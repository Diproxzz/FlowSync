"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  CreditCard,
  Search,
  Filter,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  PieChart as PieIcon,
  Download,
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
  PieChart,
  Pie,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import { formatINR, formatDate } from "@/lib/format";

// Dynamic Theme Chart Palette (Option 9 Dark / Option 10 Light)
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--primary)",
  "var(--accent)",
];

interface CustomerPaymentItem {
  customerId: string;
  accountId: string;
  customerName: string;
  amountPaidInPeriod: number;
  paymentsCountInPeriod: number;
  totalLifetimePaid: number;
  lifetimePaymentsCount: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number;
  lastPaymentInstrument: string | null;
  daysSinceLastPayment: number | null;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  totalAmountDue: number;
  currentPeriodAmount: number;
  currentPeriodPaymentsCount: number;
}

interface TopChartPoint {
  customerId: string;
  name: string;
  amount: number;
  percentage: number;
  paymentsCount: number;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
}

interface MonthlyTrendPoint {
  month: string;
  label: string;
  amount: number;
  count: number;
}

interface CustomerPaymentsDashboardData {
  period: {
    month: string;
    start: string | null;
    end: string | null;
  };
  summary: {
    totalPeriodAmount: number;
    payingCustomersCount: number;
    paymentsCount: number;
    averagePaymentAmount: number;
    mostRecentPayment: {
      customerName: string;
      amount: number;
      date: string;
      instrument: string | null;
    } | null;
  };
  topChartData: TopChartPoint[];
  monthlyTrend: MonthlyTrendPoint[];
  availableMonths: string[];
  customers: CustomerPaymentItem[];
}

