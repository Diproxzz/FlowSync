import { prisma } from "../src/lib/db";
import { backfillCustomerContacts } from "../src/lib/customers/contact-sync";

/**
 * Runs during deployment / preDeployCommand (npm run db:sync).
 * Removes temporary test customer Dipro, backfills customer contacts,
 * and ensures initial business activity logs.
 */
export async function syncProductionData() {
  console.log("[Sync Production Data] Starting customer & business logs synchronization...");

  // 1. Remove temporary customer "Dipro" if present
  try {
    const diproRecords = await prisma.customer.findMany({
      where: {
        OR: [
          { name_norm: "dipro" },
          { name: { equals: "Dipro", mode: "insensitive" } },
          { email: "chowdhurydipro123@gmail.com" },
        ],
      },
    });

    for (const dipro of diproRecords) {
      // Clean up any business logs explicitly linked to Dipro
      await prisma.businessLog.deleteMany({
        where: {
          OR: [
            { entity_id: dipro.id },
            { description: { contains: "Dipro", mode: "insensitive" } },
          ],
        },
      }).catch(() => {});

      // Delete customer (cascades to regular/informal ledger accounts and aliases)
      await prisma.customer.delete({
        where: { id: dipro.id },
      }).catch((err) => {
        console.warn(`[Sync Production Data] Warning deleting customer ${dipro.id}:`, err.message);
      });

      console.log(`[Sync Production Data] Removed temporary customer "Dipro" (${dipro.id})`);
    }

    // Clean up any stray logs mentioning Dipro
    const deletedLogs = await prisma.businessLog.deleteMany({
      where: {
        OR: [
          { description: { contains: "Dipro", mode: "insensitive" } },
          { description: { contains: "chowdhurydipro123@gmail.com", mode: "insensitive" } },
        ],
      },
    }).catch(() => ({ count: 0 }));

    if (deletedLogs && deletedLogs.count > 0) {
      console.log(`[Sync Production Data] Cleaned up ${deletedLogs.count} temporary log entries for Dipro`);
    }
  } catch (err: any) {
    console.warn("[Sync Production Data] Warning removing temporary customer Dipro:", err.message);
  }

  // 2. Backfill existing customer contacts from addresses & metadata
  try {
    const contactSyncRes = await backfillCustomerContacts();
    console.log(`[Sync Production Data] Customer contacts backfilled: ${contactSyncRes.updated} updated / ${contactSyncRes.total} total`);
  } catch (err: any) {
    console.warn("[Sync Production Data] Warning during contact backfill:", err.message);
  }

  // 3. Ensure initial business activity audit logs
  const logCount = await prisma.businessLog.count();
  if (logCount === 0) {
    console.log("[Sync Production Data] Business activity logs table is empty. Seeding initial activity logs...");

    // Recent Invoices
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

    // Recent Receipts
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
      const accName = r.account.display_name;
      const inst = r.instrument_no ? ` via Cheque No. ${r.instrument_no}` : "";
      await prisma.businessLog.create({
        data: {
          action: "PAYMENT_RECEIVED",
          description: `${accName} paid ₹ ${formatted}${inst}`,
          entity_type: "PAYMENT",
          entity_id: r.id,
          amount: r.credit,
          created_at: r.created_at || r.entry_date,
          metadata: {
            accountName: accName,
            amount: amt,
            instrumentNo: r.instrument_no,
          },
        },
      });
    }
  }

  const finalLogCount = await prisma.businessLog.count();
  console.log(`[Sync Production Data] Synchronization complete. Total business logs: ${finalLogCount}`);
}

if (require.main === module) {
  syncProductionData()
    .catch((err) => {
      console.error("[Sync Production Data] Error:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
