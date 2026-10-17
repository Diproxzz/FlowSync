import { LLMProvider, ExtractionRequest, ExtractionResponse } from "../types";
import { env } from "@/lib/env";
import { parseInvoiceTextToDraft } from "@/lib/ocr/parse-invoice-text";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export class Qwen2VlProvider implements LLMProvider {
  id = "qwen2-vl" as const;
  name = "Qwen2-VL-2B (Quantized INT4)";

  isConfigured(): boolean {
    return true;
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResponse> {
    const baseUrl = env.OLLAMA_BASE_URL || "http://localhost:11434";
    const candidateModels = ["qwen2-vl:2b", "qwen2.5vl:3b", "qwen2.5vl", "qwen2-vl"];
    let rawOutput = "";
    let usedModel = "qwen2-vl-2b-int4";

    // 1. Try Ollama endpoints first if running
    if (req.images && req.images.length > 0) {
      for (const m of candidateModels) {
        try {
          const payload = {
            model: m,
            prompt: `${req.systemPrompt}\n\n${req.userPrompt}\n\nReturn strict JSON matching the ExtractedInvoice schema.`,
            images: [req.images[0].base64],
            stream: false,
            format: "json",
          };

          const res = await fetch(`${baseUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: req.signal,
          });

          if (res.ok) {
            const data = await res.json();
            if (data.response) {
              rawOutput = data.response;
              usedModel = m;
              break;
            }
          }
        } catch {
          // Continue to next candidate model
        }
      }
    }

    // 2. Fall back to scripts/ocr_pipeline.py --tier qwen_vl
    if (!rawOutput) {
      let tempImagePath: string | null = null;
      try {
        if (req.images && req.images.length > 0) {
          const tempFileName = `ocr_qwen_${crypto.randomBytes(6).toString("hex")}.png`;
          tempImagePath = path.resolve(process.cwd(), "storage/temp", tempFileName);
          await fs.mkdir(path.dirname(tempImagePath), { recursive: true });
          await fs.writeFile(tempImagePath, Buffer.from(req.images[0].base64, "base64"));
        } else {
          throw new Error("Qwen2-VL requires an invoice image for processing");
        }

        const scriptPath = path.resolve(process.cwd(), "scripts/ocr_pipeline.py");
        const { stdout } = await execFileAsync("python", [
          scriptPath,
          "--image",
          tempImagePath,
          "--tier",
          "qwen_vl",
        ]);

        const parsed = JSON.parse(stdout.trim());
        if (parsed.success && parsed.text) {
          rawOutput = parsed.text;
        } else {
          throw new Error(parsed.error || "Qwen2-VL failed to extract document");
        }
      } finally {
        if (tempImagePath) {
          await fs.unlink(tempImagePath).catch(() => {});
        }
      }
    }

    if (!rawOutput) {
      throw new Error("Qwen2-VL returned empty extraction");
    }

    // 3. Ensure JSON output matching schema
    try {
      const jsonCandidate = JSON.parse(rawOutput);
      if (jsonCandidate.customer && jsonCandidate.invoice) {
        return {
          rawText: rawOutput,
          model: usedModel,
        };
      }
    } catch {
      // Raw text or markdown returned -> run text parser
    }

    const structuredDraft = parseInvoiceTextToDraft(rawOutput);
    return {
      rawText: JSON.stringify(structuredDraft),
      model: usedModel,
    };
  }
}
