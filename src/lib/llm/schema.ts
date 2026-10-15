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
  packSizeKg: Money.nullable(),
  rate: Money.nonnegative(),
  taxableAmount: Money,
  cgstPct: Money,
  sgstPct: Money,
  igstPct: Money.default(0),
  cgstAmount: Money.nullable(),
  sgstAmount: Money.nullable(),
  lineTotal: Money,
});

export const ExtractedInvoiceSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    gstin: z
      .string()
      .nullable()
      .transform((val) => (val && val.trim() ? val.trim().toUpperCase() : null)),
    address: z.string().nullable(),
  }),
  invoice: z.object({
    number: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  }),
  items: z.array(ExtractedInvoiceItemSchema).min(1),
  totals: z.object({
    taxableSubtotal: Money,
    cgstTotal: Money,
    sgstTotal: Money,
    igstTotal: Money.default(0),
    roundOff: Money.nullable(),
    grandTotal: Money,
  }),
  uncertainFields: z.array(z.string()).default([]),
});

export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;
export type ExtractedInvoiceItem = z.infer<typeof ExtractedInvoiceItemSchema>;

export const ExtractedInvoiceJsonSchema = {
  type: "object",
  properties: {
    customer: {
      type: "object",
      properties: {
        name: { type: "string" },
        gstin: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
      },
      required: ["name", "gstin", "address"],
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
          hsn: { type: ["string", "null"] },
          qtyKg: { type: "number" },
          packSizeKg: { type: ["number", "null"] },
          rate: { type: "number" },
          taxableAmount: { type: "number" },
          cgstPct: { type: "number" },
          sgstPct: { type: "number" },
          igstPct: { type: "number" },
          cgstAmount: { type: ["number", "null"] },
          sgstAmount: { type: ["number", "null"] },
          lineTotal: { type: "number" },
        },
        required: [
          "lineNo",
          "productNameRaw",
          "hsn",
          "qtyKg",
          "packSizeKg",
          "rate",
          "taxableAmount",
          "cgstPct",
          "sgstPct",
          "igstPct",
          "cgstAmount",
          "sgstAmount",
          "lineTotal",
        ],
      },
    },
    totals: {
      type: "object",
      properties: {
        taxableSubtotal: { type: "number" },
        cgstTotal: { type: "number" },
        sgstTotal: { type: "number" },
        igstTotal: { type: "number" },
        roundOff: { type: ["number", "null"] },
        grandTotal: { type: "number" },
      },
      required: [
        "taxableSubtotal",
        "cgstTotal",
        "sgstTotal",
        "igstTotal",
        "roundOff",
        "grandTotal",
      ],
    },
    uncertainFields: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["customer", "invoice", "items", "totals", "uncertainFields"],
};
