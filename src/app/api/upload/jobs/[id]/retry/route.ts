export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { retryUploadJob } from "@/lib/upload/processor";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
