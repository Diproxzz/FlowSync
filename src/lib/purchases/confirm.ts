import { prisma } from "@/lib/db";
import { Prisma, MovementType, MovementSource } from "@prisma/client";
import { ExtractedPurchaseInvoice } from "../llm/schema.purchase";
import { validatePurchaseInvoice } from "../validation/purchase";
import { normalize, normalizeSupplierName, normalizeInvoiceNumber } from "../matching/normalize";
import { convertUnitToKg } from "../units/convert";
import { storage } from "../storage/adapter";

export interface ConfirmPurchaseInput {
  draft: ExtractedPurchaseInvoice;
  supplierResolution: {
    action: "USE_MATCHED" | "CREATE_NEW";
    supplierId?: string;
    supplierName: string;
    supplierGstin?: string | null;
    supplierAddress?: string | null;
  };
  productResolutions: Array<{
    lineNo: number;
    action: "USE_MATCHED" | "CREATE_NEW";
    productId?: string;
    productCode?: string;
    productName?: string;
    productNameRaw: string;
    packSizeKg?: number | null;
    manualQtyKg?: number | null;
  }>;
  mode: "create" | "replace";
  fileToken?: string;
  fileHash?: string;
  provider?: string;
  model?: string;
  acknowledgeWarnings?: boolean;
  updateStdPurchaseRates?: Record<string, boolean>; // productId -> boolean
}

