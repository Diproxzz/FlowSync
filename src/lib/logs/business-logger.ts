import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type BusinessAction =
  | "INVOICE_GENERATED"
  | "INVOICE_CONFIRMED"
  | "INVOICE_VOIDED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_MADE"
  | "STATEMENT_SENT"
  | "CUSTOMER_CREATED"
  | "CUSTOMER_UPDATED"
  | "CUSTOMER_MERGED"
  | "CUSTOMER_DELETED"
  | "ENTRY_RECORDED";

export interface LogBusinessActivityInput {
  action: BusinessAction | string;
  description: string;
  entityType?: "INVOICE" | "PAYMENT" | "STATEMENT" | "CUSTOMER" | "LEDGER" | string;
  entityId?: string;
  amount?: number | string | Prisma.Decimal | null;
  metadata?: Record<string, any>;
  createdAt?: Date | string;
}

/**
 * Logs business activity events (invoices generated, customer payments received, statements sent).
 * STRICT RULE: No developer, code, or feature changes are logged here.
 * Only genuine business operations & accounting transactions.
 */
export async function logBusinessActivity(input: LogBusinessActivityInput) {
  try {
    let amountVal: Prisma.Decimal | null = null;
    if (input.amount !== undefined && input.amount !== null) {
      try {
        amountVal = new Prisma.Decimal(input.amount.toString());
      } catch {
        amountVal = null;
      }
    }

    let createdDate: Date | undefined = undefined;
    if (input.createdAt) {
      const d = new Date(input.createdAt);
      if (!isNaN(d.getTime())) {
        createdDate = d;
      }
    }

    return await prisma.businessLog.create({
      data: {
        action: input.action,
        description: input.description,
        entity_type: input.entityType || null,
        entity_id: input.entityId || null,
        amount: amountVal,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        ...(createdDate ? { created_at: createdDate } : {}),
      },
    });
  } catch (err) {
    console.error("[logBusinessActivity] Failed to write business audit log:", err);
    return null;
  }
}

/**
 * Syncs or creates a business log for a ledger entry (Customer receipt or Supplier payment).
 * Keeps logs updated as per the ledger entry date.
 */
export async function syncBusinessLogForLedgerEntry(entry: {
  id: string;
  entry_date: Date | string;
  entry_type: string;
  debit: any;
  credit: any;
  doc_no?: string | null;
  payment_mode?: string | null;
  instrument_no?: string | null;
  particulars_raw?: string | null;
  narration?: string | null;
  is_void?: boolean;
  account: {
    account_type: "CUSTOMER" | "SUPPLIER";
    display_name: string;
  };
}) {
  try {
    if (entry.is_void) {
      // Remove any business log if the entry was voided
      await prisma.businessLog.deleteMany({
        where: { entity_type: "PAYMENT", entity_id: entry.id },
      });
      return;
    }

    const isCustomer = entry.account.account_type === "CUSTOMER";
    const isSupplier = entry.account.account_type === "SUPPLIER";
    const creditNum = Number(entry.credit || 0);
    const debitNum = Number(entry.debit || 0);

    let action: string = "ENTRY_RECORDED";
    let amount = 0;
    let desc = "";

    if (isCustomer && creditNum > 0 && entry.entry_type !== "CREDIT_NOTE" && entry.entry_type !== "OPENING") {
      action = "PAYMENT_RECEIVED";
      amount = creditNum;
      const ref = entry.instrument_no
        ? ` via Cheque/Ref ${entry.instrument_no}`
        : entry.particulars_raw
        ? ` (${entry.particulars_raw})`
        : "";
      desc = `${entry.account.display_name} paid ₹ ${amount.toLocaleString("en-IN")}${ref}`;
    } else if (isSupplier && debitNum > 0 && entry.entry_type !== "DEBIT_NOTE" && entry.entry_type !== "OPENING") {
      action = "PAYMENT_MADE";
      amount = debitNum;
      const ref = entry.instrument_no
        ? ` via Cheque/Ref ${entry.instrument_no}`
        : entry.particulars_raw
        ? ` (${entry.particulars_raw})`
        : "";
      desc = `Paid ₹ ${amount.toLocaleString("en-IN")} to ${entry.account.display_name}${ref}`;
    } else {
      // Not a customer payment or supplier payment
      return;
    }

    const entryDate = new Date(entry.entry_date);

    // Check if an existing log exists
    const existing = await prisma.businessLog.findFirst({
      where: { entity_type: "PAYMENT", entity_id: entry.id },
    });

    if (existing) {
      await prisma.businessLog.update({
        where: { id: existing.id },
        data: {
          action,
          description: desc,
          amount: new Prisma.Decimal(amount),
          created_at: entryDate,
          metadata: {
            accountName: entry.account.display_name,
            entryType: entry.entry_type,
            docNo: entry.doc_no || null,
            paymentMode: entry.payment_mode || null,
            instrumentNo: entry.instrument_no || null,
          },
        },
      });
    } else {
      await prisma.businessLog.create({
        data: {
          action,
          description: desc,
          entity_type: "PAYMENT",
          entity_id: entry.id,
          amount: new Prisma.Decimal(amount),
          created_at: entryDate,
          metadata: {
            accountName: entry.account.display_name,
            entryType: entry.entry_type,
            docNo: entry.doc_no || null,
            paymentMode: entry.payment_mode || null,
            instrumentNo: entry.instrument_no || null,
          },
        },
      });
    }
  } catch (err) {
    console.error("[syncBusinessLogForLedgerEntry] Error syncing log:", err);
  }
}

/**
 * Syncs or creates a business log for an invoice.
 * Keeps logs updated as per the invoice date.
 */
export async function syncBusinessLogForInvoice(invoice: {
  id: string;
  invoice_number: string;
  invoice_date: Date | string;
  customer_name_snapshot: string;
  grand_total: any;
}) {
  try {
    if (invoice.invoice_number.toUpperCase().includes("TEST")) return;

    const invoiceDate = new Date(invoice.invoice_date);
    const grandTotalNum = Number(invoice.grand_total);
    const desc = `${invoice.invoice_number} Invoice has been confirmed for ${invoice.customer_name_snapshot} (₹ ${grandTotalNum.toLocaleString("en-IN")})`;

    const existing = await prisma.businessLog.findFirst({
      where: {
        entity_type: "INVOICE",
        entity_id: invoice.id,
      },
    });

    if (existing) {
      await prisma.businessLog.update({
        where: { id: existing.id },
        data: {
          created_at: invoiceDate,
          amount: new Prisma.Decimal(grandTotalNum),
          description: desc,
          metadata: {
            invoiceNumber: invoice.invoice_number,
            customerName: invoice.customer_name_snapshot,
          },
        },
      });
    } else {
      await prisma.businessLog.create({
        data: {
          action: "INVOICE_CONFIRMED",
          description: desc,
          entity_type: "INVOICE",
          entity_id: invoice.id,
          amount: new Prisma.Decimal(grandTotalNum),
          created_at: invoiceDate,
          metadata: {
            invoiceNumber: invoice.invoice_number,
            customerName: invoice.customer_name_snapshot,
          },
        },
      });
    }
  } catch (err) {
    console.error("[syncBusinessLogForInvoice] Error syncing invoice log:", err);
  }
}
