import { execSync, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL not found in .env");
}

const parsedUrl = new URL(dbUrl);
const dbUser = parsedUrl.username;
const dbPass = decodeURIComponent(parsedUrl.password);
const dbHost = parsedUrl.hostname;
const dbPort = parsedUrl.port || "5432";
const dbName = parsedUrl.pathname.replace(/^\//, "");

const pgBinDir = "C:\\Program Files\\PostgreSQL\\16\\bin";
const pgDumpPath = path.join(pgBinDir, "pg_dump.exe");
const pgRestorePath = path.join(pgBinDir, "pg_restore.exe");
const createdbPath = path.join(pgBinDir, "createdb.exe");
const dropdbPath = path.join(pgBinDir, "dropdb.exe");
const psqlPath = path.join(pgBinDir, "psql.exe");

const envWithPass = {
  ...process.env,
  PGPASSWORD: dbPass,
  PATH: `${pgBinDir};${process.env.PATH || ""}`,
};

const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const backupDir = path.resolve(process.cwd(), "backups", timestamp);
fs.mkdirSync(backupDir, { recursive: true });

console.log(`[Backup] Target directory: ${backupDir}`);

// 1. Database dump
const dbDumpPath = path.join(backupDir, "db.dump");
console.log(`[Backup] Dumping database '${dbName}' to ${dbDumpPath}...`);
execFileSync(
  pgDumpPath,
  ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", dbName, "-F", "c", "-b", "-f", dbDumpPath],
  { env: envWithPass, stdio: "inherit" }
);

// 2. Storage backup
const storageDir = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || "./storage");
const backupStorageDir = path.join(backupDir, "storage");
if (fs.existsSync(storageDir)) {
  console.log(`[Backup] Copying storage from ${storageDir} to ${backupStorageDir}...`);
  fs.cpSync(storageDir, backupStorageDir, { recursive: true });
}

// 3. Code archive (tar.gz using git archive or tar)
const codeArchivePath = path.join(backupDir, "code.tar.gz");
console.log(`[Backup] Creating code archive ${codeArchivePath}...`);
try {
  execSync(`git archive --format=tar.gz -o "${codeArchivePath}" HEAD`, { stdio: "inherit" });
} catch {
  // Fallback to tar
  execSync(`tar --exclude="node_modules" --exclude=".next" --exclude="backups" -czf "${codeArchivePath}" .`, { stdio: "inherit" });
}

// 4. Config & Prisma Migration Status
const envExamplePath = path.resolve(process.cwd(), ".env.example");
if (fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, path.join(backupDir, ".env.example"));
}

console.log("[Backup] Checking prisma migrate status...");
let prismaStatus = "";
try {
  prismaStatus = execSync("npx prisma migrate status", { encoding: "utf8" });
} catch (err: any) {
  prismaStatus = err.stdout || err.message;
}

// 5. Test restore to prove backup works
console.log("[Backup] Testing restore into scratch database 'indobest_restore_test'...");
const scratchDb = "indobest_restore_test";

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

// Restore dump into scratch DB
try {
  execFileSync(pgRestorePath, ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", scratchDb, dbDumpPath], {
    env: envWithPass,
    stdio: "pipe",
  });
} catch (e: any) {
  // pg_restore returns non-zero if warnings occurred (e.g. owner notice), which is standard
  console.log("[Backup] pg_restore output:", e.stdout?.toString() || "");
}

// Compare table row counts
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

const liveCounts = getTableCounts(dbName);
const restoredCounts = getTableCounts(scratchDb);

console.log("[Backup] Comparing table counts:");
let countsMatch = true;
const comparisonRows: string[] = [];

for (const [table, count] of Object.entries(liveCounts)) {
  const rCount = restoredCounts[table];
  const match = count === rCount;
  if (!match) countsMatch = false;
  console.log(` - ${table}: live=${count}, restored=${rCount} [${match ? "OK" : "MISMATCH"}]`);
  comparisonRows.push(`| \`${table}\` | ${count} | ${rCount} | ${match ? "PASSED" : "FAILED"} |`);
}

// Clean up scratch DB
try {
  execFileSync(dropdbPath, ["-h", dbHost, "-p", dbPort, "-U", dbUser, scratchDb], {
    env: envWithPass,
    stdio: "pipe",
  });
  console.log(`[Backup] Scratch database '${scratchDb}' dropped successfully.`);
} catch (e) {
  console.error("Failed to drop scratch DB:", e);
}

if (!countsMatch) {
  throw new Error("Backup verification failed: live and restored table counts do not match!");
}

// 6. Write MANIFEST.md
const envKeys = Object.keys(process.env).sort();
const projectEnvKeys = fs
  .readFileSync(".env", "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split("=")[0].trim());

const manifestContent = `# Backup Manifest

**Timestamp:** \`${timestamp}\`
**Tag:** \`pre-purchase-module\`
**Branch:** \`feature/purchase-module\`
**Live Database:** \`${dbName}\` (PostgreSQL 16)
**Restore Verification:** **PASSED** (100% table row count match)

## Files Created
- \`db.dump\`: PostgreSQL custom format binary dump
- \`code.tar.gz\`: Git archive of codebase at \`pre-purchase-module\`
- \`storage/\`: Exact snapshot of local storage directory (\`${storageDir}\`)
- \`.env.example\`: Template environment configuration
- \`MANIFEST.md\`: This file

## Database Table Row Count Verification

| Table Name | Live Count | Restored Count | Status |
|:---|:---:|:---:|:---:|
${comparisonRows.join("\n")}

## Prisma Migration State
\`\`\`
${prismaStatus.trim()}
\`\`\`

## Redacted Environment Variable Names
The following environment variable keys are configured for this installation (values redacted):
${projectEnvKeys.map((k) => `- \`${k}\``).join("\n")}
`;

fs.writeFileSync(path.join(backupDir, "MANIFEST.md"), manifestContent, "utf8");
console.log(`[Backup] Manifest written to ${path.join(backupDir, "MANIFEST.md")}`);
console.log("[Backup] Verification COMPLETE and SUCCESSFUL!");
