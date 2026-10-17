import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatParticularsText } from "@/lib/ledger/particulars";
import Decimal from "decimal.js";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      accountId,
      entryType,
      entryDate,
      amount,
      paymentMode,
      instrumentNo,
      instrumentDate,
      narration,
      allocations = [],
    } = body;

    if (!accountId || !entryType || !amount || Number(amount) <= 0) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "Account, entry type, and positive amount are required" } },
        { status: 400 }
      );
    }

    const account = await prisma.ledgerAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Ledger account not found" } },
        { status: 404 }
      );
    }

    const isCustomer = account.account_type === "CUSTOMER";
    const numAmount = new Decimal(amount);

    // Sum of allocations check
    const totalAllocated = allocations.reduce(
      (sum: Decimal, a: any) => sum.plus(new Decimal(a.amount || 0)),
      new Decimal(0)
    );

    if (totalAllocated.gt(numAmount)) {
      return NextResponse.json(
        { error: { code: "OVER_ALLOCATED", message: "Total allocated amount exceeds transaction amount" } },
        { status: 422 }
      );
    }

    // Determine Debit / Credit based on party and entry type
    let debit = new Decimal(0);
    let credit = new Decimal(0);

    if (isCustomer) {
      if (entryType === "RECEIPT" || entryType === "CREDIT_NOTE") {
        credit = numAmount;
      } else {
        debit = numAmount;
      }
    } else {
      // Supplier
      if (entryType === "PAYMENT" || entryType === "DEBIT_NOTE") {
        debit = numAmount;
      } else {
        credit = numAmount;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Find targets and build referenced docs array
      const referencedDocs: string[] = [];
      for (const a of allocations) {
        if (Number(a.amount) > 0) {
          const target = await tx.ledgerEntry.findUnique({
            where: { id: a.targetEntryId },
            select: { doc_no: true, entry_type: true },
          });
          if (target?.doc_no) {
            referencedDocs.push(target.doc_no);
          } else if (target?.entry_type === "OPENING") {
            referencedDocs.push("Opening Balance");
          }
        }
      }

      const particulars = formatParticularsText({
        entryType,
        paymentMode,
        instrumentNo,
        instrumentDate,
        referencedDocs,
        narration,
      });

      // Get highest sort_seq for this date
      const dateObj = new Date(entryDate);
      const lastOnDate = await tx.ledgerEntry.findFirst({
        where: { account_id: accountId, entry_date: dateObj },
        orderBy: { sort_seq: "desc" },
      });
      const nextSeq = (lastOnDate?.sort_seq || 0) + 1;

      // 1. Create entry
      const entry = await tx.ledgerEntry.create({
        data: {
          account_id: accountId,
          entry_date: dateObj,
          sort_seq: nextSeq,
          entry_type: entryType,
          debit,
          credit,
          payment_mode: paymentMode || null,
          instrument_no: instrumentNo || null,
          instrument_date: instrumentDate ? new Date(instrumentDate) : null,
          referenced_docs: referencedDocs,
          particulars_raw: particulars,
          narration: narration || null,
          source: "MANUAL",
        },
      });

      // 2. Create explicit allocations
      for (const a of allocations) {
        if (Number(a.amount) > 0) {
          await tx.ledgerAllocation.create({
            data: {
              settling_entry_id: entry.id,
              target_entry_id: a.targetEntryId,
              amount: new Decimal(a.amount),
              source: "MANUAL",
            },
          });
        }
      }

      // 3. Write audit log
      await tx.ledgerAudit.create({
        data: {
          entry_id: entry.id,
          action: "CREATE",
          after: {
            id: entry.id,
            entryType,
            amount: numAmount.toNumber(),
            particulars,
          },
          reason: narration || "Manual entry",
        },
      });

      return entry;
    });

    return NextResponse.json({
      success: true,
      entry: result,
      message: `${entryType} recorded successfully.`,
    });
  } catch (error: any) {
    console.error("Create entry error:", error);
    return NextResponse.json(
      { error: { code: "CREATE_ENTRY_FAILED", message: error.message || "Failed to create ledger entry" } },
      { status: 500 }
    );
  }
}
