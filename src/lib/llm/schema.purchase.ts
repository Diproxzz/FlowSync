import { z } from "zod";

const Money = z.number().finite();

export function normalizeDateToISO(val: any): string {
  if (!val) return new Date().toISOString().split("T")[0];
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Handle DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY (and single-digit D and M)
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Handle YYYY/MM/DD, YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, "0");
    const day = ymdMatch[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Handle textual month (e.g. 05-Nov-2026, 5 November 2026)
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return new Date().toISOString().split("T")[0];
}

const ISODate = z.string().transform(normalizeDateToISO);

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
export type ExtractedPurchaseInvoiceItem = ExtractedPurchaseItem;

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
  const supplier = raw.supplier || raw.seller || raw.vendor || raw.from || {};
  const rawSupplierGstin = supplier.gstin || raw.supplierGstin || raw.vendorGstin || null;
  let cleanSupplierGstin = typeof rawSupplierGstin === "string" ? rawSupplierGstin.replace(/\s+/g, "").toUpperCase() : null;
  // If supplier GSTIN was erroneously set to INDOBEST's own GSTIN, null it out
  if (cleanSupplierGstin === "19AVZPC2361G1ZA") {
    cleanSupplierGstin = null;
  }

  let supplierName = supplier.name || raw.supplierName || raw.vendorName || raw.sellerName || raw.partyName || "";
  if (!supplierName.trim() || supplierName.trim().toUpperCase() === "INDOBEST") {
    // If name is INDOBEST (the buyer), try alternate vendor fields
    if (raw.sellerName && raw.sellerName.trim().toUpperCase() !== "INDOBEST") {
      supplierName = raw.sellerName.trim();
    } else if (raw.vendorName && raw.vendorName.trim().toUpperCase() !== "INDOBEST") {
      supplierName = raw.vendorName.trim();
    } else if (supplier.tradeName && supplier.tradeName.trim().toUpperCase() !== "INDOBEST") {
      supplierName = supplier.tradeName.trim();
    } else {
      supplierName = "Supplier (Unspecified)";
    }
  }

  const normalizedSupplier = {
    name: supplierName.trim(),
    gstin: cleanSupplierGstin,
    address: supplier.address || raw.supplierAddress || raw.vendorAddress || null,
  };

  // 2. Buyer (should be INDOBEST)
  const buyer = raw.buyer || raw.consignee || raw.customer || {};
  const rawBuyerGstin = buyer.gstin || raw.buyerGstin || "19AVZPC2361G1ZA";
  const normalizedBuyer = {
    name: buyer.name || raw.buyerName || "INDOBEST",
    gstin: typeof rawBuyerGstin === "string" ? rawBuyerGstin.replace(/\s+/g, "").toUpperCase() : "19AVZPC2361G1ZA",
  };

  // 3. Invoice
  let invoice = raw.invoice || {};
  let number =
    invoice.number ||
    raw.invoiceNumber ||
    raw.supplierInvoiceNumber ||
    raw.billNo ||
    raw.receiptNo ||
    raw.grcptNo ||
    raw["G.Rcpt. No."] ||
    raw.invNo ||
    raw.invoice_no ||
    raw.bill_no ||
    "";
  if (!String(number).trim()) {
    number = `PUR-${Date.now().toString().slice(-6)}`;
  }

  const dateStr = normalizeDateToISO(invoice.date || raw.invoiceDate || raw.date);
  const rawReceived = invoice.receivedDate || raw.receivedDate || null;
  const receivedDateStr = rawReceived ? normalizeDateToISO(rawReceived) : null;

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
    const rawQty = it.qtyPrinted ?? it.quantity ?? it.qty ?? 1;
    const qty = Math.max(0.001, Number(rawQty) || 0.001);
    const rate = Number(it.rate ?? it.price ?? 0) || 0;
    const rawTaxable = it.taxableAmount ?? it.taxable ?? it.amount;
    const taxable = rawTaxable !== undefined && rawTaxable !== null && !isNaN(Number(rawTaxable))
      ? Number(rawTaxable)
      : (qty * rate);
    const discount = Number(it.discount ?? 0) || 0;

    return {
      lineNo: it.lineNo ?? (index + 1),
      productNameRaw: it.productNameRaw || it.productName || it.product || it.description || `Item #${index + 1}`,
      hsn: it.hsn ? String(it.hsn).trim() : null,
      qtyPrinted: qty,
      unitPrinted: (it.unitPrinted || it.unit || "KG").trim().toUpperCase(),
      rate,
      discount,
      taxableAmount: Number(taxable) || 0,
      cgstPct: Number(it.cgstPct ?? it.cgst_pct ?? 0) || 0,
      sgstPct: Number(it.sgstPct ?? it.sgst_pct ?? 0) || 0,
      igstPct: Number(it.igstPct ?? it.igst_pct ?? 0) || 0,
      cgstAmount: it.cgstAmount !== undefined && it.cgstAmount !== null ? Number(it.cgstAmount) : null,
      sgstAmount: it.sgstAmount !== undefined && it.sgstAmount !== null ? Number(it.sgstAmount) : null,
      igstAmount: it.igstAmount !== undefined && it.igstAmount !== null ? Number(it.igstAmount) : null,
      lineTotal: it.lineTotal !== undefined && it.lineTotal !== null ? Number(it.lineTotal) : null,
    };
  });

  // Guarantee at least one valid line item
  if (normalizedItems.length === 0) {
    const rawTotal = Number(raw.grandTotal || raw.totals?.grandTotal || 0);
    normalizedItems.push({
      lineNo: 1,
      productNameRaw: raw.productName || raw.description || "Purchase Goods",
      hsn: null,
      qtyPrinted: 1,
      unitPrinted: "KG",
      rate: rawTotal,
      discount: 0,
      taxableAmount: rawTotal,
      cgstPct: 0,
      sgstPct: 0,
      igstPct: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      lineTotal: rawTotal,
    });
  }

  // 5. Totals
  const rawTotals = raw.totals || raw;
  const itemsTaxableSum = normalizedItems.reduce((acc: number, it: any) => acc + (Number(it.taxableAmount) || 0), 0);
  const rawTaxableSubtotal =
    rawTotals.taxableSubtotal ?? rawTotals.subTotal ?? rawTotals.taxable_subtotal ?? rawTotals.taxableTotal;
  const taxableSubtotal = rawTaxableSubtotal !== undefined && rawTaxableSubtotal !== null && !isNaN(Number(rawTaxableSubtotal))
    ? Number(rawTaxableSubtotal)
    : itemsTaxableSum;

  const cgstTotal = Number(rawTotals.cgstTotal ?? rawTotals.cgst_total ?? rawTotals.cgst ?? 0) || 0;
  const sgstTotal = Number(rawTotals.sgstTotal ?? rawTotals.sgst_total ?? rawTotals.sgst ?? 0) || 0;
  const igstTotal = Number(rawTotals.igstTotal ?? rawTotals.igst_total ?? rawTotals.igst ?? 0) || 0;
  const otherCharges = Number(rawTotals.otherCharges ?? rawTotals.other_charges ?? rawTotals.freight ?? 0) || 0;
  const tcs = Number(rawTotals.tcs ?? 0) || 0;
  const roundOff = rawTotals.roundOff ?? rawTotals.round_off ?? null;

  const rawGrandTotal = rawTotals.grandTotal ?? rawTotals.grand_total ?? rawTotals.total;
  const grandTotal = rawGrandTotal !== undefined && rawGrandTotal !== null && !isNaN(Number(rawGrandTotal))
    ? Number(rawGrandTotal)
    : (taxableSubtotal + cgstTotal + sgstTotal + igstTotal + otherCharges + tcs);

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
