import { LLMProvider, ExtractionRequest, ExtractionResponse } from "../types";
import { env } from "@/lib/env";

export class GeminiProvider implements LLMProvider {
  id = "gemini" as const;
  name = "Google Gemini";

  isConfigured(): boolean {
    return Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim());
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResponse> {
    if (!this.isConfigured()) {
      throw new Error("Gemini API key is not configured in environment");
    }

    const candidateModels = Array.from(
      new Set([
        env.GEMINI_MODEL,
        "gemini-3.7-flash",
        "gemini-3.8-flash",
        "gemini-2.5-flash",
        "gemini-flash-latest",
        "gemini-3.5-flash",
      ].filter(Boolean))
    );

    let lastError: Error | null = null;

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

        const parts: any[] = [];

        // Add text prompt
        parts.push({ text: `${req.systemPrompt}\n\n${req.userPrompt}` });

        if (req.text) {
          parts.push({ text: `Document text layer:\n${req.text}` });
        }

        // Add images if provided
        if (req.images && req.images.length > 0) {
          for (const img of req.images) {
            parts.push({
              inlineData: {
                mimeType: img.mime,
                data: img.base64,
              },
            });
          }
        }

        const body: any = {
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        };

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: req.signal,
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          const message = errJson.error?.message || `Gemini API returned status ${res.status}`;
          // If model not found (404), rate limited (429), or overloaded (503), back off and try next model
          if (res.status === 404 || res.status === 429 || res.status === 503) {
            console.warn(`Gemini model ${model} returned ${res.status} (${message}), backing off and trying next candidate...`);
            lastError = new Error(`Gemini error (${model}): ${message}`);
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          throw new Error(`Gemini error: ${message}`);
        }

        const data = await res.json();
        const candidate = data.candidates?.[0];
        const textPart = candidate?.content?.parts?.[0]?.text;

        if (!textPart) {
          throw new Error("Gemini returned empty response");
        }

        return {
          rawText: textPart,
          model: model as string,
          usage: data.usageMetadata,
        };
      } catch (err: any) {
        lastError = err;
        if (err.name === "AbortError") throw err;
      }
    }

    throw lastError || new Error("All candidate Gemini models failed");
  }
}
