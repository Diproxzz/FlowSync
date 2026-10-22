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
  AlertTriangle,
  CheckCircle2,
  Percent,
  Search,
  Download,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  Boxes,
  ArrowUpDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";
import { formatINR, formatKg } from "@/lib/format";
import {
  ProfitabilityAnalyticsData,
  ProductMarginRow,
  CustomerProfitabilityRow,
} from "@/lib/analytics/profitability";

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

const PIE_COLORS = ["#009E73", "#0072B2", "#9A5B24", "#CC79A7", "#56B4E9", "#D55E00", "#718096"];

interface ProfitabilityTabProps {
  period: string;
  fromDate?: string;
  toDate?: string;
  selectedCustomer?: string;
  selectedProduct?: string;
}

export function ProfitabilityTab({
  period,
  fromDate,
  toDate,
  selectedCustomer,
  selectedProduct,
}: ProfitabilityTabProps) {
  const [data, setData] = useState<ProfitabilityAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [quadrantFilter, setQuadrantFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<"totalProfit" | "marginPct" | "soldQtyKg" | "totalRevenue">("totalProfit");
  const [sortAsc, setSortAsc] = useState(false);
  const [subView, setSubView] = useState<"products" | "customers">("products");

  useEffect(() => {
    async function loadData() {
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

        const res = await fetch(`/api/analytics/profitability?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load profitability analytics");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Error loading profitability data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [period, fromDate, toDate, selectedCustomer, selectedProduct]);

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-ink-3 bg-surface border border-border rounded-sm animate-pulse">
        Calculating weighted averages, landed costs, and margin intelligence...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-xs text-danger bg-danger-bg border border-danger/30 rounded-sm">
        Failed to load profitability metrics.
      </div>
    );
  }

  const { kpis, productMargins, customerProfitability, monthlyTrend, quadrantSummary } = data;

  // Filtered and sorted product rows
  const filteredProducts = productMargins
    .filter((p) => {
      const matchesSearch =
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase());
      const matchesQuadrant = quadrantFilter === "ALL" || p.quadrant === quadrantFilter;
      return matchesSearch && matchesQuadrant;
    })
    .sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      return sortAsc ? valA - valB : valB - valA;
    });

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const exportProductCsv = () => {
    const headers = [
      "Product Code",
      "Product Name",
      "Category",
      "Sold Qty (kg)",
      "Total Revenue (INR)",
      "WASP (INR/kg)",
      "Effective Cost (INR/kg)",
      "Cost Basis",
      "Landing Cost (INR)",
      "WAPC (INR/kg)",
      "Unit Margin (INR/kg)",
      "Margin %",
      "Markup %",
      "Total Profit (INR)",
      "Closing Stock (kg)",
      "Stock Valuation (INR)",
      "Quadrant",
    ];

    const rows = filteredProducts.map((p) => [
      `"${p.code.replace(/"/g, '""')}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${(p.category || "").replace(/"/g, '""')}"`,
      p.soldQtyKg,
      p.totalRevenue,
      p.wasp,
      p.effectiveCost,
      p.costBasis,
      p.landingCost ?? "",
      p.wapc,
      p.unitMargin,
      p.marginPct,
      p.markupPct,
      p.totalProfit,
      p.closingStockKg,
      p.stockValue,
      p.quadrant,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `flowsync_profitability_${period}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Top 10 profit contributors
  const top10ProfitProducts = [...productMargins]
    .filter((p) => p.totalProfit > 0)
    .slice(0, 10);

  // Top 6 customer profit pie data
  const topCustomerPieData = customerProfitability
    .filter((c) => c.grossProfit > 0)
    .slice(0, 6)
    .map((c) => ({
      name: c.name.length > 18 ? c.name.slice(0, 18) + "..." : c.name,
      value: c.grossProfit,
    }));

  return (
    <div className="space-y-6">
      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3">
            <span className="text-[11px] font-medium uppercase tracking-wider">Gross Revenue</span>
            <FileText className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <p className="text-lg font-bold text-ink num mt-1">{formatINR(kpis.totalRevenue)}</p>
          <span className="text-[10px] text-ink-3 block mt-0.5">{formatKg(kpis.totalVolumeKg)} sold</span>
        </div>

        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3">
            <span className="text-[11px] font-medium uppercase tracking-wider">Cost of Goods (COGS)</span>
            <Layers className="w-3.5 h-3.5 text-ink-3" />
          </div>
          <p className="text-lg font-bold text-ink num mt-1">{formatINR(kpis.totalCogs)}</p>
          <span className="text-[10px] text-ink-3 block mt-0.5">Weighted Landed / Cost</span>
        </div>

        <div className="bg-surface border border-success/30 bg-success-bg/10 p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-success">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Gross Profit</span>
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <p className="text-lg font-bold text-success num mt-1">{formatINR(kpis.grossProfit)}</p>
          <span className="text-[10px] text-success/80 block mt-0.5">Realized trading margin</span>
        </div>

        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3">
            <span className="text-[11px] font-medium uppercase tracking-wider">Blended Markup</span>
            <Percent className="w-3.5 h-3.5 text-primary" />
          </div>
          <p
            className={`text-lg font-bold num mt-1 ${
              (kpis.blendedMarkupPct ?? (kpis.totalCogs > 0 ? (kpis.grossProfit / kpis.totalCogs) * 100 : 0)) >= 10
                ? "text-success"
                : "text-amber-700"
            }`}
          >
            {(kpis.blendedMarkupPct ?? (kpis.totalCogs > 0 ? (kpis.grossProfit / kpis.totalCogs) * 100 : 0)).toFixed(1)}%
          </p>
          <span className="text-[10px] text-ink-3 block mt-0.5">Overall portfolio markup</span>
        </div>

        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3">
            <span className="text-[11px] font-medium uppercase tracking-wider">Profit per kg</span>
            <IndianRupee className="w-3.5 h-3.5 text-amber-700" />
          </div>
          <p className="text-lg font-bold text-ink num mt-1">₹{kpis.avgProfitPerKg.toFixed(2)}</p>
          <span className="text-[10px] text-ink-3 block mt-0.5">Unit contribution</span>
        </div>

        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3">
            <span className="text-[11px] font-medium uppercase tracking-wider">Stock Valuation</span>
            <Boxes className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <p className="text-lg font-bold text-ink num mt-1">{formatINR(kpis.totalInventoryValuation)}</p>
          <span className="text-[10px] text-ink-3 block mt-0.5">Landed capital in stock</span>
        </div>
      </div>

      {/* Top Drivers Highlights */}
      {(kpis.topProfitProduct || kpis.topProfitCustomer) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kpis.topProfitProduct && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  #1 Product Profit Driver
                </span>
                <p className="text-sm font-bold text-ink mt-0.5">
                  {kpis.topProfitProduct.name}{" "}
                  <span className="font-mono text-primary font-semibold">({kpis.topProfitProduct.code})</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-success num block">{formatINR(kpis.topProfitProduct.profit)}</span>
                <span className="text-[10px] text-ink-3">Total Gross Profit</span>
              </div>
            </div>
          )}

          {kpis.topProfitCustomer && (
            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  #1 Most Profitable Customer
                </span>
                <p className="text-sm font-bold text-ink mt-0.5">{kpis.topProfitCustomer.name}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-blue-600 num block">{formatINR(kpis.topProfitCustomer.profit)}</span>
                <span className="text-[10px] text-ink-3">Total Gross Profit</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Visual Analytics: Two-Chart View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Revenue vs Profit (in Rupees) */}
        <div className="bg-surface border border-border p-4 rounded-sm shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0072B2]" />
                <h3 className="text-sm font-bold text-ink">1. Monthly Revenue & Profit (₹ in Lakhs)</h3>
              </div>
              <p className="text-xs text-ink-3 mt-0.5">
                Blue = Total Sales Invoiced &nbsp;|&nbsp; Green = Actual Rupee Profit Kept
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-success num">{formatINR(kpis.grossProfit)}</span>
              <span className="text-[10px] text-ink-3 block">Total Period Profit</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                <XAxis dataKey="period" stroke="var(--ink-3)" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="var(--ink-3)"
                  fontSize={11}
                  tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-ink text-surface p-2.5 rounded-xs text-xs shadow-md space-y-1">
                          <p className="font-bold border-b border-surface/20 pb-1">{d.period}</p>
                          <div className="flex justify-between gap-4 text-blue-300">
                            <span>Sales Invoiced:</span>
                            <span className="font-mono font-semibold">{formatINR(d.revenue)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-emerald-300 font-semibold">
                            <span>Gross Profit:</span>
                            <span className="font-mono">{formatINR(d.profit)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-surface-2 text-[10px]">
                            <span>Product Cost (COGS):</span>
                            <span className="font-mono">{formatINR(d.cogs)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                <Bar dataKey="revenue" name="Sales Revenue" fill={COLORS.blue} radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Bar dataKey="profit" name="Gross Profit" fill={COLORS.green} radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Markup Percentage Trend (%) */}
        <div className="bg-surface border border-border p-4 rounded-sm shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#9A5B24]" />
                <h3 className="text-sm font-bold text-ink">2. Profit Markup Trend (%)</h3>
              </div>
              <p className="text-xs text-ink-3 mt-0.5">
                Average markup on cost applied each month (labeled directly on each point)
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-primary num">
                {(kpis.blendedMarkupPct ?? (kpis.totalCogs > 0 ? (kpis.grossProfit / kpis.totalCogs) * 100 : 0)).toFixed(1)}%
              </span>
              <span className="text-[10px] text-ink-3 block">Overall Markup</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrend} margin={{ top: 25, right: 25, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="marginGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                <XAxis dataKey="period" stroke="var(--ink-3)" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="var(--ink-3)"
                  fontSize={11}
                  domain={[0, (dataMax: number) => Math.max(40, Math.ceil((dataMax + 5) / 10) * 10)]}
                  tickFormatter={(v) => `${v}%`}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      const markupVal = d.markupPct ?? (d.cogs > 0 ? (d.profit / d.cogs) * 100 : 0);
                      return (
                        <div className="bg-ink text-surface p-2.5 rounded-xs text-xs shadow-md space-y-1">
                          <p className="font-bold border-b border-surface/20 pb-1">{d.period}</p>
                          <div className="flex justify-between gap-4 text-amber-300">
                            <span>Markup %:</span>
                            <span className="font-mono font-bold text-sm">{markupVal.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between gap-4 text-emerald-300 text-[10px]">
                            <span>Gross Profit:</span>
                            <span>{formatINR(d.profit)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-blue-300 text-[10px]">
                            <span>Revenue:</span>
                            <span>{formatINR(d.revenue)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-slate-300 text-[10px]">
                            <span>COGS:</span>
                            <span>{formatINR(d.cogs)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="markupPct"
                  name="Markup %"
                  stroke={COLORS.accent}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#marginGradient)"
                  dot={{ r: 4, fill: COLORS.accent, strokeWidth: 2, stroke: "#fff" }}
                >
                  <LabelList
                    dataKey="markupPct"
                    position="top"
                    offset={10}
                    formatter={(v: number) => `${Number(v || 0).toFixed(1)}%`}
                    style={{ fontSize: "11px", fontWeight: "600", fill: "var(--ink)" }}
                  />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Customer Profit Share Donut & Insights Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer Profit Share */}
        <div className="bg-surface border border-border p-4 rounded-sm shadow-xs flex flex-col">
          <h3 className="text-sm font-bold text-ink">Profit Share by Top Customers</h3>
          <p className="text-xs text-ink-3 mb-2">Contribution to company gross profit</p>
          <div className="h-48 relative flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topCustomerPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={68}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {topCustomerPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0];
                      return (
                        <div className="bg-ink text-surface p-2 rounded-xs text-xs shadow-md">
                          <p className="font-semibold">{d.name}</p>
                          <p className="font-mono text-emerald-300 font-bold">{formatINR(Number(d.value))}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 text-xs border-t border-border pt-2 mt-2">
            {topCustomerPieData.slice(0, 4).map((c, idx) => (
              <div key={idx} className="flex items-center justify-between text-ink-2">
                <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx] }} />
                  <span className="truncate">{c.name}</span>
                </div>
                <span className="font-mono font-medium">{formatINR(c.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Products by Profit */}
        <div className="lg:col-span-2 bg-surface border border-border p-4 rounded-sm shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-ink">Top 5 Products Driving Gross Profit</h3>
              <span className="text-[10px] text-ink-3 uppercase tracking-wider font-mono">Ranked by ₹ Profit</span>
            </div>
            <p className="text-xs text-ink-3 mb-4">
              These 5 chemicals contribute the largest share of net rupee profits after all product costs.
            </p>

            <div className="space-y-3">
              {top10ProfitProducts.slice(0, 5).map((p, idx) => {
                const profitPctOfTotal = kpis.grossProfit > 0 ? (p.totalProfit / kpis.grossProfit) * 100 : 0;
                return (
                  <div key={p.productId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-ink-3 w-4">#{idx + 1}</span>
                        <span className="font-mono font-semibold text-primary">{p.code}</span>
                        <span className="text-ink truncate max-w-[180px]">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-ink-3 text-[11px]">{formatKg(p.soldQtyKg)} sold</span>
                        <span className="font-semibold px-1.5 py-0.2 rounded text-[11px] bg-success-bg text-success font-mono">
                          {p.marginPct.toFixed(1)}% margin
                        </span>
                        <span className="font-bold text-ink num w-24 text-right">{formatINR(p.totalProfit)}</span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(5, profitPctOfTotal))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-border mt-3 flex items-center justify-between text-xs text-ink-3">
            <span>💡 High-margin products with low volume are expansion opportunities.</span>
            <span className="text-[11px] font-medium text-primary">Scroll down for full catalog breakdown ↓</span>
          </div>
        </div>
      </div>

      {/* Product Quadrant Summary Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-3 border border-border rounded-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-ink-2 mr-1">Classification:</span>
          {[
            { id: "ALL", label: `All Products (${productMargins.length})` },
            { id: "STAR", label: `🌟 Stars (${quadrantSummary.starsCount})` },
            { id: "VOLUME_DRIVER", label: `📦 Volume Drivers (${quadrantSummary.volumeDriversCount})` },
            { id: "NICHE_PROFITABLE", label: `💎 Niche High-Margin (${quadrantSummary.nicheProfitableCount})` },
            { id: "LOW_MARGIN", label: `⚠️ Low Margin (${quadrantSummary.lowMarginCount})` },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setQuadrantFilter(pill.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-sm border transition ${
                quadrantFilter === pill.id
                  ? "bg-primary text-primary-fg border-primary font-semibold"
                  : "bg-surface-2 text-ink-2 border-border hover:bg-border"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Sub-view toggle (Products vs Customers) */}
        <div className="flex items-center gap-2">
          <div className="inline-flex p-0.5 bg-surface-2 border border-border rounded-sm text-xs font-medium">
            <button
              onClick={() => setSubView("products")}
              className={`px-3 py-1 rounded-xs transition ${
                subView === "products" ? "bg-surface text-ink font-semibold shadow-xs" : "text-ink-3 hover:text-ink"
              }`}
            >
              Products Breakdown
            </button>
            <button
              onClick={() => setSubView("customers")}
              className={`px-3 py-1 rounded-xs transition ${
                subView === "customers" ? "bg-surface text-ink font-semibold shadow-xs" : "text-ink-3 hover:text-ink"
              }`}
            >
              Customer Margins
            </button>
          </div>

          <button
            onClick={exportProductCsv}
            className="px-3 py-1 rounded-sm text-xs font-medium border border-border bg-surface-2 text-ink-2 hover:bg-border transition flex items-center gap-1.5"
            title="Download detailed CSV report of margins and weighted averages"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Breakdown Section */}
      {subView === "products" ? (
        <div className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs">
          <div className="p-3 border-b border-border flex items-center justify-between gap-4">
            <div className="relative max-w-sm flex-1">
              <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chemical code or name..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="text-xs text-ink-3">
              Showing <span className="font-semibold text-ink">{filteredProducts.length}</span> products
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border select-none">
                  <th className="py-2.5 px-3">Product</th>
                  <th
                    onClick={() => handleSort("soldQtyKg")}
                    className="py-2.5 px-3 text-right cursor-pointer hover:text-primary transition"
                  >
                    <span className="inline-flex items-center gap-1">
                      Sold Qty (kg)
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3 text-right">WASP (₹/kg)</th>
                  <th className="py-2.5 px-3 text-right">Landed / Cost</th>
                  <th className="py-2.5 px-3 text-right">Unit Margin</th>
                  <th
                    onClick={() => handleSort("marginPct")}
                    className="py-2.5 px-3 text-right cursor-pointer hover:text-primary transition font-semibold"
                  >
                    <span className="inline-flex items-center gap-1">
                      Margin %
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3 text-right">Markup %</th>
                  <th
                    onClick={() => handleSort("totalRevenue")}
                    className="py-2.5 px-3 text-right cursor-pointer hover:text-primary transition"
                  >
                    <span className="inline-flex items-center gap-1">
                      Revenue (₹)
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("totalProfit")}
                    className="py-2.5 px-3 text-right cursor-pointer hover:text-primary transition font-bold text-success"
                  >
                    <span className="inline-flex items-center gap-1">
                      Gross Profit (₹)
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3 text-right">Closing Stock</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-ink-3">
                      No products match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const isHealthy = p.marginPct >= 12;
                    const isLow = p.marginPct < 6;

                    return (
                      <tr key={p.productId} className="hover:bg-surface-2/60 transition group">
                        <td className="py-2.5 px-3">
                          <Link href={`/products/${p.productId}`} className="hover:underline font-mono font-semibold text-primary">
                            {p.code}
                          </Link>
                          <span className="text-ink-3 truncate max-w-[150px] block text-[11px]">{p.name}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right num text-ink-2">{formatKg(p.soldQtyKg)}</td>
                        <td className="py-2.5 px-3 text-right num font-medium text-ink">
                          {p.wasp > 0 ? `₹${p.wasp.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right num text-ink-2">
                          <div>
                            <span className="font-medium">₹{p.effectiveCost.toFixed(2)}</span>
                            <span className="block text-[9px] font-mono text-ink-3">
                              {p.costBasis === "LANDING_COST"
                                ? "Landed"
                                : p.costBasis === "WAPC"
                                ? "WAPC"
                                : p.costBasis === "STD_RATE"
                                ? "Std Pur"
                                : "Unset"}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right num font-medium ${
                            p.unitMargin > 0 ? "text-success" : p.unitMargin < 0 ? "text-danger" : "text-ink-3"
                          }`}
                        >
                          {p.unitMargin !== 0 ? `₹${p.unitMargin.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right num">
                          <span
                            className={`font-bold px-1.5 py-0.5 rounded-sm text-[11px] ${
                              isHealthy
                                ? "bg-success-bg text-success"
                                : isLow
                                ? "bg-danger-bg text-danger"
                                : "bg-surface-2 text-ink"
                            }`}
                          >
                            {p.marginPct > 0 ? `${p.marginPct.toFixed(1)}%` : "0.0%"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right num text-ink-3">
                          {p.markupPct > 0 ? `${p.markupPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right num text-ink-2">{formatINR(p.totalRevenue)}</td>
                        <td className="py-2.5 px-3 text-right num font-bold text-success bg-success-bg/10">
                          {formatINR(p.totalProfit)}
                        </td>
                        <td className="py-2.5 px-3 text-right num text-ink-3">{formatKg(p.closingStockKg)}</td>
                        <td className="py-2.5 px-3 text-center">
                          {p.quadrant === "STAR" ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                              🌟 Star
                            </span>
                          ) : p.quadrant === "VOLUME_DRIVER" ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 border border-blue-500/30">
                              📦 Volume
                            </span>
                          ) : p.quadrant === "NICHE_PROFITABLE" ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 border border-purple-500/30">
                              💎 Niche
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-2 text-ink-3 border border-border">
                              ⚠️ Low
                            </span>
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
      ) : (
        /* Customer Profitability Breakdown Table */
        <div className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h4 className="text-xs font-bold text-ink">Customer Margin Contribution</h4>
            <span className="text-xs text-ink-3">Ranked by total realized gross profit</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3 text-right">Invoices</th>
                  <th className="py-2.5 px-3 text-right">Volume (kg)</th>
                  <th className="py-2.5 px-3 text-right">Total Billed</th>
                  <th className="py-2.5 px-3 text-right">COGS (Landed)</th>
                  <th className="py-2.5 px-3 text-right font-bold text-success">Gross Profit</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Margin %</th>
                  <th className="py-2.5 px-3 text-right">% of Company Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customerProfitability.map((c) => (
                  <tr key={c.customerId} className="hover:bg-surface-2/60 transition">
                    <td className="py-2.5 px-3 font-semibold text-ink">
                      <Link href={`/customers`} className="hover:underline hover:text-primary">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 text-right num text-ink-3">{c.invoiceCount}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-2">{formatKg(c.volumeKg)}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-2">{formatINR(c.totalRevenue)}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-3">{formatINR(c.totalCogs)}</td>
                    <td className="py-2.5 px-3 text-right num font-bold text-success bg-success-bg/10">
                      {formatINR(c.grossProfit)}
                    </td>
                    <td className="py-2.5 px-3 text-right num">
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded-sm text-[11px] ${
                          c.marginPct >= 12
                            ? "bg-success-bg text-success"
                            : c.marginPct < 6
                            ? "bg-danger-bg text-danger"
                            : "bg-surface-2 text-ink"
                        }`}
                      >
                        {c.marginPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right num font-mono font-medium text-primary">
                      {c.pctOfTotalProfit > 0 ? `${c.pctOfTotalProfit.toFixed(1)}%` : "0.0%"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
