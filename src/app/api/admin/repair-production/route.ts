export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { runProductionFixes } from "../../../../../scripts/sync-production-fixes";
import { requireFoundingReadResponse } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const denied = await requireFoundingReadResponse();
    if (denied) return denied;

    await runProductionFixes();

    return NextResponse.json({
      success: true,
      message: "Production fixes applied successfully.",
    });
  } catch (error: any) {
    console.error("repair-production error:", error);
    return NextResponse.json(
      { error: { message: error?.message || "Failed to run repairs" } },
      { status: 500 }
    );
  }
}
