import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateMargTotals } from "@/lib/ledger/balances";

export async function GET(request: NextRequest) {
  try {
    // 1. Fetch customer ledger accounts with non-void entries
    const ledgerAccounts = await prisma.ledgerAccount.findMany({
      where: {
        account_type: "CUSTOMER",
        is_active: true,
      },
      include: {
        customer: {
          select: { id: true, name: true, gstin: true, state_code: true },
        },
        entries: {
          where: { is_void: false },
          orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
        },
      },
      orderBy: { display_name: "asc" },
    });

    const debtorRows: Array<{
      id: string;
      customerId: string | null;
      accountId: string | null;
      partyName: string;
      gstin: string | null;
      stateCode: string | null;
      totalInvoiced: number;
      totalOutstanding: number;
      monthlyAmounts: Record<string, number>;
      oldestBillNo: string | null;
      oldestBillDate: string | null;
      oldestAgeDays: number | null;
      overdueAmount: number;
      unpaidBillsCount: number;
      status: "CURRENT" | "DUE" | "OVERDUE";
    }> = [];

    const monthKeysSet = new Set<string>();
    const now = new Date().getTime();

    // Process accounts that have ledger entries
    for (const acc of ledgerAccounts) {
      // Compute opening balance & Marg running totals
      const openingEntry = acc.entries.find((e) => e.entry_type === "OPENING");
      let openingBalance = 0;
      let openingSide: "Dr" | "Cr" = "Dr";
      if (openingEntry) {
        const deb = Number(openingEntry.debit);
        const cred = Number(openingEntry.credit);
        openingBalance = deb > 0 ? deb : cred;
        openingSide = deb >= cred ? "Dr" : "Cr";
      }

      const totals = calculateMargTotals(
        acc.entries as any,
        openingSide === "Dr" ? openingBalance : -openingBalance
      );

      // Only include debtors (closingSide === "Dr" and closingBalance > 0.005)
      if (totals.closingSide !== "Dr" || totals.closingBalance <= 0.005) {
        continue;
      }

      const totalOutstanding = Math.round(totals.closingBalance * 100) / 100;

      // Extract all bills from ledger (debit entries with bill / invoice doc_no)
      const bills = acc.entries
        .filter((e) => e.entry_type !== "OPENING" && Number(e.debit) > 0)
        .map((e) => ({
          id: e.id,
          docNo: e.doc_no || `BILL #${e.id.slice(0, 6)}`,
          date: e.entry_date.toISOString().slice(0, 10),
          dateTime: e.entry_date.getTime(),
          amount: Number(e.debit),
        }));

      // Sort reverse-chronologically (latest bill first till first bill)
      bills.sort((a, b) => b.dateTime - a.dateTime);

      let remaining = totalOutstanding;
      const monthlyAmounts: Record<string, number> = {};
      let oldestBillNo: string | null = null;
      let oldestBillDate: string | null = null;
      let oldestAgeDays: number | null = null;
      let unpaidBillsCount = 0;
      let overdueAmount = 0;
      const creditDays = acc.credit_days || 90;
      const creditMs = creditDays * 24 * 60 * 60 * 1000;

      // Allocate outstanding dues: latest bill first till first bill
      for (const b of bills) {
        let billPending = 0;
        if (remaining >= b.amount) {
          billPending = b.amount;
          remaining = Math.round((remaining - b.amount) * 100) / 100;
        } else if (remaining > 0) {
          billPending = remaining;
          remaining = 0;
        }

        if (billPending > 0.005) {
          unpaidBillsCount++;
          const d = new Date(b.date);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          monthlyAmounts[monthKey] = Math.round(((monthlyAmounts[monthKey] || 0) + billPending) * 100) / 100;
          monthKeysSet.add(monthKey);

          // Update oldest unpaid bill (as we progress towards earlier bills)
          oldestBillNo = b.docNo;
          oldestBillDate = b.date;
          const age = Math.max(0, Math.floor((now - b.dateTime) / (1000 * 60 * 60 * 24)));
          oldestAgeDays = age;

          // Check if bill date is beyond credit period
          if (now - b.dateTime > creditMs) {
            overdueAmount = Math.round((overdueAmount + billPending) * 100) / 100;
          }
        }
      }

      // Any remaining balance beyond current year bills is from Opening Balance (prior-year dues)
      if (remaining > 0.005) {
        monthlyAmounts["prior"] = Math.round(((monthlyAmounts["prior"] || 0) + remaining) * 100) / 100;
        monthKeysSet.add("prior");
        if (!oldestBillNo) {
          oldestBillNo = "Opening Balance";
          oldestBillDate = openingEntry ? openingEntry.entry_date.toISOString().slice(0, 10) : "2026-04-01";
        }
        overdueAmount = Math.round((overdueAmount + remaining) * 100) / 100;
      }

      const partyName = acc.customer?.name || acc.display_name;

      debtorRows.push({
        id: acc.id,
        customerId: acc.customer?.id || null,
        accountId: acc.id,
        partyName,
        gstin: acc.customer?.gstin || null,
        stateCode: acc.customer?.state_code || null,
        totalInvoiced: Math.round(totals.periodDebit * 100) / 100,
        totalOutstanding,
        monthlyAmounts,
        oldestBillNo,
        oldestBillDate,
        oldestAgeDays,
        overdueAmount,
        unpaidBillsCount,
        status: overdueAmount > 0.005 ? "OVERDUE" : unpaidBillsCount > 0 ? "DUE" : "CURRENT",
      });
    }

    // Sort debtors by highest total outstanding first
    debtorRows.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    // Build chronological month columns: Prior first, then Apr 2026, May 2026, etc.
    const sortedMonthKeys = Array.from(monthKeysSet).sort((a, b) => {
      if (a === "prior") return -1;
      if (b === "prior") return 1;
      return a.localeCompare(b);
    });

    const monthColumns = sortedMonthKeys.map((key) => {
      if (key === "prior") {
        return { key, label: "Prior Dues" };
      }
      const [yearStr, monthStr] = key.split("-");
      const d = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
      const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
      return { key, label };
    });

    // Compute month totals
    const monthTotals: Record<string, number> = {};
    for (const m of sortedMonthKeys) {
      monthTotals[m] = 0;
    }
    let grandTotalOutstanding = 0;
    let grandTotalOverdue = 0;

    for (const row of debtorRows) {
      grandTotalOutstanding += row.totalOutstanding;
      grandTotalOverdue += row.overdueAmount;
      for (const m of sortedMonthKeys) {
        monthTotals[m] = Math.round(((monthTotals[m] || 0) + (row.monthlyAmounts[m] || 0)) * 100) / 100;
      }
    }

    const payload = {
      debtors: debtorRows,
      months: monthColumns,
      summary: {
        totalDebtors: debtorRows.length,
        grandTotalOutstanding: Math.round(grandTotalOutstanding * 100) / 100,
        grandTotalOverdue: Math.round(grandTotalOverdue * 100) / 100,
        monthTotals,
      },
    };

    return NextResponse.json({
      success: true,
      data: payload,
      ...payload,
    });
  } catch (error) {
    console.error("Error generating debtor list:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to generate debtor list" } },
      { status: 500 }
    );
  }
}
