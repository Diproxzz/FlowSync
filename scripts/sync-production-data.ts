import { prisma } from "../src/lib/db";
import { normalizeCustomerName } from "../src/lib/matching/normalize";
import { getOrCreateCustomerLedgerAccount } from "../src/lib/ledger/account-utils";
import { backfillCustomerContacts } from "../src/lib/customers/contact-sync";

/**
 * Runs during deployment / preDeployCommand (npm run db:sync).
 * Ensures customer Dipro exists with contact details and ledger account,
 * backfills existing customer contacts, and seeds initial business activity logs.
 */
export async function syncProductionData() {
  console.log("[Sync Production Data] Starting customer & business logs synchronization...");

  // 1. Ensure customer Dipro
  const name = "Dipro";
  const email = "chowdhurydipro123@gmail.com";
  const phone = "6290090297";
  const secondary_phone = "9836924296";
  const address = "Kolkata, West Bengal";
  const state_code = "19";
  const name_norm = normalizeCustomerName(name);

  let dipro = await prisma.customer.findFirst({
    where: {
      OR: [
        { name_norm },
        { email },
      ],
    },
  });

  if (!dipro) {
    dipro = await prisma.customer.create({
      data: {
        name,
        name_norm,
        email,
        phone,
        secondary_phone,
        address,
        state_code,
      },
    });
    console.log(`[Sync Production Data] Created customer "${name}" (${dipro.id}) with email ${email} and phone ${phone}`);
  } else {
    dipro = await prisma.customer.update({
      where: { id: dipro.id },
      data: {
        name,
        email,
        phone: phone || dipro.phone,
        secondary_phone: secondary_phone || dipro.secondary_phone,
        address: dipro.address || address,
        state_code: dipro.state_code || state_code,
      },
    });
    console.log(`[Sync Production Data] Updated customer "${name}" (${dipro.id}) contact details`);
  }

  // Ensure ledger account exists for Dipro
  const ledger = await getOrCreateCustomerLedgerAccount(dipro.id);
  console.log(`[Sync Production Data] Customer Dipro ledger account ready (${ledger?.id})`);

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

  // 4. Ensure customer Dipro creation log is recorded
  if (dipro) {
    const existingDiproLog = await prisma.businessLog.findFirst({
      where: {
        entity_type: "CUSTOMER",
        entity_id: dipro.id,
      },
    });

    if (!existingDiproLog) {
      await prisma.businessLog.create({
        data: {
          action: "CUSTOMER_CREATED",
          description: `Customer "Dipro" created with contact chowdhurydipro123@gmail.com`,
          entity_type: "CUSTOMER",
          entity_id: dipro.id,
          created_at: dipro.created_at,
          metadata: {
            name: dipro.name,
            email: dipro.email,
            phone: dipro.phone,
          },
        },
      });
      console.log(`[Sync Production Data] Logged customer creation activity for Dipro`);
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
