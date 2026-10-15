import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { LLMProvider, ProviderId, ProviderImage } from "./types";
import { ExtractedInvoice, ExtractedInvoiceSchema, ExtractedInvoiceJsonSchema } from "./schema";
import { getInvoiceSystemPrompt, getInvoiceUserPrompt } from "./prompts/invoice";
import { GeminiProvider } from "./providers/gemini";
import { OpenRouterProvider } from "./providers/openrouter";
import { GroqProvider } from "./providers/groq";
import { OllamaProvider } from "./providers/ollama";

export interface ExtractionResult {
  draft: ExtractedInvoice;
  provider: ProviderId;
  model: string;
  latencyMs: number;
}

export class ExtractionError extends Error {
  providerErrors: Array<{ provider: ProviderId; error: string }>;

  constructor(message: string, providerErrors: Array<{ provider: ProviderId; error: string }>) {
    super(message);
    this.name = "ExtractionError";
    this.providerErrors = providerErrors;
  }
}

export function stripFences(text: string): string {
  if (!text) return "";
  let clean = text.trim();
  // Strip ```json ... ``` or ``` ... ```
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*\n?/, "");
    clean = clean.replace(/\n?```\s*$/, "");
  }
  return clean.trim();
}

const PROVIDER_REGISTRY: Record<ProviderId, LLMProvider> = {
  gemini: new GeminiProvider(),
  openrouter: new OpenRouterProvider(),
  groq: new GroqProvider(),
  ollama: new OllamaProvider(),
};

export async function extractInvoiceData(input: {
  images?: ProviderImage[];
  text?: string;
  fileHash: string;
}): Promise<ExtractionResult> {
  const startTime = Date.now();

  // Determine provider order from DB settings or env
  const dbSetting = await prisma.setting.findUnique({ where: { key: "provider_order" } });
  const rawOrder = (dbSetting?.value as string[]) || env.LLM_PROVIDER_ORDER.split(",").map((s) => s.trim());
  const providerOrder = rawOrder.filter((id): id is ProviderId => id in PROVIDER_REGISTRY);

  const providerErrors: Array<{ provider: ProviderId; error: string }> = [];

  for (const providerId of providerOrder) {
    const provider = PROVIDER_REGISTRY[providerId];
    if (!provider || !provider.isConfigured()) {
      continue;
    }

    console.log(`[Extraction] Trying provider: ${provider.name} (${provider.id})...`);
    const providerStartTime = Date.now();
    let attempts = 0;
    let lastRawText = "";
    let lastZodIssues: string[] = [];

    // Up to 2 attempts per provider (initial + 1 repair retry on schema parse failure)
    while (attempts < 2) {
      attempts++;
      const isRetry = attempts === 2;

      let userPrompt = getInvoiceUserPrompt();
      if (isRetry && lastZodIssues.length > 0) {
        userPrompt += `\n\nCRITICAL FIX REQUIRED: Your previous JSON output failed validation with the following errors:\n- ${lastZodIssues.join("\n- ")}\n\nPlease return corrected JSON strictly matching the schema.`;
      }

      try {
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), 45000); // 45s timeout

        const response = await provider.extract({
          systemPrompt: getInvoiceSystemPrompt(),
          userPrompt,
          images: input.images,
          text: input.text,
          jsonSchema: ExtractedInvoiceJsonSchema,
          signal: timeoutController.signal,
        });

        clearTimeout(timeoutId);
        lastRawText = response.rawText;

        const cleanedJson = stripFences(response.rawText);
        let parsedJson: any;

        try {
          parsedJson = JSON.parse(cleanedJson);
        } catch (jsonErr: any) {
          lastZodIssues = [`Invalid JSON syntax: ${jsonErr.message}`];
          console.warn(`[Extraction] ${provider.name} attempt ${attempts} returned non-JSON.`);
          continue; // Trigger repair retry
        }

        const zodResult = ExtractedInvoiceSchema.safeParse(parsedJson);
        if (zodResult.success) {
          const latencyMs = Date.now() - providerStartTime;
          console.log(`[Extraction] Successfully extracted with ${provider.name} in ${latencyMs}ms.`);

          // Log extraction success
          if (env.LOG_EXTRACTION_PAYLOADS) {
            await prisma.extractionLog.create({
              data: {
                file_hash: input.fileHash,
                provider: provider.id,
                model: response.model,
                latency_ms: latencyMs,
                status: "SUCCESS",
                attempts,
                raw_response: parsedJson,
              },
            }).catch((err) => console.error("Failed to write extraction log:", err));
          }

          return {
            draft: zodResult.data,
            provider: provider.id,
            model: response.model,
            latencyMs,
          };
        } else {
          lastZodIssues = zodResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
          console.warn(
            `[Extraction] ${provider.name} attempt ${attempts} schema issues:`,
            lastZodIssues
          );
        }
      } catch (err: any) {
        console.error(`[Extraction] Provider ${provider.name} failed:`, err.message);
        providerErrors.push({ provider: provider.id, error: err.message });
        break; // Network / API error -> move to next provider
      }
    }

    // Both attempts for this provider failed schema parsing
    if (lastZodIssues.length > 0) {
      providerErrors.push({
        provider: provider.id,
        error: `Schema validation failed after 2 attempts: ${lastZodIssues.join("; ")}`,
      });
    }
  }

  // All providers failed
  const totalLatencyMs = Date.now() - startTime;
  console.error("[Extraction] All configured providers failed:", providerErrors);

  await prisma.extractionLog.create({
    data: {
      file_hash: input.fileHash,
      provider: "ALL_FAILED",
      model: "none",
      latency_ms: totalLatencyMs,
      status: "FAILED",
      attempts: providerErrors.length,
      validation: providerErrors,
    },
  }).catch((err) => console.error("Failed to write extraction log:", err));

  throw new ExtractionError("All configured AI extraction providers failed", providerErrors);
}
