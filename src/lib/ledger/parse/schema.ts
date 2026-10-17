import { z } from "zod";

export const StatementEntryTypeSchema = z.enum([
  "OPENING",
  "SALE_INVOICE",
  "PURCHASE_INVOICE",
  "RECEIPT",
  "PAYMENT",
  "DEBIT_NOTE",
  "CREDIT_NOTE",
  "ADJUSTMENT",
  "OTHER",
]);

export const StatementEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entryType: StatementEntryTypeSchema,
  docNo: z.string().nullable().optional(),
  paymentMode: z.string().nullable().optional(),
  instrumentNo: z.string().nullable().optional(),
  instrumentDate: z.string().nullable().optional(),
  referencedDocs: z.array(z.string()).default([]),
  priorYearRefs: z.array(z.string()).default([]),
  referencesTruncated: z.boolean().default(false),
  particularsRaw: z.string(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  printedBalance: z.number().nullable().optional(),
  printedBalanceSide: z.enum(["Dr", "Cr"]).nullable().optional(),
});

export type StatementEntry = z.infer<typeof StatementEntrySchema>;

export const ExtractedStatementSchema = z.object({
  accountName: z.string().min(1),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingBalance: z.number().nonnegative().default(0),
  openingSide: z.enum(["Dr", "Cr"]).default("Dr"),
  entries: z.array(StatementEntrySchema),
  printedTotals: z.object({
    debit: z.number().nonnegative(),
    credit: z.number().nonnegative(),
    balance: z.number().nonnegative(),
    balanceSide: z.enum(["Dr", "Cr"]).default("Dr"),
  }),
  warnings: z.array(z.string()).default([]),
});

export type ExtractedStatement = z.infer<typeof ExtractedStatementSchema>;
