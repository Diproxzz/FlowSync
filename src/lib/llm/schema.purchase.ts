import { z } from "zod";

const Money = z.number().finite();

const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

export const ExtractedPurchaseItemSchema = z.object({
  lineNo: z.number().int().positive(),
  productNameRaw: z.string().min(1),
  hsn: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val && val.trim() ? val.trim() : null)),
  qtyPrinted: Money.positive(),
  unitPrinted: z.string().min(1), // as written: "KG", "DRUM", "MT"...
  rate: Money.nonnegative(),
  discount: Money.default(0),
  taxableAmount: Money,
  cgstPct: Money.default(0),
  sgstPct: Money.default(0),
  igstPct: Money.default(0),
  cgstAmount: Money.nullable().optional(),
  sgstAmount: Money.nullable().optional(),
  igstAmount: Money.nullable().optional(),
  lineTotal: Money.nullable().optional(),
});

export const ExtractedPurchaseInvoiceSchema = z.object({
  supplier: z.object({
    name: z.string().min(1),
    gstin: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
  }),
  buyer: z.object({
    name: z.string().nullable().optional(),
    gstin: z.string().nullable().optional(),
  }),
  invoice: z.object({
    number: z.string().min(1),
    date: ISODate,
    receivedDate: ISODate.nullable().optional(),
    referenceNo: z.string().nullable().optional(),
    vehicleNo: z.string().nullable().optional(),
  }),
  items: z.array(ExtractedPurchaseItemSchema).min(1),
  totals: z.object({
    taxableSubtotal: Money,
    cgstTotal: Money.default(0),
    sgstTotal: Money.default(0),
    igstTotal: Money.default(0),
    otherCharges: Money.default(0),
    tcs: Money.default(0),
    roundOff: Money.nullable().optional(),
    grandTotal: Money,
  }),
  isImport: z.boolean().default(false),
  uncertainFields: z.array(z.string()).default([]),
});

export type ExtractedPurchaseInvoice = z.infer<typeof ExtractedPurchaseInvoiceSchema>;
export type ExtractedPurchaseItem = z.infer<typeof ExtractedPurchaseItemSchema>;

export const ExtractedPurchaseInvoiceJsonSchema = {
  type: "object",
  properties: {
    supplier: {
      type: "object",
      properties: {
        name: { type: "string" },
        gstin: { type: "string", nullable: true },
        address: { type: "string", nullable: true },
      },
      required: ["name"],
    },
    buyer: {
      type: "object",
      properties: {
        name: { type: "string", nullable: true },
        gstin: { type: "string", nullable: true },
      },
    },
    invoice: {
      type: "object",
      properties: {
        number: { type: "string" },
        date: { type: "string" },
        receivedDate: { type: "string", nullable: true },
        referenceNo: { type: "string", nullable: true },
        vehicleNo: { type: "string", nullable: true },
      },
      required: ["number", "date"],
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          lineNo: { type: "integer" },
          productNameRaw: { type: "string" },
          hsn: { type: "string", nullable: true },
          qtyPrinted: { type: "number" },
          unitPrinted: { type: "string" },
          rate: { type: "number" },
          discount: { type: "number" },
          taxableAmount: { type: "number" },
          cgstPct: { type: "number" },
          sgstPct: { type: "number" },
          igstPct: { type: "number" },
          cgstAmount: { type: "number", nullable: true },
          sgstAmount: { type: "number", nullable: true },
          igstAmount: { type: "number", nullable: true },
          lineTotal: { type: "number", nullable: true },
        },
        required: ["lineNo", "productNameRaw", "qtyPrinted", "unitPrinted", "rate", "taxableAmount"],
      },
    },
    totals: {
      type: "object",
      properties: {
        taxableSubtotal: { type: "number" },
        cgstTotal: { type: "number" },
        sgstTotal: { type: "number" },
        igstTotal: { type: "number" },
        otherCharges: { type: "number" },
        tcs: { type: "number" },
        roundOff: { type: "number", nullable: true },
        grandTotal: { type: "number" },
      },
      required: ["taxableSubtotal", "grandTotal"],
    },
    uncertainFields: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["supplier", "invoice", "items", "totals"],
};

/**
 * Normalizes raw LLM output into compliant Purchase structure
 */
