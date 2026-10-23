import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

async function restoreModel(modelName: string, items: any[], uniqueKey = "id"): Promise<number> {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const delegate = (prisma as any)[modelName];
  if (!delegate || typeof delegate.upsert !== "function") return 0;

  let count = 0;
  for (const item of items) {
    try {
      const data = { ...item };
      const where: any = {};
      if (uniqueKey === "code" && data.code) where.code = data.code;
      else if (uniqueKey === "key" && data.key) where.key = data.key;
      else if (uniqueKey === "alias_norm" && data.alias_norm) where.alias_norm = data.alias_norm;
      else if (data.id) where.id = data.id;
      else continue;

      // Convert date strings to Date objects if needed
      for (const k of Object.keys(data)) {
        if (typeof data[k] === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data[k])) {
          data[k] = new Date(data[k]);
        }
      }

      await delegate.upsert({
        where,
        update: data,
        create: data,
      });
      count++;
    } catch {
      // Continue through individual item constraints
    }
  }
  return count;
}

export async function restoreFromJsonData(allData: any): Promise<{
  success: boolean;
  restoredCounts: Record<string, number>;
}> {
  const tables = allData?.tables || {};
  const counts: Record<string, number> = {};

  console.log(`[Restore] Starting Prisma table restore from JSON snapshot...`);

  // Dependency order: settings, master products, parties, transactions, ledger
  counts.settings = await restoreModel("setting", tables.settings, "key");
  counts.customers = await restoreModel("customer", tables.customers, "id");
  counts.customerAliases = await restoreModel("customerAlias", tables.customerAliases, "id");
  counts.suppliers = await restoreModel("supplier", tables.suppliers, "id");
  counts.supplierAliases = await restoreModel("supplierAlias", tables.supplierAliases, "id");
  counts.products = await restoreModel("product", tables.products, "code");
  counts.productAliases = await restoreModel("productAlias", tables.productAliases, "alias_norm");

  counts.invoices = await restoreModel("invoice", tables.invoices, "id");
  counts.invoiceItems = await restoreModel("invoiceItem", tables.invoiceItems, "id");
  counts.invoiceRevisions = await restoreModel("invoiceRevision", tables.invoiceRevisions, "id");

  counts.purchases = await restoreModel("purchaseInvoice", tables.purchases, "id");
  counts.purchaseItems = await restoreModel("purchaseInvoiceItem", tables.purchaseItems, "id");
  counts.purchaseRevisions = await restoreModel("purchaseInvoiceRevision", tables.purchaseRevisions, "id");

  counts.informalInvoices = await restoreModel("informalInvoice", tables.informalInvoices, "id");
  counts.informalInvoiceItems = await restoreModel("informalInvoiceItem", tables.informalInvoiceItems, "id");

  counts.ledgerAccounts = await restoreModel("ledgerAccount", tables.ledgerAccounts, "id");
  counts.ledgerEntries = await restoreModel("ledgerEntry", tables.ledgerEntries, "id");
  counts.ledgerAllocations = await restoreModel("ledgerAllocation", tables.ledgerAllocations, "id");
  counts.ledgerAudits = await restoreModel("ledgerAudit", tables.ledgerAudits, "id");

  counts.stockMovements = await restoreModel("stockMovement", tables.stockMovements, "id");
  counts.statementImports = await restoreModel("statementImport", tables.statementImports, "id");
  counts.uploadJobs = await restoreModel("uploadJob", tables.uploadJobs, "id");
  counts.extractionLogs = await restoreModel("extractionLog", tables.extractionLogs, "id");

  console.log(`[Restore] Prisma restore complete. Record counts:`, counts);
  return { success: true, restoredCounts: counts };
}

