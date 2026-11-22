"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Calendar,
  Filter,
  RefreshCw,
  ExternalLink,
  CreditCard,
  Building2,
  TrendingUp,
  Receipt,
  Download,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import { formatINR, formatDate } from "@/lib/format";

interface PaymentItem {
  id: string;
  date: string;
  partyName: string;
  partyType: "CUSTOMER" | "SUPPLIER";
  partyId: string | null;
  accountId: string;
  amount: number;
  entryType: string;
  paymentMode: string | null;
  instrumentNo: string | null;
  particulars: string | null;
  narration: string | null;
  docNo: string | null;
}

interface PaymentSummary {
  totalAmount: number;
  totalCount: number;
  thisMonthAmount: number;
  latestDate: string | null;
}

interface PartyOption {
  id: string;
  accountId: string;
  name: string;
}

interface PaymentsViewProps {
  initialType: "credit" | "debit";
}

export function PaymentsView({ initialType }: PaymentsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [type, setType] = useState<"credit" | "debit">(initialType);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PaymentSummary>({
    totalAmount: 0,
    totalCount: 0,
    thisMonthAmount: 0,
    latestDate: null,
  });
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const isCredit = type === "credit";

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("type", type);
      if (search.trim()) params.set("search", search.trim());
      if (selectedPartyId) params.set("partyId", selectedPartyId);
      if (selectedMonth) params.set("month", selectedMonth);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      params.set("page", page.toString());
      params.set("limit", "50");

      const res = await fetch(`/api/payments?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setPayments(data.payments || []);
        setSummary(data.summary || {
          totalAmount: 0,
          totalCount: 0,
          thisMonthAmount: 0,
          latestDate: null,
        });
        setTotalPages(data.totalPages || 1);
        if (data.parties) setParties(data.parties);
        if (data.availableMonths) setAvailableMonths(data.availableMonths);
      }
    } catch (err) {
      console.error("Failed to load payments:", err);
    } finally {
      setLoading(false);
    }
  }, [type, search, selectedPartyId, selectedMonth, fromDate, toDate, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPayments();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchPayments]);

  const handleTabChange = (newType: "credit" | "debit") => {
    setType(newType);
    setPage(1);
    setSelectedPartyId("");
    router.push(`/payments/${newType}`);
  };

  const getRelativeTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 30) return `${diffDays} days ago`;
      if (diffDays < 60) return `1 month ago`;
      const months = Math.floor(diffDays / 30);
      return `${months} months ago`;
    } catch {
      return "";
    }
  };

  const formatMonthLabel = (mStr: string) => {
    try {
      const [year, month] = mStr.split("-");
      const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    } catch {
      return mStr;
    }
  };

  const handleExportCSV = () => {
    if (payments.length === 0) return;
    const headers = ["Date", isCredit ? "Customer Name" : "Supplier Name", "Amount (INR)", "Payment Mode", "Instrument No", "Particulars"];
    const rows = payments.map((p) => [
      formatDate(p.date),
      `"${p.partyName.replace(/"/g, '""')}"`,
      p.amount,
      p.paymentMode || "",
      p.instrumentNo || "",
      `"${(p.particulars || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${isCredit ? "Customer_Credit_Payments" : "Supplier_Debit_Payments"}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header and Sub-section Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-ink tracking-tight">Payments Directory</h2>
            <div className="inline-flex p-0.5 bg-surface-2 border border-border rounded-sm text-xs font-medium">
              <button
                onClick={() => handleTabChange("credit")}
                className={`px-3 py-1 rounded-xs transition flex items-center gap-1.5 ${
                  isCredit
                    ? "bg-emerald-600 text-white font-semibold shadow-xs"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Credit (Customer Receipts)</span>
              </button>
              <button
                onClick={() => handleTabChange("debit")}
                className={`px-3 py-1 rounded-xs transition flex items-center gap-1.5 ${
                  !isCredit
                    ? "bg-rose-600 text-white font-semibold shadow-xs"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Debit (Supplier Payments)</span>
              </button>
            </div>
          </div>
          <p className="text-xs text-ink-3 mt-1.5">
            {isCredit
              ? "Chronological record of which customer paid how much amount on each date, extracted directly from customer ledgers."
              : "Chronological record of which supplier was paid how much amount on each date, extracted directly from supplier ledgers."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={payments.length === 0}
            className="h-8 px-3 bg-surface border border-border text-ink hover:bg-surface-2 rounded-sm text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-40"
            title="Export payments to CSV"
          >
            <Download className="w-3.5 h-3.5 text-ink-3" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={fetchPayments}
            disabled={loading}
            className="h-8 px-3 bg-surface border border-border text-ink hover:bg-surface-2 rounded-sm text-xs font-medium flex items-center gap-1.5 transition"
            title="Refresh payments"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : "text-ink-3"}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Amount */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">{isCredit ? "Total Customer Receipts" : "Total Supplier Payments"}</span>
            {isCredit ? (
              <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </span>
            ) : (
              <span className="w-6 h-6 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
          <div>
            <div className={`text-xl font-bold font-mono tracking-tight ${isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {formatINR(summary.totalAmount)}
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5">
              Across {summary.totalCount.toLocaleString("en-IN")} ledger payment entries
            </div>
          </div>
        </div>

        {/* This Month */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">Current Month</span>
            <Calendar className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-ink tracking-tight">
              {formatINR(summary.thisMonthAmount)}
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5">
              Total {isCredit ? "received" : "disbursed"} in {new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
            </div>
          </div>
        </div>

        {/* Latest Payment */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">Latest Payment Date</span>
            <Clock className="w-3.5 h-3.5 text-accent" />
          </div>
          <div>
            <div className="text-base font-bold font-mono text-ink tracking-tight">
              {summary.latestDate ? formatDate(summary.latestDate) : "—"}
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5">
              {summary.latestDate ? getRelativeTime(summary.latestDate) : "No records found"}
            </div>
          </div>
        </div>

        {/* Total Parties */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">{isCredit ? "Registered Customers" : "Registered Suppliers"}</span>
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-ink tracking-tight">
              {parties.length}
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5">
              Active ledger accounts in directory
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface p-3 border border-border rounded-sm flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-ink-3 font-medium">
          <Filter className="w-3.5 h-3.5" />
          <span>Filters:</span>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={`Search ${isCredit ? "customer" : "supplier"}, cheque, ref...`}
            className="w-full pl-8 pr-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Party Filter Dropdown */}
        <div className="flex-1 min-w-[180px] max-w-xs">
          <select
            value={selectedPartyId}
            onChange={(e) => {
              setSelectedPartyId(e.target.value);
              setPage(1);
            }}
            className="w-full px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink"
          >
            <option value="">{isCredit ? "All Customers" : "All Suppliers"}</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Month Selector */}
        <div className="min-w-[130px]">
          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setFromDate("");
              setToDate("");
              setPage(1);
            }}
            className="w-full px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink font-mono"
          >
            <option value="">All Months</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Date Range */}
        <div className="flex items-center gap-1.5 bg-bg border border-border rounded-sm px-2 py-0.5">
          <span className="text-ink-3 text-[11px]">From:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setSelectedMonth("");
              setPage(1);
            }}
            className="bg-transparent text-xs text-ink font-mono focus:outline-none"
          />
          <span className="text-ink-3 text-[11px]">To:</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setSelectedMonth("");
              setPage(1);
            }}
            className="bg-transparent text-xs text-ink font-mono focus:outline-none"
          />
        </div>

        {(search || selectedPartyId || selectedMonth || fromDate || toDate) && (
          <button
            onClick={() => {
              setSearch("");
              setSelectedPartyId("");
              setSelectedMonth("");
              setFromDate("");
              setToDate("");
              setPage(1);
            }}
            className="text-xs text-primary hover:underline ml-auto font-medium"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Main Data Table */}
      <div className="bg-surface border border-border rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-ink-2 font-semibold select-none">
                <th className="py-2.5 px-4 font-mono w-32">Date</th>
                <th className="py-2.5 px-4">{isCredit ? "Customer Name" : "Supplier Name"}</th>
                <th className="py-2.5 px-4 text-right font-mono w-40">Amount</th>
                <th className="py-2.5 px-4 w-36">Mode / Instrument</th>
                <th className="py-2.5 px-4">Particulars & References</th>
                <th className="py-2.5 px-4 text-center w-28">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink-3">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    <span>Loading payments data from ledgers...</span>
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink-3">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium text-ink-2">No payment entries found</p>
                    <p className="text-[11px] text-ink-3 mt-1">
                      No matching {isCredit ? "customer credit" : "supplier debit"} records exist for the chosen filters.
                    </p>
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  return (
                    <tr key={p.id} className="hover:bg-surface-2/60 transition group">
                      {/* Date */}
                      <td className="py-2.5 px-4 font-mono text-ink">
                        <div className="font-medium">{formatDate(p.date)}</div>
                        <div className="text-[10px] text-ink-3">{getRelativeTime(p.date)}</div>
                      </td>

                      {/* Party Name */}
                      <td className="py-2.5 px-4">
                        <Link
                          href={`/accounts/${p.accountId}`}
                          className="font-semibold text-ink group-hover:text-primary transition hover:underline flex items-center gap-1.5"
                        >
                          <span>{p.partyName}</span>
                        </Link>
                        {p.docNo && (
                          <span className="text-[10px] text-ink-3 font-mono">
                            Ref Doc: {p.docNo}
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-2.5 px-4 text-right font-mono">
                        <span
                          className={`font-bold text-sm ${
                            isCredit
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {isCredit ? "+" : "−"}
                          {formatINR(p.amount)}
                        </span>
                      </td>

                      {/* Mode / Instrument */}
                      <td className="py-2.5 px-4">
                        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-surface-2 text-ink-2 border border-border text-[11px] font-mono">
                          <span>{p.paymentMode || (p.particulars?.includes("NEFT") ? "NEFT" : "CHEQUE")}</span>
                          {p.instrumentNo && <span>#{p.instrumentNo}</span>}
                        </div>
                      </td>

                      {/* Particulars */}
                      <td className="py-2.5 px-4 text-ink-2 max-w-xs truncate" title={p.particulars || p.narration || ""}>
                        <span>{p.particulars || p.narration || "—"}</span>
                      </td>

                      {/* Link to Ledger */}
                      <td className="py-2.5 px-4 text-center">
                        <Link
                          href={`/accounts/${p.accountId}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-sm bg-surface-2 border border-border text-ink-2 hover:text-ink hover:bg-surface text-[11px] font-medium transition"
                          title="View statement & full ledger"
                        >
                          <span>View Ledger</span>
                          <ExternalLink className="w-3 h-3 text-ink-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-border bg-surface-2/40 flex items-center justify-between text-xs text-ink-3">
            <div>
              Page <span className="font-semibold text-ink">{page}</span> of{" "}
              <span className="font-semibold text-ink">{totalPages}</span> ({summary.totalCount} total entries)
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded-sm bg-surface border border-border text-ink disabled:opacity-40 hover:bg-surface-2 transition text-xs font-medium"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 rounded-sm bg-surface border border-border text-ink disabled:opacity-40 hover:bg-surface-2 transition text-xs font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
