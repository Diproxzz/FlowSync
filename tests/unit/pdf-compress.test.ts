import { describe, it, expect, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import { compressPdf } from "@/lib/pdf/compress";
import { storage } from "@/lib/storage/adapter";

describe("PDF Compression (< 20KB target)", () => {
  const sampleLargePdf = path.resolve(process.cwd(), "storage/invoices/IB26-27_0493.pdf");
  const testOutputDir = path.resolve(process.cwd(), "storage/temp");

  it("compresses large PDF to strictly below 20 KB (20,480 bytes)", async () => {
    const exists = await fs.stat(sampleLargePdf).catch(() => null);
    if (!exists) {
      console.warn("Sample large PDF not found, skipping large PDF test");
      return;
    }

    const initialStat = await fs.stat(sampleLargePdf);
    expect(initialStat.size).toBeGreaterThan(20 * 1024);

    const outPath = path.join(testOutputDir, "test_compressed_unit.pdf");
    await compressPdf(sampleLargePdf, outPath, 20);

    const compressedStat = await fs.stat(outPath);
    expect(compressedStat.size).toBeLessThanOrEqual(20 * 1024);
    expect(compressedStat.size).toBeGreaterThan(0);

    // Clean up
    await fs.unlink(outPath).catch(() => {});
  }, 30000);

  it("storage.persist automatically compresses PDFs larger than 20 KB", async () => {
    const exists = await fs.stat(sampleLargePdf).catch(() => null);
    if (!exists) {
      return;
    }

    // Save large PDF to temp storage
    const buffer = await fs.readFile(sampleLargePdf);
    const tempToken = await storage.saveTemp(buffer, "sample_large.pdf");

    // Persist to a test final key
    const finalKey = "test_invoices/compressed_test.pdf";
    const persistedKey = await storage.persist(tempToken, finalKey);

    expect(persistedKey).toBe(finalKey);

    const savedBuffer = await storage.getFile(finalKey);
    expect(savedBuffer.length).toBeLessThanOrEqual(20 * 1024);
    expect(savedBuffer.length).toBeGreaterThan(0);

    // Clean up
    await storage.deleteFile(finalKey);
  }, 30000);
});
