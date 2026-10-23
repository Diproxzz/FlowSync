export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { env } from "@/lib/env";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${env.SESSION_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const storageDir = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR || "./storage");
    await fs.mkdir(storageDir, { recursive: true });

    const arrayBuffer = await file.arrayBuffer();
    const zipPath = path.join(storageDir, "temp_bundle.zip");
    await fs.writeFile(zipPath, Buffer.from(arrayBuffer));

    const pythonScript = `
import zipfile
with zipfile.ZipFile(r"${zipPath.replace(/\\/g, "/")}", 'r') as z:
    z.extractall(r"${storageDir.replace(/\\/g, "/")}")
`;
    const pythonBin = process.platform === "win32" ? "python" : "python3";
    try {
      await execFileAsync(pythonBin, ["-c", pythonScript]);
    } catch {
      await execFileAsync("tar", ["-xf", zipPath, "-C", storageDir]);
    }
    await fs.unlink(zipPath).catch(() => {});

    return NextResponse.json({ ok: true, message: "Storage synced successfully" });
  } catch (error: any) {
    console.error("Storage sync failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
