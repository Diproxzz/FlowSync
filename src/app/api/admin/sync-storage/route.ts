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

    const filename = file.name || "temp_bundle.tar.gz";
    const archivePath = path.join(storageDir, filename);
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(archivePath, Buffer.from(arrayBuffer));

    if (filename.endsWith(".tar.gz") || filename.endsWith(".tgz")) {
      await execFileAsync("tar", ["-xzf", archivePath, "-C", storageDir]);
    } else if (filename.endsWith(".tar")) {
      await execFileAsync("tar", ["-xf", archivePath, "-C", storageDir]);
    } else {
      const pythonScript = `
import zipfile
with zipfile.ZipFile(r"${archivePath.replace(/\\/g, "/")}", 'r') as z:
    z.extractall(r"${storageDir.replace(/\\/g, "/")}")
`;
      const pythonBin = process.platform === "win32" ? "python" : "python3";
      await execFileAsync(pythonBin, ["-c", pythonScript]);
    }
    await fs.unlink(archivePath).catch(() => {});

    return NextResponse.json({ ok: true, message: "Storage synced successfully" });
  } catch (error: any) {
    console.error("Storage sync failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
