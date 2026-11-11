export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { env, isStrongSessionSecret } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { timingSafeEqualStrings } from "@/lib/auth/crypto";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  let archivePath = "";
  try {
    const authHeader = request.headers.get("authorization") || "";
    const session = await getSession();

    const isBearerAuthorized =
      isStrongSessionSecret(env.SESSION_SECRET) &&
      timingSafeEqualStrings(authHeader, `Bearer ${env.SESSION_SECRET}`);
    const isAdminAuthorized = Boolean(
      session?.authenticated && session?.role === "ADMIN" && !session?.isReadOnly
    );

    if (!isBearerAuthorized && !isAdminAuthorized) {
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
    const lowerName = safeBasename.toLowerCase();
    const isTar = lowerName.endsWith(".tar.gz") || lowerName.endsWith(".tgz") || lowerName.endsWith(".tar");
    const isZip = lowerName.endsWith(".zip");
    if (!isTar && !isZip) {
      return NextResponse.json({ error: "Unsupported archive format. Use .tar.gz, .tgz, .tar, or .zip." }, { status: 400 });
    }

    archivePath = path.join(storageDir, `.sync-${crypto.randomUUID()}-${safeBasename}`);
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(archivePath, Buffer.from(arrayBuffer));

    const pythonBin = process.platform === "win32" ? "python" : "python3";

    if (isTar) {
      const tarValidateAndExtract = `
import sys, os, tarfile
archive, target = sys.argv[1], sys.argv[2]
target_real = os.path.realpath(target)
with tarfile.open(archive, "r:*") as tf:
    members = tf.getmembers()
    for m in members:
        if m.issym() or m.islnk() or m.ischr() or m.isblk() or m.isfifo():
            raise Exception("Unsafe tar member type detected: " + m.name)
        normalized = m.name.replace("\\\\", "/")
        if os.path.isabs(m.name) or normalized.startswith("/") or ".." in normalized.split("/"):
            raise Exception("Unsafe tar path detected: " + m.name)
        member_path = os.path.realpath(os.path.join(target, m.name))
        if not member_path.startswith(target_real + os.sep) and member_path != target_real:
            raise Exception("Tar path traversal detected: " + m.name)
    for m in members:
        tf.extract(m, target)
`;
      await execFileAsync(pythonBin, ["-c", tarValidateAndExtract, archivePath, storageDir]);
    } else {
      const zipValidateAndExtract = `
import sys, os, zipfile, stat
archive, target = sys.argv[1], sys.argv[2]
target_real = os.path.realpath(target)
with zipfile.ZipFile(archive, "r") as z:
    for info in z.infolist():
        if stat.S_ISLNK(info.external_attr >> 16):
            raise Exception("Unsafe symlink detected in zip: " + info.filename)
        normalized = info.filename.replace("\\\\", "/")
        if os.path.isabs(info.filename) or normalized.startswith("/") or ".." in normalized.split("/"):
            raise Exception("Unsafe zip entry path detected: " + info.filename)
        member_path = os.path.realpath(os.path.join(target, info.filename))
        if not member_path.startswith(target_real + os.sep) and member_path != target_real:
            raise Exception("Unsafe zip entry detected: " + info.filename)
    z.extractall(target)
`;
      await execFileAsync(pythonBin, ["-c", zipValidateAndExtract, archivePath, storageDir]);
    }

    return NextResponse.json({ ok: true, message: "Storage synced successfully" });
  } catch (error: any) {
    console.error("Storage sync failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (archivePath) {
      await fs.unlink(archivePath).catch(() => {});
    }
  }
}
