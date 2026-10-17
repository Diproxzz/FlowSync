import { ExtractedPurchaseInvoice, ExtractedPurchaseItem } from "../llm/schema.purchase";
import { validateGstin } from "./gstin";
import { toDecimal, roundMoney } from "./money";
import { Decimal } from "decimal.js";
import { convertUnitToKg } from "../units/convert";

export interface Issue {
  path: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

export interface PurchaseValidationResult {
  isValid: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  derivedRoundOff: number;
  taxType: "CGST_SGST" | "IGST" | "MIXED";
  issues: Issue[];
}

export function validatePurchaseInvoice(
  draft: ExtractedPurchaseInvoice,
  companyGstin = "19AVZPC2361G1ZA",
  productContexts?: Array<{
    lineNo: number;
    productId?: string;
    packSizeKg?: number | null;
    stdPurchaseRate?: number | null;
    manualQtyKg?: number | null;
  }>
): PurchaseValidationResult {
  const issues: Issue[] = [];

  // 1. Supplier validation
  if (!draft.supplier.name || !draft.supplier.name.trim()) {
    issues.push({
      path: "supplier.name",
      severity: "error",
      code: "SUPPLIER_NAME_MISSING",
      message: "Supplier name is required",
    });
  }

  // Validate Supplier GSTIN
  if (draft.isImport) {
    issues.push({
      path: "supplier.gstin",
      severity: "info",
      code: "IMPORT_SUPPLIER_NO_GSTIN",
      message: "Import Invoice: Overseas supplier does not have an Indian GSTIN",
    });
  } else {
    const gstinCheck = validateGstin(draft.supplier.gstin, companyGstin);
    if (!gstinCheck.isValid && gstinCheck.code) {
      if (gstinCheck.code === "GSTIN_IS_COMPANY") {
        issues.push({
          path: "supplier.gstin",
          severity: "error",
          code: "SUPPLIER_GSTIN_IS_COMPANY",
          message: "Supplier GSTIN matches company GSTIN. Supplier must be the seller, not INDOBEST.",
        });
      } else {
        issues.push({
          path: "supplier.gstin",
          severity: gstinCheck.code === "GSTIN_MISSING" ? "warning" : "error",
          code: gstinCheck.code,
          message: gstinCheck.message || "Invalid supplier GSTIN",
        });
      }
    }
  }

  // Validate Buyer GSTIN (should be INDOBEST)
  if (draft.buyer?.gstin) {
    const cleanBuyerGstin = draft.buyer.gstin.trim().toUpperCase();
    if (cleanBuyerGstin !== companyGstin.trim().toUpperCase()) {
      issues.push({
        path: "buyer.gstin",
        severity: "warning",
        code: "BUYER_GSTIN_MISMATCH",
        message: `Buyer GSTIN on invoice ('${cleanBuyerGstin}') does not match INDOBEST GSTIN ('${companyGstin}'). Ensure invoice is addressed to INDOBEST.`,
      });
    }
  }

  // 2. Invoice number & date
  if (!draft.invoice.number || !draft.invoice.number.trim()) {
    issues.push({
      path: "invoice.number",
      severity: "error",
      code: "INVOICE_NUMBER_MISSING",
      message: "Supplier invoice number is required",
    });
  }

  const invoiceDate = new Date(draft.invoice.date);
  if (isNaN(invoiceDate.getTime())) {
    issues.push({
      path: "invoice.date",
      severity: "error",
      code: "DATE_INVALID",
      message: "Invoice date is invalid",
    });
  } else {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (invoiceDate > today) {
      issues.push({
        path: "invoice.date",
        severity: "warning",
        code: "DATE_FUTURE",
        message: "Invoice date is in the future",
      });
    }
    // Opening stock date check (e.g. 2026-04-01)
    const openingStockDate = new Date("2026-04-01");
    if (invoiceDate < openingStockDate) {
      issues.push({
        path: "invoice.date",
        severity: "warning",
        code: "DATE_BEFORE_OPENING_DATE",
        message: "Purchase date predates stock opening date (01-04-2026)",
      });
    }
  }

  // 3. Line items validation
  if (!draft.items || draft.items.length === 0) {
    issues.push({
      path: "items",
      severity: "error",
      code: "NO_ITEMS",
      message: "Purchase invoice must have at least one line item",
    });
  }

  let computedTaxableSubtotal = new Decimal(0);
  let computedCgstTotal = new Decimal(0);
  let computedSgstTotal = new Decimal(0);
  let computedIgstTotal = new Decimal(0);

  let hasCgstSgst = false;
  let hasIgst = false;

  draft.items?.forEach((item, index) => {
    const path = `items[${index}]`;
    const lineCtx = productContexts?.find((c) => c.lineNo === item.lineNo);

    if (!item.productNameRaw || !item.productNameRaw.trim()) {
      issues.push({
        path: `${path}.productNameRaw`,
        severity: "error",
        code: "PRODUCT_NAME_MISSING",
        message: `Line ${item.lineNo}: Product name is missing`,
      });
    }

    if (item.qtyPrinted <= 0) {
      issues.push({
        path: `${path}.qtyPrinted`,
        severity: "error",
        code: "QTY_INVALID",
        message: `Line ${item.lineNo}: Quantity must be greater than zero`,
      });
    }

    // Unit conversion check
    const conv = convertUnitToKg({
      qtyPrinted: item.qtyPrinted,
      unitPrinted: item.unitPrinted,
      packSizeKg: lineCtx?.packSizeKg,
      manualQtyKg: lineCtx?.manualQtyKg,
      rate: item.rate,
    });

    if (!conv.isConvertible) {
      issues.push({
        path: `${path}.unitPrinted`,
        severity: "info",
        code: "UNIT_UNCONVERTIBLE",
        message: `Line ${item.lineNo}: ${conv.error || "Unit not converted to kg"}`,
      });
    }

    // Check taxable arithmetic: |qtyPrinted * rate * (1 - discount/100) - taxable| > 0.05
    const discountMultiplier = item.discount && Number(item.discount) > 0
      ? new Decimal(1).minus(new Decimal(item.discount).div(100))
      : new Decimal(1);
    const expectedTaxable = new Decimal(item.qtyPrinted)
      .mul(item.rate)
      .mul(discountMultiplier);
    const actualTaxable = new Decimal(item.taxableAmount);

    if (expectedTaxable.minus(actualTaxable).abs().greaterThan(0.05)) {
      issues.push({
        path: `${path}.taxableAmount`,
        severity: "warning",
        code: "LINE_TAXABLE_MISMATCH",
        message: item.discount && Number(item.discount) > 0
          ? `Line ${item.lineNo}: Taxable amount ₹${item.taxableAmount} does not match (Qty × Rate less ${item.discount}% = ₹${expectedTaxable.toFixed(2)})`
          : `Line ${item.lineNo}: Taxable amount ₹${item.taxableAmount} does not match (Qty × Rate = ₹${expectedTaxable.toFixed(2)})`,
      });
    }

    computedTaxableSubtotal = computedTaxableSubtotal.plus(actualTaxable);

    // Line taxes
    const cgstPct = new Decimal(item.cgstPct || 0);
    const sgstPct = new Decimal(item.sgstPct || 0);
    const igstPct = new Decimal(item.igstPct || 0);

    if (cgstPct.greaterThan(0) || sgstPct.greaterThan(0)) hasCgstSgst = true;
    if (igstPct.greaterThan(0)) hasIgst = true;

    const lineCgst = actualTaxable.mul(cgstPct).div(100);
    const lineSgst = actualTaxable.mul(sgstPct).div(100);
    const lineIgst = actualTaxable.mul(igstPct).div(100);

    computedCgstTotal = computedCgstTotal.plus(lineCgst);
    computedSgstTotal = computedSgstTotal.plus(lineSgst);
    computedIgstTotal = computedIgstTotal.plus(lineIgst);

    // Rate variance against standard purchase rate
    if (lineCtx?.stdPurchaseRate && lineCtx.stdPurchaseRate > 0) {
      const stdRate = new Decimal(lineCtx.stdPurchaseRate);
      const effectiveRate = conv.ratePerKg;
      if (effectiveRate.greaterThan(0)) {
        const deltaPct = effectiveRate.minus(stdRate).div(stdRate).mul(100).abs();
        if (deltaPct.greaterThan(5)) {
          issues.push({
            path: `${path}.rate`,
            severity: "info",
            code: "RATE_VARIANCE",
            message: `Line ${item.lineNo}: Rate ₹${effectiveRate.toFixed(2)}/kg deviates by ${deltaPct.toFixed(1)}% from master purchase rate ₹${stdRate.toFixed(2)}/kg`,
          });
        }
      }
    }
  });

  // 4. Tax type consistency
  let taxType: "CGST_SGST" | "IGST" | "MIXED" = "CGST_SGST";
  if (hasCgstSgst && hasIgst) {
    taxType = "MIXED";
    issues.push({
      path: "totals",
      severity: "warning",
      code: "TAX_TYPE_INCONSISTENT",
      message: "Invoice has both CGST/SGST and IGST taxes present together.",
    });
  } else if (hasIgst) {
    taxType = "IGST";
  } else {
    taxType = "CGST_SGST";
  }

  // State code check vs tax type
  const supplierState = draft.supplier.gstin && /^\d{2}/.test(draft.supplier.gstin) ? draft.supplier.gstin.substring(0, 2) : null;
  const buyerState = companyGstin.substring(0, 2); // "19" West Bengal
  if (supplierState) {
    const isSameState = supplierState === buyerState;
    if (isSameState && taxType === "IGST") {
      issues.push({
        path: "totals.igstTotal",
        severity: "warning",
        code: "TAX_TYPE_INCONSISTENT",
        message: `Supplier is in West Bengal (State 19), but invoice is charged as IGST instead of CGST + SGST.`,
      });
    } else if (!isSameState && taxType === "CGST_SGST") {
      issues.push({
        path: "totals.cgstTotal",
        severity: "warning",
        code: "TAX_TYPE_INCONSISTENT",
        message: `Supplier is outside West Bengal (State ${supplierState}), but invoice is charged as CGST + SGST instead of IGST.`,
      });
    }
  }

  // 5. Grand total arithmetic & derived round-off
  const draftTaxable = new Decimal(draft.totals.taxableSubtotal);
  const draftCgst = new Decimal(draft.totals.cgstTotal || 0);
  const draftSgst = new Decimal(draft.totals.sgstTotal || 0);
  const draftIgst = new Decimal(draft.totals.igstTotal || 0);
  const draftOther = new Decimal(draft.totals.otherCharges || 0);
  const draftTcs = new Decimal(draft.totals.tcs || 0);
  const draftGrand = new Decimal(draft.totals.grandTotal);

  const exactSum = draftTaxable
    .plus(draftCgst)
    .plus(draftSgst)
    .plus(draftIgst)
    .plus(draftOther)
    .plus(draftTcs);

  const derivedRoundOff = draftGrand.minus(exactSum).toNumber();

  if (Math.abs(derivedRoundOff) > 1.0) {
    issues.push({
      path: "totals.grandTotal",
      severity: "error",
      code: "GRAND_TOTAL_MISMATCH",
      message: `Grand total ₹${draftGrand.toFixed(2)} does not match exact sum ₹${exactSum.toFixed(2)} (difference ₹${derivedRoundOff.toFixed(2)} exceeds ₹1 round-off limit).`,
    });
  }

  // Uncertain fields
  if (draft.uncertainFields && draft.uncertainFields.length > 0) {
    draft.uncertainFields.forEach((field) => {
      issues.push({
        path: field,
        severity: "warning",
        code: "UNCERTAIN_FIELD",
        message: `Field '${field}' was flagged as uncertain during extraction.`,
      });
    });
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");

  return {
    isValid: !hasErrors,
    hasErrors,
    hasWarnings,
    derivedRoundOff: Math.round(derivedRoundOff * 100) / 100,
    taxType,
    issues,
  };
}
