import { LLMProvider, ExtractionRequest, ExtractionResponse } from "../types";
import { env } from "@/lib/env";

export class OllamaProvider implements LLMProvider {
  id = "ollama" as const;
  name = "Ollama (Local)";

  isConfigured(): boolean {
    return Boolean(env.OLLAMA_MODEL && env.OLLAMA_MODEL.trim());
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResponse> {
    const baseUrl = env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = env.OLLAMA_MODEL || "llama3.2-vision";
    const url = `${baseUrl}/api/chat`;

    const userImages: string[] = [];
    if (req.images && req.images.length > 0) {
      for (const img of req.images) {
        userImages.push(img.base64);
      }
    }

    let userPrompt = req.userPrompt;
    if (req.text) {
      userPrompt += `\n\nDocument text layer:\n${req.text}`;
    }

    const messages = [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: userPrompt, images: userImages.length > 0 ? userImages : undefined },
    ];

    const body = {
      model,
      messages,
      format: "json",
      stream: false,
      options: {
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
      throw new Error(`Ollama returned status ${res.status}`);
    }

    const data = await res.json();
    const rawText = data.message?.content;
    if (!rawText) {
      throw new Error("Ollama returned empty response");
    }

    return {
      rawText,
      model,
      usage: {
        total_duration: data.total_duration,
        prompt_eval_count: data.prompt_eval_count,
        eval_count: data.eval_count,
      },
    };
  }
}
