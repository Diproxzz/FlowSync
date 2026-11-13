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

    return await prisma.businessLog.create({
      data: {
        action: input.action,
        description: input.description,
        entity_type: input.entityType || null,
        entity_id: input.entityId || null,
        amount: amountVal,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error("[logBusinessActivity] Failed to write business audit log:", err);
    return null;
  }
}
