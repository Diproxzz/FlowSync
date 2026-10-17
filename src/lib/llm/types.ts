export type ProviderId =
  | "groq"
  | "gemini"
  | "glm-ocr"
  | "paddleocr-vl"
  | "qwen2-vl"
  | "openrouter"
  | "ollama";

export interface ProviderImage {
  mime: "image/png" | "image/jpeg";
  base64: string;
}

export interface ExtractionRequest {
  systemPrompt: string;
  userPrompt: string;
  images?: ProviderImage[];
  text?: string;
  jsonSchema?: object;
  signal?: AbortSignal;
}

export interface ExtractionResponse {
  rawText: string;
  model: string;
  usage?: unknown;
}

export interface LLMProvider {
  id: ProviderId;
  name: string;
  isConfigured(): boolean;
  extract(req: ExtractionRequest): Promise<ExtractionResponse>;
}
