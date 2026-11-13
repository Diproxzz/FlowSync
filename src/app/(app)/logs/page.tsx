"use client";

import { useEffect, useState, useCallback } from "react";
import {
  History,
  Search,
  RefreshCw,
  Receipt,
  CreditCard,
  Mail,
  UserCheck,
  Calendar,
  Filter,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { formatINR } from "@/lib/format";

interface BusinessLogItem {
  id: string;
  action: string;
  description: string;
  entityType: string | null;
  entityId: string | null;
  amount: number | null;
  metadata: any;
  createdAt: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<BusinessLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      params.set("limit", "100");

      const res = await fetch(`/api/logs?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.logs) {
        setLogs(data.logs);
        setTotalCount(data.total || data.logs.length);
      }
    } catch (err) {
      console.error("Failed to load business logs:", err);
    } finally {
      setLoading(false);
    }
  }, [search, actionFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  const formatLogDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "INVOICE_GENERATED":
        return {
          label: "Invoice Generated",
          icon: Receipt,
          className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
        };
      case "INVOICE_CONFIRMED":
        return {
          label: "Invoice Confirmed",
          icon: FileText,
          className: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
        };
      case "PAYMENT_RECEIVED":
        return {
          label: "Payment Received",
          icon: CreditCard,
          className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        };
      case "STATEMENT_SENT":
        return {
          label: "Statement Emailed",
          icon: Mail,
          className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
        };
      case "CUSTOMER_CREATED":
        return {
          label: "Customer Created",
          icon: UserCheck,
          className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
        };
      case "CUSTOMER_UPDATED":
        return {
          label: "Customer Updated",
          icon: UserCheck,
          className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
        };
      default:
        return {
          label: action.replace(/_/g, " "),
          icon: CheckCircle2,
          className: "bg-surface-2 text-ink-2 border-border",
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-ink">Business Activity Logs</h2>
          </div>
          <p className="text-xs text-ink-3 mt-1">
            Real-time chronological timeline of business transactions: invoices generated, payments received, and statements dispatched
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="h-9 px-3.5 bg-surface-2 border border-border text-ink hover:bg-surface rounded-sm text-xs font-medium flex items-center gap-2 transition self-start"
          title="Refresh activity logs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : "text-ink-3"}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-3 border border-border rounded-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number, party name, cheque, or description..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <button
            onClick={() => setActionFilter("ALL")}
            className={`px-2.5 py-1 rounded-sm transition text-xs font-medium ${
              actionFilter === "ALL"
                ? "bg-primary text-primary-fg"
                : "bg-surface-2 text-ink-3 hover:text-ink hover:bg-surface"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setActionFilter("INVOICE_GENERATED")}
            className={`px-2.5 py-1 rounded-sm transition text-xs font-medium ${
              actionFilter === "INVOICE_GENERATED"
                ? "bg-primary text-primary-fg"
                : "bg-surface-2 text-ink-3 hover:text-ink hover:bg-surface"
            }`}
          >
            Invoices
          </button>
          <button
            onClick={() => setActionFilter("PAYMENT_RECEIVED")}
            className={`px-2.5 py-1 rounded-sm transition text-xs font-medium ${
              actionFilter === "PAYMENT_RECEIVED"
                ? "bg-primary text-primary-fg"
                : "bg-surface-2 text-ink-3 hover:text-ink hover:bg-surface"
            }`}
          >
            Payments
          </button>
          <button
            onClick={() => setActionFilter("STATEMENT_SENT")}
            className={`px-2.5 py-1 rounded-sm transition text-xs font-medium ${
              actionFilter === "STATEMENT_SENT"
                ? "bg-primary text-primary-fg"
                : "bg-surface-2 text-ink-3 hover:text-ink hover:bg-surface"
            }`}
          >
            Statements
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-surface border border-border rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                <th className="py-2.5 px-4 w-44">Date & Time</th>
                <th className="py-2.5 px-3 w-40">Event Type</th>
                <th className="py-2.5 px-4">Activity Description</th>
                <th className="py-2.5 px-4 text-right w-36">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-ink-3">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                      <span>Loading business activity...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-ink-3">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <History className="w-6 h-6 text-ink-3 opacity-60" />
                      <span className="font-medium text-ink-2">No business activity logs recorded yet.</span>
                      <span className="text-[11px] text-ink-3">
                        Logs are generated automatically when sales invoices are issued, customer payments are received, or statements are sent.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const Icon = badge.icon;
                  return (
                    <tr key={log.id} className="hover:bg-surface-2/60 transition">
                      {/* Date & Time */}
                      <td className="py-3 px-4 font-mono text-ink-3 text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
                          <span>{formatLogDate(log.createdAt)}</span>
                        </div>
                      </td>

                      {/* Event Type */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${badge.className}`}
                        >
                          <Icon className="w-3 h-3 flex-shrink-0" />
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Activity Description */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-ink leading-relaxed">
                          {log.description}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                        {log.amount !== null && log.amount !== undefined ? (
                          <span
                            className={
                              log.action === "PAYMENT_RECEIVED"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-ink"
                            }
                          >
                            ₹ {log.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
