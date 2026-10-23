export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await prisma.uploadJob.update({
      where: { id: params.id },
      data: {
        status: "CANCELLED",
        error: "Upload manually stopped by user",
      },
    });

    return NextResponse.json({ success: true, job });
  } catch (error: any) {
    console.error("Failed to cancel upload job:", error);
    return NextResponse.json(
      { error: { message: "Failed to cancel upload job" } },
      { status: 500 }
    );
  }
}
