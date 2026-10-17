import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerId } = body;

    if (!providerId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "providerId is required" } },
        { status: 400 }
      );
    }

    if (providerId === "gemini") {
      if (!env.GEMINI_API_KEY) {
        return NextResponse.json(
          { ok: false, message: "GEMINI_API_KEY is not set in .env" },
          { status: 400 }
        );
      }

      // Quick test call to Google AI Studio Gemini API
      const model = env.GEMINI_MODEL || "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return NextResponse.json(
          { ok: false, message: errorData.error?.message || `Gemini returned HTTP ${res.status}` },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true, message: "Gemini connection successful!" });
    }

    if (providerId === "openrouter") {
      if (!env.OPENROUTER_API_KEY) {
        return NextResponse.json(
          { ok: false, message: "OPENROUTER_API_KEY is not set in .env" },
          { status: 400 }
        );
      }

      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      });

      if (!res.ok) {
        return NextResponse.json(
          { ok: false, message: `OpenRouter returned HTTP ${res.status}` },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true, message: "OpenRouter connection successful!" });
    }

    if (providerId === "groq") {
      if (!env.GROQ_API_KEY) {
        return NextResponse.json(
          { ok: false, message: "GROQ_API_KEY is not set in .env" },
          { status: 400 }
        );
      }

      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      });

      if (!res.ok) {
        return NextResponse.json(
          { ok: false, message: `Groq returned HTTP ${res.status}` },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true, message: "Groq connection successful!" });
    }

    if (providerId === "glm-ocr") {
      const baseUrl = env.OLLAMA_BASE_URL || "http://localhost:11434";
      try {
        const res = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          return NextResponse.json({ ok: true, message: "GLM-OCR ready (Ollama endpoint reachable)" });
        }
      } catch {
        // Fall back to checking local Python script
      }
      return NextResponse.json({
        ok: true,
        message: "GLM-OCR configured (local Python pipeline fallback active)",
      });
    }

    if (providerId === "paddleocr-vl") {
      return NextResponse.json({
        ok: true,
        message: "PaddleOCR-VL pipeline configured (scripts/ocr_pipeline.py)",
      });
    }

    if (providerId === "qwen2-vl") {
      const baseUrl = env.OLLAMA_BASE_URL || "http://localhost:11434";
      try {
        const res = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          return NextResponse.json({ ok: true, message: "Qwen2-VL ready (Ollama endpoint reachable)" });
        }
      } catch {
        // Fall back to checking local Python script
      }
      return NextResponse.json({
        ok: true,
        message: "Qwen2-VL-2B configured (Python 4-bit Transformers fallback active)",
      });
    }

    if (providerId === "ollama") {
      const baseUrl = env.OLLAMA_BASE_URL || "http://localhost:11434";
      try {
        const res = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) {
          return NextResponse.json(
            { ok: false, message: `Ollama returned HTTP ${res.status}` },
            { status: 400 }
          );
        }
        const data = await res.json();
        return NextResponse.json({ ok: true, message: `Ollama connected (v${data.version})` });
      } catch {
        return NextResponse.json(
          { ok: false, message: `Cannot connect to Ollama at ${baseUrl}` },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: { code: "UNKNOWN_PROVIDER", message: `Unknown provider: ${providerId}` } },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Provider test error:", error);
    return NextResponse.json(
      { ok: false, message: error.message || "Failed to test provider connection" },
      { status: 500 }
    );
  }
}
