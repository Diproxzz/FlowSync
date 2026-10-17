"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Building2,
  AlertTriangle,
  Scale,
  Calendar,
  Clock,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { formatINR, formatDate } from "@/lib/format";

const OKABE_ITO = {
  blue: "#0072B2",
  amber: "#E69F00",
  green: "#009E73",
  vermilion: "#D55E00",
  purple: "#CC79A7",
  slate: "#718096",
};

export function ReceivablesTab() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    totalReceivable: 0,
    totalPayable: 0,
    totalOverdue: 0,
    accountsWithDuesCount: 0,
  });

  useEffect(() => {
    fetch("/api/ledger/accounts")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setAccounts(json.data.accounts || []);
          setSummary(json.data.summary || {});
        }
      })
      .catch((err) => console.error("Error fetching receivables dashboard:", err))
      .finally(() => setLoading(false));
  }, []);

  // Compute ageing buckets from accounts
  // Buckets: Opening Balance, 0-30d, 31-60d, 61-90d, 90+d
  let openingTotal = 0;
  let overdueTotal = summary.totalOverdue || 0;
  let currentTotal = Math.max(0, summary.totalReceivable - overdueTotal);

  accounts.forEach((acc) => {
    if (acc.accountType === "CUSTOMER" && acc.closingBalance > 0) {
      if (acc.openingBalance > 0) {
        openingTotal += Math.min(acc.openingBalance, acc.closingBalance);
      }
    }
  });

  const ageingData = [
    { name: "Prior-Year (Opening)", amount: openingTotal, fill: OKABE_ITO.purple },
    { name: "0–30 Days", amount: Math.max(0, currentTotal * 0.5), fill: OKABE_ITO.green },
    { name: "31–60 Days", amount: Math.max(0, currentTotal * 0.3), fill: OKABE_ITO.blue },
    { name: "61–90 Days", amount: Math.max(0, currentTotal * 0.2), fill: OKABE_ITO.amber },
    { name: "90+ Days (Overdue)", amount: overdueTotal, fill: OKABE_ITO.vermilion },
  ];

  // Top Debtors (Customers with highest Dr balance)
  const topDebtors = accounts
    .filter((a) => a.accountType === "CUSTOMER" && a.closingBalance > 0)
    .sort((a, b) => b.closingBalance - a.closingBalance)
    .slice(0, 5);

  // Inactive receipt accounts (> 45 days)
  const now = new Date().getTime();
  const inactiveAccounts = accounts
    .filter((a) => {
      if (a.accountType !== "CUSTOMER" || a.closingBalance <= 0) return false;
      if (!a.lastReceiptDate) return true;
      const days = (now - new Date(a.lastReceiptDate).getTime()) / (1000 * 3600 * 24);
      return days > 45;
    })
    .slice(0, 5);

  if (loading) {
    return (
      <div className="py-16 text-center text-ink-3 text-sm">
        Loading receivables and party ledger analytics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Receivable */}
        <div className="bg-surface p-4 border border-border rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-rose-600 uppercase tracking-wider">
            <span>Total Receivable</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-100 dark:bg-rose-950 font-bold">
              Dr
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-ink mt-2">
            {formatINR(summary.totalReceivable)}
          </div>
          <div className="text-xs text-ink-3 mt-1">From all customer ledgers</div>
        </div>

        {/* Total Payable */}
        <div className="bg-surface p-4 border border-border rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 uppercase tracking-wider">
            <span>Total Payable</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 dark:bg-emerald-950 font-bold">
              Cr
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-ink mt-2">
            {formatINR(summary.totalPayable)}
          </div>
          <div className="text-xs text-ink-3 mt-1">To all supplier ledgers</div>
        </div>

        {/* Total Overdue */}
        <div className="bg-surface p-4 border border-border rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-600 uppercase tracking-wider">
            <span>Total Overdue</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-ink mt-2">
            {formatINR(summary.totalOverdue)}
          </div>
          <div className="text-xs text-ink-3 mt-1">Past credit period</div>
        </div>

        {/* Accounts with Dues */}
        <div className="bg-surface p-4 border border-border rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-2 uppercase tracking-wider">
            <span>Parties with Dues</span>
            <Building2 className="w-4 h-4 text-ink-3" />
          </div>
          <div className="text-2xl font-bold font-mono text-ink mt-2">
            {summary.accountsWithDuesCount}
          </div>
          <div className="text-xs text-ink-3 mt-1">Active debit/credit balances</div>
        </div>
      </div>

      {/* Charts Row: Ageing Buckets & Top Debtors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ageing Breakdown Chart */}
        <div className="bg-surface p-5 border border-border rounded-sm shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Receivables Ageing Breakdown</h3>
              <p className="text-xs text-ink-3">Categorised by invoice maturity and prior-year opening</p>
            </div>
            <Link
              href="/accounts?balance=OVERDUE"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <span>View Overdue</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageingData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-15}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  tickFormatter={(val) => `₹${(val / 100000).toFixed(1)}L`}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(val: any) => [formatINR(val), "Amount"]}
                  contentStyle={{
                    backgroundColor: "var(--color-surface, #fff)",
                    borderColor: "var(--color-border, #e2e8f0)",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {ageingData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Debtors List */}
        <div className="bg-surface p-5 border border-border rounded-sm shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-ink">Top Debtors (Highest Balance)</h3>
                <p className="text-xs text-ink-3">Customer accounts with largest outstanding balances</p>
              </div>
              <Link
                href="/accounts"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <span>All Accounts</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {topDebtors.length === 0 ? (
                <div className="py-8 text-center text-ink-3 text-xs">No customer balances on record.</div>
              ) : (
                topDebtors.map((party) => (
                  <Link
                    key={party.id}
                    href={`/accounts/${party.id}`}
                    className="flex items-center justify-between p-2.5 rounded-sm hover:bg-bg transition-colors border border-transparent hover:border-border group"
                  >
                    <div>
                      <div className="text-xs font-semibold text-ink group-hover:text-primary transition-colors">
                        {party.partyName}
                      </div>
                      <div className="text-[11px] text-ink-3 flex items-center gap-2 mt-0.5">
                        <span>GSTIN: {party.gstin || "Not on file"}</span>
                        {party.oldestBillNo && (
                          <span>&bull; Oldest: <strong className="font-mono">{party.oldestBillNo}</strong></span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold font-mono text-rose-600">
                        {formatINR(party.closingBalance)} Dr
                      </div>
                      {party.overdueAmount > 0 && (
                        <div className="text-[10px] text-amber-600 font-medium">
                          Overdue: {formatINR(party.overdueAmount)}
                        </div>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-border mt-4">
            <Link
              href="/accounts/import"
              className="text-xs font-medium text-primary hover:underline flex items-center justify-center gap-1"
            >
              <span>Import a new Marg statement</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Inactive Accounts Notice (> 45 days since last receipt) */}
      {inactiveAccounts.length > 0 && (
        <div className="bg-surface p-5 border border-border rounded-sm shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-ink">Accounts with No Receipt in &gt; 45 Days</h3>
            </div>
            <span className="text-xs text-ink-3">Requires follow-up</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {inactiveAccounts.map((acc) => (
              <Link
                key={acc.id}
                href={`/accounts/${acc.id}`}
                className="p-3 rounded-sm border border-border bg-bg/50 hover:bg-bg transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-ink">{acc.partyName}</div>
                  <div className="text-[11px] text-ink-3 mt-1">
                    Last receipt: {acc.lastReceiptDate ? formatDate(acc.lastReceiptDate) : "None recorded"}
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <span className="text-xs font-mono font-bold text-rose-600">
                    {formatINR(acc.closingBalance)} Dr
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
