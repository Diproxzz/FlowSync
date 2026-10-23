export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateStatementTotals, computeRunningBalances } from "@/lib/ledger/balances";
import { calculateOpenItems } from "@/lib/ledger/openItems";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const type = searchParams.get("type"); // CUSTOMER | SUPPLIER
    const overdueOnly = searchParams.get("overdue") === "true";

    const where: any = { is_active: true };
    if (type) where.account_type = type;
    if (search) {
      where.OR = [
        { display_name: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { gstin: { contains: search, mode: "insensitive" } } },
        { informal_customer: { name: { contains: search, mode: "insensitive" } } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
        { supplier: { gstin: { contains: search, mode: "insensitive" } } },
      ];
    }

    const accounts = await prisma.ledgerAccount.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true, gstin: true, gstin_source: true },
        },
        informal_customer: {
          select: { id: true, name: true, gstin: true, gstin_source: true },
        },
        supplier: {
          select: { id: true, name: true, gstin: true, gstin_source: true },
        },
        entries: {
          where: { is_void: false },
          orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
        },
      },
      orderBy: { display_name: "asc" },
    });

    let totalReceivable = 0;
    let totalPayable = 0;
    let grandOverdue = 0;

    const accountRows = accounts.map((acc) => {
      const gstin = acc.customer?.gstin || acc.informal_customer?.gstin || acc.supplier?.gstin || null;
      const gstinSource = acc.customer?.gstin_source || acc.informal_customer?.gstin_source || acc.supplier?.gstin_source || null;

      // Extract opening entry
      const openingEntry = acc.entries.find((e) => e.entry_type === "OPENING");
      let openingBalance = 0;
      let openingSide: "Dr" | "Cr" = "Dr";
      if (openingEntry) {
        const deb = Number(openingEntry.debit);
        const cred = Number(openingEntry.credit);
        openingBalance = deb > 0 ? deb : cred;
        openingSide = deb >= cred ? "Dr" : "Cr";
      }

      // Compute totals
      const totals = calculateStatementTotals(
        acc.entries as any,
        openingSide === "Dr" ? openingBalance : -openingBalance
      );

      // Compute Open Items & Overdue
      const openItems = calculateOpenItems(
        acc.entries as any,
        [],
        acc.credit_days || 90,
        new Date(),
        acc.account_type === "CUSTOMER"
      );

      const closingBalance = totals.closingBalance;
      const closingSide = totals.closingSide;

      if (closingSide === "Dr") {
        totalReceivable += closingBalance;
      } else {
        totalPayable += closingBalance;
      }
      if (acc.account_type === "CUSTOMER") {
        grandOverdue += openItems.totalOverdue;
      }

      // Find last receipt date
      const receipts = acc.entries.filter((e) => e.entry_type === "RECEIPT" || e.entry_type === "PAYMENT");
      const lastReceipt = receipts.length > 0 ? receipts[receipts.length - 1].entry_date : null;

      // Find oldest unpaid bill
      const openBills = openItems.items.filter((it) => it.status === "OPEN" || it.status === "PART");
      const oldestBillNo = openBills.length > 0 ? openBills[0].docNo : null;
      const oldestBillDate = openBills.length > 0 ? openBills[0].entryDate : null;

      const isCustomer = acc.account_type === "CUSTOMER";
      const overdueVal = isCustomer ? openItems.totalOverdue : 0;

      return {
        id: acc.id,
        accountType: acc.account_type,
        displayName: acc.display_name,
        partyName: acc.display_name,
        partyId: acc.customer_id || acc.informal_customer_id || acc.supplier_id,
        isInformal: acc.is_informal,
        gstin,
        gstinSource,
        creditDays: acc.credit_days || 90,
        openingBalance,
        openingSide,
        periodDebit: totals.periodDebit,
        periodCredit: totals.periodCredit,
        totalDebitWithOpening: totals.totalDebitWithOpening,
        totalCreditWithOpening: totals.totalCreditWithOpening,
        closingBalance,
        closingSide,
        totalOverdue: overdueVal,
        overdueAmount: overdueVal,
        oldestBill: oldestBillNo,
        oldestBillNo,
        oldestBillDate,
        lastReceiptDate: lastReceipt ? new Date(lastReceipt).toISOString().split("T")[0] : null,
        statementThroughDate: acc.statement_through_date,
        openingBalanceSet: acc.opening_balance_set,
        entriesCount: acc.entries.length,
      };
    });

    const filteredRows = overdueOnly ? accountRows.filter((r) => r.totalOverdue > 0) : accountRows;
    const accountsWithDuesCount = accountRows.filter((r) => Math.abs(r.closingBalance) > 0.005).length;

    const summaryData = {
      totalReceivable,
      totalPayable,
      grandOverdue,
      totalOverdue: grandOverdue,
      accountsWithDuesCount,
      totalAccounts: accounts.length,
    };

    return NextResponse.json({
      success: true,
      data: {
        accounts: filteredRows,
        summary: summaryData,
      },
      accounts: filteredRows,
      summary: summaryData,
    });
  } catch (error: any) {
    console.error("Fetch accounts error:", error);
    return NextResponse.json(
      { error: { code: "FETCH_FAILED", message: error.message || "Failed to load ledger accounts" } },
      { status: 500 }
    );
  }
}
