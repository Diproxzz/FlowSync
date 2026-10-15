import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export async function GET() {
  const dbSettings = await prisma.setting.findMany();
  const settingsMap: Record<string, any> = {};
  for (const s of dbSettings) {
    settingsMap[s.key] = s.value;
  }

  // Combine DB settings with environment provider status (keys are NEVER exposed to browser)
  const providers = [
    {
      id: "gemini",
      name: "Google Gemini",
      isConfigured: Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()),
      model: env.GEMINI_MODEL || "gemini-1.5-flash",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      isConfigured: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim()),
      model: env.OPENROUTER_MODEL || "meta-llama/llama-3.2-11b-vision-instruct:free",
    },
    {
      id: "groq",
      name: "Groq",
      isConfigured: Boolean(env.GROQ_API_KEY && env.GROQ_API_KEY.trim()),
      model: env.GROQ_MODEL || "llama-3.2-11b-vision-preview",
    },
    {
      id: "ollama",
      name: "Ollama (Local)",
      isConfigured: Boolean(env.OLLAMA_MODEL && env.OLLAMA_MODEL.trim()),
      model: env.OLLAMA_MODEL || "llama3.2-vision",
      baseUrl: env.OLLAMA_BASE_URL,
    },
  ];

  return NextResponse.json({
    settings: {
      company: settingsMap.company || {
        name: env.COMPANY_NAME,
        gstin: env.COMPANY_GSTIN,
        address: "19/10/2, GOBINDA KHATICK ROAD, KOLKATA-700046, WEST BENGAL",
      },
      fiscalYearStartMonth: settingsMap.fiscal_year_start_month ?? 4,
      lapsedDays: settingsMap.lapsed_days ?? 60,
      fuzzyThreshold: settingsMap.fuzzy_threshold ?? 0.85,
      providerOrder: settingsMap.provider_order ?? ["gemini", "openrouter", "groq", "ollama"],
    },
    providers,
  });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.company) {
      await prisma.setting.upsert({
        where: { key: "company" },
        update: { value: body.company },
        create: { key: "company", value: body.company },
      });
    }

    if (body.fiscalYearStartMonth !== undefined) {
      await prisma.setting.upsert({
        where: { key: "fiscal_year_start_month" },
        update: { value: Number(body.fiscalYearStartMonth) },
        create: { key: "fiscal_year_start_month", value: Number(body.fiscalYearStartMonth) },
      });
    }

    if (body.lapsedDays !== undefined) {
      await prisma.setting.upsert({
        where: { key: "lapsed_days" },
        update: { value: Number(body.lapsedDays) },
        create: { key: "lapsed_days", value: Number(body.lapsedDays) },
      });
    }

    if (body.fuzzyThreshold !== undefined) {
      await prisma.setting.upsert({
        where: { key: "fuzzy_threshold" },
        update: { value: Number(body.fuzzyThreshold) },
        create: { key: "fuzzy_threshold", value: Number(body.fuzzyThreshold) },
      });
    }

    if (Array.isArray(body.providerOrder)) {
      await prisma.setting.upsert({
        where: { key: "provider_order" },
        update: { value: body.providerOrder },
        create: { key: "provider_order", value: body.providerOrder },
      });
    }

    return NextResponse.json({ success: true, message: "Settings updated successfully" });
  } catch (error) {
    console.error("Error saving settings:", error);
    return NextResponse.json(
      { error: { code: "SAVE_FAILED", message: "Failed to update settings" } },
      { status: 500 }
    );
  }
}
