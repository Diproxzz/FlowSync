import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage/adapter";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { source_file_key: true, invoice_number: true },
  });

  if (!invoice || !invoice.source_file_key) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "File not found for this invoice" } },
      { status: 404 }
    );
  }

  try {
    const fileBuffer = await storage.getFile(invoice.source_file_key);
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoice_number.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error streaming invoice file:", error);
    return NextResponse.json(
      { error: { code: "FILE_ERROR", message: "Could not read invoice file" } },
      { status: 500 }
    );
  }
}
