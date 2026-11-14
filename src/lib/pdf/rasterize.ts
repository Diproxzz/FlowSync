import { execFile } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import { createRequire } from "module";

const execFileAsync = promisify(execFile);

export interface RasterizedPage {
  pageNumber: number;
  text: string;
  hasText: boolean;
  pngBase64: string;
  width: number;
  height: number;
}

let cachedPythonBin: string | null = null;

/**
 * Searches for a usable Python executable across common environment and container paths.
 */
export async function getPythonBin(): Promise<string | null> {
  if (cachedPythonBin) return cachedPythonBin;

  const candidates = [
    process.env.PYTHON_BIN,
    process.platform === "win32" ? "python" : "python3",
    "python3",
    "python",
    "python3.11",
    "python3.12",
    "/root/.nix-profile/bin/python3",
    "/root/.nix-profile/bin/python",
    "/nix/var/nix/profiles/default/bin/python3",
    "/usr/bin/python3",
    "/usr/local/bin/python3",
  ].filter(Boolean) as string[];

  // Also check glob in /nix/store/*/bin/python3 if in a Linux/Nix environment
  if (process.platform === "linux" && fsSync.existsSync("/nix/store")) {
    try {
      const dirs = await fs.readdir("/nix/store");
      for (const d of dirs) {
        if (d.includes("python3-") || d.includes("python-3")) {
          const binPath = path.join("/nix/store", d, "bin/python3");
          if (fsSync.existsSync(binPath)) {
            candidates.push(binPath);
          }
        }
      }
    } catch {}
  }

  for (const bin of candidates) {
    try {
      if (bin.startsWith("/") && !fsSync.existsSync(bin)) {
        continue;
      }
      await execFileAsync(bin, ["--version"]);
      cachedPythonBin = bin;
      return bin;
    } catch {
      // continue checking next candidate
    }
  }

  return null;
}

/**
 * Pure Node.js fallback rasterizer using pdfjs-dist and @napi-rs/canvas.
 * Extracts text layers and produces page images without needing Python or external CLI binaries.
 */
