import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

export async function runDailyBackup(): Promise<{
  success: boolean;
  backupDir: string;
  manifest: Record<string, any>;
}> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const baseBackupsDir = path.resolve(process.cwd(), "backups", "daily");
  const targetBackupDir = path.join(baseBackupsDir, `${dateStr}_${timestamp}`);
  fs.mkdirSync(targetBackupDir, { recursive: true });

  console.log(`[Backup] ========================================================`);
  console.log(`[Backup] Starting End-of-Day Profile Backup: ${now.toISOString()}`);
  console.log(`[Backup] Destination: ${targetBackupDir}`);
  console.log(`[Backup] ========================================================`);

  // 1. Export all Profile Models to JSON
  console.log(`[Backup] 1/3 Exporting database tables to JSON...`);
  const [
    customers,
    customerAliases,
    products,
    productAliases,
    invoices,
    invoiceItems,
    invoiceRevisions,
    suppliers,
    supplierAliases,
    purchases,
    purchaseItems,
    purchaseRevisions,
    stockMovements,
    ledgerAccounts,
    ledgerEntries,
    ledgerAllocations,
    ledgerAudits,
    informalInvoices,
    informalInvoiceItems,
    settings,
    statementImports,
    uploadJobs,
    extractionLogs,
  ] = await Promise.all([
    prisma.customer.findMany(),
    prisma.customerAlias.findMany(),
    prisma.product.findMany(),
    prisma.productAlias.findMany(),
    prisma.invoice.findMany(),
    prisma.invoiceItem.findMany(),
    prisma.invoiceRevision.findMany(),
    prisma.supplier.findMany(),
    prisma.supplierAlias.findMany(),
    prisma.purchaseInvoice.findMany(),
    prisma.purchaseInvoiceItem.findMany(),
    prisma.purchaseInvoiceRevision.findMany(),
    prisma.stockMovement.findMany(),
    prisma.ledgerAccount.findMany(),
    prisma.ledgerEntry.findMany(),
    prisma.ledgerAllocation.findMany(),
    prisma.ledgerAudit.findMany(),
    prisma.informalInvoice.findMany(),
    prisma.informalInvoiceItem.findMany(),
    prisma.setting.findMany(),
    prisma.statementImport.findMany(),
    prisma.uploadJob.findMany(),
    prisma.extractionLog.findMany(),
  ]);

  const allData = {
    profile: {
      companyName: process.env.COMPANY_NAME || "INDOBEST",
      companyGstin: process.env.COMPANY_GSTIN || "19AVZPC2361G1ZA",
      appUsername: process.env.APP_USERNAME || "Indobest",
    },
    meta: {
      backupTimestamp: now.toISOString(),
      backupDate: dateStr,
    },
    tables: {
      customers,
      customerAliases,
      products,
      productAliases,
      invoices,
      invoiceItems,
      invoiceRevisions,
      suppliers,
      supplierAliases,
      purchases,
      purchaseItems,
      purchaseRevisions,
      stockMovements,
      ledgerAccounts,
      ledgerEntries,
      ledgerAllocations,
      ledgerAudits,
      informalInvoices,
      informalInvoiceItems,
      settings,
      statementImports,
      uploadJobs,
      extractionLogs,
    },
  };

  const jsonDumpPath = path.join(targetBackupDir, "profile-data.json");
  fs.writeFileSync(jsonDumpPath, JSON.stringify(allData, null, 2), "utf-8");
  console.log(`[Backup] Saved profile database export: ${jsonDumpPath}`);

  // 2. Storage backup (all scanned invoice PDFs, bills, files)
  console.log(`[Backup] 2/3 Backing up uploaded files & documents...`);
  const storageDir = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || "./storage");
  const backupStorageDir = path.join(targetBackupDir, "storage");
  let storageFileCount = 0;
  if (fs.existsSync(storageDir)) {
    fs.cpSync(storageDir, backupStorageDir, { recursive: true });
    const countFiles = (dir: string): number => {
      let count = 0;
      if (!fs.existsSync(dir)) return 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          count += countFiles(full);
        } else {
          count++;
        }
      }
      return count;
    };
    storageFileCount = countFiles(backupStorageDir);
    console.log(`[Backup] Successfully copied ${storageFileCount} files from storage.`);
  } else {
    console.log(`[Backup] Storage directory not found, skipping file copy.`);
  }

  // 3. Optional pg_dump SQL dump if PostgreSQL client tools are present
  console.log(`[Backup] 3/3 Checking for pg_dump utility...`);
  let hasPgDump = false;
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const parsedUrl = new URL(dbUrl);
      const dbUser = parsedUrl.username;
      const dbPass = decodeURIComponent(parsedUrl.password);
      const dbHost = parsedUrl.hostname;
      const dbPort = parsedUrl.port || "5432";
      const dbName = parsedUrl.pathname.replace(/^\//, "");

      const possiblePgPaths = [
        "pg_dump",
        "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
        "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
        "C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe",
      ];

      let pgDumpExe: string | null = null;
      for (const p of possiblePgPaths) {
        try {
          if (p.includes("\\")) {
            if (fs.existsSync(p)) {
              pgDumpExe = p;
              break;
            }
          }
        } catch {}
      }

      if (pgDumpExe) {
        const sqlDumpPath = path.join(targetBackupDir, "database.dump");
        console.log(`[Backup] Running pg_dump to ${sqlDumpPath}...`);
        execFileSync(
          pgDumpExe,
          ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", dbName, "-F", "c", "-b", "-f", sqlDumpPath],
          {
            env: {
              ...process.env,
              PGPASSWORD: dbPass,
            },
            stdio: "pipe",
          }
        );
        hasPgDump = true;
        console.log(`[Backup] Binary PostgreSQL dump completed successfully.`);
      }
    } catch (pgErr: any) {
      console.warn(`[Backup] Note: pg_dump was not executed (${pgErr.message}), JSON export is active.`);
    }
  }

  // 4. Write Backup Manifest
  const manifest = {
    version: "1.0",
    profile: {
      companyName: process.env.COMPANY_NAME || "INDOBEST",
      companyGstin: process.env.COMPANY_GSTIN || "19AVZPC2361G1ZA",
    },
    backup: {
      timestamp: now.toISOString(),
      date: dateStr,
      directory: targetBackupDir,
      hasPgDump,
      counts: {
        customers: customers.length,
        customerAliases: customerAliases.length,
        products: products.length,
        productAliases: productAliases.length,
        invoices: invoices.length,
        invoiceItems: invoiceItems.length,
        suppliers: suppliers.length,
        purchases: purchases.length,
        purchaseItems: purchaseItems.length,
        stockMovements: stockMovements.length,
        ledgerAccounts: ledgerAccounts.length,
        ledgerEntries: ledgerEntries.length,
        informalInvoices: informalInvoices.length,
        settings: settings.length,
        storageFiles: storageFileCount,
      },
    },
  };

  const manifestPath = path.join(targetBackupDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  // Also write "latest" pointer
  const latestPath = path.join(baseBackupsDir, "latest.json");
  fs.writeFileSync(latestPath, JSON.stringify(manifest, null, 2), "utf-8");

  console.log(`[Backup] ========================================================`);
  console.log(`[Backup] Daily backup completed successfully!`);
  console.log(`[Backup] Invoices: ${invoices.length} | Purchases: ${purchases.length} | Customers: ${customers.length} | Products: ${products.length} | Files: ${storageFileCount}`);
  console.log(`[Backup] ========================================================`);

  await prisma.$disconnect();

  return {
    success: true,
    backupDir: targetBackupDir,
    manifest,
  };
}

// If invoked directly from CLI
if (require.main === module || process.argv[1]?.endsWith("daily-backup.ts")) {
  runDailyBackup()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Backup] Backup failed:", err);
      process.exit(1);
    });
}
