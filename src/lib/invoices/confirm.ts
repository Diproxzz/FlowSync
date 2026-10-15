import { prisma } from "@/lib/db";
import { Prisma, MovementType, MovementSource } from "@prisma/client";
import { ExtractedInvoice } from "../llm/schema";
import { validateInvoice } from "../validation/invoice";
import { normalize, normalizeCustomerName, normalizeInvoiceNumber } from "../matching/normalize";
import { storage } from "../storage/adapter";

export interface ConfirmInvoiceInput {
  draft: ExtractedInvoice;
  customerResolution: {
    action: "USE_MATCHED" | "CREATE_NEW";
    customerId?: string;
    customerName: string;
    customerGstin?: string | null;
    customerAddress?: string | null;
  };
  productResolutions: Array<{
    lineNo: number;
    action: "USE_MATCHED" | "CREATE_NEW";
    productId?: string;
    productCode?: string;
    productName?: string;
    productNameRaw: string;
  }>;
  mode: "create" | "replace";
  fileToken?: string;
  fileHash?: string;
  provider?: string;
  model?: string;
  acknowledgeWarnings?: boolean;
}

export async function confirmInvoice(input: ConfirmInvoiceInput) {
  const { draft, customerResolution, productResolutions, mode, fileToken, fileHash, provider, model } = input;

  // 1. Server-side validation
  const validation = validateInvoice(draft);
  if (validation.hasErrors) {
    throw new Error(`Validation failed with ${validation.issues.filter((i) => i.severity === "error").length} errors`);
  }

  const numberNorm = normalizeInvoiceNumber(draft.invoice.number);

  // 2. Duplicate checks
  const existing = await prisma.invoice.findUnique({
    where: { invoice_number_norm: numberNorm },
    include: {
      items: { include: { movement: true } },
      customer: true,
    },
  });

  if (mode === "create" && existing) {
    const error: any = new Error(`Invoice '${draft.invoice.number}' already exists in database`);
    error.code = "DUPLICATE_INVOICE";
    error.invoiceId = existing.id;
    throw error;
  }

  if (mode === "replace" && !existing) {
    const error: any = new Error(`Invoice '${draft.invoice.number}' not found to replace`);
    error.code = "NOT_FOUND";
    throw error;
  }

  let newCustomerCreated = false;
  let newProductsCreatedCount = 0;

  // Execute in single Prisma Transaction
  return await prisma.$transaction(async (tx) => {
    // 3. Resolve Customer
    let customerId = customerResolution.customerId;

    if (customerResolution.action === "CREATE_NEW" || !customerId) {
      const cleanName = customerResolution.customerName.trim();
      const nameNorm = normalizeCustomerName(cleanName);
      const cleanGstin = customerResolution.customerGstin
        ? customerResolution.customerGstin.trim().toUpperCase()
        : null;

      // Check if GSTIN already exists
      let cust = cleanGstin ? await tx.customer.findUnique({ where: { gstin: cleanGstin } }) : null;
      if (!cust) {
        cust = await tx.customer.create({
          data: {
            name: cleanName,
            name_norm: nameNorm,
            gstin: cleanGstin,
            address: customerResolution.customerAddress || null,
            state_code: cleanGstin ? cleanGstin.substring(0, 2) : null,
          },
        });
        newCustomerCreated = true;
      }
      customerId = cust.id;
    } else {
      // If customer exists but has no GSTIN and draft has one, update it
      const currentCust = await tx.customer.findUnique({ where: { id: customerId } });
      if (currentCust && !currentCust.gstin && customerResolution.customerGstin) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            gstin: customerResolution.customerGstin.trim().toUpperCase(),
            state_code: customerResolution.customerGstin.trim().substring(0, 2),
          },
        });
      }
    }

    // Learn Customer Alias
    if (draft.customer.name) {
      const aliasNorm = normalizeCustomerName(draft.customer.name);
      const existingAlias = await tx.customerAlias.findUnique({ where: { alias_norm: aliasNorm } });
      if (!existingAlias) {
        await tx.customerAlias.create({
          data: {
            customer_id: customerId,
            alias: draft.customer.name.trim(),
            alias_norm: aliasNorm,
          },
        });
      }
    }

    // 4. Resolve Products
    const lineProductMap = new Map<number, string>(); // lineNo -> productId

    for (const pRes of productResolutions) {
      let prodId = pRes.productId;

      if (pRes.action === "CREATE_NEW" || !prodId) {
        const rawCode = pRes.productCode || pRes.productNameRaw;
        const cleanCode = rawCode.trim().toUpperCase();

        let prod = await tx.product.findUnique({ where: { code: cleanCode } });
        if (!prod) {
          const matchedItem = draft.items.find((it) => it.lineNo === pRes.lineNo);
          prod = await tx.product.create({
            data: {
              code: cleanCode,
              name: pRes.productName || cleanCode,
              pack_size_kg: matchedItem?.packSizeKg ? new Prisma.Decimal(matchedItem.packSizeKg) : null,
              std_sale_rate: matchedItem?.rate ? new Prisma.Decimal(matchedItem.rate) : null,
              source: "INVOICE_AUTO",
              needs_review: true,
              is_active: true,
            },
          });
          newProductsCreatedCount++;
        }
        prodId = prod.id;
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
    }

    // 5. Handle File Storage
    let storageKey: string | null = null;
    if (fileToken) {
      const finalFileName = `invoices/${numberNorm.replace(/[^A-Z0-9-]/gi, "_")}.pdf`;
      storageKey = await storage.persist(fileToken, finalFileName);
    }

    // Calculate financial year string (e.g. "2026-27")
    const invDate = new Date(draft.invoice.date);
    const invMonth = invDate.getMonth() + 1; // 1-12
    const invYear = invDate.getFullYear();
    const fyStart = invMonth >= 4 ? invYear : invYear - 1;
    const fyEnd = (fyStart + 1) % 100;
    const financialYear = `${fyStart}-${fyEnd < 10 ? "0" + fyEnd : fyEnd}`;

    // Derived round-off
    const exactSum = new Prisma.Decimal(draft.totals.taxableSubtotal)
      .plus(draft.totals.cgstTotal)
      .plus(draft.totals.sgstTotal)
      .plus(draft.totals.igstTotal || 0);
    const roundOff = new Prisma.Decimal(draft.totals.grandTotal).minus(exactSum);

    let savedInvoice: any;

    if (mode === "replace" && existing) {
      // Create Revision Snapshot before replacing
      await tx.invoiceRevision.create({
        data: {
          invoice_id: existing.id,
          version: existing.version,
          snapshot: {
            invoice: existing,
            items: existing.items,
          },
          reason: "Modified / Re-uploaded invoice",
        },
      });

      // Delete old items (cascade removes associated stock_movements)
      await tx.invoiceItem.deleteMany({
        where: { invoice_id: existing.id },
      });

      // Update invoice record
      savedInvoice = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          invoice_number: draft.invoice.number,
          invoice_date: invDate,
          financial_year: financialYear,
          customer_id: customerId,
          customer_name_snapshot: draft.customer.name,
          customer_gstin_snapshot: draft.customer.gstin,
          taxable_total: new Prisma.Decimal(draft.totals.taxableSubtotal),
          cgst_total: new Prisma.Decimal(draft.totals.cgstTotal),
          sgst_total: new Prisma.Decimal(draft.totals.sgstTotal),
          igst_total: new Prisma.Decimal(draft.totals.igstTotal || 0),
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
      // Create new invoice record
      savedInvoice = await tx.invoice.create({
        data: {
          invoice_number: draft.invoice.number,
          invoice_number_norm: numberNorm,
          invoice_date: invDate,
          financial_year: financialYear,
          customer_id: customerId,
          customer_name_snapshot: draft.customer.name,
          customer_gstin_snapshot: draft.customer.gstin,
          taxable_total: new Prisma.Decimal(draft.totals.taxableSubtotal),
          cgst_total: new Prisma.Decimal(draft.totals.cgstTotal),
          sgst_total: new Prisma.Decimal(draft.totals.sgstTotal),
          igst_total: new Prisma.Decimal(draft.totals.igstTotal || 0),
          round_off: roundOff,
          grand_total: new Prisma.Decimal(draft.totals.grandTotal),
          source_file_hash: fileHash || "manual",
          source_file_key: storageKey,
          extraction_provider: provider,
          extraction_model: model,
          warnings: validation.issues.filter((i) => i.severity !== "error") as unknown as Prisma.InputJsonValue,
          version: 1,
        },
      });
    }

    // 6. Insert Items & Automatic SALE Stock Movements
    for (const item of draft.items) {
      const prodId = lineProductMap.get(item.lineNo)!;

      const createdItem = await tx.invoiceItem.create({
        data: {
          invoice_id: savedInvoice.id,
          line_no: item.lineNo,
          product_id: prodId,
          product_name_raw: item.productNameRaw,
          hsn: item.hsn,
          qty_kg: new Prisma.Decimal(item.qtyKg),
          pack_size_kg: item.packSizeKg ? new Prisma.Decimal(item.packSizeKg) : null,
          rate: new Prisma.Decimal(item.rate),
          taxable_amount: new Prisma.Decimal(item.taxableAmount),
          cgst_pct: new Prisma.Decimal(item.cgstPct),
          sgst_pct: new Prisma.Decimal(item.sgstPct),
          igst_pct: new Prisma.Decimal(item.igstPct || 0),
          cgst_amount: new Prisma.Decimal(item.cgstAmount ?? 0),
          sgst_amount: new Prisma.Decimal(item.sgstAmount ?? 0),
          igst_amount: new Prisma.Decimal(0),
          line_total: new Prisma.Decimal(item.lineTotal),
        },
      });

      // Create SALE StockMovement
      await tx.stockMovement.create({
        data: {
          product_id: prodId,
          movement_date: invDate,
          type: MovementType.SALE,
          qty_kg: new Prisma.Decimal(item.qtyKg),
          invoice_item_id: createdItem.id,
          source: MovementSource.INVOICE,
          party_text: draft.customer.name,
          note: `Invoice ${draft.invoice.number} (Line ${item.lineNo})`,
        },
      });
    }

    return {
      invoice: savedInvoice,
      newCustomerCreated,
      newProductsCreatedCount,
    };
  });
}
