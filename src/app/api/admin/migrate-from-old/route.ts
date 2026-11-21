import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secretKey = req.nextUrl.searchParams.get("key");
  if (secretKey !== "migrate_now_indobest_2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oldUrl = process.env.OLD_DATABASE_URL;
  const newUrl = process.env.DATABASE_URL;

  if (!oldUrl || !newUrl) {
    return NextResponse.json(
      { error: "Both OLD_DATABASE_URL and DATABASE_URL must be configured" },
      { status: 500 }
    );
  }

  const oldPrisma = new PrismaClient({
    datasources: { db: { url: oldUrl } },
  });

  const newPrisma = new PrismaClient({
    datasources: { db: { url: newUrl } },
  });

  try {
    console.log("[Migration] Fetching latest records from old database...");
    const stats: Record<string, any> = {};

    // 1. Settings
    const settings = await oldPrisma.setting.findMany();
    await (newPrisma.setting as any).createMany({ data: settings, skipDuplicates: true });
    stats.settings = settings.length;

    // 2. Customers & Aliases
    const customers = await oldPrisma.customer.findMany();
    await (newPrisma.customer as any).createMany({ data: customers, skipDuplicates: true });
    stats.customers = customers.length;

    const customerAliases = await oldPrisma.customerAlias.findMany();
    await (newPrisma.customerAlias as any).createMany({ data: customerAliases, skipDuplicates: true });
    stats.customerAliases = customerAliases.length;

    // 3. Suppliers & Aliases
    const suppliers = await oldPrisma.supplier.findMany();
    await (newPrisma.supplier as any).createMany({ data: suppliers, skipDuplicates: true });
    stats.suppliers = suppliers.length;

    const supplierAliases = await oldPrisma.supplierAlias.findMany();
    await (newPrisma.supplierAlias as any).createMany({ data: supplierAliases, skipDuplicates: true });
    stats.supplierAliases = supplierAliases.length;

    // 4. Products & Aliases
    const products = await oldPrisma.product.findMany();
    await (newPrisma.product as any).createMany({ data: products, skipDuplicates: true });
    stats.products = products.length;

    const productAliases = await oldPrisma.productAlias.findMany();
    await (newPrisma.productAlias as any).createMany({ data: productAliases, skipDuplicates: true });
    stats.productAliases = productAliases.length;

    // 5. Upload Jobs
    const uploadJobs = await oldPrisma.uploadJob.findMany();
    await (newPrisma.uploadJob as any).createMany({ data: uploadJobs, skipDuplicates: true });
    stats.uploadJobs = uploadJobs.length;

    // 6. Invoices & Items & Revisions
    const invoices = await oldPrisma.invoice.findMany();
    await (newPrisma.invoice as any).createMany({ data: invoices, skipDuplicates: true });
    stats.invoices = invoices.length;

    const invoiceItems = await oldPrisma.invoiceItem.findMany();
    await (newPrisma.invoiceItem as any).createMany({ data: invoiceItems, skipDuplicates: true });
    stats.invoiceItems = invoiceItems.length;

    const invoiceRevisions = await oldPrisma.invoiceRevision.findMany();
    await (newPrisma.invoiceRevision as any).createMany({ data: invoiceRevisions, skipDuplicates: true });
    stats.invoiceRevisions = invoiceRevisions.length;

    // 7. Purchases & Items & Revisions
    const purchases = await oldPrisma.purchaseInvoice.findMany();
    await (newPrisma.purchaseInvoice as any).createMany({ data: purchases, skipDuplicates: true });
    stats.purchases = purchases.length;

    const purchaseItems = await oldPrisma.purchaseInvoiceItem.findMany();
    await (newPrisma.purchaseInvoiceItem as any).createMany({ data: purchaseItems, skipDuplicates: true });
    stats.purchaseItems = purchaseItems.length;

    const purchaseRevisions = await oldPrisma.purchaseInvoiceRevision.findMany();
    await (newPrisma.purchaseInvoiceRevision as any).createMany({ data: purchaseRevisions, skipDuplicates: true });
    stats.purchaseRevisions = purchaseRevisions.length;

    // 8. Informal Invoices & Items
    const informalInvoices = await oldPrisma.informalInvoice.findMany();
    await (newPrisma.informalInvoice as any).createMany({ data: informalInvoices, skipDuplicates: true });
    stats.informalInvoices = informalInvoices.length;

    const informalItems = await oldPrisma.informalInvoiceItem.findMany();
    await (newPrisma.informalInvoiceItem as any).createMany({ data: informalItems, skipDuplicates: true });
    stats.informalInvoiceItems = informalItems.length;

    // 9. Ledger Accounts & Imports
    const ledgerAccounts = await oldPrisma.ledgerAccount.findMany();
    await (newPrisma.ledgerAccount as any).createMany({ data: ledgerAccounts, skipDuplicates: true });
    stats.ledgerAccounts = ledgerAccounts.length;

    const statementImports = await oldPrisma.statementImport.findMany();
    await (newPrisma.statementImport as any).createMany({ data: statementImports, skipDuplicates: true });
    stats.statementImports = statementImports.length;

    // 10. Ledger Entries & Allocations & Audits
    const ledgerEntries = await oldPrisma.ledgerEntry.findMany();
    await (newPrisma.ledgerEntry as any).createMany({ data: ledgerEntries, skipDuplicates: true });
    stats.ledgerEntries = ledgerEntries.length;

    const ledgerAllocations = await oldPrisma.ledgerAllocation.findMany();
    await (newPrisma.ledgerAllocation as any).createMany({ data: ledgerAllocations, skipDuplicates: true });
    stats.ledgerAllocations = ledgerAllocations.length;

    const ledgerAudits = await oldPrisma.ledgerAudit.findMany();
    await (newPrisma.ledgerAudit as any).createMany({ data: ledgerAudits, skipDuplicates: true });
    stats.ledgerAudits = ledgerAudits.length;

    // 11. Stock Movements
    const stockMovements = await oldPrisma.stockMovement.findMany();
    await (newPrisma.stockMovement as any).createMany({ data: stockMovements, skipDuplicates: true });
    stats.stockMovements = stockMovements.length;

    // 12. Extraction Logs
    const extractionLogs = await oldPrisma.extractionLog.findMany();
    await (newPrisma.extractionLog as any).createMany({ data: extractionLogs, skipDuplicates: true });
    stats.extractionLogs = extractionLogs.length;

    // 13. Business Logs
    const businessLogs = await oldPrisma.businessLog.findMany();
    await (newPrisma.businessLog as any).createMany({ data: businessLogs, skipDuplicates: true });
    stats.businessLogs = businessLogs.length;

    // Check latest invoice date and ledger date in old db
    const maxInv = await oldPrisma.invoice.aggregate({ _max: { invoice_date: true, created_at: true } });
    const maxLedger = await oldPrisma.ledgerEntry.aggregate({ _max: { entry_date: true, created_at: true } });
    const maxLog = await oldPrisma.businessLog.aggregate({ _max: { created_at: true } });

    stats.latestDates = {
      maxInvoiceDate: maxInv._max.invoice_date,
      maxInvoiceCreated: maxInv._max.created_at,
      maxLedgerDate: maxLedger._max.entry_date,
      maxLedgerCreated: maxLedger._max.created_at,
      maxLogCreated: maxLog._max.created_at,
    };

    return NextResponse.json({ success: true, stats });
  } catch (err: any) {
    console.error("[Migration] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
  }
}
