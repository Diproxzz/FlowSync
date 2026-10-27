import { LLMProvider, ExtractionRequest, ExtractionResponse } from "../types";
import { env } from "@/lib/env";

export function getGroqKeys(): string[] {
  const raw = [env.GROQ_API_KEYS, env.GROQ_API_KEY].filter(Boolean).join(",");
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  return Array.from(new Set(keys));
}

let activeKeyIndex = 0;

export class GroqProvider implements LLMProvider {
  id = "groq" as const;
  name = "Groq (Qwen 3.8)";

  isConfigured(): boolean {
    return getGroqKeys().length > 0;
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResponse> {
    const keys = getGroqKeys();
    if (keys.length === 0) {
      throw new Error("No Groq API keys configured in environment");
    }

    const defaultModel = env.GROQ_MODEL || "qwen/qwen3.8-27b";
    const candidateModels = Array.from(
      new Set([defaultModel, "llama-3.3-70b-versatile", "llama-3.1-8b-instant"])
    );
    const url = "https://api.groq.com/openai/v1/chat/completions";

    const hasRichText = Boolean(req.text && req.text.trim().length > 150);
    const validImages = (req.images || []).filter(
      (img) => img && typeof img.base64 === "string" && img.base64.trim().length > 100
    );

    // If document has a digital text layer, omit heavy image URLs to stay well within
    // Groq's 7,000 on_demand Input Tokens Per Minute (ITPM) quota. Text-only extraction uses ~1,500 tokens.
    let includeImagesInPayload = !hasRichText && validImages.length > 0;

    const buildUserContent = (includeImages: boolean) => {
      const content: any[] = [];
      content.push({ type: "text", text: req.userPrompt });

      if (req.text) {
        content.push({ type: "text", text: `Document text layer:\n${req.text}` });
      }

      if (includeImages && validImages.length > 0) {
        // Send at most 1 page image to minimize vision token footprint
        for (const img of validImages.slice(0, 1)) {
          content.push({
            type: "image_url",
            image_url: {
              url: `data:${img.mime};base64,${img.base64}`,
            },
          });
        }
      }
      return content;
    };

    let lastError: Error | null = null;
    const totalKeys = keys.length;

    for (const model of candidateModels) {
      for (let keyAttempt = 0; keyAttempt < totalKeys; keyAttempt++) {
        const keyIndex = (activeKeyIndex + keyAttempt) % totalKeys;
        const currentApiKey = keys[keyIndex];

        const messages = [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: buildUserContent(includeImagesInPayload) },
        ];

        const body: any = {
          model,
          messages,
          temperature: 0.1,
          response_format: { type: "json_object" },
        };

        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${currentApiKey}`,
            },
            body: JSON.stringify(body),
            signal: req.signal,
          });

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            const message = errJson.error?.message || `Groq returned status ${res.status}`;

            // Check if error is due to input token limit (e.g. 7000 ITPM limit exceeded)
            const isSizeOrTokenLimit =
              res.status === 413 ||
              message.includes("Request too large") ||
              message.includes("tokens per minute") ||
              message.includes("ITPM") ||
              message.includes("reduce your message size");

            if (isSizeOrTokenLimit && includeImagesInPayload && req.text && req.text.trim().length > 50) {
              console.warn(
                `[Groq] Request exceeded token limit with vision payload (${message}). Retrying immediately with text-only payload...`
              );
              includeImagesInPayload = false;
              // Retry immediately without images on this key
              keyAttempt--;
              continue;
            }

            // Rate limit (429), quota exceeded (402, 403), or token capacity limit
            if (res.status === 429 || res.status === 402 || res.status === 403 || isSizeOrTokenLimit) {
              console.warn(
                `[Groq] Key ${keyIndex + 1}/${totalKeys} on model ${model} limited (${res.status}): ${message}. Rotating to next key...`
              );
              activeKeyIndex = (keyIndex + 1) % totalKeys;
              lastError = new Error(`Groq key ${keyIndex + 1} exhausted (${model}): ${message}`);
              continue;
            }

            throw new Error(`Groq error: ${message}`);
          }

          const data = await res.json();
          const rawText = data.choices?.[0]?.message?.content;
          if (!rawText) {
            throw new Error("Groq returned empty response");
          }

          // Successfully processed: keep this key active
          activeKeyIndex = keyIndex;

          return {
            rawText,
            model,
            usage: data.usage,
          };
        } catch (err: any) {
          if (err.name === "AbortError") throw err;
          lastError = err;

          if (keyAttempt < totalKeys - 1) {
            console.warn(`[Groq] Error with key ${keyIndex + 1}: ${err.message}. Rotating...`);
            activeKeyIndex = (keyIndex + 1) % totalKeys;
            continue;
          }
        }
      }
    }

    throw lastError || new Error(`All Groq attempts failed across ${totalKeys} keys.`);
  }
}
