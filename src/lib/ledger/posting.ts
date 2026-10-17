import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { normalizeInvoiceNumber } from "@/lib/matching/normalize";

/**
 * Posts or links a Sales Invoice to the Customer's Ledger Account.
 * Follows Link-Never-Duplicate (FR-LED-AUTO-3) and Statement Cut-off (FR-LED-AUTO-4).
 */
export async function postSalesInvoiceToLedger(
  tx: Prisma.TransactionClient,
  invoice: {
    id: string;
    invoice_number: string;
    invoice_date: Date | string;
    customer_id: string;
    grand_total: Decimal | number | string;
  }
): Promise<void> {
  // Do not post test/mock invoices from automated tests into real ledger accounts
  if (invoice.invoice_number.toUpperCase().includes("TEST")) {
    return;
  }

  const invoiceDate = new Date(invoice.invoice_date);
  const grandTotal = new Decimal(invoice.grand_total.toString());
  const normDoc = normalizeInvoiceNumber(invoice.invoice_number);

  // 1. Find or create customer ledger account
  let account = await tx.ledgerAccount.findUnique({
    where: { customer_id: invoice.customer_id },
  });

  if (!account) {
    const cust = await tx.customer.findUnique({
      where: { id: invoice.customer_id },
      select: { name: true },
    });
    account = await tx.ledgerAccount.create({
      data: {
        account_type: "CUSTOMER",
        customer_id: invoice.customer_id,
        display_name: cust?.name || "Customer",
        credit_days: 30,
      },
    });
  }

  // 2. Check if this invoice is already linked to a ledger entry
  const existingLinked = await tx.ledgerEntry.findUnique({
    where: { invoice_id: invoice.id },
  });

  if (existingLinked) {
    // Mode replace: update amount & date
    await tx.ledgerEntry.update({
      where: { id: existingLinked.id },
      data: {
        entry_date: invoiceDate,
        debit: grandTotal,
        doc_no: invoice.invoice_number,
        doc_no_norm: normDoc,
        particulars_raw: `Bill No. ${invoice.invoice_number}`,
      },
    });
    return;
  }

  // 3. Link-Never-Duplicate: Check if an imported statement entry already has this bill number
  const existingImported = await tx.ledgerEntry.findFirst({
    where: {
      account_id: account.id,
      doc_no_norm: normDoc,
      entry_type: "SALE_INVOICE",
      is_void: false,
    },
  });

  if (existingImported) {
    const importedDeb = Number(existingImported.debit);
    const mismatch = Math.abs(importedDeb - grandTotal.toNumber()) > 0.5;

    await tx.ledgerEntry.update({
      where: { id: existingImported.id },
      data: {
        invoice_id: invoice.id,
        needs_review: mismatch,
      },
    });
    return;
  }

  // 4. Update statement through date if later
  if (!account.statement_through_date || invoiceDate > account.statement_through_date) {
    await tx.ledgerAccount.update({
      where: { id: account.id },
      data: { statement_through_date: invoiceDate },
    });
  }

  // 5. Post new SALE_INVOICE entry
  const lastOnDate = await tx.ledgerEntry.findFirst({
    where: { account_id: account.id, entry_date: invoiceDate },
    orderBy: { sort_seq: "desc" },
  });
  const nextSeq = (lastOnDate?.sort_seq || 0) + 1;

  await tx.ledgerEntry.create({
    data: {
      account_id: account.id,
      entry_date: invoiceDate,
      sort_seq: nextSeq,
      entry_type: "SALE_INVOICE",
      debit: grandTotal,
      credit: 0,
      doc_no: invoice.invoice_number,
      doc_no_norm: normDoc,
      invoice_id: invoice.id,
      particulars_raw: `Bill No. ${invoice.invoice_number}`,
      source: "INVOICE_AUTO",
    },
  });
}

/**
 * Removes or unlinks a Sales Invoice ledger entry when invoice is deleted.
 */
