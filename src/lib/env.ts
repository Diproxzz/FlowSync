import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().default("postgresql://postgres:postgres@localhost:5432/indobest"),
  SESSION_SECRET: z.string().min(16).default("development_session_secret_change_me_to_at_least_32_chars_long"),
  APP_PASSWORD_HASH: z.string().optional(),
  COMPANY_NAME: z.string().default("INDOBEST"),
  COMPANY_GSTIN: z.string().default("19AVZPC2361G1ZA"),

  LLM_PROVIDER_ORDER: z.string().default("gemini,openrouter,groq,ollama"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().optional().default("gemini-1.5-flash"),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  OPENROUTER_MODEL: z.string().optional().default(""),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().optional().default(""),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().optional().default(""),

  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_SERVICE_KEY: z.string().optional().default(""),
  SUPABASE_BUCKET: z.string().default("invoices"),

  LOG_EXTRACTION_PAYLOADS: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return result.data;
}

export const env = parseEnv();
