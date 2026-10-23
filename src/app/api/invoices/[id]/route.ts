export const dynamic = "force-dynamic";
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
    include: {
      customer: true,
      items: {
        include: { product: true, movement: true },
        orderBy: { line_no: "asc" },
      },
      revisions: {
        orderBy: { changed_at: "desc" },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Invoice not found" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ invoice });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const invoice = await prisma.invoice.findUnique({ where: { id } });

    if (!invoice) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Invoice not found" } },
        { status: 404 }
      );
    }

    // Deleting invoice cascades to invoice_items and their stock_movements
    if (process.env.FEATURE_LEDGER === "true") {
      const { removeSalesInvoiceFromLedger } = await import("@/lib/ledger/posting");
      await removeSalesInvoiceFromLedger(prisma, id);
    }

    await prisma.invoice.delete({ where: { id } });

    // Clean up stored file if exists
    if (invoice.source_file_key) {
      await storage.deleteFile(invoice.source_file_key).catch(() => {});
    }

    return NextResponse.json({ success: true, message: "Invoice deleted successfully" });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    return NextResponse.json(
      { error: { code: "DELETE_FAILED", message: "Failed to delete invoice" } },
      { status: 500 }
    );
  }
}
