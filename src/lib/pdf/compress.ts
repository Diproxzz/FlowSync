import { execFile } from "child_process";
import path from "path";
import fs from "fs/promises";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Compresses a PDF file below `maxKb` (default 20 KB) using Python PyMuPDF.
 * Preserves text clarity, numbers, and layout.
 */
export async function compressPdf(
  inputPath: string,
  outputPath: string,
  maxKb: number = 20
): Promise<void> {
  const scriptPath = path.resolve(process.cwd(), "scripts/compress_pdf.py");
  try {
    const { stdout, stderr } = await execFileAsync("python", [
      scriptPath,
      inputPath,
      outputPath,
      String(maxKb),
    ]);

    if (stderr && !stdout) {
      console.warn(`[compressPdf] Warning/stderr: ${stderr}`);
    }
  } catch (err: any) {
    console.error("[compressPdf] Compression failed, falling back to copy:", err);
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      await fs.copyFile(inputPath, outputPath);
    }
  }
}
