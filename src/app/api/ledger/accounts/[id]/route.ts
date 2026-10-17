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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const account = await prisma.ledgerAccount.findUnique({
      where: { id },
      include: {
        customer: true,
        supplier: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Ledger account not found" } },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete all ledger allocations for entries of this account
      const entryIds = (
        await tx.ledgerEntry.findMany({
          where: { account_id: id },
          select: { id: true },
        })
      ).map((e) => e.id);

      if (entryIds.length > 0) {
        await tx.ledgerAllocation.deleteMany({
          where: {
            OR: [
              { settling_entry_id: { in: entryIds } },
              { target_entry_id: { in: entryIds } },
            ],
          },
        });
      }

      // 2. Delete all ledger entries
      await tx.ledgerEntry.deleteMany({
        where: { account_id: id },
      });

      // 3. Delete all statement imports
      await tx.statementImport.deleteMany({
        where: { account_id: id },
      });

      // 4. Delete the ledger account
      await tx.ledgerAccount.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true, message: "Ledger account deleted successfully" });
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: "DELETE_FAILED", message: error.message || "Failed to delete account" } },
      { status: 500 }
    );
  }
}

