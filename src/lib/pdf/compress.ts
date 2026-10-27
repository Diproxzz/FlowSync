import { execFile } from "child_process";
import path from "path";
import fs from "fs/promises";
import { promisify } from "util";
import { getPythonBin } from "./rasterize";

const execFileAsync = promisify(execFile);

/**
 * Compresses a PDF file below `maxKb` (default 20 KB) using Python PyMuPDF.
 * Preserves text clarity, numbers, and layout.
 * If Python is unavailable, gracefully falls back to copying the original file.
 */
export async function compressPdf(
  inputPath: string,
  outputPath: string,
  maxKb: number = 20
): Promise<void> {
  const scriptPath = path.resolve(process.cwd(), "scripts/compress_pdf.py");
  try {
    const pythonBin = await getPythonBin();
    if (!pythonBin) {
      throw new Error("No Python binary detected on system");
    }

    const { stdout, stderr } = await execFileAsync(pythonBin, [
      scriptPath,
      inputPath,
      outputPath,
      String(maxKb),
    ]);

    if (stderr && !stdout) {
      console.warn(`[compressPdf] Warning/stderr: ${stderr}`);
    }
  } catch (err: any) {
    console.warn("[compressPdf] Compression unavailable or failed, falling back to copy:", err?.message || err);
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      await fs.copyFile(inputPath, outputPath);
    }
  }
}
