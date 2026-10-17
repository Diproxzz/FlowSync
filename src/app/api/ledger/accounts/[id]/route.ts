import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const account = await prisma.ledgerAccount.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, name: true, gstin: true, gstin_source: true, address: true, state_code: true },
        },
        supplier: {
          select: { id: true, name: true, gstin: true, gstin_source: true, address: true, state_code: true },
        },
        import_batches: {
          orderBy: { created_at: "desc" },
          take: 5,
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Ledger account not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ account });
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: "FETCH_FAILED", message: error.message || "Failed to load account" } },
      { status: 500 }
    );
  }
}
