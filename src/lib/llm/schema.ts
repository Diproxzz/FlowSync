import { z } from "zod";

const Money = z.number().finite();

export const ExtractedInvoiceItemSchema = z.object({
  lineNo: z.number().int().positive(),
  productNameRaw: z.string().min(1),
  hsn: z
    .string()
    .nullable()
    .transform((val) => (val && val.trim() ? val.trim() : null)),
  qtyKg: Money.positive(),
  packSizeKg: Money.nullable().optional(),
  rate: Money.nonnegative(),
  taxableAmount: Money,
  cgstPct: Money,
  sgstPct: Money,
  igstPct: z.number().nullable().optional().transform((v) => v ?? 0),
  cgstAmount: z.number().nullable().optional(),
  sgstAmount: z.number().nullable().optional(),
  lineTotal: Money,
});

export function normalizeRawExtractedInvoice(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;

  // Normalize customer
  const customer = raw.customer || {};
  const rawGstin = customer.gstin || raw.customerGstin || raw.partyGstin || null;
  const normalizedCustomer = {
    name: customer.name || raw.customerName || raw.partyName || "",
    gstin: typeof rawGstin === "string" ? rawGstin.replace(/\s+/g, "").toUpperCase() : null,
    address: customer.address || raw.customerAddress || raw.partyAddress || null,
  };

  // Normalize invoice object
  let invoice = raw.invoice;
  if (!invoice && (raw.invoiceNumber || raw.invoice_number || raw.invoiceNo || raw.invoice_no)) {
    invoice = {
      number: raw.invoiceNumber || raw.invoice_number || raw.invoiceNo || raw.invoice_no,
      date: raw.invoiceDate || raw.invoice_date || raw.date,
    };
  }

  // Normalize totals object
  let rawTotals = raw.totals || {};
  const taxableSubtotal =
    rawTotals.taxableSubtotal ?? rawTotals.subTotal ?? rawTotals.sub_total ?? rawTotals.taxable_subtotal ??
    raw.taxableSubtotal ?? raw.subTotal ?? raw.taxable_subtotal ?? raw.sub_total ?? raw.taxableTotal ?? 0;
  const cgstTotal =
    rawTotals.cgstTotal ?? rawTotals.cgstAmount ?? rawTotals.cgst_amount ?? rawTotals.cgst_total ?? rawTotals.cgst ??
    raw.cgstTotal ?? raw.cgstAmount ?? raw.cgst ?? 0;
  const sgstTotal =
    rawTotals.sgstTotal ?? rawTotals.sgstAmount ?? rawTotals.sgst_amount ?? rawTotals.sgst_total ?? rawTotals.sgst ??
    raw.sgstTotal ?? raw.sgstAmount ?? raw.sgst ?? 0;
  const igstTotal =
    rawTotals.igstTotal ?? rawTotals.igstAmount ?? rawTotals.igst_amount ?? rawTotals.igst_total ?? rawTotals.igst ??
    raw.igstTotal ?? raw.igstAmount ?? raw.igst ?? 0;
  const roundOff =
    rawTotals.roundOff ?? rawTotals.round_off ?? rawTotals.roundoff ??
    raw.roundOff ?? raw.round_off ?? raw.roundoff ?? 0;
  const grandTotal =
    rawTotals.grandTotal ?? rawTotals.grand_total ?? rawTotals.total ??
    raw.grandTotal ?? raw.grand_total ?? 0;

  const totals = {
    taxableSubtotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    roundOff,
    grandTotal,
  };

  // Normalize items array
  const items = Array.isArray(raw.items)
    ? raw.items.map((it: any, idx: number) => {
        const taxable = it.taxableAmount ?? it.taxableValue ?? it.taxable_amount ?? it.taxable_value ?? it.taxable ?? 0;
        const cgstPct = it.cgstPct ?? it.cgst_pct ?? 9;
        const sgstPct = it.sgstPct ?? it.sgst_pct ?? 9;
        const lineTotal = it.lineTotal ?? it.line_total ?? it.amount ?? it.total ?? taxable;

        return {
          lineNo: it.lineNo ?? it.slNo ?? it.sl_no ?? it.line_no ?? it.sl ?? it.srNo ?? it.sr_no ?? it.sNo ?? idx + 1,
          productNameRaw: it.productNameRaw ?? it.product_name_raw ?? it.product ?? it.description ?? it.item ?? it.particulars ?? "",
          hsn: it.hsn ? String(it.hsn) : null,
          qtyKg: it.qtyKg ?? it.quantityKg ?? it.qty_kg ?? it.quantity_kg ?? it.qty ?? it.quantity ?? it.qnty ?? 0,
          packSizeKg: it.packSizeKg ?? it.pack_size_kg ?? it.pack ?? it.packing ?? null,
          rate: it.rate ?? it.price ?? 0,
          taxableAmount: taxable,
          cgstPct: cgstPct,
          sgstPct: sgstPct,
          igstPct: it.igstPct ?? it.igst_pct ?? 0,
          cgstAmount: it.cgstAmount ?? it.cgst_amount ?? it.cgst ?? Math.round(((taxable * cgstPct) / 100) * 100) / 100,
          sgstAmount: it.sgstAmount ?? it.sgst_amount ?? it.sgst ?? Math.round(((taxable * sgstPct) / 100) * 100) / 100,
          lineTotal: lineTotal,
        };
      })
    : [];

  // Fallback taxableSubtotal if 0 or missing
  if ((!totals.taxableSubtotal || totals.taxableSubtotal === 0) && items.length > 0) {
    totals.taxableSubtotal = Math.round(items.reduce((acc, it) => acc + (it.taxableAmount || 0), 0) * 100) / 100;
  }

  return {
    ...raw,
    customer: normalizedCustomer,
    invoice,
    totals,
    items,
    uncertainFields: Array.isArray(raw.uncertainFields) ? raw.uncertainFields : [],
  };
}

