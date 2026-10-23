import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface RasterizedPage {
  pageNumber: number;
  text: string;
  hasText: boolean;
  pngBase64: string;
  width: number;
  height: number;
}

export async function rasterizePdf(
  filePath: string,
  dpi = 150
): Promise<RasterizedPage[]> {
  const scriptPath = path.resolve(process.cwd(), "scripts/rasterize-pdf.py");
  try {
    const pythonBin = process.platform === "win32" ? "python" : "python3";
    const { stdout, stderr } = await execFileAsync(pythonBin, [
      scriptPath,
      filePath,
      String(dpi),
    ]);

    if (stderr && !stdout) {
      throw new Error(`PDF Rasterization error: ${stderr}`);
    }

    const pages = JSON.parse(stdout.trim());
    if (pages.error) {
      throw new Error(pages.error);
    }

    return pages as RasterizedPage[];
  } catch (err: any) {
    console.error("Failed to rasterize PDF:", err);
    throw new Error(`PDF rasterization failed: ${err.message}`);
  }
}