export async function confirmPurchaseInvoice(input: ConfirmPurchaseInput) {
  const {
    draft,
    supplierResolution,
    productResolutions,
    mode,
    fileToken,
    fileHash,
    provider,
    model,
    updateStdPurchaseRates,
  } = input;

  // 1. Server-side validation
  const productContexts = draft.items.map((it) => {
    const res = productResolutions.find((r) => r.lineNo === it.lineNo);
    return {
      lineNo: it.lineNo,
      productId: res?.productId,
      packSizeKg: res?.packSizeKg,
      manualQtyKg: res?.manualQtyKg,
    };
  });

  const validation = validatePurchaseInvoice(draft, undefined, productContexts);
  const blockingErrors = validation.issues.filter(
    (i) =>
      i.severity === "error" &&
      [
        "SUPPLIER_NAME_MISSING",
        "INVOICE_NUMBER_MISSING",
        "GSTIN_FORMAT",
        "GSTIN_CHECKSUM",
        "SUPPLIER_GSTIN_IS_COMPANY",
        "NO_ITEMS",
        "DATE_INVALID",
        "UNIT_UNCONVERTIBLE",
      ].includes(i.code)
  );

  if (blockingErrors.length > 0) {
    throw new Error(
      `Validation failed with format error(s): ${blockingErrors.map((e) => e.message).join(", ")}`
    );
  }

  const numberNorm = normalizeInvoiceNumber(draft.invoice.number);

  return await prisma.$transaction(async (tx) => {
    // 2. Resolve or create Supplier
    let supplierId = supplierResolution.supplierId;
    const cleanGstin = draft.isImport
      ? null
      : (supplierResolution.supplierGstin || draft.supplier.gstin || "").trim().toUpperCase() || null;
    const stateCode = draft.isImport
      ? "96"
      : cleanGstin && /^\d{2}/.test(cleanGstin)
      ? cleanGstin.substring(0, 2)
      : null;

    if (cleanGstin) {
      const existingSupByGstin = await tx.supplier.findUnique({ where: { gstin: cleanGstin } });
      if (existingSupByGstin) {
        supplierId = existingSupByGstin.id;
        supplierResolution.supplierId = existingSupByGstin.id;
        supplierResolution.supplierName = existingSupByGstin.name;
        draft.supplier.name = existingSupByGstin.name;
      }
    }

    if (!supplierId || supplierResolution.action === "CREATE_NEW") {
      const cleanName = (supplierResolution.supplierName || draft.supplier.name).trim();
      const nameNorm = normalizeSupplierName(cleanName);

      const existingByName = await tx.supplier.findFirst({
        where: { name_norm: nameNorm },
      });
      const existingByGstin = cleanGstin
        ? await tx.supplier.findFirst({ where: { gstin: cleanGstin } })
        : null;

      if (existingByGstin) {
        supplierId = existingByGstin.id;
      } else if (existingByName) {
        supplierId = existingByName.id;
        if (cleanGstin && !existingByName.gstin) {
          await tx.supplier.update({
            where: { id: supplierId },
            data: { gstin: cleanGstin, state_code: stateCode },
          });
        }
      } else {
        const newSup = await tx.supplier.create({
          data: {
            name: cleanName,
            name_norm: nameNorm,
            gstin: cleanGstin,
            address: supplierResolution.supplierAddress || draft.supplier.address || null,
            state_code: stateCode,
          },
        });
        supplierId = newSup.id;
      }
    }

    // 3. Duplicate checks: key is (supplier_id, invoice_number_norm)
    const existing = await tx.purchaseInvoice.findUnique({
      where: {
        supplier_id_invoice_number_norm: {
          supplier_id: supplierId,
          invoice_number_norm: numberNorm,
        },
      },
      include: {
        items: { include: { movement: true } },
        supplier: true,
      },
    });

    if (mode === "create" && existing) {
      const error: any = new Error(
        `Purchase Invoice '${draft.invoice.number}' from ${existing.supplier.name} already exists in database`
      );
      error.code = "DUPLICATE_INVOICE";
      error.invoiceId = existing.id;
      throw error;
    }

    if (mode === "replace" && !existing) {
      const error: any = new Error(`Purchase Invoice '${draft.invoice.number}' not found to replace`);
      error.code = "NOT_FOUND";
      throw error;
    }

    // Learn Supplier Alias if needed
    if (draft.supplier.name) {
      const aliasNorm = normalizeSupplierName(draft.supplier.name);
      const existingAlias = await tx.supplierAlias.findUnique({ where: { alias_norm: aliasNorm } });
      if (!existingAlias) {
        const supRecord = await tx.supplier.findUnique({ where: { id: supplierId } });
        if (supRecord && supRecord.name_norm !== aliasNorm) {
          await tx.supplierAlias.create({
            data: {
              supplier_id: supplierId,
              alias: draft.supplier.name.trim(),
              alias_norm: aliasNorm,
            },
          });
        }
      }
    }

    // 4. Resolve Products
    const lineProductMap = new Map<number, string>();

    for (const pRes of productResolutions) {
      let prodId = pRes.productId;

      if (!prodId || pRes.action === "CREATE_NEW") {
        const cleanName = (pRes.productName || pRes.productNameRaw).trim();
        const code = (pRes.productCode || cleanName.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, "")).trim();

        const existingProd = await tx.product.findFirst({
          where: { OR: [{ code }, { name: { equals: cleanName, mode: "insensitive" } }] },
        });

        if (existingProd) {
          prodId = existingProd.id;
        } else {
          const matchedItem = draft.items.find((it) => it.lineNo === pRes.lineNo);
          const conv = convertUnitToKg({
            qtyPrinted: matchedItem?.qtyPrinted || 1,
            unitPrinted: matchedItem?.unitPrinted || "KG",
            packSizeKg: pRes.packSizeKg,
            manualQtyKg: pRes.manualQtyKg,
            rate: matchedItem?.rate || 0,
          });

          const prod = await tx.product.create({
            data: {
              code,
              name: cleanName,
              default_hsn: matchedItem?.hsn ? String(matchedItem.hsn).trim() : null,
              pack_size_kg: pRes.packSizeKg ? new Prisma.Decimal(pRes.packSizeKg) : null,
              std_purchase_rate: conv.ratePerKg.greaterThan(0) ? conv.ratePerKg : null,
              source: "INVOICE_AUTO",
              needs_review: true,
              is_active: true,
            },
          });
          prodId = prod.id;
        }
      }

      lineProductMap.set(pRes.lineNo, prodId);

      // Learn Product Alias
      if (pRes.productNameRaw) {
        const aliasNorm = normalize(pRes.productNameRaw);
        const existingAlias = await tx.productAlias.findUnique({ where: { alias_norm: aliasNorm } });
        if (!existingAlias) {
          await tx.productAlias.create({
            data: {
              product_id: prodId,
              alias: pRes.productNameRaw.trim(),
              alias_norm: aliasNorm,
            },
          });
        }
      }

      // Update default HSN if not present
      const matchedItem = draft.items.find((it) => it.lineNo === pRes.lineNo);
      if (matchedItem?.hsn && prodId) {
        const existingProd = await tx.product.findUnique({
          where: { id: prodId },
          select: { default_hsn: true },
        });
        if (existingProd && !existingProd.default_hsn) {
          await tx.product.update({
            where: { id: prodId },
            data: { default_hsn: String(matchedItem.hsn).trim() },
          });
        }
      }
    }

    // 5. File storage persistence
    let storageKey: string | null = null;
    if (fileToken) {
      const finalFileName = `purchases/${supplierId}_${numberNorm.replace(/[^A-Z0-9-]/gi, "_")}.pdf`;
      storageKey = await storage.persist(fileToken, finalFileName);
    }

    // Dates and financial year
    const invDate = new Date(draft.invoice.date);
    const receivedDate = draft.invoice.receivedDate ? new Date(draft.invoice.receivedDate) : null;
    const invMonth = invDate.getMonth() + 1;
    const invYear = invDate.getFullYear();
    const fyStart = invMonth >= 4 ? invYear : invYear - 1;
    const fyEnd = (fyStart + 1) % 100;
    const financialYear = `${fyStart}-${fyEnd < 10 ? "0" + fyEnd : fyEnd}`;

    // Taxes & totals
    const isInterState =
      Number(draft.totals.igstTotal || 0) > 0 ||
      draft.items.some((it) => (it.igstPct || 0) > 0);

    const cgstTotalDec = isInterState ? new Prisma.Decimal(0) : new Prisma.Decimal(draft.totals.cgstTotal || 0);
    const sgstTotalDec = isInterState ? new Prisma.Decimal(0) : new Prisma.Decimal(draft.totals.sgstTotal || 0);
    const igstTotalDec = isInterState ? new Prisma.Decimal(draft.totals.igstTotal || 0) : new Prisma.Decimal(0);
    const otherChargesDec = new Prisma.Decimal(draft.totals.otherCharges || 0);
    const tcsDec = new Prisma.Decimal(draft.totals.tcs || 0);

    const exactSum = new Prisma.Decimal(draft.totals.taxableSubtotal)
      .plus(cgstTotalDec)
      .plus(sgstTotalDec)
      .plus(igstTotalDec)
      .plus(otherChargesDec)
      .plus(tcsDec);

    const roundOff = new Prisma.Decimal(draft.totals.grandTotal).minus(exactSum);

    let savedPurchase: any;

    if (mode === "replace" && existing) {
      // 1. Create Revision Snapshot
      await tx.purchaseInvoiceRevision.create({
        data: {
          purchase_invoice_id: existing.id,
          version: existing.version,
          snapshot: {
            invoice: existing,
            items: existing.items,
          },
          reason: "Modified / Re-uploaded purchase invoice",
        },
      });

      // 2. Delete old items (cascade removes associated stock_movements)
      await tx.purchaseInvoiceItem.deleteMany({
        where: { purchase_invoice_id: existing.id },
      });

      // 3. Update purchase invoice record
      savedPurchase = await tx.purchaseInvoice.update({
        where: { id: existing.id },
        data: {
          supplier_invoice_number: draft.invoice.number,
          invoice_date: invDate,
          received_date: receivedDate,
          financial_year: financialYear,
          supplier_id: supplierId,
          supplier_name_snapshot: draft.supplier.name,
          supplier_gstin_snapshot: draft.isImport ? null : draft.supplier.gstin,
          is_import: Boolean(draft.isImport),
          buyer_gstin_snapshot: draft.buyer?.gstin || null,
          reference_no: draft.invoice.referenceNo || null,
          vehicle_no: draft.invoice.vehicleNo || null,
          taxable_total: new Prisma.Decimal(draft.totals.taxableSubtotal),
          cgst_total: cgstTotalDec,
          sgst_total: sgstTotalDec,
          igst_total: igstTotalDec,
          other_charges: otherChargesDec,
          tcs: tcsDec,
          round_off: roundOff,
          grand_total: new Prisma.Decimal(draft.totals.grandTotal),
          source_file_hash: fileHash || existing.source_file_hash,
          source_file_key: storageKey || existing.source_file_key,
          extraction_provider: provider || existing.extraction_provider,
          extraction_model: model || existing.extraction_model,
          warnings: validation.issues.filter((i) => i.severity !== "error") as unknown as Prisma.InputJsonValue,
          version: existing.version + 1,
        },
      });
    } else {
      // Create new purchase invoice record
      savedPurchase = await tx.purchaseInvoice.create({
        data: {
          supplier_invoice_number: draft.invoice.number,
          invoice_number_norm: numberNorm,
          invoice_date: invDate,
          received_date: receivedDate,
          financial_year: financialYear,
          supplier_id: supplierId,
          supplier_name_snapshot: draft.supplier.name,
          supplier_gstin_snapshot: draft.isImport ? null : draft.supplier.gstin,
          is_import: Boolean(draft.isImport),
          buyer_gstin_snapshot: draft.buyer?.gstin || null,
          reference_no: draft.invoice.referenceNo || null,
          vehicle_no: draft.invoice.vehicleNo || null,
          taxable_total: new Prisma.Decimal(draft.totals.taxableSubtotal),
          cgst_total: cgstTotalDec,
          sgst_total: sgstTotalDec,
          igst_total: igstTotalDec,
          other_charges: otherChargesDec,
          tcs: tcsDec,
          round_off: roundOff,
          grand_total: new Prisma.Decimal(draft.totals.grandTotal),
          source_file_hash: fileHash || "manual",
          source_file_key: storageKey,
          extraction_provider: provider || "manual",
          extraction_model: model || "none",
          warnings: validation.issues.filter((i) => i.severity !== "error") as unknown as Prisma.InputJsonValue,
          version: 1,
        },
      });
    }

    // 6. Insert Items & Automatic PURCHASE Stock Movements
    for (const item of draft.items) {
      const prodId = lineProductMap.get(item.lineNo)!;
      const pRes = productResolutions.find((r) => r.lineNo === item.lineNo);

      const conv = convertUnitToKg({
        qtyPrinted: item.qtyPrinted,
        unitPrinted: item.unitPrinted,
        packSizeKg: pRes?.packSizeKg,
        manualQtyKg: pRes?.manualQtyKg,
        rate: item.rate,
      });

      const itemCgstPct = isInterState ? new Prisma.Decimal(0) : new Prisma.Decimal(item.cgstPct || 0);
      const itemSgstPct = isInterState ? new Prisma.Decimal(0) : new Prisma.Decimal(item.sgstPct || 0);
      const itemIgstPct = isInterState ? new Prisma.Decimal(item.igstPct || 0) : new Prisma.Decimal(0);

      const itemCgstAmount = isInterState
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(item.cgstAmount ?? Math.round(((item.taxableAmount * Number(item.cgstPct || 0)) / 100) * 100) / 100);
      const itemSgstAmount = isInterState
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(item.sgstAmount ?? Math.round(((item.taxableAmount * Number(item.sgstPct || 0)) / 100) * 100) / 100);
      const itemIgstAmount = isInterState
        ? new Prisma.Decimal(item.igstAmount ?? Math.round(((item.taxableAmount * Number(item.igstPct || 0)) / 100) * 100) / 100)
        : new Prisma.Decimal(0);

      const createdItem = await tx.purchaseInvoiceItem.create({
        data: {
          purchase_invoice_id: savedPurchase.id,
          line_no: item.lineNo,
          product_id: prodId,
          product_name_raw: item.productNameRaw,
          hsn: item.hsn ? String(item.hsn).trim() : null,
          qty_printed: new Prisma.Decimal(item.qtyPrinted),
          unit_printed: item.unitPrinted,
          qty_kg: conv.qtyKg,
          rate: new Prisma.Decimal(item.rate),
          rate_per_kg: conv.ratePerKg,
          discount: new Prisma.Decimal(item.discount || 0),
          taxable_amount: new Prisma.Decimal(item.taxableAmount),
          cgst_pct: itemCgstPct,
          sgst_pct: itemSgstPct,
          igst_pct: itemIgstPct,
          cgst_amount: itemCgstAmount,
          sgst_amount: itemSgstAmount,
          igst_amount: itemIgstAmount,
          line_total: item.lineTotal ? new Prisma.Decimal(item.lineTotal) : null,
        },
      });

      // Create PURCHASE StockMovement (dated by received_date or invoice_date)
      const movementDate = receivedDate || invDate;
      await tx.stockMovement.create({
        data: {
          product_id: prodId,
          movement_date: movementDate,
          type: MovementType.PURCHASE,
          qty_kg: conv.qtyKg,
          purchase_invoice_item_id: createdItem.id,
          source: MovementSource.PURCHASE_INVOICE,
          party_text: draft.supplier.name,
          note: `Purchase Invoice: ${draft.invoice.number}`,
        },
      });

      // Update standard purchase rate if opted in (FR-PUR-STK-3)
      if (updateStdPurchaseRates && updateStdPurchaseRates[prodId]) {
        await tx.product.update({
          where: { id: prodId },
          data: { std_purchase_rate: conv.ratePerKg },
        });
      }
    }

    return {
      invoiceId: savedPurchase.id,
      invoiceNumber: savedPurchase.supplier_invoice_number,
      supplierId,
      supplierName: draft.supplier.name,
      itemsCount: draft.items.length,
      grandTotal: savedPurchase.grand_total,
      mode,
    };
  });
}
