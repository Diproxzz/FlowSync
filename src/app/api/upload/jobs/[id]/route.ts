export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFoundingReadResponse, requireFoundingWrite } from "@/lib/auth/session";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const denied = await requireFoundingReadResponse();
    if (denied) return denied;
    const job = await prisma.uploadJob.findUnique({
      where: { id: params.id },
    });

    if (!job) {
      return NextResponse.json(
        { error: { message: "Job not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ job });
  } catch (error: any) {
    console.error("Failed to fetch upload job:", error);
    return NextResponse.json(
      { error: { message: "Failed to fetch upload job" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireFoundingWrite();
    if (!auth.ok) return auth.response;
    await prisma.uploadJob.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete upload job:", error);
    return NextResponse.json(
      { error: { message: "Failed to delete upload job" } },
      { status: 500 }
    );
  }
}
