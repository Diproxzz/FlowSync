import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { env } from "@/lib/env";
import { compressPdf } from "@/lib/pdf/compress";

export interface StorageAdapter {
  saveTemp(buffer: Buffer, originalFilename: string): Promise<string>;
  getTemp(token: string): Promise<{ buffer: Buffer; filename: string }>;
  persist(token: string, finalKey: string): Promise<string>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
}

class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;
  private tempDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR || "./storage");
    this.tempDir = path.join(this.baseDir, "temp");
  }

  private async ensureDirs() {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  async saveTemp(buffer: Buffer, originalFilename: string): Promise<string> {
    await this.ensureDirs();
    const token = crypto.randomUUID();
    const ext = path.extname(originalFilename) || ".pdf";
    const tempPath = path.join(this.tempDir, `${token}${ext}`);
    await fs.writeFile(tempPath, buffer);
    return `${token}${ext}`;
  }

  async getTemp(token: string): Promise<{ buffer: Buffer; filename: string }> {
    const tempPath = path.join(this.tempDir, token);
    const buffer = await fs.readFile(tempPath);
    return { buffer, filename: token };
  }

  async persist(token: string, finalKey: string): Promise<string> {
    await this.ensureDirs();
    const tempPath = path.join(this.tempDir, token);
    const finalPath = path.join(this.baseDir, finalKey);
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
    const filePath = path.join(this.baseDir, key);
    return await fs.readFile(filePath);
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    await fs.unlink(filePath).catch(() => {});
  }
}

export const storage = new LocalStorageAdapter();
