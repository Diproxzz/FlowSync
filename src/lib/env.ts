import { z } from "zod";
import { DEV_SESSION_SECRET } from "@/lib/auth/constants";

export { DEV_SESSION_SECRET };

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@localhost:5432/indobest"),
  SESSION_SECRET: z.string().min(16).default(DEV_SESSION_SECRET),
  APP_USERNAME: z.string().default("Indobest"),
  APP_PASSWORD_HASH: z.string().optional().default(""),
  ADMIN_PASSWORD_HASH: z.string().optional().default(""),
  ADMIN_RECOVERY_EMAIL: z.string().optional().default(""),
  INDOBEST_RECOVERY_EMAIL: z.string().optional().default(""),
  COMPANY_NAME: z.string().default("INDOBEST"),
  COMPANY_GSTIN: z.string().default("19AVZPC2361G1ZA"),
  COMPANY_EMAIL: z.string().optional().default(""),

  SMTP_HOST: z.string().optional().default("smtp.gmail.com"),
  SMTP_PORT: z.string().optional().default("465"),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),
  APP_URL: z.string().optional().default(""),

  LLM_PROVIDER_ORDER: z
    .string()
    .default("groq,gemini,glm-ocr,paddleocr-vl,qwen2-vl,openrouter,ollama"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().optional().default("gemini-3.7-flash"),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  OPENROUTER_MODEL: z.string().optional().default(""),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_API_KEYS: z.string().optional().default(""),
  GROQ_MODEL: z.string().optional().default("qwen/qwen3.8-27b"),
  ENABLE_LOCAL_MODELS: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default("true"),
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

  FEATURE_PURCHASES: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .default("true"),

  FEATURE_LEDGER: z
    .string()
    .transform((val) => val !== "false" && val !== "0")
    .default("true"),
});

export function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.VITEST !== "true"
  );
}

export function isStrongSessionSecret(secret?: string): boolean {
  return Boolean(secret && secret.length >= 32 && secret !== DEV_SESSION_SECRET);
}

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }

  if (isProductionRuntime() && !isStrongSessionSecret(result.data.SESSION_SECRET)) {
    throw new Error(
      "SECURITY ERROR: SESSION_SECRET must be at least 32 characters and not the development placeholder in production."
    );
  }

  return result.data;
}

export const env = parseEnv();
