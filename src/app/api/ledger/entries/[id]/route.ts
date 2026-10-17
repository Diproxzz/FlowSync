import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeInvoiceNumber } from "@/lib/matching/normalize";
import Decimal from "decimal.js";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const entry = await prisma.ledgerEntry.findUnique({
      where: { id },
      include: {
        account: true,
        invoice: { select: { id: true, invoice_number: true } },
        purchase_invoice: { select: { id: true, supplier_invoice_number: true } },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, entry });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch entry" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const existing = await prisma.ledgerEntry.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (existing.is_void) {
      return NextResponse.json({ error: "Cannot edit a voided entry" }, { status: 400 });
    }

    const {
      entryDate,
      entryType,
      debit,
      credit,
      particulars,
      docNo,
      paymentMode,
      instrumentNo,
      instrumentDate,
      narration,
    } = body;

    const updatedData: any = {};

    if (entryDate) {
      updatedData.entry_date = new Date(entryDate);
    }
    if (entryType) {
      updatedData.entry_type = entryType;
    }
    if (debit !== undefined) {
      updatedData.debit = new Decimal(debit || 0);
    }
    if (credit !== undefined) {
      updatedData.credit = new Decimal(credit || 0);
    }
    if (particulars !== undefined) {
      updatedData.particulars_raw = particulars;
    }
    if (docNo !== undefined) {
      updatedData.doc_no = docNo || null;
      updatedData.doc_no_norm = docNo ? normalizeInvoiceNumber(docNo) : null;
    }
    if (paymentMode !== undefined) {
      updatedData.payment_mode = paymentMode || null;
    }
    if (instrumentNo !== undefined) {
      updatedData.instrument_no = instrumentNo || null;
    }
    if (instrumentDate !== undefined) {
      updatedData.instrument_date = instrumentDate ? new Date(instrumentDate) : null;
    }
    if (narration !== undefined) {
      updatedData.narration = narration || null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.ledgerEntry.update({
        where: { id },
        data: updatedData,
      });

      await tx.ledgerAudit.create({
        data: {
          entry_id: id,
          action: "UPDATE",
          before: existing as any,
          after: res as any,
          reason: body.editReason || "Manual edit of entry",
        },
      });

      return res;
    });

    return NextResponse.json({
      success: true,
      entry: updated,
      message: "Entry updated successfully",
    });
  } catch (error: any) {
    console.error("Update entry error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update entry" },
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
    const existing = await prisma.ledgerEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    await prisma.ledgerEntry.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Entry deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete entry error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete entry" },
      { status: 500 }
    );
  }
}
