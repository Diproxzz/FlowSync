import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteInformalInvoice } from "@/lib/informal-invoices/service";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const invoice = await prisma.informalInvoice.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            gstin: true,
            informal_ledger_account: { select: { id: true, display_name: true } },
            ledger_account: { select: { id: true, display_name: true } },
          },
        },
        items: {
          include: {
            product: {
              select: { id: true, code: true, name: true, pack_size_kg: true },
            },
            movement: true,
          },
          orderBy: { line_no: "asc" },
        },
        ledger_entry: {
          include: {
            account: { select: { id: true, display_name: true } },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Informal invoice not found." } },
        { status: 404 }
      );
    }

    return NextResponse.json({ invoice });
  } catch (error: any) {
    console.error("GET /api/informal-invoices/[id] error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: error.message || "Failed to fetch invoice." } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await deleteInformalInvoice(id);
    return NextResponse.json({ success: true, message: "Informal invoice deleted successfully." });
  } catch (error: any) {
    console.error("DELETE /api/informal-invoices/[id] error:", error);
    return NextResponse.json(
      { error: { code: "DELETE_FAILED", message: error.message || "Failed to delete informal invoice." } },
      { status: 400 }
    );
  }
}
