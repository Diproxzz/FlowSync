export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { retryAllFailedJobs } from "@/lib/upload/processor";
import { requireFoundingWrite } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const auth = await requireFoundingWrite();
  if (!auth.ok) return auth.response;
  try {
    await retryAllFailedJobs();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to retry all failed upload jobs:", error);
    return NextResponse.json(
      { error: { message: "Failed to retry all failed upload jobs" } },
      { status: 500 }
    );
  }
}
