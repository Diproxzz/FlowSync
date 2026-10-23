import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

async function runRestore() {
  const args = process.argv.slice(2);
  const baseDir = path.resolve(process.cwd(), "backups", "daily");

  let targetDir: string | null = null;

  if (args[0]) {
    targetDir = path.resolve(process.cwd(), args[0]);
  } else {
    // Find latest backup directory
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

  // 1. Verify files exist
  const manifestPath = path.join(targetDir, "manifest.json");
  const jsonDumpPath = path.join(targetDir, "profile-data.json");
  const pgDumpPath = path.join(targetDir, "database.dump");
  const backupStorageDir = path.join(targetDir, "storage");

  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    console.log(`[Restore] Backup Timestamp: ${manifest.backup?.timestamp}`);
    console.log(`[Restore] Profile: ${manifest.profile?.companyName} (${manifest.profile?.companyGstin})`);
    console.log(`[Restore] Records in backup:`, manifest.backup?.counts);
  }

  // 2. Restore Storage files
  if (fs.existsSync(backupStorageDir)) {
    const targetStorage = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || "./storage");
    fs.mkdirSync(targetStorage, { recursive: true });
    console.log(`[Restore] Restoring storage files to ${targetStorage}...`);
    fs.cpSync(backupStorageDir, targetStorage, { recursive: true });
    console.log(`[Restore] Storage files restored successfully.`);
  }

  // 3. Restore Database via pg_restore if binary dump is available
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

  if (!restoredViaPg && fs.existsSync(jsonDumpPath)) {
    console.log(`[Restore] Note: 'profile-data.json' is available with full table snapshots.`);
  }

  console.log(`[Restore] ========================================================`);
  console.log(`[Restore] Restore complete!`);
  console.log(`[Restore] ========================================================`);

  await prisma.$disconnect();
}

runRestore().catch((err) => {
  console.error("[Restore] Restore failed:", err);
  process.exit(1);
});
