export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage/adapter";
import { processNextQueuedJobs } from "@/lib/upload/processor";

export async function GET(request: NextRequest) {
  try {
    // Pick up any pending queued jobs on polling
    processNextQueuedJobs().catch(console.error);

    const jobs = await prisma.uploadJob.findMany({
      orderBy: { created_at: "desc" },
      take: 50,
      select: {
        id: true,
        file_name: true,
        file_size: true,
        status: true,
        error: true,
        saved_invoice_id: true,
        saved_invoice_num: true,
        created_at: true,
        updated_at: true,
        // Include minimal draft preview metadata for the queue cards
        extracted_data: true,
      },
    });

    return NextResponse.json({ jobs });
  } catch (error: any) {
    console.error("Failed to fetch upload jobs:", error);
    return NextResponse.json(
      { error: { message: "Failed to fetch upload jobs" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: { message: "No invoice file uploaded" } },
        { status: 400 }
      );
    }

    // 10 MB limit check
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: { message: "File exceeds 10 MB limit" } },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Save temporary copy for extraction & confirmation
    const fileToken = await storage.saveTemp(buffer, file.name);

    // Create job record in PostgreSQL
    const job = await prisma.uploadJob.create({
      data: {
        file_name: file.name,
        file_size: file.size,
        file_token: fileToken,
        file_hash: fileHash,
        status: "QUEUED",
      },
    });

    // Kick off background processing
    processNextQueuedJobs().catch(console.error);

    return NextResponse.json({ job }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create upload job:", error);
    return NextResponse.json(
      { error: { message: error.message || "Failed to create upload job" } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope"); // 'completed' or 'all'

    if (scope === "completed") {
      await prisma.uploadJob.deleteMany({
        where: {
          status: { in: ["SAVED", "CANCELLED", "FAILED"] },
        },
      });
    } else {
      await prisma.uploadJob.deleteMany();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to clear upload jobs:", error);
    return NextResponse.json(
      { error: { message: "Failed to clear upload jobs" } },
      { status: 500 }
    );
  }
}
