export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "Voided by user";

    const entry = await prisma.ledgerEntry.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!entry) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Entry not found" } },
        { status: 404 }
      );
    }

    if (entry.is_void) {
      return NextResponse.json(
        { error: { code: "ALREADY_VOID", message: "Entry is already voided" } },
        { status: 400 }
      );
    }

    // Do not allow voiding invoice-linked entries directly; edit the invoice instead
    if (entry.source === "INVOICE_AUTO") {
      return NextResponse.json(
        {
          error: {
            code: "INVOICE_LOCKED",
            message: "This entry was automatically posted from an invoice. To modify or void it, edit or delete the invoice directly.",
          },
        },
        { status: 422 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Soft delete
      const res = await tx.ledgerEntry.update({
        where: { id },
        data: {
          is_void: true,
          void_reason: reason,
        },
      });

      // 2. Write audit log
      await tx.ledgerAudit.create({
        data: {
          entry_id: id,
          action: "VOID",
          before: entry as any,
          after: res as any,
          reason,
        },
      });

      return res;
    });

    return NextResponse.json({
      success: true,
      message: `Entry voided successfully.`,
      entry: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: "VOID_FAILED", message: error.message || "Failed to void entry" } },
      { status: 500 }
    );
  }
}
