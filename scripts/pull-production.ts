import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { runRestore } from "./restore-backup";
import { syncProductMaster } from "./sync-product-master";

dotenv.config();

async function main() {
  const arg = process.argv[2];
  let targetUrlOrFile = arg || process.env.PRODUCTION_URL;

  console.log(`[Sync Production] ========================================================`);
  console.log(`[Sync Production] Mirroring Production Data & Changes to Local Environment`);
  console.log(`[Sync Production] ========================================================`);

  // 1. Sync local product master & commercial names from seed
  console.log(`[Sync Production] Step 1/2: Verifying product master & commercial names...`);
  await syncProductMaster();

  // 2. Determine target source
  if (!targetUrlOrFile) {
    console.log(`\n[Sync Production] Note: No PRODUCTION_URL provided in .env or arguments.`);
    console.log(`[Sync Production] Checking latest downloaded backup in ./backups/daily/...`);
    
    const baseDir = path.resolve(process.cwd(), "backups", "daily");
    if (fs.existsSync(baseDir)) {
      const entries = fs
        .readdirSync(baseDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => ({
          name: e.name,
          path: path.join(baseDir, e.name),
          time: fs.statSync(path.join(baseDir, e.name)).mtimeMs,
        }))
        .sort((a, b) => b.time - a.time);

      if (entries.length > 0) {
        console.log(`[Sync Production] Found latest backup: ${entries[0].name}`);
        targetUrlOrFile = entries[0].path;
      }
    }
  }

  if (targetUrlOrFile && (targetUrlOrFile.startsWith("http://") || targetUrlOrFile.startsWith("https://"))) {
    const cleanUrl = targetUrlOrFile.replace(/\/$/, "");
    const downloadEndpoint = `${cleanUrl}/api/admin/backup?action=download`;
    console.log(`[Sync Production] Step 2/2: Pulling live snapshot from production: ${downloadEndpoint}...`);

    try {
      const res = await fetch(downloadEndpoint);
      if (!res.ok) {
        throw new Error(`Production server returned HTTP ${res.status}: ${res.statusText}`);
      }

      const backupJson = await res.json();
      const syncDir = path.resolve(process.cwd(), "backups", "daily", "production_sync");
      fs.mkdirSync(syncDir, { recursive: true });
      const syncFile = path.join(syncDir, "profile-data.json");
      fs.writeFileSync(syncFile, JSON.stringify(backupJson, null, 2), "utf-8");

      console.log(`[Sync Production] Successfully downloaded live production snapshot (${(fs.statSync(syncFile).size / 1024).toFixed(1)} KB)`);
      console.log(`[Sync Production] Restoring into local database...`);
      await runRestore(syncFile);
      console.log(`[Sync Production] ✅ Local database is now 100% in sync with production!`);
      return;
    } catch (err: any) {
      console.error(`[Sync Production] Failed to fetch live from production URL:`, err.message);
      console.log(`\n[Sync Production] TIP: You can also download the backup file from your production`);
      console.log(`app UI at /settings, and run:`);
      console.log(`npm run pull:production -- <path-to-downloaded-backup.json>\n`);
      process.exit(1);
    }
  }

  if (targetUrlOrFile && fs.existsSync(targetUrlOrFile)) {
    console.log(`[Sync Production] Step 2/2: Restoring from backup file: ${targetUrlOrFile}...`);
    await runRestore(targetUrlOrFile);
    console.log(`[Sync Production] ✅ Local database is now 100% in sync!`);
    return;
  }

  console.log(`\n[Sync Production] How to sync live production data to your local machine:`);
  console.log(`Option 1: Set PRODUCTION_URL in .env (e.g. PRODUCTION_URL=https://your-app.up.railway.app)`);
  console.log(`          Then run: npm run pull:production`);
  console.log(`Option 2: Run with your production URL directly:`);
  console.log(`          npm run pull:production -- https://your-app.up.railway.app`);
  console.log(`Option 3: Download backup from Settings page on production, then run:`);
  console.log(`          npm run pull:production -- path/to/flowsync-profile-backup.json`);
  console.log(`Option 4: Point DATABASE_URL in .env to your production database URL for real-time live sync.`);
}

main().catch((err) => {
  console.error("[Sync Production] Error:", err);
  process.exit(1);
});
