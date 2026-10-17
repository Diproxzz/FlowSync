"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Package,
  Users,
  FileText,
  IndianRupee,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle,
  Filter,
  RefreshCw,
  Calendar,
  Building2,
  Boxes,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  BarChart,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatINR, formatKg } from "@/lib/format";
import { AnalyticsData, TrendPoint, TopItem, AbcProduct } from "@/lib/analytics";
import { PurchasesTab } from "@/components/dashboard/PurchasesTab";
import { ReceivablesTab } from "@/components/dashboard/ReceivablesTab";

// Accessible Okabe-Ito Palette
const COLORS = {
  primary: "#0F4C4A",
  accent: "#9A5B24",
  blue: "#0072B2",
  sky: "#56B4E9",
  green: "#009E73",
  vermilion: "#D55E00",
  purple: "#CC79A7",
  slate: "#718096",
};

export default function DashboardPage() {
  const [section, setSection] = useState<"sales" | "purchases" | "receivables">("sales");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>("fy");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"overview" | "abc" | "gst" | "velocity">("overview");

  // Filter dropdown lists
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  useEffect(() => {
    async function loadFilters() {
      try {
        const [cRes, sRes, pRes] = await Promise.all([
          fetch("/api/customers?limit=100"),
          fetch("/api/suppliers?limit=100"),
          fetch("/api/products?limit=100"),
        ]);
        const cData = await cRes.json();
        const sData = await sRes.json();
        const pData = await pRes.json();
        setCustomers(cData.customers || []);
        setSuppliers(sData.suppliers || []);
        setProducts(pData.products || []);
      } catch (err) {
        console.error("Failed to load filter options", err);
      }
    }
    loadFilters();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("period", period);
      if (period === "custom") {
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);
      }
      if (selectedCustomer) params.set("customerId", selectedCustomer);
      if (selectedProduct) params.set("productId", selectedProduct);

      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selectedCustomer, selectedProduct]);

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-ink tracking-tight">Executive Dashboard</h2>
            <div className="inline-flex p-0.5 bg-surface-2 border border-border rounded-sm text-xs font-medium">
              <button
                onClick={() => setSection("sales")}
                className={`px-3 py-1 rounded-xs transition ${
                  section === "sales"
                    ? "bg-primary text-primary-fg font-semibold shadow-xs"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                Sales
              </button>
              {process.env.NEXT_PUBLIC_FEATURE_PURCHASES !== "false" && (
                <button
                  onClick={() => setSection("purchases")}
                  className={`px-3 py-1 rounded-xs transition ${
                    section === "purchases"
                      ? "bg-accent text-accent-fg font-semibold shadow-xs"
                      : "text-ink-2 hover:text-ink"
                  }`}
                >
                  Purchases
                </button>
              )}
              {process.env.NEXT_PUBLIC_FEATURE_LEDGER !== "false" && (
                <button
                  onClick={() => setSection("receivables")}
                  className={`px-3 py-1 rounded-xs transition ${
                    section === "receivables"
                      ? "bg-blue-600 text-white font-semibold shadow-xs"
                      : "text-ink-2 hover:text-ink"
                  }`}
                >
                  Receivables
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-ink-3 mt-1">
            {section === "receivables"
              ? "Party ledger statements, receivables ageing, top debtors, and cash collections"
              : section === "purchases"
              ? "Procurement analytics, vendor spend, multi-sourcing price comparisons, and input GST credits"
              : "Real-time business intelligence, GST turnover, inventory velocity, and customer metrics"}
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-0.5 bg-surface-2 border border-border rounded-sm text-xs">
            {[
              { id: "this_month", label: "This Month" },
              { id: "last_30", label: "Last 30 Days" },
              { id: "fy", label: "FY 2026-27" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPeriod(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-xs transition ${
                  period === tab.id
                    ? "bg-surface text-ink shadow-xs border border-border/40 font-semibold"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={loadAnalytics}
            className="p-1.5 border border-border bg-surface text-ink-3 hover:text-ink rounded-sm transition"
            title="Refresh analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-surface p-3 border border-border rounded-sm flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-ink-3 font-medium">
          <Filter className="w-3.5 h-3.5" />
          <span>Filters:</span>
        </div>

        {section === "sales" ? (
          /* Customer Select */
          <div className="flex-1 min-w-[180px] max-w-xs">
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="w-full px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink"
            >
              <option value="">All Customers / Buyers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          /* Supplier Select */
          <div className="flex-1 min-w-[180px] max-w-xs">
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink"
            >
              <option value="">All Suppliers / Vendors</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Product Select */}
        <div className="flex-1 min-w-[180px] max-w-xs">
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="w-full px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink"
          >
            <option value="">All Products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} - {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Date Pickers */}
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2 py-1 bg-bg border border-border rounded-sm text-xs text-ink font-mono"
            />
            <span className="text-ink-3">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2 py-1 bg-bg border border-border rounded-sm text-xs text-ink font-mono"
            />
            <button
              onClick={loadAnalytics}
              className="px-2.5 py-1 bg-primary text-primary-fg text-xs rounded-sm font-medium hover:opacity-90"
            >
              Apply
            </button>
          </div>
        )}

        {(selectedCustomer || selectedSupplier || selectedProduct) && (
          <button
            onClick={() => {
              setSelectedCustomer("");
              setSelectedSupplier("");
              setSelectedProduct("");
            }}
            className="text-xs text-primary hover:underline ml-auto"
          >
            Clear Filters
          </button>
        )}
      </div>

      {section === "receivables" ? (
        <ReceivablesTab />
      ) : section === "purchases" ? (
        <PurchasesTab
          period={period}
          fromDate={fromDate}
          toDate={toDate}
          selectedSupplier={selectedSupplier}
          selectedProduct={selectedProduct}
        />
      ) : (
        <>
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Taxable Revenue */}
            <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span className="font-medium">Taxable Revenue</span>
                <IndianRupee className="w-3.5 h-3.5 text-primary" />
              </div>
          <div>
            <div className="text-xl font-bold font-mono text-ink tracking-tight">
              {formatINR(kpis?.revenueTaxable || 0)}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              {kpis?.revenueDeltaPct !== null && kpis?.revenueDeltaPct !== undefined ? (
                <span
                  className={`inline-flex items-center gap-0.5 font-medium ${
                    kpis.revenueDeltaPct >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {kpis.revenueDeltaPct >= 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {Math.abs(kpis.revenueDeltaPct)}%
                </span>
              ) : null}
              <span className="text-ink-3 text-[11px]">vs prior period</span>
            </div>
          </div>
        </div>

        {/* Volume Sold (kg) */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">Volume Dispatched</span>
            <Package className="w-3.5 h-3.5 text-accent" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-ink tracking-tight">
              {formatKg(kpis?.volumeKg || 0)}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              {kpis?.volumeDeltaPct !== null && kpis?.volumeDeltaPct !== undefined ? (
                <span
                  className={`inline-flex items-center gap-0.5 font-medium ${
                    kpis.volumeDeltaPct >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {kpis.volumeDeltaPct >= 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {Math.abs(kpis.volumeDeltaPct)}%
                </span>
              ) : null}
              <span className="text-ink-3 text-[11px]">vs prior period</span>
            </div>
          </div>
        </div>

        {/* Average Realization (₹/kg) */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">Avg Realization</span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-ink tracking-tight">
              ₹{kpis?.avgRealizationPerKg ? kpis.avgRealizationPerKg.toFixed(2) : "0.00"}/kg
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              {kpis?.realizationDeltaPct !== null && kpis?.realizationDeltaPct !== undefined ? (
                <span
                  className={`inline-flex items-center gap-0.5 font-medium ${
                    kpis.realizationDeltaPct >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {kpis.realizationDeltaPct >= 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {Math.abs(kpis.realizationDeltaPct)}%
                </span>
              ) : null}
              <span className="text-ink-3 text-[11px]">taxable rate / kg</span>
            </div>
          </div>
        </div>

        {/* Invoices & Customers */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="font-medium">Activity & Reach</span>
            <Users className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-ink-3">Invoices:</span>
              <div className="text-lg font-bold font-mono text-ink">{kpis?.invoicesCount || 0}</div>
            </div>
            <div>
              <span className="text-[11px] text-ink-3">Active Buyers:</span>
              <div className="text-lg font-bold font-mono text-ink">{kpis?.activeCustomersCount || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-border flex items-center gap-6 text-xs font-medium">
        {[
          { id: "overview", label: "Revenue & Top Entities" },
          { id: "abc", label: "ABC Pareto Classification" },
          { id: "gst", label: "GST & Compliance (GSTR-1)" },
          { id: "velocity", label: "Stock Velocity & Dead Stock" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`pb-3 -mb-px transition border-b-2 ${
              activeTab === t.id
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-ink-3 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview (Trends & Top Lists) */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Trend Chart */}
          <div className="bg-surface border border-border rounded-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-2">
                  Monthly Sales & Volume Trend
                </h3>
                <p className="text-[11px] text-ink-3">
                  Bars indicate volume (kg), line indicates taxable revenue (₹)
                </p>
              </div>
            </div>

            <div className="h-72 w-full pt-2">
              {data?.trend && data.trend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.trend} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k kg`}
                    />
                    <Tooltip
                      formatter={(value: any, name: string) => {
                        if (name === "Revenue (₹)") return [formatINR(value), name];
                        if (name === "Volume (kg)") return [formatKg(value), name];
                        return [value, name];
                      }}
                      contentStyle={{ backgroundColor: "#ffffff", borderRadius: "4px", fontSize: "11px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                    <Bar
                      yAxisId="right"
                      dataKey="volumeKg"
                      name="Volume (kg)"
                      fill={COLORS.sky}
                      radius={[2, 2, 0, 0]}
                      maxBarSize={40}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue (₹)"
                      stroke={COLORS.primary}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: COLORS.primary }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-ink-3">
                  No sales data found for this period.
                </div>
              )}
            </div>
          </div>

          {/* Top Products & Top Customers Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Products Table */}
            <div className="bg-surface border border-border rounded-sm overflow-hidden">
              <div className="p-3 bg-surface-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-primary" /> Top Products by Revenue
                </span>
                <Link href="/products" className="text-[11px] text-primary hover:underline">
                  All products →
                </Link>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2/60 text-ink-3 border-b border-border font-medium">
                    <th className="py-2 px-3">Code / Product</th>
                    <th className="py-2 px-3 text-right">Volume</th>
                    <th className="py-2 px-3 text-right">Avg Rate</th>
                    <th className="py-2 px-3 text-right">Margin / kg</th>
                    <th className="py-2 px-3 text-right font-semibold text-ink">Taxable Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.topProducts && data.topProducts.length > 0 ? (
                    data.topProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-2/40 transition">
                        <td className="py-2 px-3">
                          <span className="font-mono font-semibold text-primary">{p.code}</span>
                          <span className="text-ink-2 truncate max-w-[140px] block text-[11px]">
                            {p.name}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right num text-ink-2">{formatKg(p.volumeKg)}</td>
                        <td className="py-2 px-3 text-right num text-ink-3">₹{p.avgRate.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right num">
                          {p.marginPerKg !== null && p.marginPerKg !== undefined ? (
                            <div className="flex items-center justify-end gap-1">
                              <span
                                className={
                                  p.marginPerKg >= 0
                                    ? "text-emerald-700 font-medium"
                                    : "text-rose-700 font-medium"
                                }
                              >
                                ₹{p.marginPerKg.toFixed(2)}
                              </span>
                              <span
                                className={`text-[9px] px-1 py-0.2 rounded-xs uppercase tracking-tight font-semibold ${
                                  p.marginBasis === "ACTUAL"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-surface-2 text-ink-3 border border-border"
                                }`}
                                title={
                                  p.marginBasis === "ACTUAL"
                                    ? `Actual purchase avg cost: ₹${p.purchaseCostPerKg?.toFixed(2)}/kg`
                                    : `Estimated from standard rate: ₹${p.purchaseCostPerKg?.toFixed(2)}/kg`
                                }
                              >
                                {p.marginBasis === "ACTUAL" ? "Act" : "Est"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-ink-4">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right num font-semibold text-ink">
                          {formatINR(p.revenue)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-ink-3 text-xs">
                        No product sales recorded in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Top Customers Table */}
            <div className="bg-surface border border-border rounded-sm overflow-hidden">
              <div className="p-3 bg-surface-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-accent" /> Top Buyers by Turnover
                </span>
                <Link href="/customers" className="text-[11px] text-primary hover:underline">
                  All buyers →
                </Link>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2/60 text-ink-3 border-b border-border font-medium">
                    <th className="py-2 px-3">Buyer Name</th>
                    <th className="py-2 px-3 text-right">Invoices</th>
                    <th className="py-2 px-3 text-right">Volume</th>
                    <th className="py-2 px-3 text-right font-semibold text-ink">Turnover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.topCustomers && data.topCustomers.length > 0 ? (
                    data.topCustomers.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-2/40 transition">
                        <td className="py-2 px-3 font-medium text-ink truncate max-w-[180px]">
                          {c.name}
                        </td>
                        <td className="py-2 px-3 text-right num text-ink-3">{c.invoiceCount}</td>
                        <td className="py-2 px-3 text-right num text-ink-2">{formatKg(c.volumeKg)}</td>
                        <td className="py-2 px-3 text-right num font-semibold text-ink">
                          {formatINR(c.revenue)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-ink-3 text-xs">
                        No customer transactions recorded in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: ABC Pareto Classification */}
      {activeTab === "abc" && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-sm p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              ABC Product Classification (Pareto 80/15/5 Rule)
            </h3>
            <p className="text-xs text-ink-3 mt-1">
              Class A: Core 80% revenue drivers (focus high inventory control) · Class B: Next 15% · Class C: Long-tail 5%
            </p>
          </div>

          <div className="bg-surface border border-border rounded-sm overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                  <th className="py-2.5 px-3">Class</th>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3 text-right">Volume</th>
                  <th className="py-2.5 px-3 text-right">Revenue</th>
                  <th className="py-2.5 px-3 text-right">Cumulative %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.abcProducts && data.abcProducts.length > 0 ? (
                  data.abcProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-2/40 transition">
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.classification === "A"
                              ? "bg-emerald-100 text-emerald-800"
                              : p.classification === "B"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          Class {p.classification}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-primary">{p.code}</td>
                      <td className="py-2.5 px-3 font-medium text-ink">{p.name}</td>
                      <td className="py-2.5 px-3 text-right num text-ink-2">{formatKg(p.volumeKg)}</td>
                      <td className="py-2.5 px-3 text-right num font-semibold text-ink">
                        {formatINR(p.revenue)}
                      </td>
                      <td className="py-2.5 px-3 text-right num text-ink-3">{p.cumulativePct}%</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-ink-3">
                      No sales data to perform ABC analysis.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: GST & Compliance */}
      {activeTab === "gst" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-border rounded-sm p-4 space-y-1">
              <span className="text-xs text-ink-3 font-medium">Taxable Turnover</span>
              <div className="text-xl font-bold font-mono text-ink">
                {formatINR(data?.gstSummary?.taxableTotal || 0)}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-sm p-4 space-y-1">
              <span className="text-xs text-ink-3 font-medium">CGST Total (9%)</span>
              <div className="text-xl font-bold font-mono text-ink">
                {formatINR(data?.gstSummary?.cgstTotal || 0)}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-sm p-4 space-y-1">
              <span className="text-xs text-ink-3 font-medium">SGST Total (9%)</span>
              <div className="text-xl font-bold font-mono text-ink">
                {formatINR(data?.gstSummary?.sgstTotal || 0)}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-sm p-4 space-y-1">
              <span className="text-xs text-ink-3 font-medium">Grand Total Value</span>
              <div className="text-xl font-bold font-mono text-primary">
                {formatINR(data?.gstSummary?.grandTotal || 0)}
              </div>
            </div>
          </div>

          {/* Intrastate vs Interstate Breakdown */}
          <div className="bg-surface border border-border rounded-sm p-4 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              Territorial Breakdown (GSTR-1 Preparation)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-surface-2 rounded-sm border border-border space-y-1.5">
                <div className="flex items-center justify-between font-semibold text-ink">
                  <span>Intrastate Sales (West Bengal - 19)</span>
                  <span className="font-mono text-primary">
                    {formatINR(data?.gstSummary?.intrastateTaxable || 0)}
                  </span>
                </div>
                <p className="text-[11px] text-ink-3">
                  Attracts CGST (9%) + SGST (9%). Represents local tanneries & leather manufacturers in Kolkata cluster.
                </p>
              </div>

              <div className="p-3 bg-surface-2 rounded-sm border border-border space-y-1.5">
                <div className="flex items-center justify-between font-semibold text-ink">
                  <span>Interstate Sales (Outside West Bengal)</span>
                  <span className="font-mono text-accent">
                    {formatINR(data?.gstSummary?.interstateTaxable || 0)}
                  </span>
                </div>
                <p className="text-[11px] text-ink-3">
                  Attracts IGST (18%). Represents buyers in Kanpur, Chennai, or other leather hubs.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Stock Velocity & Dead Stock */}
      {activeTab === "velocity" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Fast Moving */}
            <div className="bg-surface border border-border rounded-sm overflow-hidden">
              <div className="p-3 bg-surface-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Fast Moving Products (High Velocity)
                </span>
                <span className="text-[11px] text-ink-3">Ranked by volume sold</span>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2/60 text-ink-3 border-b border-border font-medium">
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-3 text-right">Dispatched</th>
                    <th className="py-2 px-3 text-right">Closing Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.velocity?.fastMoving && data.velocity.fastMoving.length > 0 ? (
                    data.velocity.fastMoving.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-2/40 transition">
                        <td className="py-2 px-3">
                          <span className="font-mono font-semibold text-primary">{p.code}</span>
                          <span className="text-ink-2 truncate max-w-[160px] block text-[11px]">
                            {p.name}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right num font-semibold text-emerald-600">
                          {formatKg(p.volumeKg)}
                        </td>
                        <td className="py-2 px-3 text-right num text-ink">{formatKg(p.closingStock)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-ink-3 text-xs">
                        No product velocity data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Slow or Dead Stock */}
            <div className="bg-surface border border-border rounded-sm overflow-hidden">
              <div className="p-3 bg-surface-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Slow / Idle Stock (0 Sales in Period)
                </span>
                <span className="text-[11px] text-ink-3">Has stock but no movement</span>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2/60 text-ink-3 border-b border-border font-medium">
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-3 text-right">Idle Quantity</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.velocity?.slowOrDead && data.velocity.slowOrDead.length > 0 ? (
                    data.velocity.slowOrDead.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-2/40 transition">
                        <td className="py-2 px-3">
                          <span className="font-mono font-semibold text-ink-2">{p.code}</span>
                          <span className="text-ink-3 truncate max-w-[160px] block text-[11px]">
                            {p.name}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right num font-medium text-amber-700">
                          {formatKg(p.closingStock)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xs text-[10px] font-medium">
                            IDLE
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-ink-3 text-xs">
                        All stocked products have active sales.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
