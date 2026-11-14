import { prisma } from "../src/lib/db";
import { formatParticularsText } from "../src/lib/ledger/particulars";

async function main() {
  const count = await prisma.businessLog.count();
  if (count > 0) {
    console.log(`Business logs already has ${count} records. Skipping seed.`);
    return;
  }

  console.log("Seeding initial business activity audit logs...");

  // 1. Invoices
  const recentInvoices = await prisma.invoice.findMany({
    orderBy: { created_at: "desc" },
    take: 15,
  });

  for (const inv of recentInvoices) {
    await prisma.businessLog.create({
      data: {
        action: inv.source_file_hash === "generator" ? "INVOICE_GENERATED" : "INVOICE_CONFIRMED",
        description: `${inv.invoice_number} Invoice has been ${inv.source_file_hash === "generator" ? "generated" : "confirmed"} for ${inv.customer_name_snapshot}`,
        entity_type: "INVOICE",
        entity_id: inv.id,
        amount: inv.grand_total,
        created_at: inv.created_at,
        metadata: {
          invoiceNumber: inv.invoice_number,
          customerName: inv.customer_name_snapshot,
          grandTotal: Number(inv.grand_total),
        },
      },
    });
  }

  // 2. Recent Ledger Receipts
  const receipts = await prisma.ledgerEntry.findMany({
    where: {
      entry_type: "RECEIPT",
      is_void: false,
    },
    include: {
      account: true,
    },
    orderBy: { entry_date: "desc" },
    take: 15,
  });

  for (const r of receipts) {
    const amt = Number(r.credit);
    const formatted = amt.toLocaleString("en-IN");
    const name = r.account.display_name;
    const inst = r.instrument_no ? ` via Cheque No. ${r.instrument_no}` : "";
    await prisma.businessLog.create({
      data: {
        action: "PAYMENT_RECEIVED",
        description: `${name} paid ₹ ${formatted}${inst}`,
        entity_type: "PAYMENT",
        entity_id: r.id,
        amount: r.credit,
        created_at: r.created_at || r.entry_date,
        metadata: {
          accountName: name,
          amount: amt,
          instrumentNo: r.instrument_no,
        },
      },
    });
  }

  const finalCount = await prisma.businessLog.count();
  console.log(`Seeded ${finalCount} initial business logs.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
