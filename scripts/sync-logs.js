const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function syncAllBusinessLogs() {
  console.log("Starting business activity logs synchronization...");
  let invoicesCreated = 0;
  let invoicesUpdated = 0;
  let paymentsCreated = 0;
  let paymentsUpdated = 0;

  // 1. Process All Invoices
  const allInvoices = await prisma.invoice.findMany({
    select: {
      id: true,
      invoice_number: true,
      invoice_date: true,
      customer_name_snapshot: true,
      grand_total: true,
    },
    orderBy: { invoice_date: "asc" },
  });

  const existingInvoiceLogs = await prisma.businessLog.findMany({
    where: { entity_type: "INVOICE" },
    select: { id: true, entity_id: true, created_at: true },
  });

  const invoiceLogMap = new Map();
  for (const log of existingInvoiceLogs) {
    if (log.entity_id) {
      invoiceLogMap.set(log.entity_id, log);
    }
  }

  const toCreateInvoices = [];
  const toUpdateInvoices = [];

  for (const inv of allInvoices) {
    if (inv.invoice_number.toUpperCase().includes("TEST")) continue;

    const invDate = new Date(inv.invoice_date);
    const existing = invoiceLogMap.get(inv.id);
    const grandTotalNum = Number(inv.grand_total);
    const desc = `${inv.invoice_number} Invoice has been confirmed for ${inv.customer_name_snapshot} (₹ ${grandTotalNum.toLocaleString("en-IN")})`;

    if (existing) {
      const existingDate = new Date(existing.created_at);
      if (Math.abs(existingDate.getTime() - invDate.getTime()) > 60000) {
        toUpdateInvoices.push({
          id: existing.id,
          created_at: invDate,
          amount: grandTotalNum,
        });
      }
    } else {
      toCreateInvoices.push({
        action: "INVOICE_CONFIRMED",
        description: desc,
        entity_type: "INVOICE",
        entity_id: inv.id,
        amount: grandTotalNum,
        metadata: {
          invoiceNumber: inv.invoice_number,
          customerName: inv.customer_name_snapshot,
        },
        created_at: invDate,
      });
    }
  }

  if (toCreateInvoices.length > 0) {
    await prisma.businessLog.createMany({ data: toCreateInvoices });
    invoicesCreated = toCreateInvoices.length;
  }
  for (const item of toUpdateInvoices) {
    await prisma.businessLog.update({
      where: { id: item.id },
      data: { created_at: item.created_at, amount: item.amount },
    });
    invoicesUpdated++;
  }

  // 2. Process Customer Payments (RECEIPT / Credit)
  const customerReceipts = await prisma.ledgerEntry.findMany({
    where: {
      account: { account_type: "CUSTOMER" },
      credit: { gt: 0 },
      is_void: false,
      entry_type: { notIn: ["CREDIT_NOTE", "OPENING"] },
    },
    include: {
      account: {
        select: { display_name: true },
      },
    },
    orderBy: { entry_date: "asc" },
  });

  // 3. Process Supplier Payments (PAYMENT / Debit)
  const supplierPayments = await prisma.ledgerEntry.findMany({
    where: {
      account: { account_type: "SUPPLIER" },
      debit: { gt: 0 },
      is_void: false,
      entry_type: { notIn: ["DEBIT_NOTE", "OPENING"] },
    },
    include: {
      account: {
        select: { display_name: true },
      },
    },
    orderBy: { entry_date: "asc" },
  });

  const existingPaymentLogs = await prisma.businessLog.findMany({
    where: { entity_type: "PAYMENT" },
    select: { id: true, entity_id: true, created_at: true },
  });

  const paymentLogMap = new Map();
  for (const log of existingPaymentLogs) {
    if (log.entity_id) {
      paymentLogMap.set(log.entity_id, log);
    }
  }

  const toCreatePayments = [];
  const toUpdatePayments = [];

  // Sync Customer Receipts
  for (const entry of customerReceipts) {
    const entryDate = new Date(entry.entry_date);
    const amount = Number(entry.credit);
    const ref = entry.instrument_no
      ? ` via Cheque/Ref ${entry.instrument_no}`
      : entry.particulars_raw
      ? ` (${entry.particulars_raw})`
      : "";
    const desc = `${entry.account.display_name} paid ₹ ${amount.toLocaleString("en-IN")}${ref}`;

    const existing = paymentLogMap.get(entry.id);
    if (existing) {
      const existingDate = new Date(existing.created_at);
      if (Math.abs(existingDate.getTime() - entryDate.getTime()) > 60000) {
        toUpdatePayments.push({
          id: existing.id,
          created_at: entryDate,
          amount,
          description: desc,
        });
      }
    } else {
      toCreatePayments.push({
        action: "PAYMENT_RECEIVED",
        description: desc,
        entity_type: "PAYMENT",
        entity_id: entry.id,
        amount,
        metadata: {
          accountName: entry.account.display_name,
          entryType: entry.entry_type,
          docNo: entry.doc_no,
          paymentMode: entry.payment_mode,
          instrumentNo: entry.instrument_no,
        },
        created_at: entryDate,
      });
    }
  }

  // Sync Supplier Payments
  for (const entry of supplierPayments) {
    const entryDate = new Date(entry.entry_date);
    const amount = Number(entry.debit);
    const ref = entry.instrument_no
      ? ` via Cheque/Ref ${entry.instrument_no}`
      : entry.particulars_raw
      ? ` (${entry.particulars_raw})`
      : "";
    const desc = `Paid ₹ ${amount.toLocaleString("en-IN")} to ${entry.account.display_name}${ref}`;

    const existing = paymentLogMap.get(entry.id);
    if (existing) {
      const existingDate = new Date(existing.created_at);
      if (Math.abs(existingDate.getTime() - entryDate.getTime()) > 60000) {
        toUpdatePayments.push({
          id: existing.id,
          created_at: entryDate,
          amount,
          description: desc,
        });
      }
    } else {
      toCreatePayments.push({
        action: "PAYMENT_MADE",
        description: desc,
        entity_type: "PAYMENT",
        entity_id: entry.id,
        amount,
        metadata: {
          accountName: entry.account.display_name,
          entryType: entry.entry_type,
          docNo: entry.doc_no,
          paymentMode: entry.payment_mode,
          instrumentNo: entry.instrument_no,
        },
        created_at: entryDate,
      });
    }
  }

  if (toCreatePayments.length > 0) {
    await prisma.businessLog.createMany({ data: toCreatePayments });
    paymentsCreated = toCreatePayments.length;
  }
  for (const item of toUpdatePayments) {
    await prisma.businessLog.update({
      where: { id: item.id },
      data: {
        created_at: item.created_at,
        amount: item.amount,
        description: item.description,
      },
    });
    paymentsUpdated++;
  }

  console.log("Synchronization complete:", {
    invoicesCreated,
    invoicesUpdated,
    paymentsCreated,
    paymentsUpdated,
    totalSynced: invoicesCreated + invoicesUpdated + paymentsCreated + paymentsUpdated,
  });
}

if (require.main === module) {
  syncAllBusinessLogs()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

module.exports = { syncAllBusinessLogs };
