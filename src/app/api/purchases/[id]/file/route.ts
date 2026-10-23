export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage/adapter";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const purchase = await prisma.purchaseInvoice.findUnique({
    where: { id },
    select: { source_file_key: true, supplier_invoice_number: true },
  });

  if (!purchase || !purchase.source_file_key) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "File not found for this purchase invoice" } },
      { status: 404 }
    );
  }

  try {
    const fileBuffer = await storage.getFile(purchase.source_file_key);
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${purchase.supplier_invoice_number.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error streaming purchase invoice file:", error);
    return NextResponse.json(
      { error: { code: "FILE_ERROR", message: "Could not read purchase invoice file" } },
      { status: 500 }
    );
  }
}