export async function removeSalesInvoiceFromLedger(
  tx: Prisma.TransactionClient,
  invoiceId: string
): Promise<void> {
  const entry = await tx.ledgerEntry.findUnique({
    where: { invoice_id: invoiceId },
  });

  if (!entry) return;

  if (entry.source === "INVOICE_AUTO") {
    // Hard delete automatic entry
    await tx.ledgerEntry.delete({
      where: { id: entry.id },
    });
  } else {
    // Statement imported row was merely linked: unlink it
    await tx.ledgerEntry.update({
      where: { id: entry.id },
      data: { invoice_id: null },
    });
  }
}

/**
 * Posts or links a Purchase Invoice to the Supplier's Ledger Account.
 */
export async function postPurchaseInvoiceToLedger(
  tx: Prisma.TransactionClient,
  purchase: {
    id: string;
    supplier_invoice_number: string;
    invoice_date: Date | string;
    supplier_id: string;
    grand_total: Decimal | number | string;
  }
): Promise<void> {
  const invoiceDate = new Date(purchase.invoice_date);
  const grandTotal = new Decimal(purchase.grand_total.toString());
  const normDoc = normalizeInvoiceNumber(purchase.supplier_invoice_number);

  let account = await tx.ledgerAccount.findUnique({
    where: { supplier_id: purchase.supplier_id },
  });

  if (!account) {
    const sup = await tx.supplier.findUnique({
      where: { id: purchase.supplier_id },
      select: { name: true },
    });
    account = await tx.ledgerAccount.create({
      data: {
        account_type: "SUPPLIER",
        supplier_id: purchase.supplier_id,
        display_name: sup?.name || "Supplier",
        credit_days: 30,
      },
    });
  }

  const existingLinked = await tx.ledgerEntry.findUnique({
    where: { purchase_invoice_id: purchase.id },
  });

  if (existingLinked) {
    await tx.ledgerEntry.update({
      where: { id: existingLinked.id },
      data: {
        entry_date: invoiceDate,
        credit: grandTotal,
        doc_no: purchase.supplier_invoice_number,
        doc_no_norm: normDoc,
        particulars_raw: `Bill No. ${purchase.supplier_invoice_number}`,
      },
    });
    return;
  }

  const existingImported = await tx.ledgerEntry.findFirst({
    where: {
      account_id: account.id,
      doc_no_norm: normDoc,
      entry_type: "PURCHASE_INVOICE",
      is_void: false,
    },
  });

  if (existingImported) {
    await tx.ledgerEntry.update({
      where: { id: existingImported.id },
      data: {
        purchase_invoice_id: purchase.id,
      },
    });
    return;
  }

  if (account.statement_through_date) {
    const cutOff = new Date(account.statement_through_date);
    if (invoiceDate <= cutOff) {
      return;
    }
  }

  const lastOnDate = await tx.ledgerEntry.findFirst({
    where: { account_id: account.id, entry_date: invoiceDate },
    orderBy: { sort_seq: "desc" },
  });
  const nextSeq = (lastOnDate?.sort_seq || 0) + 1;

  await tx.ledgerEntry.create({
    data: {
      account_id: account.id,
      entry_date: invoiceDate,
      sort_seq: nextSeq,
      entry_type: "PURCHASE_INVOICE",
      debit: 0,
      credit: grandTotal,
      doc_no: purchase.supplier_invoice_number,
      doc_no_norm: normDoc,
      purchase_invoice_id: purchase.id,
      particulars_raw: `Bill No. ${purchase.supplier_invoice_number}`,
      source: "INVOICE_AUTO",
    },
  });
}

/**
 * Removes or unlinks a Purchase Invoice ledger entry.
 */
export async function removePurchaseInvoiceFromLedger(
  tx: Prisma.TransactionClient,
  purchaseId: string
): Promise<void> {
  const entry = await tx.ledgerEntry.findUnique({
    where: { purchase_invoice_id: purchaseId },
  });

  if (!entry) return;

  if (entry.source === "INVOICE_AUTO") {
    await tx.ledgerEntry.delete({
      where: { id: entry.id },
    });
  } else {
    await tx.ledgerEntry.update({
      where: { id: entry.id },
      data: { purchase_invoice_id: null },
    });
  }
}
