export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { runDailyBackup } from "@/../scripts/daily-backup";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const baseDir = path.resolve(process.cwd(), "backups", "daily");
    const latestPath = path.join(baseDir, "latest.json");

    let latestManifest: any = null;
    if (fs.existsSync(latestPath)) {
      try {
        latestManifest = JSON.parse(fs.readFileSync(latestPath, "utf-8"));
      } catch {}
    }

    // Direct download action
    if (action === "download" || action === "download-fresh") {
      let backupFile = "";
      if (action !== "download-fresh" && latestManifest?.backupDir) {
        const candidate = path.join(latestManifest.backupDir, "profile-data.json");
        if (fs.existsSync(candidate)) backupFile = candidate;
      }

      if (!backupFile) {
        const result = await runDailyBackup();
        backupFile = path.join(result.backupDir, "profile-data.json");
      }

      const fileBuffer = fs.readFileSync(backupFile);
      const dateStr = new Date().toISOString().split("T")[0];
      return new Response(fileBuffer, {
        status: 200,
        headers: {
          "Content-Disposition": `attachment; filename="flowsync-profile-backup-${dateStr}.json"`,
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      });
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
