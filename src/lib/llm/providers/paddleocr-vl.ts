import { LLMProvider, ExtractionRequest, ExtractionResponse } from "../types";
import { parseInvoiceTextToDraft } from "@/lib/ocr/parse-invoice-text";
import { env } from "@/lib/env";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export class PaddleOcrVlProvider implements LLMProvider {
  id = "paddleocr-vl" as const;
  name = "PaddleOCR-VL (0.9B)";

  isConfigured(): boolean {
    // Local pipeline available on this system
    return Boolean(env.ENABLE_LOCAL_MODELS);
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResponse> {
    if (!req.images || req.images.length === 0) {
      throw new Error("PaddleOCR-VL requires an invoice image for processing");
    }

    let tempImagePath: string | null = null;
    try {
      const tempFileName = `ocr_paddle_${crypto.randomBytes(6).toString("hex")}.png`;
      tempImagePath = path.resolve(process.cwd(), "storage/temp", tempFileName);
      await fs.mkdir(path.dirname(tempImagePath), { recursive: true });
      await fs.writeFile(tempImagePath, Buffer.from(req.images[0].base64, "base64"));

      const scriptPath = path.resolve(process.cwd(), "scripts/ocr_pipeline.py");
      const { stdout } = await execFileAsync("python", [
        scriptPath,
        "--image",
        tempImagePath,
        "--tier",
        "paddle",
      ]);

      const parsed = JSON.parse(stdout.trim());
      if (!parsed.success || !parsed.text) {
        throw new Error(parsed.error || "PaddleOCR-VL failed to extract document");
      }

      const structuredDraft = parseInvoiceTextToDraft(parsed.text);
      return {
        rawText: JSON.stringify(structuredDraft),
        model: "paddleocr-vl-0.9b",
      };
    } finally {
      if (tempImagePath) {
        await fs.unlink(tempImagePath).catch(() => {});
      }
    }
  }
}
