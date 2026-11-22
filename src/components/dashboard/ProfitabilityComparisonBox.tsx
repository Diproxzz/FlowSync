"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  CreditCard,
  Calendar,
  Filter,
  RefreshCw,
  FileText,
  ShoppingCart,
  CheckCircle2,
  TrendingUp,
  Percent,
  Layers,
  Info,
} from "lucide-react";
import { formatINR } from "@/lib/format";

type FilterType = "month" | "quarter" | "cy" | "fy";

interface ComparisonData {
  sold: {
    amount: number;
    taxable: number;
    count: number;
  };
  spentOnPurchase: {
    amount: number;
    taxable: number;
    count: number;
  };
  received: {
    amount: number;
    count: number;
  };
  netTradingDifference: number;
  netCashFlow: number;
  collectionRate: number;
  grossMarginPct: number;
  markupPct: number;
}

interface FilterOption {
  key: string;
  label: string;
}

interface ApiResponse {
  success: boolean;
  filter: {
    type: FilterType;
    value: string;
    label: string;
    start: string | null;
    end: string | null;
  };
  comparison: ComparisonData;
  options: {
    months: FilterOption[];
    quarters: FilterOption[];
    calendarYears: FilterOption[];
    financialYears: FilterOption[];
  };
}

export function ProfitabilityComparisonBox() {
  const [filterType, setFilterType] = useState<FilterType>("fy");
  const [filterValue, setFilterValue] = useState<string>("2026-27");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async (type: FilterType, val: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("filterType", type);
      if (val) params.set("value", val);

      const res = await fetch(`/api/analytics/business-comparison?${params.toString()}`);
      if (res.ok) {
        const json: ApiResponse = await res.json();
        if (json.success) {
          setData(json);
        }
      }
    } catch (err) {
      console.error("Failed to load business comparison:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(filterType, filterValue);
  }, [filterType, filterValue]);

  // When filter type changes, set appropriate default value
  const handleTypeChange = (newType: FilterType) => {
    setFilterType(newType);
    let defaultVal = "";
    if (newType === "month") {
      defaultVal = data?.options.months[0]?.key || "2026-11";
    } else if (newType === "quarter") {
      defaultVal = data?.options.quarters[2]?.key || "2026-Q3";
    } else if (newType === "cy") {
      defaultVal = data?.options.calendarYears[0]?.key || "2026";
    } else {
      defaultVal = data?.options.financialYears[0]?.key || "2026-27";
    }
    setFilterValue(defaultVal);
  };

  const c = data?.comparison;

  // Visual ratio calculations
  const totalBarMax = Math.max(
    c?.sold.amount || 1,
    c?.spentOnPurchase.amount || 1,
    c?.received.amount || 1
  );

  const soldPct = c ? Math.min(100, Math.round((c.sold.amount / totalBarMax) * 100)) : 0;
  const purchasePct = c ? Math.min(100, Math.round((c.spentOnPurchase.amount / totalBarMax) * 100)) : 0;
  const receivedPct = c ? Math.min(100, Math.round((c.received.amount / totalBarMax) * 100)) : 0;

  return (
    <div className="bg-surface border border-border rounded-sm p-4 space-y-4 shadow-xs">
      {/* Header & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-border/70 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-ink">
              Business Revenue, Purchase & Cash Receipts Comparison
            </h3>
            {data?.filter.label && (
              <span className="hidden sm:inline-block text-[11px] font-mono px-2 py-0.5 rounded-xs bg-primary/10 text-primary font-semibold border border-primary/20">
                {data.filter.label}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-3 mt-0.5">
            Compare total invoice sales, expenditure spent on purchases, and customer payments received.
          </p>
        </div>

        {/* Filter Buttons & Value Dropdown */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Filter Type Selector */}
          <div className="inline-flex p-0.5 bg-surface-2 border border-border rounded-sm">
            <button
              onClick={() => handleTypeChange("month")}
              className={`px-2.5 py-1 rounded-xs transition text-xs font-medium ${
                filterType === "month"
                  ? "bg-surface text-ink font-semibold shadow-xs"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              Months
            </button>
            <button
              onClick={() => handleTypeChange("quarter")}
              className={`px-2.5 py-1 rounded-xs transition text-xs font-medium ${
                filterType === "quarter"
                  ? "bg-surface text-ink font-semibold shadow-xs"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              Quarter
            </button>
            <button
              onClick={() => handleTypeChange("cy")}
              className={`px-2.5 py-1 rounded-xs transition text-xs font-medium ${
                filterType === "cy"
                  ? "bg-surface text-ink font-semibold shadow-xs"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              Calendar Year
            </button>
            <button
              onClick={() => handleTypeChange("fy")}
              className={`px-2.5 py-1 rounded-xs transition text-xs font-medium ${
                filterType === "fy"
                  ? "bg-surface text-ink font-semibold shadow-xs"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              Financial Year
            </button>
          </div>

          {/* Value Dropdown */}
          <div className="relative">
            <select
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              className="px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {filterType === "month" &&
                data?.options.months.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              {filterType === "quarter" &&
                data?.options.quarters.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              {filterType === "cy" &&
                data?.options.calendarYears.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              {filterType === "fy" &&
                data?.options.financialYears.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchData(filterType, filterValue)}
            disabled={loading}
            className="p-1.5 border border-border bg-surface text-ink-3 hover:text-ink rounded-sm transition"
            title="Refresh comparison"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
          </button>
        </div>
      </div>

      {/* 3 Main Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1: Amount Sold (Total Invoice Value) */}
        <div className="bg-gradient-to-br from-emerald-500/5 to-transparent border border-emerald-500/30 p-4 rounded-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              Amount Sold (Total Invoice Value)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-semibold">
              Sales Invoices
            </span>
          </div>

          <div>
            <p className="text-2xl font-bold font-mono text-ink tracking-tight">
              {formatINR(c?.sold.amount ?? 0)}
            </p>
            <div className="flex items-center justify-between text-xs text-ink-3 mt-1.5 pt-1.5 border-t border-border/50">
              <span>{c?.sold.count ?? 0} Sales Invoices</span>
              <span className="font-mono">
                Taxable: {formatINR(c?.sold.taxable ?? 0, true)}
              </span>
            </div>
          </div>

          {/* Mini Proportion Bar */}
          <div className="w-full bg-border/60 h-1 rounded-full overflow-hidden mt-1">
            <div
              className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${soldPct}%` }}
            />
          </div>
        </div>

        {/* Card 2: Amount Spent on Purchase */}
        <div className="bg-gradient-to-br from-amber-500/5 to-transparent border border-amber-500/30 p-4 rounded-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5 text-amber-600" />
              Amount Spent on Purchase
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-semibold">
              Purchase Bills
            </span>
          </div>

          <div>
            <p className="text-2xl font-bold font-mono text-ink tracking-tight">
              {formatINR(c?.spentOnPurchase.amount ?? 0)}
            </p>
            <div className="flex items-center justify-between text-xs text-ink-3 mt-1.5 pt-1.5 border-t border-border/50">
              <span>{c?.spentOnPurchase.count ?? 0} Purchase Invoices</span>
              <span className="font-mono">
                Taxable: {formatINR(c?.spentOnPurchase.taxable ?? 0, true)}
              </span>
            </div>
          </div>

          {/* Mini Proportion Bar */}
          <div className="w-full bg-border/60 h-1 rounded-full overflow-hidden mt-1">
            <div
              className="bg-amber-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${purchasePct}%` }}
            />
          </div>
        </div>

        {/* Card 3: Amount Received (Collections) */}
        <div className="bg-gradient-to-br from-blue-500/5 to-transparent border border-blue-500/30 p-4 rounded-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              Amount Received (Collections)
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 font-semibold">
              Ledger Receipts
            </span>
          </div>

          <div>
            <p className="text-2xl font-bold font-mono text-ink tracking-tight">
              {formatINR(c?.received.amount ?? 0)}
            </p>
            <div className="flex items-center justify-between text-xs text-ink-3 mt-1.5 pt-1.5 border-t border-border/50">
              <span>{c?.received.count ?? 0} Payment Receipts</span>
              <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                {c?.collectionRate ?? 0}% of Invoiced
              </span>
            </div>
          </div>

          {/* Mini Proportion Bar */}
          <div className="w-full bg-border/60 h-1 rounded-full overflow-hidden mt-1">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${receivedPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Synthesis & Comparative Insights Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
        {/* Metric 1: Invoiced Margin Spread */}
        <div className="p-2.5 rounded-sm bg-surface-2 border border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-semibold text-ink-3 block">
              Invoiced Trading Spread (Sold − Purchase)
            </span>
            <span
              className={`font-mono font-bold text-sm ${
                (c?.netTradingDifference ?? 0) >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600"
              }`}
            >
              {(c?.netTradingDifference ?? 0) >= 0 ? "+" : ""}
              {formatINR(c?.netTradingDifference ?? 0)}
            </span>
          </div>
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-xs bg-surface border border-border text-ink-2">
            {c?.markupPct ?? 0}% markup
          </span>
        </div>

        {/* Metric 2: Net Cash Position */}
        <div className="p-2.5 rounded-sm bg-surface-2 border border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-semibold text-ink-3 block">
              Cash vs Purchase (Received − Purchase)
            </span>
            <span
              className={`font-mono font-bold text-sm ${
                (c?.netCashFlow ?? 0) >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600"
              }`}
            >
              {(c?.netCashFlow ?? 0) >= 0 ? "+" : ""}
              {formatINR(c?.netCashFlow ?? 0)}
            </span>
          </div>
          <span className="text-[10px] text-ink-3 text-right">
            {(c?.netCashFlow ?? 0) >= 0 ? "Surplus inflow" : "Purchases exceed receipts"}
          </span>
        </div>

        {/* Metric 3: Collection Efficiency */}
        <div className="p-2.5 rounded-sm bg-surface-2 border border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-semibold text-ink-3 block">
              Collection Efficiency
            </span>
            <span className="font-mono font-bold text-sm text-ink">
              {c?.collectionRate ?? 0}% Collected
            </span>
          </div>
          <div className="text-right text-[10px] text-ink-3">
            {(c?.sold.amount ?? 0) > (c?.received.amount ?? 0) ? (
              <span className="text-amber-600 font-mono font-medium">
                Uncollected: {formatINR((c?.sold.amount ?? 0) - (c?.received.amount ?? 0), true)}
              </span>
            ) : (
              <span className="text-emerald-600 font-medium">Full collection parity</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