export function CustomerPaymentsTab() {
  const [data, setData] = useState<CustomerPaymentsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [sortBy, setSortBy] = useState<"amount_desc" | "due_desc" | "purchase_desc" | "date_desc" | "date_asc" | "name_asc">("amount_desc");
  const [chartView, setChartView] = useState<"customers" | "trend" | "distribution">("customers");

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedMonth && selectedMonth !== "all") {
        params.set("month", selectedMonth);
      }
      if (search.trim()) params.set("search", search.trim());
      if (selectedCustomerId) params.set("customerId", selectedCustomerId);

      const res = await fetch(`/api/dashboard/customer-payments?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load customer payments dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedMonth, search, selectedCustomerId]);

  const formatMonthLabel = (mStr: string) => {
    try {
      const [year, month] = mStr.split("-");
      const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    } catch {
      return mStr;
    }
  };

  const getLastPaymentBadge = (days: number | null) => {
    if (days === null || days === undefined) {
      return {
        label: "No Record",
        className: "bg-surface-2 text-ink-3 border-border",
      };
    }
    if (days === 0) {
      return {
        label: "Today",
        className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-semibold",
      };
    }
    if (days === 1) {
      return {
        label: "Yesterday",
        className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-semibold",
      };
    }
    if (days <= 30) {
      return {
        label: `${days}d ago (Recent)`,
        className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
      };
    }
    if (days <= 60) {
      return {
        label: `${days}d ago (30-60d)`,
        className: "bg-amber-500/10 text-amber-600 border-amber-500/30",
      };
    }
    return {
      label: `${days}d ago (>60d)`,
      className: "bg-rose-500/10 text-rose-600 border-rose-500/30",
    };
  };

  // Sorted customer list
  const sortedCustomers = useMemo(() => {
    if (!data?.customers) return [];
    return [...data.customers].sort((a, b) => {
      if (sortBy === "amount_desc") {
        return b.currentPeriodAmount - a.currentPeriodAmount;
      }
      if (sortBy === "due_desc") {
        return b.totalAmountDue - a.totalAmountDue;
      }
      if (sortBy === "purchase_desc") {
        const timeA = a.lastPurchaseDate ? new Date(a.lastPurchaseDate).getTime() : 0;
        const timeB = b.lastPurchaseDate ? new Date(b.lastPurchaseDate).getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === "date_desc") {
        const timeA = a.lastPaymentDate ? new Date(a.lastPaymentDate).getTime() : 0;
        const timeB = b.lastPaymentDate ? new Date(b.lastPaymentDate).getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === "date_asc") {
        const timeA = a.lastPaymentDate ? new Date(a.lastPaymentDate).getTime() : Infinity;
        const timeB = b.lastPaymentDate ? new Date(b.lastPaymentDate).getTime() : Infinity;
        return timeA - timeB;
      }
      if (sortBy === "name_asc") {
        return a.customerName.localeCompare(b.customerName);
      }
      return 0;
    });
  }, [data?.customers, sortBy]);

  // Distribution chart data (Top 5 + Others)
  const distributionData = useMemo(() => {
    if (!data?.topChartData || data.topChartData.length === 0) return [];
    const top5 = data.topChartData.slice(0, 5);
    const top5Total = top5.reduce((sum, item) => sum + item.amount, 0);
    const othersAmount = Math.max(0, (data.summary.totalPeriodAmount || 0) - top5Total);

    const result = top5.map((item, idx) => ({
      name: item.name,
      value: item.amount,
      fill: CHART_COLORS[idx % CHART_COLORS.length],
    }));

    if (othersAmount > 0) {
      result.push({
        name: "Other Customers",
        value: othersAmount,
        fill: CHART_COLORS[5],
      });
    }

    return result;
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Title & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface p-4 border border-border rounded-sm">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-ink">Customer Collections & Payment Analysis</h3>
          </div>
          <p className="text-xs text-ink-3 mt-1">
            Visual breakdown of customer payments filtered by month, including exact dates when each customer last made a payment.
          </p>
        </div>

        {/* Month Filter Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-0.5 bg-surface-2 border border-border rounded-sm text-xs font-medium">
            <button
              onClick={() => setSelectedMonth("all")}
              className={`px-3 py-1 rounded-xs transition ${
                selectedMonth === "all"
                  ? "bg-surface text-ink font-semibold shadow-xs"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              All Time
            </button>
            {data?.availableMonths?.slice(0, 4).map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`px-3 py-1 rounded-xs transition ${
                  selectedMonth === m
                    ? "bg-emerald-600 text-white font-semibold shadow-xs"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                {formatMonthLabel(m)}
              </button>
            ))}
          </div>

          {/* Extended Month Dropdown */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-2.5 py-1 bg-surface border border-border rounded-sm text-xs text-ink font-mono"
          >
            <option value="all">All Months</option>
            {data?.availableMonths?.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-1.5 border border-border bg-surface text-ink-3 hover:text-ink rounded-sm transition"
            title="Refresh payments analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Collected */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">Total Paid by Customers</span>
            <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
              {formatINR(data?.summary.totalPeriodAmount || 0)}
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5">
              {selectedMonth === "all" ? "Total all-time receipts" : `In ${formatMonthLabel(selectedMonth)}`}
            </div>
          </div>
        </div>

        {/* Paying Customers */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">Paying Customers</span>
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-ink tracking-tight">
              {data?.summary.payingCustomersCount || 0}
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5">
              Customers who made payments in this period
            </div>
          </div>
        </div>

        {/* Average Payment */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">Average Per Customer</span>
            <TrendingUp className="w-3.5 h-3.5 text-accent" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-ink tracking-tight">
              {formatINR(data?.summary.averagePaymentAmount || 0)}
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5">
              Across {data?.summary.paymentsCount || 0} total receipts
            </div>
          </div>
        </div>

        {/* Most Recent Payment */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">Most Recent Payment</span>
            <Clock className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-ink truncate" title={data?.summary.mostRecentPayment?.customerName || ""}>
              {data?.summary.mostRecentPayment?.customerName || "—"}
            </div>
            <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
              {data?.summary.mostRecentPayment ? `${formatINR(data.summary.mostRecentPayment.amount)} on ${formatDate(data.summary.mostRecentPayment.date)}` : "No payments"}
            </div>
          </div>
        </div>
      </div>

      {/* Graphical Display Section */}
      <div className="bg-surface border border-border rounded-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              {chartView === "customers"
                ? `Customer Payments Breakdown (${selectedMonth === "all" ? "All Time" : formatMonthLabel(selectedMonth)})`
                : chartView === "trend"
                ? "Monthly Customer Collections Trajectory"
                : "Payment Share by Customer"}
            </h4>
            <p className="text-[11px] text-ink-3">
              {chartView === "customers"
                ? "Horizontal bars show total amount paid by each customer in the selected month/period"
                : chartView === "trend"
                ? "Month-by-month historical payments received from customers"
                : "Percentage contribution of top customers to total receipts"}
            </p>
          </div>

          {/* Chart View Switcher */}
          <div className="inline-flex p-0.5 bg-surface-2 border border-border rounded-sm text-xs font-medium self-start sm:self-auto">
            <button
              onClick={() => setChartView("customers")}
              className={`px-2.5 py-1 rounded-xs transition flex items-center gap-1 ${
                chartView === "customers"
                  ? "bg-surface text-ink font-semibold shadow-xs"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>By Customer</span>
            </button>
            <button
              onClick={() => setChartView("trend")}
              className={`px-2.5 py-1 rounded-xs transition flex items-center gap-1 ${
                chartView === "trend"
                  ? "bg-surface text-ink font-semibold shadow-xs"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Monthly Collections</span>
            </button>
            <button
              onClick={() => setChartView("distribution")}
              className={`px-2.5 py-1 rounded-xs transition flex items-center gap-1 ${
                chartView === "distribution"
                  ? "bg-surface text-ink font-semibold shadow-xs"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              <PieIcon className="w-3.5 h-3.5" />
              <span>Share %</span>
            </button>
          </div>
        </div>

        {/* Chart View 1: Top Customers Bar Chart */}
        {chartView === "customers" && (
          <div className="h-80 w-full pt-2">
            {data?.topChartData && data.topChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.topChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "var(--ink-2)" }}
                    tickFormatter={(v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}k`)}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11, fill: "var(--ink-2)" }}
                    width={110}
                    tickFormatter={(val) => (val.length > 15 ? val.slice(0, 14) + "…" : val)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-surface border border-border p-2.5 rounded-sm shadow-md text-xs space-y-1">
                            <p className="font-semibold text-ink border-b border-border/70 pb-1">
                              Customer: {label}
                            </p>
                            <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              Amount Paid: {formatINR(payload[0].value as any)}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="amount" fill="#009E73" radius={[0, 3, 3, 0]}>
                    {data.topChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-ink-3 text-xs">
                No payment data available for the chosen month filter.
              </div>
            )}
          </div>
        )}

        {/* Chart View 2: Monthly Collections Bar Chart (Trend line removed) */}
        {chartView === "trend" && (
          <div className="h-80 w-full pt-2">
            {data?.monthlyTrend && data.monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.monthlyTrend}
                  margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-2)" }} stroke="var(--border)" />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--ink-2)" }}
                    stroke="var(--border)"
                    tickFormatter={(v) => (v >= 100000 ? `₹${(v / 100000).toFixed(0)}L` : `₹${(v / 1000).toFixed(0)}k`)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-surface border border-border p-2.5 rounded-sm shadow-md text-xs space-y-1">
                            <p className="font-semibold text-ink border-b border-border/70 pb-1">
                              {label}
                            </p>
                            <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              Amount Collected: {formatINR(payload[0].value as any)}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="amount" name="Amount Collected" fill="#009E73" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-ink-3 text-xs">
                No monthly collection data available.
              </div>
            )}
          </div>
        )}

        {/* Chart View 3: Distribution Donut Chart */}
        {chartView === "distribution" && (
          <div className="h-80 w-full flex flex-col md:flex-row items-center justify-center pt-2">
            {distributionData.length > 0 ? (
              <>
                <div className="w-full md:w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distributionData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {distributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const item = payload[0];
                            return (
                              <div className="bg-surface border border-border p-2.5 rounded-sm shadow-md text-xs space-y-1">
                                <div className="flex items-center gap-1.5 border-b border-border/70 pb-1">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: item.payload?.fill || "#009E73" }}
                                  />
                                  <span className="font-semibold text-ink truncate max-w-[200px]">
                                    {item.name}
                                  </span>
                                </div>
                                <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  Paid: {formatINR(item.value as any)}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full md:w-1/2 p-4 space-y-2 text-xs">
                  <div className="font-semibold text-ink-2 mb-2">Top Contributors Share:</div>
                  {distributionData.map((item, idx) => {
                    const pct = data?.summary.totalPeriodAmount
                      ? ((item.value / data.summary.totalPeriodAmount) * 100).toFixed(1)
                      : "0.0";
                    return (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                          <span className="truncate text-ink font-medium">{item.name}</span>
                        </div>
                        <div className="font-mono text-ink-2 shrink-0 ml-2">
                          {formatINR(item.value, true)} ({pct}%)
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-ink-3 text-xs">
                No distribution data available.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Customer Payments Directory & Last Payment Dates */}
      <div className="bg-surface border border-border rounded-sm space-y-3 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              Customer Payment Timeline & Last Made Payment
            </h4>
            <p className="text-[11px] text-ink-3">
              Shows for each customer: amount paid in selected period, lifetime payments, and the exact date when the customer last made a payment.
            </p>
          </div>

          {/* Sort Controls & Search */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Search Customer */}
            <div className="relative min-w-[160px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer name..."
                className="w-full pl-8 pr-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink"
            >
              <option value="amount_desc">Highest Amount Paid</option>
              <option value="due_desc">Highest Amount Due</option>
              <option value="purchase_desc">Last Purchase Date (Recent first)</option>
              <option value="date_desc">Last Payment Date (Recent first)</option>
              <option value="date_asc">Last Payment Date (Oldest first / Inactive)</option>
              <option value="name_asc">Customer Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto border border-border rounded-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-ink-2 font-semibold select-none">
                <th className="py-2.5 px-3">Customer Name</th>
                <th className="py-2.5 px-3 text-right font-mono">
                  {selectedMonth === "all" ? "Total Paid (All Time)" : `Paid in ${formatMonthLabel(selectedMonth)}`}
                </th>
                <th className="py-2.5 px-3 text-center w-24">Receipts</th>
                <th className="py-2.5 px-3 font-mono">Last Purchase Date</th>
                <th className="py-2.5 px-3 font-mono">When Customer Last Paid</th>
                <th className="py-2.5 px-3">Last Payment Details</th>
                <th className="py-2.5 px-3 text-right font-mono">Total Amount Due</th>
                <th className="py-2.5 px-3 text-center w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && sortedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-ink-3">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-primary" />
                    <span>Loading customer payment details...</span>
                  </td>
                </tr>
              ) : sortedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-ink-3">
                    No customers found matching the search and period criteria.
                  </td>
                </tr>
              ) : (
                sortedCustomers.map((c) => {
                  const badge = getLastPaymentBadge(c.daysSinceLastPayment);
                  return (
                    <tr key={c.customerId} className="hover:bg-surface-2/60 transition group">
                      {/* Customer Name */}
                      <td className="py-2.5 px-3">
                        <Link
                          href={`/accounts/${c.accountId}`}
                          className="font-semibold text-ink group-hover:text-primary transition hover:underline"
                        >
                          {c.customerName}
                        </Link>
                      </td>

                      {/* Period Amount */}
                      <td className="py-2.5 px-3 text-right font-mono">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatINR(c.currentPeriodAmount)}
                        </span>
                      </td>

                      {/* Period Payment Count */}
                      <td className="py-2.5 px-3 text-center font-mono text-ink-2">
                        {c.currentPeriodPaymentsCount}
                      </td>

                      {/* Last Purchase Date */}
                      <td className="py-2.5 px-3 font-mono">
                        {c.lastPurchaseDate ? (
                          <div>
                            <div className="font-semibold text-ink">{formatDate(c.lastPurchaseDate)}</div>
                            <div className="mt-0.5 text-[10px] text-ink-3">
                              {c.daysSinceLastPurchase === 0 ? "Today" : `${c.daysSinceLastPurchase}d ago`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>

                      {/* When Customer Last Made a Payment */}
                      <td className="py-2.5 px-3 font-mono">
                        {c.lastPaymentDate ? (
                          <div>
                            <div className="font-semibold text-ink">{formatDate(c.lastPaymentDate)}</div>
                            <div className="mt-0.5">
                              <span className={`inline-block px-1.5 py-0.5 rounded-xs border text-[10px] ${badge.className}`}>
                                {badge.label}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>

                      {/* Last Payment Details */}
                      <td className="py-2.5 px-3 text-ink-2 max-w-xs truncate">
                        {c.lastPaymentAmount > 0 ? (
                          <div>
                            <div className="font-mono text-ink font-medium">{formatINR(c.lastPaymentAmount)}</div>
                            <div className="text-[10px] text-ink-3 truncate" title={c.lastPaymentInstrument || ""}>
                              {c.lastPaymentInstrument || "Direct Payment"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>

                      {/* Total Amount Due */}
                      <td className="py-2.5 px-3 text-right font-mono" title={formatINR(c.totalAmountDue)}>
                        <span className={c.totalAmountDue > 0 ? "font-bold text-amber-600 dark:text-amber-400" : "text-ink-3"}>
                          {formatINR(c.totalAmountDue, true)}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/accounts/${c.accountId}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-surface-2 border border-border text-ink-2 hover:text-ink hover:bg-surface text-[11px] font-medium transition"
                          title="Open Customer Ledger"
                        >
                          <span>Ledger</span>
                          <ExternalLink className="w-2.5 h-2.5 text-ink-3" />
                        </Link>
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