export const ExtractedInvoiceSchema = z.preprocess(
  normalizeRawExtractedInvoice,
  z.object({
    customer: z.object({
      name: z.string().min(1),
      gstin: z
        .string()
        .nullable()
        .transform((val) => (val && val.trim() ? val.trim().toUpperCase() : null)),
      address: z.string().nullable().optional(),
    }),
    invoice: z.object({
      number: z.string().min(1),
      date: z.string(),
    }),
    items: z.array(ExtractedInvoiceItemSchema).min(1),
    totals: z.object({
      taxableSubtotal: Money,
      cgstTotal: Money,
      sgstTotal: Money,
      igstTotal: z.number().nullable().optional().transform((v) => v ?? 0),
      roundOff: z.number().nullable().optional().transform((v) => v ?? 0),
      grandTotal: Money,
    }),
    uncertainFields: z.array(z.string()).default([]),
  })
);

export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;
export type ExtractedInvoiceItem = z.infer<typeof ExtractedInvoiceItemSchema>;

export const ExtractedInvoiceJsonSchema = {
  type: "object",
  properties: {
    customer: {
      type: "object",
      properties: {
        name: { type: "string" },
        gstin: { type: "string", nullable: true },
        address: { type: "string", nullable: true },
      },
      required: ["name"],
    },
    invoice: {
      type: "object",
      properties: {
        number: { type: "string" },
        date: { type: "string" },
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
          qtyKg: { type: "number" },
          packSizeKg: { type: "number", nullable: true },
          rate: { type: "number" },
          taxableAmount: { type: "number" },
          cgstPct: { type: "number" },
          sgstPct: { type: "number" },
          igstPct: { type: "number" },
          cgstAmount: { type: "number", nullable: true },
          sgstAmount: { type: "number", nullable: true },
          lineTotal: { type: "number" },
        },
        required: ["lineNo", "productNameRaw", "qtyKg", "rate", "taxableAmount", "lineTotal"],
      },
    },
    totals: {
      type: "object",
      properties: {
        taxableSubtotal: { type: "number" },
        cgstTotal: { type: "number" },
        sgstTotal: { type: "number" },
        igstTotal: { type: "number" },
        roundOff: { type: "number", nullable: true },
        grandTotal: { type: "number" },
      },
      required: ["taxableSubtotal", "cgstTotal", "sgstTotal", "grandTotal"],
    },
    uncertainFields: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["customer", "invoice", "items", "totals"],
};
