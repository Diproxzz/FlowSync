import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { askWisp } from "@/lib/wisp/agent";

const chatSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parseRes = chatSchema.safeParse(json);

    if (!parseRes.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid chat payload",
            details: parseRes.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const { message, history } = parseRes.data;
    const response = await askWisp(message, history);

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    console.error("Wisp Chat API Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: error?.message || "Failed to process chat query",
        },
      },
      { status: 500 }
    );
  }
}
