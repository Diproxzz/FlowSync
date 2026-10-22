import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateMargTotals } from "@/lib/ledger/balances";

export async function GET(request: NextRequest) {
  try {
    // 1. Fetch customer ledger accounts (both regular and informal) with non-void entries
    const ledgerAccounts = await prisma.ledgerAccount.findMany({
      where: {
        account_type: "CUSTOMER",
        is_active: true,
      },
      include: {
        customer: {
          select: { id: true, name: true, gstin: true, state_code: true },
        },
        informal_customer: {
          select: { id: true, name: true, gstin: true, state_code: true },
        },
        entries: {
          where: { is_void: false },
          orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
        },
      },
      orderBy: { display_name: "asc" },
    });

    interface AccountDebtorRow {
      accountId: string;
      customerId: string | null;
      partyName: string;
      gstin: string | null;
      stateCode: string | null;
      isInformal: boolean;
      totalInvoiced: number;
      totalOutstanding: number;
      monthlyAmounts: Record<string, number>;
      oldestBillNo: string | null;
      oldestBillDate: string | null;
      oldestAgeDays: number | null;
      overdueAmount: number;
      unpaidBillsCount: number;
    }

    const accountRows: AccountDebtorRow[] = [];
    const monthKeysSet = new Set<string>();
    const now = new Date().getTime();

    // Process each account that has ledger entries
    for (const acc of ledgerAccounts) {
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

          oldestBillNo = b.docNo;
          oldestBillDate = b.date;
          const age = Math.max(0, Math.floor((now - b.dateTime) / (1000 * 60 * 60 * 24)));
          oldestAgeDays = age;

          if (now - b.dateTime > creditMs) {
            overdueAmount = Math.round((overdueAmount + billPending) * 100) / 100;
          }
        }
      }

      if (remaining > 0.005) {
        monthlyAmounts["prior"] = Math.round(((monthlyAmounts["prior"] || 0) + remaining) * 100) / 100;
        monthKeysSet.add("prior");
        if (!oldestBillNo) {
          oldestBillNo = "Opening Balance";
          oldestBillDate = openingEntry ? openingEntry.entry_date.toISOString().slice(0, 10) : "2026-04-01";
        }
        overdueAmount = Math.round((overdueAmount + remaining) * 100) / 100;
      }

      const partyName =
        acc.customer?.name ||
        acc.informal_customer?.name ||
        acc.display_name.replace(" (Informal)", "");

      accountRows.push({
        accountId: acc.id,
        customerId: acc.customer?.id || acc.informal_customer?.id || null,
        partyName,
        gstin: acc.customer?.gstin || acc.informal_customer?.gstin || null,
        stateCode: acc.customer?.state_code || acc.informal_customer?.state_code || null,
        isInformal: acc.is_informal,
        totalInvoiced: Math.round(totals.periodDebit * 100) / 100,
        totalOutstanding,
        monthlyAmounts,
        oldestBillNo,
        oldestBillDate,
        oldestAgeDays,
        overdueAmount,
        unpaidBillsCount,
      });
    }

    // 2. Collective Grouping by Customer:
    // "If the same customer have normal Sales Invoices and Informal Invoices, two separate
    // ledger accounts should be available for them but the amount will be collectively displayed in the debtor list."
    const customerGroupMap = new Map<string, {
      customerId: string | null;
      partyName: string;
      gstin: string | null;
      stateCode: string | null;
      regularRow?: AccountDebtorRow;
      informalRow?: AccountDebtorRow;
    }>();

    for (const row of accountRows) {
      // Group key: customerId if available, or normalized partyName
      const groupKey = row.customerId || `name:${row.partyName.toLowerCase().trim()}`;
      if (!customerGroupMap.has(groupKey)) {
        customerGroupMap.set(groupKey, {
          customerId: row.customerId,
          partyName: row.partyName,
          gstin: row.gstin,
          stateCode: row.stateCode,
        });
      }
      const group = customerGroupMap.get(groupKey)!;
      if (row.isInformal) {
        group.informalRow = row;
      } else {
        group.regularRow = row;
      }
      if (!group.gstin && row.gstin) group.gstin = row.gstin;
      if (!group.stateCode && row.stateCode) group.stateCode = row.stateCode;
    }

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
      hasBothAccounts: boolean;
      hasInformal: boolean;
      regularAccountId: string | null;
      informalAccountId: string | null;
      regularOutstanding: number;
      informalOutstanding: number;
    }> = [];

    for (const group of customerGroupMap.values()) {
      const reg = group.regularRow;
      const inf = group.informalRow;

      const hasBothAccounts = Boolean(reg && inf);
      const hasInformal = Boolean(inf);

      const totalInvoiced = Math.round(((reg?.totalInvoiced || 0) + (inf?.totalInvoiced || 0)) * 100) / 100;
      const totalOutstanding = Math.round(((reg?.totalOutstanding || 0) + (inf?.totalOutstanding || 0)) * 100) / 100;
      const overdueAmount = Math.round(((reg?.overdueAmount || 0) + (inf?.overdueAmount || 0)) * 100) / 100;
      const unpaidBillsCount = (reg?.unpaidBillsCount || 0) + (inf?.unpaidBillsCount || 0);

      // Merge monthlyAmounts
      const mergedMonthly: Record<string, number> = {};
      const allKeys = new Set([
        ...Object.keys(reg?.monthlyAmounts || {}),
        ...Object.keys(inf?.monthlyAmounts || {}),
      ]);
      for (const k of allKeys) {
        mergedMonthly[k] = Math.round(
          ((reg?.monthlyAmounts[k] || 0) + (inf?.monthlyAmounts[k] || 0)) * 100
        ) / 100;
      }

      // Oldest bill information across both accounts
      let oldestBillNo = reg?.oldestBillNo || inf?.oldestBillNo || null;
      let oldestBillDate = reg?.oldestBillDate || inf?.oldestBillDate || null;
      let oldestAgeDays = Math.max(reg?.oldestAgeDays || 0, inf?.oldestAgeDays || 0);
      if (inf?.oldestAgeDays && (!reg?.oldestAgeDays || inf.oldestAgeDays > reg.oldestAgeDays)) {
        oldestBillNo = inf.oldestBillNo;
        oldestBillDate = inf.oldestBillDate;
      }

      const primaryAccountId = reg?.accountId || inf?.accountId || null;

      debtorRows.push({
        id: group.customerId || primaryAccountId || Math.random().toString(),
        customerId: group.customerId,
        accountId: primaryAccountId,
        partyName: group.partyName,
        gstin: group.gstin,
        stateCode: group.stateCode,
        totalInvoiced,
        totalOutstanding,
        monthlyAmounts: mergedMonthly,
        oldestBillNo,
        oldestBillDate,
        oldestAgeDays: oldestAgeDays || null,
        overdueAmount,
        unpaidBillsCount,
        status: overdueAmount > 0.005 ? "OVERDUE" : unpaidBillsCount > 0 ? "DUE" : "CURRENT",
        hasBothAccounts,
        hasInformal,
        regularAccountId: reg?.accountId || null,
        informalAccountId: inf?.accountId || null,
        regularOutstanding: reg?.totalOutstanding || 0,
        informalOutstanding: inf?.totalOutstanding || 0,
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
