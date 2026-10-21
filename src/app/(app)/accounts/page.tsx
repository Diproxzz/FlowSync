"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatINR, formatDate } from "@/lib/format";
import {
  FileSpreadsheet,
  Search,
  Filter,
  ArrowUpDown,
  PlusCircle,
  ExternalLink,
  Scale,
  AlertTriangle,
  Building,
  CheckCircle,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DebtorListView,
  type DebtorItem,
  type MonthColumn,
  type DebtorSummary,
} from "@/components/accounts/DebtorListView";

interface AccountOverviewItem {
  id: string;
  accountType: "CUSTOMER" | "SUPPLIER";
  partyName: string;
  partyId: string | null;
  gstin: string | null;
  gstinSource: string | null;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
  closingSide: "Dr" | "Cr";
  creditDays: number;
  statementThroughDate: string | null;
  lastReceiptDate: string | null;
  oldestBillNo: string | null;
  oldestBillDate: string | null;
  overdueAmount: number;
}

interface AccountsSummary {
  totalReceivable: number;
  totalPayable: number;
  totalOverdue: number;
  accountsWithDuesCount: number;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountOverviewItem[]>([]);
  const [summary, setSummary] = useState<AccountsSummary>({
    totalReceivable: 0,
    totalPayable: 0,
    totalOverdue: 0,
    accountsWithDuesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "CUSTOMER" | "SUPPLIER">("ALL");
  const [filterBalance, setFilterBalance] = useState<"ALL" | "DR_ONLY" | "CR_ONLY" | "OVERDUE">("ALL");

  const [isDebtorListOpen, setIsDebtorListOpen] = useState(false);
  const [debtorData, setDebtorData] = useState<{
    debtors: DebtorItem[];
    months: MonthColumn[];
    summary: DebtorSummary;
  } | null>(null);
  const [loadingDebtors, setLoadingDebtors] = useState(false);

  const fetchDebtors = async () => {
    try {
      const res = await fetch("/api/ledger/debtors");
      const json = await res.json();
      if (json.data) {
        setDebtorData(json.data);
      } else if (json.debtors) {
        setDebtorData(json);
      }
    } catch (err) {
      console.error("Failed to load debtors list:", err);
    }
  };

  const handleOpenDebtorList = async () => {
    setIsDebtorListOpen(true);
    if (!debtorData) {
      setLoadingDebtors(true);
      await fetchDebtors();
      setLoadingDebtors(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchDebtors();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ledger/accounts");
      const json = await res.json();
      const accountsList = json.data?.accounts || json.accounts || [];
      const summaryData = json.data?.summary || json.summary || {
        totalReceivable: 0,
        totalPayable: 0,
        totalOverdue: 0,
        accountsWithDuesCount: 0,
      };
      setAccounts(accountsList);
      setSummary(summaryData);
    } catch (err) {
      console.error("Failed to load accounts overview:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filter accounts
  const filteredAccounts = accounts.filter((acc) => {
    if (filterType !== "ALL" && acc.accountType !== filterType) return false;
    if (filterBalance === "DR_ONLY" && (acc.closingSide !== "Dr" || acc.closingBalance <= 0.005)) return false;
    if (filterBalance === "CR_ONLY" && (acc.closingSide !== "Cr" || acc.closingBalance <= 0.005)) return false;
    if (filterBalance === "OVERDUE" && acc.overdueAmount <= 0.005) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = acc.partyName.toLowerCase().includes(q);
      const matchGstin = acc.gstin && acc.gstin.toLowerCase().includes(q);
      const matchDoc = acc.oldestBillNo && acc.oldestBillNo.toLowerCase().includes(q);
      if (!matchName && !matchGstin && !matchDoc) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Accounts & Ledgers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Party statements, running balances, receivables, and payables.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenDebtorList}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors shadow-xs"
            title="View Debtor List with monthwise classification and export"
          >
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Debtor List (Monthwise)</span>
          </button>

          <Link
            href="/accounts/import"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Import Statement</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards: Receivables & Payables (Never Netted) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Receivable */}
        <div
          onClick={handleOpenDebtorList}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleOpenDebtorList();
          }}
          className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 dark:bg-rose-950/20 dark:border-rose-900 shadow-sm cursor-pointer hover:border-rose-300 dark:hover:border-rose-700 hover:shadow-md transition-all group select-none"
          title="Click to view monthwise Debtor List"
        >
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Receivable (Dr)</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] lowercase text-rose-600/80 group-hover:underline">view list &rarr;</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-100 dark:bg-rose-900/60 font-bold uppercase">
                Dr
              </span>
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-400 mt-2">
            {formatINR(summary.totalReceivable)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Total amount parties owe you &bull; Click for debtor list
          </div>
        </div>

        {/* Total Payable */}
        <div
          onClick={() => setFilterBalance("CR_ONLY")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setFilterBalance("CR_ONLY");
          }}
          className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900 shadow-sm cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all group select-none"
          title="Click to filter Cr (Payable) balances"
        >
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Payable (Cr)</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 dark:bg-emerald-900/60 font-bold">
              Cr
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-2">
            {formatINR(summary.totalPayable)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Total amount you owe to parties &bull; Click to filter
          </div>
        </div>

        {/* Total Overdue */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <span>Total Overdue</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">
            {formatINR(summary.totalOverdue)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Outstanding past credit period
          </div>
        </div>

        {/* Accounts with Dues */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <span>Accounts with Balance</span>
            <Building className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">
            {summary.accountsWithDuesCount}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Parties with non-zero closing dues
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-card border border-border rounded-xl shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search party name, GSTIN, or bill #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border text-xs">
            <button
              type="button"
              onClick={() => setFilterType("ALL")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                filterType === "ALL" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterType("CUSTOMER")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                filterType === "CUSTOMER" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Customers
            </button>
            <button
              type="button"
              onClick={() => setFilterType("SUPPLIER")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                filterType === "SUPPLIER" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Suppliers
            </button>
          </div>

          <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border text-xs">
            <button
              type="button"
              onClick={() => setFilterBalance("ALL")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                filterBalance === "ALL" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              All Balances
            </button>
            <button
              type="button"
              onClick={() => setFilterBalance("DR_ONLY")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                filterBalance === "DR_ONLY" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Dr Only
            </button>
            <button
              type="button"
              onClick={() => setFilterBalance("CR_ONLY")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                filterBalance === "CR_ONLY" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Cr Only
            </button>
            <button
              type="button"
              onClick={() => setFilterBalance("OVERDUE")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                filterBalance === "OVERDUE" ? "bg-background text-rose-600 shadow-sm" : "text-muted-foreground"
              )}
            >
              Overdue
            </button>
          </div>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                <th className="py-3 px-4">Party Name</th>
                <th className="py-3 px-3 w-[150px]">GSTIN</th>
                <th className="py-3 px-3 text-right w-[110px]">Opening</th>
                <th className="py-3 px-3 text-right w-[110px]">Debit</th>
                <th className="py-3 px-3 text-right w-[110px]">Credit</th>
                <th className="py-3 px-3 text-right w-[130px]">Closing Balance</th>
                <th className="py-3 px-3 text-right w-[110px]">Overdue</th>
                <th className="py-3 px-3 w-[120px]">Oldest Open Bill</th>
                <th className="py-3 px-3 w-[100px]">Last Receipt</th>
                <th className="py-3 px-2 w-[40px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    Loading party ledgers...
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    No accounts found matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const isDr = acc.closingSide === "Dr";
                  const isCr = acc.closingSide === "Cr";

                  return (
                    <tr
                      key={acc.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => (window.location.href = `/accounts/${acc.id}`)}
                    >
                      {/* Party Name */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors flex items-center gap-1.5">
                          <span>{acc.partyName}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono text-muted-foreground bg-muted font-normal">
                            {acc.accountType === "CUSTOMER" ? "Customer" : "Supplier"}
                          </span>
                        </div>
                      </td>

                      {/* GSTIN */}
                      <td className="py-3 px-3 font-mono text-muted-foreground">
                        {acc.gstin ? (
                          <span className="text-foreground font-medium">{acc.gstin}</span>
                        ) : (
                          <span className="text-muted-foreground/60 italic">Not on file</span>
                        )}
                      </td>

                      {/* Opening */}
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                        {formatINR(acc.openingBalance)}
                      </td>

                      {/* Debit */}
                      <td className="py-3 px-3 text-right font-mono text-foreground">
                        {acc.periodDebit > 0 ? formatINR(acc.periodDebit) : "—"}
                      </td>

                      {/* Credit */}
                      <td className="py-3 px-3 text-right font-mono text-foreground">
                        {acc.periodCredit > 0 ? formatINR(acc.periodCredit) : "—"}
                      </td>

                      {/* Closing Balance */}
                      <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isCr ? "text-emerald-600 dark:text-emerald-400 font-bold" : isDr ? "text-foreground" : "text-muted-foreground"}>
                          {formatINR(Math.abs(acc.closingBalance))}
                        </span>{" "}
                        <span
                          className={cn(
                            "text-[10px] font-bold ml-1",
                            isCr ? "text-emerald-600 dark:text-emerald-400" : isDr ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                          )}
                        >
                          {acc.closingSide}
                        </span>
                      </td>

                      {/* Overdue */}
                      <td className="py-3 px-3 text-right font-mono">
                        {acc.accountType === "CUSTOMER" && acc.overdueAmount > 0 ? (
                          <span className="text-rose-600 font-semibold">
                            {formatINR(acc.overdueAmount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>

                      {/* Oldest Open Bill */}
                      <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                        {acc.oldestBillNo ? (
                          <div>
                            <span className="text-foreground font-medium">{acc.oldestBillNo}</span>
                            {acc.oldestBillDate && (
                              <div className="text-[10px] text-muted-foreground">
                                {formatDate(acc.oldestBillDate)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span>—</span>
                        )}
                      </td>

                      {/* Last Receipt */}
                      <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {acc.lastReceiptDate ? formatDate(acc.lastReceiptDate) : "—"}
                      </td>

                      {/* Arrow */}
                      <td className="py-3 px-2 text-center text-muted-foreground group-hover:text-primary">
                        <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Debtor List Monthwise View Modal */}
      {isDebtorListOpen && (
        debtorData ? (
          <DebtorListView
            debtors={debtorData.debtors}
            months={debtorData.months}
            summary={debtorData.summary}
            onClose={() => setIsDebtorListOpen(false)}
          />
        ) : (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-xl p-8 max-w-sm w-full flex flex-col items-center text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="w-8 h-8 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin mb-4" />
              <div className="font-semibold text-base text-foreground">Loading Debtor List...</div>
              <div className="text-xs text-muted-foreground mt-1.5">
                Classifying invoices and running balance month-by-month
              </div>
              <button
                type="button"
                onClick={() => setIsDebtorListOpen(false)}
                className="mt-5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                Cancel
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