export async function rasterizePdfPureNode(
  filePath: string,
  dpi = 100
): Promise<RasterizedPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const workerFile = path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    if (fsSync.existsSync(workerFile)) {
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerFile).href;
    }
  } catch {
    // worker optional in node
  }

  const standardFontDir = path.resolve(process.cwd(), "node_modules/pdfjs-dist/standard_fonts");
  const standardFontDataUrl = fsSync.existsSync(standardFontDir)
    ? pathToFileURL(standardFontDir).href + "/"
    : undefined;

  const cMapDir = path.resolve(process.cwd(), "node_modules/pdfjs-dist/cmaps");
  const cMapUrl = fsSync.existsSync(cMapDir)
    ? pathToFileURL(cMapDir).href + "/"
    : undefined;

  let createCanvasFn: any = null;
  try {
    const nodeRequire = createRequire(import.meta.url);
    const canvasPkg = nodeRequire("@napi-rs/canvas");
    createCanvasFn = canvasPkg?.createCanvas;

    // Polyfill canvas globals for pdfjs-dist font loading in Node.js
    if (canvasPkg) {
      if (canvasPkg.DOMMatrix && !(globalThis as any).DOMMatrix) {
        (globalThis as any).DOMMatrix = canvasPkg.DOMMatrix;
      }
      if (canvasPkg.ImageData && !(globalThis as any).ImageData) {
        (globalThis as any).ImageData = canvasPkg.ImageData;
      }
      if (canvasPkg.Path2D && !(globalThis as any).Path2D) {
        (globalThis as any).Path2D = canvasPkg.Path2D;
      }

      // Explicitly register bundled standard fonts into GlobalFonts so canvas renders text
      // on systems with zero installed OS fonts (e.g. minimal headless Linux containers).
      if (canvasPkg.GlobalFonts && standardFontDir && fsSync.existsSync(standardFontDir)) {
        const fontMappings = [
          { file: "LiberationSans-Regular.ttf", families: ["Helvetica", "Arial", "Verdana", "sans-serif", "Liberation Sans", "LiberationSans"] },
          { file: "LiberationSans-Bold.ttf", families: ["Helvetica-Bold", "Arial-Bold", "Verdana-Bold", "Liberation Sans Bold", "LiberationSans-Bold"] },
          { file: "LiberationSans-Italic.ttf", families: ["Helvetica-Oblique", "Arial-Italic", "Verdana-Italic", "Liberation Sans Italic", "LiberationSans-Italic"] },
          { file: "LiberationSans-BoldItalic.ttf", families: ["Helvetica-BoldOblique", "Arial-BoldItalic", "Verdana-BoldItalic", "Liberation Sans Bold Italic", "LiberationSans-BoldItalic"] },
        ];
        for (const m of fontMappings) {
          const fontFilePath = path.join(standardFontDir, m.file);
          if (fsSync.existsSync(fontFilePath)) {
            for (const fam of m.families) {
              try {
                canvasPkg.GlobalFonts.registerFromPath(fontFilePath, fam);
              } catch {}
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[rasterizePdfPureNode] @napi-rs/canvas could not be loaded via createRequire:", e);
  }

  const fileBytes = await fs.readFile(filePath);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(fileBytes),
    disableFontFace: false,
    useSystemFonts: true,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  const maxPages = Math.min(pdfDoc.numPages, 3);
  const pages: RasterizedPage[] = [];

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    let pngBase64 = "";
    let width = 0;
    let height = 0;

    if (createCanvasFn) {
      try {
        const scale = dpi / 72;
        const viewport = page.getViewport({ scale });
        width = Math.floor(viewport.width);
        height = Math.floor(viewport.height);

        const canvas = createCanvasFn(width, height);
        const context = canvas.getContext("2d");

        // Suppress font path generator warnings in Node.js canvas context
        const originalWarn = console.warn;
        console.warn = (...args: any[]) => {
          if (typeof args[0] === "string" && args[0].includes("getPathGenerator")) return;
          originalWarn(...args);
        };

        try {
          await page.render({
            canvasContext: context,
            viewport,
          }).promise;
          const pngBuffer = canvas.toBuffer("image/png");
          pngBase64 = pngBuffer.toString("base64");
        } finally {
          console.warn = originalWarn;
        }
      } catch (renderErr) {
        console.warn(`[rasterizePdfPureNode] Page ${i} canvas render failed, returning extracted text:`, renderErr);
      }
    }

    pages.push({
      pageNumber: i,
      text,
      hasText: text.length > 200,
      pngBase64,
      width,
      height,
    });
  }

  return pages;
}

/**
 * Primary PDF rasterizer.
 * Tries the high-speed Python PyMuPDF engine first; if Python is missing (e.g. ENOENT in production containers)
 * or fails, transparently falls back to the pure Node.js rasterizer without failing invoice uploads.
 */
export async function rasterizePdf(
  filePath: string,
  dpi = 100
): Promise<RasterizedPage[]> {
  const scriptPath = path.resolve(process.cwd(), "scripts/rasterize-pdf.py");

  // 1. Try Python first if available
  try {
    const pythonBin = await getPythonBin();
    if (pythonBin) {
      const { stdout, stderr } = await execFileAsync(
        pythonBin,
        [scriptPath, filePath, String(dpi)],
        { maxBuffer: 50 * 1024 * 1024 }
      );

      if (!stderr || stdout) {
        const parsed = JSON.parse(stdout.trim());
        if (!parsed.error && Array.isArray(parsed) && parsed.length > 0) {
          return parsed as RasterizedPage[];
        }
        if (parsed.error) {
          console.warn(`[rasterizePdf] Python script reported error: ${parsed.error}. Switching to pure Node.js engine...`);
        }
      }
    }
  } catch (pythonErr: any) {
    console.warn(`[rasterizePdf] Python rasterizer unavailable (${pythonErr?.message || pythonErr}). Switching to pure Node.js engine...`);
  }

  // 2. Fall back to pure Node.js rasterizer (pdfjs-dist + @napi-rs/canvas)
  try {
    return await rasterizePdfPureNode(filePath, dpi);
  } catch (nodeErr: any) {
    console.error("[rasterizePdf] Both Python and Node rasterization failed:", nodeErr);
    throw new Error(`PDF rasterization failed: ${nodeErr?.message || nodeErr}`);
  }
}
