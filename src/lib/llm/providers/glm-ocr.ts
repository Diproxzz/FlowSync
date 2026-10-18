import { LLMProvider, ExtractionRequest, ExtractionResponse } from "../types";
import { env } from "@/lib/env";
import { parseInvoiceTextToDraft } from "@/lib/ocr/parse-invoice-text";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export class GlmOcrProvider implements LLMProvider {
  id = "glm-ocr" as const;
  name = "GLM-OCR (0.9B)";

  isConfigured(): boolean {
    // Available via Ollama or local Python environment when running on this system
    return Boolean(env.ENABLE_LOCAL_MODELS);
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResponse> {
    const baseUrl = env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = "glm-ocr";
    let rawOutput = "";

    // 1. Try Ollama generate endpoint first
    if (req.images && req.images.length > 0) {
      try {
        const payload = {
          model,
          prompt: "Extract all text, tables, and structural content from this Indian GST sales invoice document exactly as it appears.",
          images: [req.images[0].base64],
          stream: false,
        };

        const res = await fetch(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: req.signal,
        });

        if (res.ok) {
          const data = await res.json();
          rawOutput = data.response;
        }
      } catch (err: any) {
        console.warn(`[GLM-OCR] Ollama direct endpoint unavailable (${err.message}), falling back to Python script...`);
      }
    }

    // 2. Fall back to scripts/ocr_pipeline.py --tier glm
    if (!rawOutput) {
      let tempImagePath: string | null = null;
      try {
        if (req.images && req.images.length > 0) {
          const tempFileName = `ocr_glm_${crypto.randomBytes(6).toString("hex")}.png`;
          tempImagePath = path.resolve(process.cwd(), "storage/temp", tempFileName);
          await fs.mkdir(path.dirname(tempImagePath), { recursive: true });
          await fs.writeFile(tempImagePath, Buffer.from(req.images[0].base64, "base64"));
        } else {
          throw new Error("GLM-OCR requires an invoice image for processing");
        }

        const scriptPath = path.resolve(process.cwd(), "scripts/ocr_pipeline.py");
        const { stdout } = await execFileAsync("python", [
          scriptPath,
          "--image",
          tempImagePath,
          "--tier",
          "glm",
        ]);

        const parsed = JSON.parse(stdout.trim());
        if (parsed.success && parsed.text) {
          rawOutput = parsed.text;
        } else {
          throw new Error(parsed.error || "GLM-OCR failed to extract document");
        }
      } finally {
        if (tempImagePath) {
          await fs.unlink(tempImagePath).catch(() => {});
        }
      }
    }

    if (!rawOutput) {
      throw new Error("GLM-OCR returned empty extraction");
    }

    // 3. Ensure JSON output matching schema
    try {
      const jsonCandidate = JSON.parse(rawOutput);
      if (jsonCandidate.customer && jsonCandidate.invoice) {
        return {
          rawText: rawOutput,
          model: "glm-ocr-0.9b",
        };
      }
    } catch {
      // Raw text/markdown returned -> run text parser
    }

    const structuredDraft = parseInvoiceTextToDraft(rawOutput);
    return {
      rawText: JSON.stringify(structuredDraft),
      model: "glm-ocr-0.9b",
    };
  }
}
