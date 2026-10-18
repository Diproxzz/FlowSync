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

    const model = env.GROQ_MODEL || "qwen/qwen3.8-27b";
    const url = "https://api.groq.com/openai/v1/chat/completions";

    const userContent: any[] = [];
    userContent.push({ type: "text", text: req.userPrompt });

    if (req.text) {
      userContent.push({ type: "text", text: `Document text layer:\n${req.text}` });
    }

    if (req.images && req.images.length > 0) {
      for (const img of req.images) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${img.mime};base64,${img.base64}`,
          },
        });
      }
    }

    const messages = [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: userContent },
    ];

    const body: any = {
      model,
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" },
    };

    let lastError: Error | null = null;
    const totalKeys = keys.length;

    // Try keys sequentially, rotating if rate-limited or quota exceeded
    for (let keyAttempt = 0; keyAttempt < totalKeys; keyAttempt++) {
      const keyIndex = (activeKeyIndex + keyAttempt) % totalKeys;
      const currentApiKey = keys[keyIndex];

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

          // Rate limit (429) or quota exceeded
          if (res.status === 429 || res.status === 402 || res.status === 403) {
            console.warn(
              `[Groq] Key ${keyIndex + 1}/${totalKeys} rate-limited or quota reached (${res.status}). Rotating to next key...`
            );
            // Advance active key index for future requests
            activeKeyIndex = (keyIndex + 1) % totalKeys;
            lastError = new Error(`Groq key ${keyIndex + 1} exhausted: ${message}`);
            continue; // Try next key immediately
          }

          throw new Error(`Groq error: ${message}`);
        }

        const data = await res.json();
        const rawText = data.choices?.[0]?.message?.content;
        if (!rawText) {
          throw new Error("Groq returned empty response");
        }

        // Successfully processed with this key: stick to it for subsequent calls
        activeKeyIndex = keyIndex;

        return {
          rawText,
          model,
          usage: data.usage,
        };
      } catch (err: any) {
        if (err.name === "AbortError") throw err;
        lastError = err;

        // If it's a network error or fetch failure, rotate to next key if available
        if (keyAttempt < totalKeys - 1) {
          console.warn(`[Groq] Error with key ${keyIndex + 1}: ${err.message}. Rotating...`);
          activeKeyIndex = (keyIndex + 1) % totalKeys;
          continue;
        }
      }
    }

    throw lastError || new Error(`All ${totalKeys} Groq API keys failed or were rate-limited.`);
  }
}