export function normalizeRawExtractedPurchase(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;

  // 1. Supplier
  const supplier = raw.supplier || raw.seller || raw.vendor || {};
  const rawSupplierGstin = supplier.gstin || raw.supplierGstin || raw.vendorGstin || null;
  const normalizedSupplier = {
    name: supplier.name || raw.supplierName || raw.vendorName || "",
    gstin: typeof rawSupplierGstin === "string" ? rawSupplierGstin.replace(/\s+/g, "").toUpperCase() : null,
    address: supplier.address || raw.supplierAddress || null,
  };

  // 2. Buyer (should be INDOBEST)
  const buyer = raw.buyer || raw.consignee || raw.customer || {};
  const rawBuyerGstin = buyer.gstin || raw.buyerGstin || null;
  const normalizedBuyer = {
    name: buyer.name || raw.buyerName || null,
    gstin: typeof rawBuyerGstin === "string" ? rawBuyerGstin.replace(/\s+/g, "").toUpperCase() : null,
  };

  // 3. Invoice
  let invoice = raw.invoice || {};
  const number =
    invoice.number ||
    raw.invoiceNumber ||
    raw.supplierInvoiceNumber ||
    raw.billNo ||
    raw.receiptNo ||
    raw.grcptNo ||
    raw["G.Rcpt. No."] ||
    "";

  let dateStr = invoice.date || raw.invoiceDate || raw.date || "";
  // Normalize DD-MM-YYYY or DD/MM/YYYY to YYYY-MM-DD
  if (dateStr && /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(dateStr.trim())) {
    const parts = dateStr.trim().split(/[-/]/);
    dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  let receivedDateStr = invoice.receivedDate || raw.receivedDate || null;
  if (receivedDateStr && /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(receivedDateStr.trim())) {
    const parts = receivedDateStr.trim().split(/[-/]/);
    receivedDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  const normalizedInvoice = {
    number: String(number).trim(),
    date: dateStr,
    receivedDate: receivedDateStr,
    referenceNo: invoice.referenceNo || raw.referenceNo || raw.orderNo || null,
    vehicleNo: invoice.vehicleNo || raw.vehicleNo || raw.lrNo || null,
  };

  // 4. Items
  const rawItems = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.lines) ? raw.lines : [];
  const normalizedItems = rawItems.map((it: any, index: number) => {
    const qty = it.qtyPrinted ?? it.quantity ?? it.qty ?? 0;
    const rate = it.rate ?? it.price ?? 0;
    const taxable = it.taxableAmount ?? it.taxable ?? it.amount ?? (Number(qty) * Number(rate));
    const discount = it.discount ?? 0;

    return {
      lineNo: it.lineNo ?? (index + 1),
      productNameRaw: it.productNameRaw || it.productName || it.product || it.description || "",
      hsn: it.hsn ? String(it.hsn).trim() : null,
      qtyPrinted: Number(qty) || 0,
      unitPrinted: (it.unitPrinted || it.unit || "KG").trim().toUpperCase(),
      rate: Number(rate) || 0,
      discount: Number(discount) || 0,
      taxableAmount: Number(taxable) || 0,
      cgstPct: Number(it.cgstPct ?? it.cgst_pct ?? 0),
      sgstPct: Number(it.sgstPct ?? it.sgst_pct ?? 0),
      igstPct: Number(it.igstPct ?? it.igst_pct ?? 0),
      cgstAmount: it.cgstAmount !== undefined && it.cgstAmount !== null ? Number(it.cgstAmount) : null,
      sgstAmount: it.sgstAmount !== undefined && it.sgstAmount !== null ? Number(it.sgstAmount) : null,
      igstAmount: it.igstAmount !== undefined && it.igstAmount !== null ? Number(it.igstAmount) : null,
      lineTotal: it.lineTotal !== undefined && it.lineTotal !== null ? Number(it.lineTotal) : null,
    };
  });

  // 5. Totals
  const rawTotals = raw.totals || raw;
  const taxableSubtotal =
    rawTotals.taxableSubtotal ?? rawTotals.subTotal ?? rawTotals.taxable_subtotal ?? rawTotals.taxableTotal ?? 0;
  const cgstTotal = rawTotals.cgstTotal ?? rawTotals.cgst_total ?? rawTotals.cgst ?? 0;
  const sgstTotal = rawTotals.sgstTotal ?? rawTotals.sgst_total ?? rawTotals.sgst ?? 0;
  const igstTotal = rawTotals.igstTotal ?? rawTotals.igst_total ?? rawTotals.igst ?? 0;
  const otherCharges = rawTotals.otherCharges ?? rawTotals.other_charges ?? rawTotals.freight ?? 0;
  const tcs = rawTotals.tcs ?? 0;
  const roundOff = rawTotals.roundOff ?? rawTotals.round_off ?? null;
  const grandTotal = rawTotals.grandTotal ?? rawTotals.grand_total ?? rawTotals.total ?? 0;

  return {
    supplier: normalizedSupplier,
    buyer: normalizedBuyer,
    invoice: normalizedInvoice,
    items: normalizedItems,
    totals: {
      taxableSubtotal: Number(taxableSubtotal),
      cgstTotal: Number(cgstTotal),
      sgstTotal: Number(sgstTotal),
      igstTotal: Number(igstTotal),
      otherCharges: Number(otherCharges),
      tcs: Number(tcs),
      roundOff: roundOff !== null && roundOff !== undefined ? Number(roundOff) : null,
      grandTotal: Number(grandTotal),
    },
    uncertainFields: Array.isArray(raw.uncertainFields) ? raw.uncertainFields : [],
  };
}
