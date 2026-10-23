import { LLMProvider, ExtractionRequest, ExtractionResponse } from "../types";
import { env } from "@/lib/env";

export class OpenRouterProvider implements LLMProvider {
  id = "openrouter" as const;
  name = "OpenRouter";

  isConfigured(): boolean {
    return Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim());
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResponse> {
    if (!this.isConfigured()) {
      throw new Error("OpenRouter API key is not configured in environment");
    }

    const model = env.OPENROUTER_MODEL || "meta-llama/llama-3.2-11b-vision-instruct:free";
    const url = "https://openrouter.ai/api/v1/chat/completions";

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

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "FlowPilot",
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const message = errJson.error?.message || `OpenRouter returned status ${res.status}`;
      throw new Error(`OpenRouter error: ${message}`);
    }

    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content;
    if (!rawText) {
      throw new Error("OpenRouter returned empty response");
    }

    return {
      rawText,
      model,
      usage: data.usage,
    };
  }
}
