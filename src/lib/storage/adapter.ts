import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { env } from "@/lib/env";
import { compressPdf } from "@/lib/pdf/compress";

export interface StorageAdapter {
  saveTemp(buffer: Buffer, originalFilename: string): Promise<string>;
  getTempPath(token: string): string;
  getTemp(token: string): Promise<{ buffer: Buffer; filename: string }>;
  persist(token: string, finalKey: string): Promise<string>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
}

const TEMP_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const TEMP_FILE_TTL_MS = 24 * 60 * 60 * 1000;

class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;
  private tempDir: string;
  private lastTempCleanupAt = 0;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR || "./storage");
    this.tempDir = path.join(this.baseDir, "temp");
  }

  private async ensureDirs() {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  getTempPath(token: string): string {
    const tempPath = path.resolve(this.tempDir, token);
    const resolvedTemp = path.resolve(this.tempDir);
    if (!tempPath.startsWith(resolvedTemp + path.sep) && tempPath !== resolvedTemp) {
      throw new Error("Invalid storage token: directory traversal attempt");
    }
    return tempPath;
  }

  private async cleanupExpiredTemp(maxAgeMs = TEMP_FILE_TTL_MS): Promise<void> {
    const now = Date.now();
    if (now - this.lastTempCleanupAt < TEMP_CLEANUP_INTERVAL_MS) {
      return;
    }
    this.lastTempCleanupAt = now;

    try {
      const entries = await fs.readdir(this.tempDir, { withFileTypes: true });
      const resolvedTemp = path.resolve(this.tempDir);
      await Promise.all(
        entries.map(async (entry) => {
          if (!entry.isFile()) return;
          const entryPath = path.resolve(this.tempDir, entry.name);
          if (!entryPath.startsWith(resolvedTemp + path.sep)) return;
          try {
            const stat = await fs.stat(entryPath);
            if (now - stat.mtimeMs > maxAgeMs) {
              await fs.unlink(entryPath).catch(() => {});
            }
          } catch {
            // Ignore per-file stat/unlink race conditions
          }
        })
      );
    } catch {
      // Ignore cleanup errors if temp dir does not exist yet
    }
  }

  async saveTemp(buffer: Buffer, originalFilename: string): Promise<string> {
    await this.ensureDirs();
    void this.cleanupExpiredTemp();
    const token = crypto.randomUUID();
    const ext = path.extname(originalFilename) || ".pdf";
    const tempPath = path.join(this.tempDir, `${token}${ext}`);
    await fs.writeFile(tempPath, buffer);
    return `${token}${ext}`;
  }

  async getTemp(token: string): Promise<{ buffer: Buffer; filename: string }> {
    const tempPath = this.getTempPath(token);
    const buffer = await fs.readFile(tempPath);
    return { buffer, filename: token };
  }

  async persist(token: string, finalKey: string): Promise<string> {
    await this.ensureDirs();
    const tempPath = this.getTempPath(token);

    const finalPath = path.resolve(this.baseDir, finalKey);
    const resolvedBase = path.resolve(this.baseDir);
    if (!finalPath.startsWith(resolvedBase + path.sep) && finalPath !== resolvedBase) {
      throw new Error("Invalid storage key: directory traversal attempt");
    }
    await fs.mkdir(path.dirname(finalPath), { recursive: true });

    const isPdf =
      token.toLowerCase().endsWith(".pdf") ||
      finalKey.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      try {
        const stat = await fs.stat(tempPath);
        const maxBytes = 20 * 1024; // 20 KB
        if (stat.size > maxBytes) {
          await compressPdf(tempPath, finalPath, 20);
          await fs.unlink(tempPath).catch(() => {});
          return finalKey;
        }
      } catch (err) {
        console.error("Error during PDF compression in storage adapter:", err);
      }
    }

    await fs.rename(tempPath, finalPath);
    return finalKey;
  }

  async getFile(key: string): Promise<Buffer> {
    const filePath = path.resolve(this.baseDir, key);
    const resolvedBase = path.resolve(this.baseDir);
    if (!filePath.startsWith(resolvedBase + path.sep) && filePath !== resolvedBase) {
      throw new Error("Invalid storage key: directory traversal attempt");
    }
    return await fs.readFile(filePath);
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.resolve(this.baseDir, key);
    const resolvedBase = path.resolve(this.baseDir);
    if (!filePath.startsWith(resolvedBase + path.sep) && filePath !== resolvedBase) {
      return;
    }
    await fs.unlink(filePath).catch(() => {});
  }
}

export const storage = new LocalStorageAdapter();
