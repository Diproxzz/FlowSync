export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage/adapter";
import { requireFoundingReadResponse, requireFoundingWrite } from "@/lib/auth/session";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireFoundingReadResponse();
  if (denied) return denied;

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
  const auth = await requireFoundingWrite();
  if (!auth.ok) return auth.response;

  try {
    const { id } = params;
    const invoice = await prisma.invoice.findUnique({ where: { id } });

    if (!invoice) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Invoice not found" } },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Deleting invoice cascades to invoice_items and their stock_movements
      if (process.env.FEATURE_LEDGER !== "false" && process.env.FEATURE_LEDGER !== "0") {
        const { removeSalesInvoiceFromLedger } = await import("@/lib/ledger/posting");
        await removeSalesInvoiceFromLedger(tx, id);
      }

      await tx.invoice.delete({ where: { id } });
    });

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
