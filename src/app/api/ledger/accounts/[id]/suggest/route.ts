import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateOpenItems } from "@/lib/ledger/openItems";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = request.nextUrl;
    const amountStr = searchParams.get("amount") || "0";
    const amount = parseFloat(amountStr) || 0;

    const account = await prisma.ledgerAccount.findUnique({
      where: { id },
      include: {
        entries: {
          where: { is_void: false },
          orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Account not found" } },
        { status: 404 }
      );
    }

    const openItems = calculateOpenItems(
      account.entries as any,
      [],
      account.credit_days || 30,
      new Date(),
      account.account_type === "CUSTOMER"
    );

    // Filter to items that have outstanding > 0
    const unpaid = openItems.items.filter((it) => it.outstanding > 0);

    let remaining = amount;
    const suggestions = unpaid.map((it) => {
      let alloc = 0;
      if (remaining > 0) {
        alloc = Math.min(it.outstanding, remaining);
        remaining -= alloc;
      }
      return {
        targetEntryId: it.id,
        docNo: it.docNo,
        entryDate: it.entryDate,
        amount: it.amount,
        outstanding: it.outstanding,
        suggestedAllocation: alloc,
        overdue: it.overdue,
        ageDays: it.ageDays,
      };
    });

    const totalAllocated = amount - remaining;

    return NextResponse.json({
      amount,
      totalAllocated,
      unallocatedAdvance: remaining,
      suggestions,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: "SUGGEST_FAILED", message: error.message || "Failed to calculate suggestions" } },
      { status: 500 }
    );
  }
}
