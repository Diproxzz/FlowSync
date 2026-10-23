export const dynamic = "force-dynamic";
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
    const asOfParam = searchParams.get("asOf");

    const account = await prisma.ledgerAccount.findUnique({
      where: { id },
      include: {
        entries: {
          where: { is_void: false },
          include: {
            invoice: {
              select: { id: true },
            },
          },
          orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Ledger account not found" } },
        { status: 404 }
      );
    }

    const asOf = asOfParam ? new Date(asOfParam) : new Date();

    const openItemsSummary = calculateOpenItems(
      account.entries as any,
      [],
      account.credit_days || 90,
      asOf,
      account.account_type === "CUSTOMER"
    );

    return NextResponse.json({
      success: true,
      data: openItemsSummary,
      ...openItemsSummary,
    });
  } catch (error: any) {
    console.error("Open items error:", error);
    return NextResponse.json(
      { error: { code: "FETCH_FAILED", message: error.message || "Failed to load open items" } },
      { status: 500 }
    );
  }
}
