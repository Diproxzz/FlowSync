export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { retryUploadJob } from "@/lib/upload/processor";
import { requireFoundingWrite } from "@/lib/auth/session";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireFoundingWrite();
  if (!auth.ok) return auth.response;
  try {
    await retryUploadJob(params.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to retry upload job:", error);
    return NextResponse.json(
      { error: { message: "Failed to retry upload job" } },
      { status: 500 }
    );
  }
}
