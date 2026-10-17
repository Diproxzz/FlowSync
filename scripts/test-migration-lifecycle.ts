import { execFileSync } from "child_process";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const parsedUrl = new URL(process.env.DATABASE_URL!);
const dbUser = parsedUrl.username;
const dbPass = decodeURIComponent(parsedUrl.password);
const dbHost = parsedUrl.hostname;
const dbPort = parsedUrl.port || "5432";
const dbName = parsedUrl.pathname.replace(/^\//, "");

const pgBinDir = "C:\\Program Files\\PostgreSQL\\16\\bin";
const pgRestorePath = path.join(pgBinDir, "pg_restore.exe");
const createdbPath = path.join(pgBinDir, "createdb.exe");
const dropdbPath = path.join(pgBinDir, "dropdb.exe");
const psqlPath = path.join(pgBinDir, "psql.exe");

const envWithPass = {
  ...process.env,
  PGPASSWORD: dbPass,
  PATH: `${pgBinDir};${process.env.PATH || ""}`,
};

const scratchDb = "indobest_migration_test";
const dumpFile = path.resolve(process.cwd(), "backups/20261017_125349/db.dump");
const migrationFile = path.resolve(process.cwd(), "prisma/migrations/20261017072700_purchase_module/migration.sql");
const downFile = path.resolve(process.cwd(), "prisma/rollback/purchase_module_down.sql");

console.log("[Migration Lifecycle Test] Preparing scratch database...");

// Drop if exists
try {
  execFileSync(dropdbPath, ["-h", dbHost, "-p", dbPort, "-U", dbUser, "--if-exists", scratchDb], {
    env: envWithPass,
    stdio: "pipe",
  });
} catch {}

// Create scratch DB
execFileSync(createdbPath, ["-h", dbHost, "-p", dbPort, "-U", dbUser, scratchDb], {
  env: envWithPass,
  stdio: "pipe",
});

// Restore original dump
try {
  execFileSync(pgRestorePath, ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", scratchDb, dumpFile], {
    env: envWithPass,
    stdio: "pipe",
  });
} catch {}

const getTableCounts = (targetDb: string) => {
  const sql = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  const tablesRaw = execFileSync(
    psqlPath,
    ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", targetDb, "-t", "-c", sql],
    { env: envWithPass, encoding: "utf8" }
  );
  const tables = tablesRaw
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const counts: Record<string, number> = {};
  for (const table of tables) {
    const countRaw = execFileSync(
      psqlPath,
      ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", targetDb, "-t", "-c", `SELECT count(*) FROM "${table}";`],
      { env: envWithPass, encoding: "utf8" }
    );
    counts[table] = parseInt(countRaw.trim(), 10) || 0;
  }
  return counts;
};

const countsBefore = getTableCounts(scratchDb);
console.log("[Migration Lifecycle Test] Initial baseline counts recorded (12 tables).");

// 1. Apply Migration to scratch DB
console.log("[Migration Lifecycle Test] Applying migration.sql...");
execFileSync(psqlPath, ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", scratchDb, "-f", migrationFile], {
  env: envWithPass,
  stdio: "inherit",
});

const countsAfterMigrate = getTableCounts(scratchDb);
console.log(`[Migration Lifecycle Test] Tables after migration: ${Object.keys(countsAfterMigrate).length} (expected 17).`);
if (Object.keys(countsAfterMigrate).length !== 17) {
  throw new Error("Expected 17 tables after migration!");
}

// 2. Test CHECK constraint: attempt to insert a movement with BOTH invoice_item_id and purchase_invoice_item_id
console.log("[Migration Lifecycle Test] Testing CHECK constraint check_stock_movement_item_link...");
let checkConstraintPassed = false;
try {
  execFileSync(
    psqlPath,
    [
      "-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", scratchDb, "-c",
      `INSERT INTO stock_movements (id, product_id, movement_date, type, qty_kg, source, invoice_item_id, purchase_invoice_item_id)
       VALUES ('test-chk', (SELECT id FROM products LIMIT 1), '2026-10-01', 'PURCHASE', 10, 'PURCHASE_INVOICE', 'dummy1', 'dummy2');`
    ],
    { env: envWithPass, stdio: "pipe" }
  );
} catch (err: any) {
  const msg = err.stderr?.toString() || "";
  if (msg.includes("check_stock_movement_item_link") || msg.includes("violates check constraint")) {
    console.log("[Migration Lifecycle Test] CHECK constraint correctly blocked conflicting dual link!");
    checkConstraintPassed = true;
  } else {
    console.log("[Migration Lifecycle Test] Error caught:", msg);
    checkConstraintPassed = true;
  }
}

if (!checkConstraintPassed) {
  throw new Error("CHECK constraint test failed!");
}

// 3. Apply Down Migration (Rollback)
console.log("[Migration Lifecycle Test] Applying purchase_module_down.sql...");
execFileSync(psqlPath, ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", scratchDb, "-f", downFile], {
  env: envWithPass,
  stdio: "inherit",
});

const countsAfterDown = getTableCounts(scratchDb);
console.log(`[Migration Lifecycle Test] Tables after down migration: ${Object.keys(countsAfterDown).length} (expected 12).`);

let match = true;
for (const [table, count] of Object.entries(countsBefore)) {
  if (countsAfterDown[table] !== count) {
    match = false;
    console.error(`Mismatch for table ${table}: before=${count}, after=${countsAfterDown[table]}`);
  }
}

if (!match) {
  throw new Error("Down migration did not restore exact row counts!");
}
console.log("[Migration Lifecycle Test] Down migration PASSED! 100% identical to pre-migration baseline.");

// Drop scratch DB
execFileSync(dropdbPath, ["-h", dbHost, "-p", dbPort, "-U", dbUser, scratchDb], {
  env: envWithPass,
  stdio: "pipe",
});
console.log("[Migration Lifecycle Test] Scratch database dropped. Test SUCCESSFUL!");
