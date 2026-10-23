export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { runDailyBackup } from "@/../scripts/daily-backup";

export async function GET() {
  try {
    const baseDir = path.resolve(process.cwd(), "backups", "daily");
    const latestPath = path.join(baseDir, "latest.json");

    let latestManifest: any = null;
    if (fs.existsSync(latestPath)) {
      try {
        latestManifest = JSON.parse(fs.readFileSync(latestPath, "utf-8"));
      } catch {}
    }

    const availableBackups: Array<{ name: string; createdAt: string }> = [];
    if (fs.existsSync(baseDir)) {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const stats = fs.statSync(path.join(baseDir, ent.name));
          availableBackups.push({
            name: ent.name,
            createdAt: stats.mtime.toISOString(),
          });
        }
      }
    }

    availableBackups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({
      success: true,
      latest: latestManifest,
      backups: availableBackups.slice(0, 15),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to retrieve backup info" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await runDailyBackup();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Backup API Error:", error);
    return NextResponse.json(
      { error: error.message || "Backup execution failed" },
      { status: 500 }
    );
  }
}
