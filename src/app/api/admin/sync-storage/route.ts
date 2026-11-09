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

    const safeBasename = path.basename(file.name || "temp_bundle.tar.gz").replace(/[^a-zA-Z0-9._-]/g, "_");
    const archivePath = path.join(storageDir, safeBasename);
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(archivePath, Buffer.from(arrayBuffer));

    if (safeBasename.endsWith(".tar.gz") || safeBasename.endsWith(".tgz")) {
      await execFileAsync("tar", ["-xzf", archivePath, "-C", storageDir]);
    } else if (safeBasename.endsWith(".tar")) {
      await execFileAsync("tar", ["-xf", archivePath, "-C", storageDir]);
    } else {
      const pythonScript = `
import sys, os, zipfile
archive, target = sys.argv[1], sys.argv[2]
target_real = os.path.realpath(target)
with zipfile.ZipFile(archive, 'r') as z:
    for member in z.namelist():
        member_path = os.path.realpath(os.path.join(target, member))
        if not member_path.startswith(target_real + os.sep) and member_path != target_real:
            raise Exception("Unsafe zip entry detected: " + member)
    z.extractall(target)
`;
      const pythonBin = process.platform === "win32" ? "python" : "python3";
      await execFileAsync(pythonBin, ["-c", pythonScript, archivePath, storageDir]);
    }
    await fs.unlink(archivePath).catch(() => {});

    return NextResponse.json({ ok: true, message: "Storage synced successfully" });
  } catch (error: any) {
    console.error("Storage sync failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
