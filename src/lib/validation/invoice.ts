import { ExtractedInvoice } from "../llm/schema";
import { validateGstin } from "./gstin";
import { toDecimal, roundMoney } from "./money";
import { Decimal } from "decimal.js";

export interface Issue {
  path: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  derivedRoundOff: number;
  issues: Issue[];
}

export function validateInvoice(
  draft: ExtractedInvoice,
  companyGstin = "19AVZPC2361G1ZA"
): ValidationResult {
  const issues: Issue[] = [];

  // 1. Customer validation
  if (!draft.customer.name || !draft.customer.name.trim()) {
    issues.push({
      path: "customer.name",
      severity: "error",
      code: "CUSTOMER_NAME_MISSING",
      message: "Customer name is required",
    });
  }

  const gstinCheck = validateGstin(draft.customer.gstin, companyGstin);
  if (!gstinCheck.isValid && gstinCheck.code) {
    issues.push({
      path: "customer.gstin",
      severity: gstinCheck.code === "GSTIN_MISSING" ? "warning" : "error",
      code: gstinCheck.code,
      message: gstinCheck.message || "Invalid GSTIN",
    });
  }

  // 2. Invoice number & date
  if (!draft.invoice.number || !draft.invoice.number.trim()) {
    issues.push({
      path: "invoice.number",
      severity: "error",
      code: "INVOICE_NUMBER_MISSING",
      message: "Invoice number is required",
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

    // Check financial year in invoice number (e.g. IB26-27/0473 -> FY 2026-27)
    const fyMatch = draft.invoice.number.match(/(\d{2})-(\d{2})/);
    if (fyMatch) {
      const startYear = 2000 + parseInt(fyMatch[1], 10);
      const endYear = 2000 + parseInt(fyMatch[2], 10);
      const fyStart = new Date(startYear, 3, 1); // 1 April
      const fyEnd = new Date(endYear, 2, 31, 23, 59, 59); // 31 March
      if (invoiceDate < fyStart || invoiceDate > fyEnd) {
        issues.push({
          path: "invoice.date",
          severity: "warning",
          code: "FY_MISMATCH",
          message: `Date (${draft.invoice.date}) does not match financial year in invoice number (FY ${startYear}-${endYear})`,
        });
      }
    }
  }

  // 3. Line items validation
  let sumTaxable = new Decimal(0);
  let sumCgst = new Decimal(0);
  let sumSgst = new Decimal(0);
  let sumIgst = new Decimal(0);

  if (!draft.items || draft.items.length === 0) {
    issues.push({
      path: "items",
      severity: "error",
      code: "NO_ITEMS",
      message: "Invoice must contain at least one line item",
    });
  }

  draft.items.forEach((item, index) => {
    const p = `items[${index}]`;

    const qty = toDecimal(item.qtyKg);
    const rate = toDecimal(item.rate);
    const taxable = toDecimal(item.taxableAmount);
    const lineTotal = toDecimal(item.lineTotal);

    // Taxable = Qty × Rate (±₹0.01)
    const expectedTaxable = roundMoney(qty.times(rate));
    const taxableDiff = taxable.minus(expectedTaxable).abs();
    if (taxableDiff.greaterThan(0.01)) {
      issues.push({
        path: `${p}.taxableAmount`,
        severity: "warning",
        code: "LINE_TAXABLE_MISMATCH",
        message: `Line ${item.lineNo}: Taxable ₹${taxable.toFixed(2)} ≠ Qty (${qty}) × Rate (₹${rate}) = ₹${expectedTaxable.toFixed(2)}`,
      });
    }

    sumTaxable = sumTaxable.plus(taxable);

    // GST amounts & line total
    const cgstPct = toDecimal(item.cgstPct);
    const sgstPct = toDecimal(item.sgstPct);
    const igstPct = toDecimal(item.igstPct || 0);

    const calcCgst = roundMoney(taxable.times(cgstPct).dividedBy(100));
    const calcSgst = roundMoney(taxable.times(sgstPct).dividedBy(100));
    const calcIgst = roundMoney(taxable.times(igstPct).dividedBy(100));

    sumCgst = sumCgst.plus(item.cgstAmount !== null ? toDecimal(item.cgstAmount) : calcCgst);
    sumSgst = sumSgst.plus(item.sgstAmount !== null ? toDecimal(item.sgstAmount) : calcSgst);
    sumIgst = sumIgst.plus(calcIgst);

    // Line total = taxable × (1 + tax%)
    const expectedLineTotal = roundMoney(taxable.plus(calcCgst).plus(calcSgst).plus(calcIgst));
    const lineTotalDiff = lineTotal.minus(expectedLineTotal).abs();
    if (lineTotalDiff.greaterThan(1.0)) {
      issues.push({
        path: `${p}.lineTotal`,
        severity: "warning",
        code: "LINE_TOTAL_MISMATCH",
        message: `Line ${item.lineNo}: Amount ₹${lineTotal.toFixed(2)} differs from taxable + taxes (₹${expectedLineTotal.toFixed(2)}) by ₹${lineTotalDiff.toFixed(2)}`,
      });
    } else if (lineTotalDiff.greaterThan(0.05)) {
      issues.push({
        path: `${p}.lineTotal`,
        severity: "warning",
        code: "LINE_TOTAL_MISMATCH",
        message: `Line ${item.lineNo}: Amount ₹${lineTotal.toFixed(2)} slightly differs from taxable + taxes (₹${expectedLineTotal.toFixed(2)})`,
      });
    }

    // Multiple products hint
    if (item.productNameRaw && item.productNameRaw.includes(",")) {
      issues.push({
        path: `${p}.productNameRaw`,
        severity: "info",
        code: "MULTIPLE_PRODUCTS_IN_LINE",
        message: "Line contains multiple product names. You can map to one product or split this line.",
      });
    }
  });

  // 4. Totals validation
  const declaredSubtotal = toDecimal(draft.totals.taxableSubtotal);
  const declaredCgst = toDecimal(draft.totals.cgstTotal);
  const declaredSgst = toDecimal(draft.totals.sgstTotal);
  const declaredIgst = toDecimal(draft.totals.igstTotal || 0);
  const declaredGrand = toDecimal(draft.totals.grandTotal);

  if (sumTaxable.minus(declaredSubtotal).abs().greaterThan(0.01)) {
    issues.push({
      path: "totals.taxableSubtotal",
      severity: "warning",
      code: "SUBTOTAL_MISMATCH",
      message: `Sub total ₹${declaredSubtotal.toFixed(2)} does not match sum of lines (₹${sumTaxable.toFixed(2)})`,
    });
  }

  if (sumCgst.minus(declaredCgst).abs().greaterThan(0.05)) {
    issues.push({
      path: "totals.cgstTotal",
      severity: "warning",
      code: "CGST_TOTAL_MISMATCH",
      message: `CGST total ₹${declaredCgst.toFixed(2)} does not match line CGST sum (₹${sumCgst.toFixed(2)})`,
    });
  }

  if (sumSgst.minus(declaredSgst).abs().greaterThan(0.05)) {
    issues.push({
      path: "totals.sgstTotal",
      severity: "warning",
      code: "SGST_TOTAL_MISMATCH",
      message: `SGST total ₹${declaredSgst.toFixed(2)} does not match line SGST sum (₹${sumSgst.toFixed(2)})`,
    });
  }

  // Derived round-off = grandTotal − (taxable + cgst + sgst + igst)
  const exactSum = declaredSubtotal.plus(declaredCgst).plus(declaredSgst).plus(declaredIgst);
  const derivedRoundOff = declaredGrand.minus(exactSum);

  if (derivedRoundOff.abs().greaterThan(1.0)) {
    issues.push({
      path: "totals.grandTotal",
      severity: "warning",
      code: "GRAND_TOTAL_MISMATCH",
      message: `Grand total ₹${declaredGrand.toFixed(2)} mismatch. Derived round-off ₹${derivedRoundOff.toFixed(2)} exceeds ±₹1.00`,
    });
  }

  // Uncertain fields
  if (Array.isArray(draft.uncertainFields)) {
    for (const fieldPath of draft.uncertainFields) {
      issues.push({
        path: fieldPath,
        severity: "warning",
        code: "UNCERTAIN_FIELD",
        message: "Model flagged this field as uncertain or low confidence",
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");

  return {
    isValid: !hasErrors,
    hasErrors,
    hasWarnings,
    derivedRoundOff: derivedRoundOff.toNumber(),
    issues,
  };
}
