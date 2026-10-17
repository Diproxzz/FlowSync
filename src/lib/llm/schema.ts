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
  discountPct: z.number().nullable().optional(),
  discountAmount: z.number().nullable().optional(),
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

  // Normalize totals input values
  let rawTotals = raw.totals || {};
  const rawTaxableSubtotal =
    rawTotals.taxableSubtotal ?? rawTotals.subTotal ?? rawTotals.sub_total ?? rawTotals.taxable_subtotal ??
    raw.taxableSubtotal ?? raw.subTotal ?? raw.taxable_subtotal ?? raw.sub_total ?? raw.taxableTotal ?? null;
  const rawDiscPct = rawTotals.discountPct ?? rawTotals.discount_pct ?? raw.discountPct ?? raw.discount_pct ?? null;
  const rawDiscTotal = rawTotals.discountTotal ?? rawTotals.discount_total ?? rawTotals.discount ?? raw.discountTotal ?? raw.discount ?? null;
  const discountPct = rawDiscPct !== null && rawDiscPct !== undefined && !isNaN(Number(rawDiscPct)) && Number(rawDiscPct) > 0 ? Number(rawDiscPct) : null;
  const discountTotal = rawDiscTotal !== null && rawDiscTotal !== undefined && !isNaN(Number(rawDiscTotal)) && Number(rawDiscTotal) > 0 ? Number(rawDiscTotal) : null;

  const rawCgstTotal =
    rawTotals.cgstTotal ?? rawTotals.cgstAmount ?? rawTotals.cgst_amount ?? rawTotals.cgst_total ?? rawTotals.cgst ??
    raw.cgstTotal ?? raw.cgstAmount ?? raw.cgst ?? null;
  const rawSgstTotal =
    rawTotals.sgstTotal ?? rawTotals.sgstAmount ?? rawTotals.sgst_amount ?? rawTotals.sgst_total ?? rawTotals.sgst ??
    raw.sgstTotal ?? raw.sgstAmount ?? raw.sgst ?? null;
  const rawIgstTotal =
    rawTotals.igstTotal ?? rawTotals.igstAmount ?? rawTotals.igst_amount ?? rawTotals.igst_total ?? rawTotals.igst ??
    raw.igstTotal ?? raw.igstAmount ?? raw.igst ?? null;

  // Determine if Inter-State (IGST) or Intra-State (CGST + SGST)
  const isInterState =
    Number(rawIgstTotal || 0) > 0 ||
    (Array.isArray(raw.items) && raw.items.some((it: any) => Number(it.igstPct || it.igst_pct || 0) > 0)) ||
    (normalizedCustomer.gstin ? !normalizedCustomer.gstin.startsWith("19") : false);

  // Normalize items array with automatic CGST and SGST calculation
  const items = Array.isArray(raw.items)
    ? raw.items.map((it: any, idx: number) => {
        const rawQty = it.qtyKg ?? it.quantityKg ?? it.qty_kg ?? it.quantity_kg ?? it.qty ?? it.quantity ?? it.qnty ?? 0;
        const qtyKg = Number(rawQty) || 0;
        const rawRate = it.rate ?? it.price ?? 0;
        const rate = Number(rawRate) || 0;

        const rawItemDisc = it.discountPct ?? it.discount_pct ?? it.discPct ?? it.disc_pct ?? it.discount ?? it.disc ?? null;
        const itemDiscountPct = rawItemDisc !== null && rawItemDisc !== undefined && !isNaN(Number(rawItemDisc)) && Number(rawItemDisc) > 0 ? Number(rawItemDisc) : null;
        const rawItemDiscAmt = it.discountAmount ?? it.discount_amount ?? null;
        const itemDiscountAmt = rawItemDiscAmt !== null && rawItemDiscAmt !== undefined && !isNaN(Number(rawItemDiscAmt)) && Number(rawItemDiscAmt) > 0 ? Number(rawItemDiscAmt) : null;

        const rawTaxable = it.taxableAmount ?? it.taxableValue ?? it.taxable_amount ?? it.taxable_value ?? it.taxable;
        const taxable = rawTaxable !== undefined && rawTaxable !== null && !isNaN(Number(rawTaxable)) && Number(rawTaxable) > 0
          ? Number(rawTaxable)
          : (qtyKg > 0 && rate > 0
              ? Math.round(qtyKg * rate * (itemDiscountPct ? 1 - itemDiscountPct / 100 : 1) * 100) / 100
              : 0);

        const rawItemGstPct = it.gstPct ?? it.gst_pct ?? it.gstRate ?? it.gst_rate ?? it.taxPct ?? it.tax_pct ?? it.taxRate ?? it.tax_rate ?? it.gst ?? null;
        const rawCgstPct = it.cgstPct ?? it.cgst_pct ?? null;
        const rawSgstPct = it.sgstPct ?? it.sgst_pct ?? null;
        const rawIgstPct = it.igstPct ?? it.igst_pct ?? null;

        // Determine GST percentage (default to 18% if not specified, or 5% if indicated)
        let resolvedGstPct = 18;
        if (rawItemGstPct !== null && !isNaN(Number(rawItemGstPct)) && Number(rawItemGstPct) > 0) {
          resolvedGstPct = Number(rawItemGstPct);
        } else if (rawCgstPct !== null && Number(rawCgstPct) > 0) {
          resolvedGstPct = Number(rawCgstPct) * 2;
        } else if (rawIgstPct !== null && Number(rawIgstPct) > 0) {
          resolvedGstPct = Number(rawIgstPct);
        } else if (rawTotals.gstPct || rawTotals.gst_pct) {
          resolvedGstPct = Number(rawTotals.gstPct || rawTotals.gst_pct);
        } else if (taxable > 0 && it.lineTotal && Number(it.lineTotal) > taxable) {
          const ratio = (Number(it.lineTotal) - taxable) / taxable;
          if (Math.abs(ratio - 0.05) < 0.02) resolvedGstPct = 5;
          else if (Math.abs(ratio - 0.18) < 0.04) resolvedGstPct = 18;
          else if (Math.abs(ratio - 0.12) < 0.02) resolvedGstPct = 12;
          else if (Math.abs(ratio - 0.28) < 0.04) resolvedGstPct = 28;
        }

        // For intra-state:
        // If GST% is 18: CGST is 9% and SGST is 9%
        // If GST% is 5: CGST is 2.5% and SGST is 2.5%
        // In general: CGST% = GST% / 2, SGST% = GST% / 2
        const halfPct = resolvedGstPct === 5 ? 2.5 : (resolvedGstPct === 18 ? 9 : resolvedGstPct / 2);

        const cgstPct = isInterState ? 0 : (rawCgstPct !== null && Number(rawCgstPct) > 0 ? Number(rawCgstPct) : halfPct);
        const sgstPct = isInterState ? 0 : (rawSgstPct !== null && Number(rawSgstPct) > 0 ? Number(rawSgstPct) : halfPct);
        const igstPct = isInterState ? (rawIgstPct !== null && Number(rawIgstPct) > 0 ? Number(rawIgstPct) : resolvedGstPct) : 0;

        // Calculate CGST and SGST amounts (9% or 2.5% each of taxable amount for intra-state)
        const cgstAmount = isInterState
          ? 0
          : (it.cgstAmount !== undefined && it.cgstAmount !== null && Number(it.cgstAmount) > 0
              ? Number(it.cgstAmount)
              : Math.round(((taxable * cgstPct) / 100) * 100) / 100);

        const sgstAmount = isInterState
          ? 0
          : (it.sgstAmount !== undefined && it.sgstAmount !== null && Number(it.sgstAmount) > 0
              ? Number(it.sgstAmount)
              : Math.round(((taxable * sgstPct) / 100) * 100) / 100);

        const igstAmount = isInterState
          ? (it.igstAmount !== undefined && it.igstAmount !== null && Number(it.igstAmount) > 0
              ? Number(it.igstAmount)
              : Math.round(((taxable * igstPct) / 100) * 100) / 100)
          : 0;

        const rawLineTotal = it.lineTotal ?? it.line_total ?? it.amount ?? it.total;
        const lineTotal = rawLineTotal !== undefined && rawLineTotal !== null && Number(rawLineTotal) > 0
          ? Number(rawLineTotal)
          : (isInterState
              ? Math.round((taxable + igstAmount) * 100) / 100
              : Math.round((taxable + cgstAmount + sgstAmount) * 100) / 100);

        return {
          lineNo: it.lineNo ?? it.slNo ?? it.sl_no ?? it.line_no ?? it.sl ?? it.srNo ?? it.sr_no ?? it.sNo ?? idx + 1,
          productNameRaw: it.productNameRaw ?? it.product_name_raw ?? it.product ?? it.description ?? it.item ?? it.particulars ?? "",
          hsn: it.hsn ? String(it.hsn) : null,
          qtyKg,
          packSizeKg: it.packSizeKg ?? it.pack_size_kg ?? it.pack ?? it.packing ?? null,
          rate,
          discountPct: itemDiscountPct,
          discountAmount: itemDiscountAmt,
          taxableAmount: taxable,
          cgstPct,
          sgstPct,
          igstPct,
          cgstAmount,
          sgstAmount,
          lineTotal,
        };
      })
    : [];

  const sumItemTaxable = Math.round(items.reduce((acc: number, it: any) => acc + (it.taxableAmount || 0), 0) * 100) / 100;
  const taxableSubtotal = Number(rawTaxableSubtotal) > 0 ? Number(rawTaxableSubtotal) : sumItemTaxable;

  const sumItemCgst = Math.round(items.reduce((acc: number, it: any) => acc + (it.cgstAmount || 0), 0) * 100) / 100;
  const sumItemSgst = Math.round(items.reduce((acc: number, it: any) => acc + (it.sgstAmount || 0), 0) * 100) / 100;
  const sumItemIgst = Math.round(items.reduce((acc: number, it: any) => acc + (it.igstAmount || ((it.taxableAmount * (it.igstPct || 18)) / 100)), 0) * 100) / 100;

  // Calculate CGST and SGST totals directly from taxable amount (taxableSubtotal * 0.09 for intra-state)
  const calcTaxableCgst = Math.round(((taxableSubtotal * 9) / 100) * 100) / 100;
  const calcTaxableSgst = Math.round(((taxableSubtotal * 9) / 100) * 100) / 100;

  const cgstTotal = isInterState
    ? 0
    : (sumItemCgst > 0 ? sumItemCgst : calcTaxableCgst);
  const sgstTotal = isInterState
    ? 0
    : (sumItemSgst > 0 ? sumItemSgst : calcTaxableSgst);
  const igstTotal = isInterState
    ? (Number(rawIgstTotal) > 0 ? Number(rawIgstTotal) : (sumItemIgst > 0 ? sumItemIgst : Math.round(((taxableSubtotal * 18) / 100) * 100) / 100))
    : 0;

  const roundOff =
    rawTotals.roundOff ?? rawTotals.round_off ?? rawTotals.roundoff ??
    raw.roundOff ?? raw.round_off ?? raw.roundoff ?? 0;

  const calcGrandTotal = Math.round(taxableSubtotal + (isInterState ? igstTotal : cgstTotal + sgstTotal) + Number(roundOff) - (Number(discountTotal) || 0));
  const rawGrand = rawTotals.grandTotal ?? rawTotals.grand_total ?? rawTotals.total ?? raw.grandTotal ?? raw.grand_total;
  const grandTotal = rawGrand !== undefined && rawGrand !== null && Number(rawGrand) > 0 ? Number(rawGrand) : calcGrandTotal;

  const totals = {
    taxableSubtotal,
    discountPct,
    discountTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    roundOff,
    grandTotal,
  };

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
      discountPct: z.number().nullable().optional(),
      discountTotal: z.number().nullable().optional(),
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
          discountPct: { type: "number", nullable: true },
          discountAmount: { type: "number", nullable: true },
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
        discountPct: { type: "number", nullable: true },
        discountTotal: { type: "number", nullable: true },
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
