import { rasterizePdf, RasterizedPage } from "./rasterize";

export interface PdfInspectionResult {
  hasTextLayer: boolean;
  pages: RasterizedPage[];
  extractedText: string;
}

export async function inspectAndRasterizePdf(filePath: string): Promise<PdfInspectionResult> {
  const pages = await rasterizePdf(filePath, 150);
  const combinedText = pages.map((p) => p.text).join("\n").trim();
  const hasTextLayer = combinedText.length > 200;

  return {
    hasTextLayer,
    pages,
    extractedText: combinedText,
  };
}