export async function runRestore(targetPath?: string) {
  const baseDir = path.resolve(process.cwd(), "backups", "daily");

  let targetDir: string | null = null;

  if (targetPath) {
    targetDir = path.resolve(process.cwd(), targetPath);
  } else {
    if (!fs.existsSync(baseDir)) {
      throw new Error(`Backups directory not found: ${baseDir}`);
    }

    const entries = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => ({
        name: e.name,
        path: path.join(baseDir, e.name),
        time: fs.statSync(path.join(baseDir, e.name)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);

    if (entries.length === 0) {
      throw new Error("No backup folders found in backups/daily/");
    }

    targetDir = entries[0].path;
  }

  console.log(`[Restore] ========================================================`);
  console.log(`[Restore] Restoring profile data from: ${targetDir}`);
  console.log(`[Restore] ========================================================`);

  let jsonDumpPath = path.join(targetDir, "profile-data.json");
  if (targetDir.endsWith(".json")) {
    jsonDumpPath = targetDir;
  }

  const manifestPath = path.join(path.dirname(jsonDumpPath), "manifest.json");
  const pgDumpPath = path.join(path.dirname(jsonDumpPath), "database.dump");
  const backupStorageDir = path.join(path.dirname(jsonDumpPath), "storage");

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      console.log(`[Restore] Backup Timestamp: ${manifest.backup?.timestamp}`);
      console.log(`[Restore] Profile: ${manifest.profile?.companyName} (${manifest.profile?.companyGstin})`);
    } catch {}
  }

  // 1. Restore Storage files
  if (fs.existsSync(backupStorageDir)) {
    const targetStorage = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || "./storage");
    fs.mkdirSync(targetStorage, { recursive: true });
    console.log(`[Restore] Restoring storage files to ${targetStorage}...`);
    fs.cpSync(backupStorageDir, targetStorage, { recursive: true });
    console.log(`[Restore] Storage files restored successfully.`);
  }

  // 2. Restore via pg_restore if binary dump exists
  const dbUrl = process.env.DATABASE_URL;
  let restoredViaPg = false;

  if (fs.existsSync(pgDumpPath) && dbUrl) {
    try {
      const parsedUrl = new URL(dbUrl);
      const dbUser = parsedUrl.username;
      const dbPass = decodeURIComponent(parsedUrl.password);
      const dbHost = parsedUrl.hostname;
      const dbPort = parsedUrl.port || "5432";
      const dbName = parsedUrl.pathname.replace(/^\//, "");

      const possiblePgPaths = [
        "pg_restore",
        "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_restore.exe",
        "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_restore.exe",
        "C:\\Program Files\\PostgreSQL\\14\\bin\\pg_restore.exe",
      ];

      let pgRestoreExe: string | null = null;
      for (const p of possiblePgPaths) {
        try {
          if (p.includes("\\")) {
            if (fs.existsSync(p)) {
              pgRestoreExe = p;
              break;
            }
          }
        } catch {}
      }

      if (pgRestoreExe) {
        console.log(`[Restore] Executing pg_restore into database '${dbName}'...`);
        execFileSync(
          pgRestoreExe,
          ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", dbName, "--clean", "--if-exists", pgDumpPath],
          {
            env: {
              ...process.env,
              PGPASSWORD: dbPass,
            },
            stdio: "pipe",
          }
        );
        restoredViaPg = true;
        console.log(`[Restore] PostgreSQL database restored successfully.`);
      }
    } catch (pgErr: any) {
      console.warn(`[Restore] pg_restore exited: ${pgErr.message}`);
    }
  }

  // 3. Fallback to Prisma JSON restoration
  if (!restoredViaPg && fs.existsSync(jsonDumpPath)) {
    console.log(`[Restore] Restoring records directly via Prisma from '${jsonDumpPath}'...`);
    const allData = JSON.parse(fs.readFileSync(jsonDumpPath, "utf-8"));
    await restoreFromJsonData(allData);
  }

  console.log(`[Restore] ========================================================`);
  console.log(`[Restore] Restore complete!`);
  console.log(`[Restore] ========================================================`);
}

if (process.argv[1]?.includes("restore-backup")) {
  const argPath = process.argv[2];
  runRestore(argPath)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[Restore] Restore failed:", err);
      process.exit(1);
    });
}
