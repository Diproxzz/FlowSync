"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Package,
  Building2,
  FileText,
  IndianRupee,
  Layers,
  AlertTriangle,
  CheckCircle,
  Truck,
  Boxes,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Clock,
  ChevronRight,
  ExternalLink,
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
import { PurchaseAnalyticsData } from "@/lib/analytics/purchases";

// Okabe-Ito Color Palette (Accessible)
const COLORS = {
  sales: "#0072B2", // Sales (blue)
  purchase: "#E69F00", // Purchase (accent orange/amber)
  green: "#009E73",
  vermilion: "#D55E00",
  purple: "#CC79A7",
  slate: "#718096",
  darkTeal: "#0F4C4A",
};

interface PurchasesTabProps {
  period: string;
  fromDate?: string;
  toDate?: string;
  selectedSupplier?: string;
  selectedProduct?: string;
}

export function PurchasesTab({
  period,
  fromDate,
  toDate,
  selectedSupplier,
  selectedProduct,
}: PurchasesTabProps) {
  const [data, setData] = useState<PurchaseAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "suppliers" | "trends" | "gst" | "alerts">("overview");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("period", period);
        if (period === "custom") {
          if (fromDate) params.set("from", fromDate);
          if (toDate) params.set("to", toDate);
        }
        if (selectedSupplier) params.set("supplierId", selectedSupplier);
        if (selectedProduct) params.set("productId", selectedProduct);

        const res = await fetch(`/api/analytics/purchases?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load purchase analytics");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Error loading purchase analytics:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [period, fromDate, toDate, selectedSupplier, selectedProduct]);

  if (loading) {
    return (
      <div className="py-16 text-center text-xs text-ink-3">
        Loading purchase analytics...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-16 text-center text-xs text-danger">
        Failed to load purchase analytics data.
      </div>
    );
  }

  const { kpis, trend, topSuppliers, top3ConcentrationPct, topProducts, priceTrends, supplierComparison, gstInput, quality } = data;

  return (
    <div className="space-y-6">
      {/* KPI Tiles Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Purchases Taxable */}
        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3 text-[11px] font-medium">
            <span>Purchases (Taxable)</span>
            <IndianRupee className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="text-xl font-bold text-ink num mt-1 font-mono">
            {formatINR(kpis.purchasesTaxable)}
          </div>
          <span className="text-[10px] text-ink-3">Net supplier billings</span>
        </div>

        {/* 2. Input GST Paid */}
        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3 text-[11px] font-medium">
            <span>Input GST Credit</span>
            <Percent className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-xl font-bold text-primary num mt-1 font-mono">
            {formatINR(kpis.inputGst)}
          </div>
          <span className="text-[10px] text-ink-3">Available for ITC offset</span>
        </div>

        {/* 3. Purchase Bills Count */}
        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3 text-[11px] font-medium">
            <span>Purchase Bills</span>
            <FileText className="w-3.5 h-3.5 text-ink-3" />
          </div>
          <div className="text-xl font-bold text-ink num mt-1 font-mono">
            {kpis.invoicesCount}
          </div>
          <span className="text-[10px] text-ink-3">Verified supplier bills</span>
        </div>

        {/* 4. Quantity Bought */}
        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3 text-[11px] font-medium">
            <span>Quantity Bought</span>
            <Package className="w-3.5 h-3.5 text-ink-3" />
          </div>
          <div className="text-xl font-bold text-ink num mt-1 font-mono">
            {formatKg(kpis.volumeKg)}
          </div>
          <span className="text-[10px] text-ink-3">Total incoming weight</span>
        </div>

        {/* 5. Active Suppliers */}
        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3 text-[11px] font-medium">
            <span>Active Suppliers</span>
            <Truck className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="text-xl font-bold text-ink num mt-1 font-mono">
            {kpis.activeSuppliersCount}
          </div>
          <span className="text-[10px] text-ink-3">Supplied in this period</span>
        </div>

        {/* 6. Net Stock Movement */}
        <div className="bg-surface border border-border p-3.5 rounded-sm shadow-xs">
          <div className="flex items-center justify-between text-ink-3 text-[11px] font-medium">
            <span>Net Stock Movement</span>
            <Boxes className="w-3.5 h-3.5 text-ink-3" />
          </div>
          <div
            className={`text-xl font-bold num mt-1 font-mono flex items-center gap-1 ${
              kpis.netStockMovementKg >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {kpis.netStockMovementKg >= 0 ? (
              <ArrowUpRight className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ArrowDownRight className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{formatKg(Math.abs(kpis.netStockMovementKg))}</span>
          </div>
          <span className="text-[10px] text-ink-3">
            {kpis.netStockMovementKg >= 0 ? "Inventory accumulation" : "Net inventory draw"}
          </span>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 text-xs">
          {[
            { id: "overview", label: "Purchases vs Sales" },
            { id: "suppliers", label: "Supplier Analytics" },
            { id: "trends", label: "Price Trends & Multi-Sourcing" },
            { id: "gst", label: "GST Input Credit" },
            { id: "alerts", label: "Data Quality & Alerts" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-3 py-2 font-medium border-b-2 transition ${
                activeSubTab === tab.id
                  ? "border-accent text-accent font-semibold"
                  : "border-transparent text-ink-2 hover:text-ink hover:border-border"
              }`}
            >
              {tab.label}
              {tab.id === "alerts" &&
                (quality.invoicesWithWarningsCount > 0 || quality.rateVarianceCount > 0) && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-warning-bg text-warning text-[10px] font-bold">
                    {quality.invoicesWithWarningsCount + quality.rateVarianceCount}
                  </span>
                )}
            </button>
          ))}
        </div>

        {top3ConcentrationPct > 60 && (
          <div className="text-[11px] text-warning bg-warning-bg px-2.5 py-1 rounded-sm border border-warning/30 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Supplier Concentration Risk: Top 3 suppliers represent {top3ConcentrationPct}% of spend</span>
          </div>
        )}
      </div>

      {/* SUB-TAB 1: OVERVIEW (Purchases vs Sales Trend) */}
      {activeSubTab === "overview" && (
        <div className="space-y-6">
          <div className="bg-surface border border-border p-4 rounded-sm space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Purchases vs Sales by Month</h3>
                <p className="text-xs text-ink-3">
                  Monthly comparative turnover: Taxable Sales vs Taxable Purchases (Okabe-Ito high contrast)
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs" style={{ backgroundColor: COLORS.sales }} />
                  <span className="text-ink-2">Sales (Taxable)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs" style={{ backgroundColor: COLORS.purchase }} />
                  <span className="text-ink-2">Purchases (Taxable)</span>
                </div>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [formatINR(Number(val)), name]}
                    labelStyle={{ fontWeight: "bold" }}
                  />
                  <Bar dataKey="salesTaxable" name="Sales" fill={COLORS.sales} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="purchasesTaxable" name="Purchases" fill={COLORS.purchase} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Products Bought Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface border border-border p-4 rounded-sm space-y-3 shadow-xs">
              <h3 className="text-sm font-semibold text-ink">Top Products by Purchase Spend</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                      <th className="py-2 px-2.5">Product</th>
                      <th className="py-2 px-2.5 text-right">Volume</th>
                      <th className="py-2 px-2.5 text-right">Avg Rate/kg</th>
                      <th className="py-2 px-2.5 text-right">Total Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {topProducts.slice(0, 8).map((p) => (
                      <tr key={p.id} className="hover:bg-surface-2/40">
                        <td className="py-2 px-2.5 font-medium text-ink">
                          <div>{p.name}</div>
                          <div className="text-[10px] text-ink-3 font-mono">{p.code}</div>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-ink">
                          {formatKg(p.volumeKg)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-ink-2">
                          ₹{p.avgRatePerKg.toFixed(2)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-accent">
                          {formatINR(p.totalSpend)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Suppliers Spend Card */}
            <div className="bg-surface border border-border p-4 rounded-sm space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Top Suppliers by Spend</h3>
                <Link href="/suppliers" className="text-xs text-accent hover:underline flex items-center gap-1 font-medium">
                  <span>View All</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                      <th className="py-2 px-2.5">Supplier</th>
                      <th className="py-2 px-2.5 text-right">Bills</th>
                      <th className="py-2 px-2.5 text-right">Volume</th>
                      <th className="py-2 px-2.5 text-right">Spend</th>
                      <th className="py-2 px-2.5 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {topSuppliers.slice(0, 8).map((s) => (
                      <tr key={s.id} className="hover:bg-surface-2/40">
                        <td className="py-2 px-2.5 font-medium text-ink">
                          <Link href={`/suppliers/${s.id}`} className="hover:underline hover:text-accent">
                            {s.name}
                          </Link>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-ink-3">{s.invoiceCount}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-ink">{formatKg(s.volumeKg)}</td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-ink">
                          {formatINR(s.totalSpend)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-ink-2">{s.pctShare}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SUPPLIER ANALYTICS */}
      {activeSubTab === "suppliers" && (
        <div className="space-y-4">
          <div className="bg-surface border border-border p-4 rounded-sm space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Supplier Spend & Concentration</h3>
                <p className="text-xs text-ink-3">
                  Evaluation of vendor dependencies, share of wallet, and material procurement volume.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-ink bg-surface-2 px-2 py-1 rounded-sm border border-border">
                Top 3 Share: {top3ConcentrationPct}%
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                    <th className="py-2.5 px-3">Supplier Name</th>
                    <th className="py-2.5 px-3">GSTIN</th>
                    <th className="py-2.5 px-3 text-right">Total Spend</th>
                    <th className="py-2.5 px-3 text-right">Share of Spend</th>
                    <th className="py-2.5 px-3 text-right">Total Kg</th>
                    <th className="py-2.5 px-3 text-right">Bills Count</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topSuppliers.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-surface-2/40">
                      <td className="py-2.5 px-3 font-semibold text-ink flex items-center gap-1.5">
                        <span className="w-4 text-ink-3 font-mono text-[11px]">#{idx + 1}</span>
                        <Link href={`/suppliers/${s.id}`} className="hover:underline hover:text-accent">
                          {s.name}
                        </Link>
                        {s.isTop3 && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-accent/10 text-accent font-semibold">
                            Top 3
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-ink-3">
                        {s.gstin || <span className="text-warning">Unregistered</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-accent">
                        {formatINR(s.totalSpend)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink font-medium">
                        {s.pctShare}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink">
                        {formatKg(s.volumeKg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-3">
                        {s.invoiceCount}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/suppliers/${s.id}`}
                          className="px-2 py-1 border border-border text-xs rounded-sm hover:bg-surface-2 transition text-ink font-medium"
                        >
                          Profile
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PRICE TRENDS & MULTI-SOURCING */}
      {activeSubTab === "trends" && (
        <div className="space-y-6">
          {/* Supplier Price Comparison Table */}
          <div className="bg-surface border border-border p-4 rounded-sm space-y-3 shadow-xs">
            <h3 className="text-sm font-semibold text-ink">Multi-Sourced Products Price Comparison</h3>
            <p className="text-xs text-ink-3">
              Products purchased from multiple vendors showing latest and weighted-average procurement rates.
            </p>

            {supplierComparison.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-3">
                No products were purchased from multiple distinct suppliers in this period.
              </div>
            ) : (
              <div className="overflow-x-auto space-y-4">
                {supplierComparison.map((item) => (
                  <div key={item.productId} className="border border-border rounded-sm overflow-hidden">
                    <div className="bg-surface-2 p-2.5 border-b border-border flex items-center justify-between">
                      <div className="font-semibold text-ink text-xs">
                        {item.productName} <span className="font-mono text-ink-3 text-[11px]">({item.productCode})</span>
                      </div>
                      <span className="text-[11px] text-ink-3">{item.suppliers.length} active suppliers</span>
                    </div>

                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-surface text-ink-2 font-medium border-b border-border">
                          <th className="py-2 px-3">Supplier</th>
                          <th className="py-2 px-3 text-right">Latest Rate (₹/kg)</th>
                          <th className="py-2 px-3 text-right">Weighted Avg (₹/kg)</th>
                          <th className="py-2 px-3 text-right">Total Kg Bought</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {item.suppliers.map((s) => (
                          <tr key={s.supplierId} className="hover:bg-surface-2/40">
                            <td className="py-2 px-3 font-medium text-ink">{s.supplierName}</td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-ink">
                              ₹{s.latestRatePerKg.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-ink-2">
                              ₹{s.avgRatePerKg.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-ink-3">
                              {formatKg(s.volumeKg)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Price Trends per Product */}
          <div className="bg-surface border border-border p-4 rounded-sm space-y-4 shadow-xs">
            <h3 className="text-sm font-semibold text-ink">Product Purchase Price Trends</h3>
            <p className="text-xs text-ink-3">
              Weighted-average monthly purchase rate (₹/kg) vs catalog standard purchase rate.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {priceTrends.map((pt) => (
                <div key={pt.productId} className="border border-border rounded-sm p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-xs text-ink block">{pt.productName}</span>
                      <span className="text-[10px] text-ink-3 font-mono">{pt.productCode}</span>
                    </div>
                    {pt.stdPurchaseRate && (
                      <span className="text-[11px] font-mono font-semibold text-ink-2 bg-surface-2 px-2 py-0.5 rounded-xs border border-border">
                        Std: ₹{pt.stdPurchaseRate.toFixed(2)}/kg
                      </span>
                    )}
                  </div>

                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={pt.months} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${v}`} />
                        <Tooltip formatter={(val: any) => [`₹${Number(val).toFixed(2)}/kg`, "Avg Rate"]} />
                        <Line
                          type="monotone"
                          dataKey="avgRatePerKg"
                          stroke={COLORS.purchase}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: GST INPUT CREDIT */}
      {activeSubTab === "gst" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-surface border border-border p-4 rounded-sm">
              <span className="text-[11px] text-ink-3">Total Input GST Credit</span>
              <div className="text-2xl font-bold text-primary num mt-1 font-mono">
                {formatINR(gstInput.totalInputGst)}
              </div>
            </div>
            <div className="bg-surface border border-border p-4 rounded-sm">
              <span className="text-[11px] text-ink-3">Input CGST</span>
              <div className="text-xl font-semibold text-ink num mt-1 font-mono">
                {formatINR(gstInput.cgstTotal)}
              </div>
            </div>
            <div className="bg-surface border border-border p-4 rounded-sm">
              <span className="text-[11px] text-ink-3">Input SGST</span>
              <div className="text-xl font-semibold text-ink num mt-1 font-mono">
                {formatINR(gstInput.sgstTotal)}
              </div>
            </div>
            <div className="bg-surface border border-border p-4 rounded-sm">
              <span className="text-[11px] text-ink-3">Input IGST</span>
              <div className="text-xl font-semibold text-ink num mt-1 font-mono">
                {formatINR(gstInput.igstTotal)}
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border p-4 rounded-sm space-y-3 shadow-xs">
            <h3 className="text-sm font-semibold text-ink">Input Tax Credit by HSN Code</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                    <th className="py-2 px-3">HSN Code</th>
                    <th className="py-2 px-3 text-right">Taxable Procurement (₹)</th>
                    <th className="py-2 px-3 text-right">Tax Credit Amount (₹)</th>
                    <th className="py-2 px-3 text-right">Effective Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gstInput.byHsn.map((h) => {
                    const effRate = h.taxable > 0 ? ((h.taxAmount / h.taxable) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={h.hsn} className="hover:bg-surface-2/40">
                        <td className="py-2 px-3 font-mono font-semibold text-ink">{h.hsn}</td>
                        <td className="py-2 px-3 text-right font-mono text-ink">
                          {formatINR(h.taxable)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-primary">
                          {formatINR(h.taxAmount)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-ink-2">{effRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: DATA QUALITY & ALERTS */}
      {activeSubTab === "alerts" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-surface border border-border p-4 rounded-sm">
              <span className="text-[11px] text-ink-3">Invoices With Warnings</span>
              <div className="text-2xl font-bold text-warning num mt-1 font-mono">
                {quality.invoicesWithWarningsCount}
              </div>
            </div>
            <div className="bg-surface border border-border p-4 rounded-sm">
              <span className="text-[11px] text-ink-3">Suppliers Without GSTIN</span>
              <div className="text-2xl font-bold text-danger num mt-1 font-mono">
                {quality.suppliersWithoutGstinCount}
              </div>
            </div>
            <div className="bg-surface border border-border p-4 rounded-sm">
              <span className="text-[11px] text-ink-3">Rate Variance Alerts (&gt;20%)</span>
              <div className="text-2xl font-bold text-accent num mt-1 font-mono">
                {quality.rateVarianceCount}
              </div>
            </div>
          </div>

          {/* Lapsed Suppliers Card */}
          <div className="bg-surface border border-border p-4 rounded-sm space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Lapsed Suppliers (&gt;90 Days Inactive)</h3>
                <p className="text-xs text-ink-3">
                  Registered vendors from whom no materials have been purchased in over 90 days.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                    <th className="py-2 px-3">Supplier</th>
                    <th className="py-2 px-3">Last Purchase Date</th>
                    <th className="py-2 px-3 text-right">Days Inactive</th>
                    <th className="py-2 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {quality.lapsedSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-2/40">
                      <td className="py-2 px-3 font-medium text-ink">{s.name}</td>
                      <td className="py-2 px-3 font-mono text-ink-3">
                        {s.lastPurchaseDate || "No purchases recorded"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-danger font-semibold">
                        {s.daysSincePurchase === 999 ? "Never" : `${s.daysSincePurchase} days`}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Link
                          href={`/suppliers/${s.id}`}
                          className="px-2 py-1 border border-border text-xs rounded-sm hover:bg-surface-2 transition text-ink font-medium"
                        >
                          View Profile
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
