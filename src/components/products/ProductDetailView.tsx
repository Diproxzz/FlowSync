"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Tag,
  ExternalLink,
  Search,
  Calendar,
  Building2,
  Receipt,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
} from "lucide-react";
import { formatINR, formatKg, formatDate } from "@/lib/format";

export interface ProductDetailViewProps {
  product: any;
  stats?: any;
  onClose?: () => void;
  isModal?: boolean;
  onEdit?: (product: any) => void;
}

export function ProductDetailView({
  product,
  stats,
  onClose,
  isModal = false,
  onEdit,
}: ProductDetailViewProps) {
  const [activeTab, setActiveTab] = useState<"purchases" | "sales" | "movements">("purchases");
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");

  const purchaseItems = product.purchase_items || [];
  const invoiceItems = product.invoice_items || [];
  const stockMovements = product.stock_movements || [];

  // Filtered purchases
  const filteredPurchases = purchaseItems.filter((item: any) => {
    if (!purchaseSearch) return true;
    const q = purchaseSearch.toLowerCase();
    const invNum = item.purchase_invoice?.supplier_invoice_number?.toLowerCase() || "";
    const supName = item.purchase_invoice?.supplier?.name?.toLowerCase() || item.purchase_invoice?.supplier_name_snapshot?.toLowerCase() || "";
    const rawName = item.product_name_raw?.toLowerCase() || "";
    return invNum.includes(q) || supName.includes(q) || rawName.includes(q);
  });

  // Filtered sales
  const filteredSales = invoiceItems.filter((item: any) => {
    if (!salesSearch) return true;
    const q = salesSearch.toLowerCase();
    const invNum = item.invoice?.invoice_number?.toLowerCase() || "";
    const custName = item.invoice?.customer?.name?.toLowerCase() || item.invoice?.customer_name_snapshot?.toLowerCase() || "";
    const rawName = item.product_name_raw?.toLowerCase() || "";
    return invNum.includes(q) || custName.includes(q) || rawName.includes(q);
  });

  // Filtered movements
  const filteredMovements = stockMovements.filter((m: any) => {
    if (!movementSearch) return true;
    const q = movementSearch.toLowerCase();
    const type = m.type?.toLowerCase() || "";
    const party = m.party_text?.toLowerCase() || "";
    const note = m.note?.toLowerCase() || "";
    return type.includes(q) || party.includes(q) || note.includes(q);
  });

  // Calculated totals for filtered lists
  const filteredPurchasesTotalQty = filteredPurchases.reduce((acc: number, it: any) => acc + (Number(it.qty_kg) || 0), 0);
  const filteredPurchasesTotalValue = filteredPurchases.reduce((acc: number, it: any) => acc + (Number(it.line_total) || Number(it.taxable_amount) || 0), 0);

  const filteredSalesTotalQty = filteredSales.reduce((acc: number, it: any) => acc + (Number(it.qty_kg) || 0), 0);
  const filteredSalesTotalValue = filteredSales.reduce((acc: number, it: any) => acc + (Number(it.line_total) || Number(it.taxable_amount) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-surface border border-border rounded-sm p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-sm bg-primary/10 border border-primary/20 text-primary">
                {product.code}
              </span>
              {product.category && (
                <span className="text-xs px-2 py-0.5 rounded-sm bg-surface-2 border border-border text-ink-2">
                  {product.category}
                </span>
              )}
              {product.default_hsn && (
                <span className="text-xs px-2 py-0.5 rounded-sm bg-surface-2 border border-border font-mono text-ink-3">
                  HSN: {product.default_hsn}
                </span>
              )}
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  product.is_active
                    ? "bg-success-bg text-success border border-success/30"
                    : "bg-surface-2 text-ink-3 border border-border"
                }`}
              >
                {product.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight break-words">
              {product.name}
            </h1>

            {/* Aliases */}
            {product.aliases && product.aliases.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-ink-3 pt-0.5">
                <Tag className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="font-medium text-ink-2">Recognized Aliases:</span>
                {product.aliases.map((a: any) => (
                  <span
                    key={a.id}
                    className="px-1.5 py-0.2 rounded-xs bg-surface-2 border border-border text-[11px] font-mono text-ink"
                  >
                    {a.alias}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onEdit && (
              <button
                onClick={() => onEdit(product)}
                className="px-3 py-1.5 border border-border bg-surface hover:bg-surface-2 rounded-sm text-xs font-medium text-ink transition"
              >
                Edit Master
              </button>
            )}

            {isModal && (
              <Link
                href={`/products/${product.id}`}
                target="_blank"
                className="px-3 py-1.5 border border-border bg-surface hover:bg-surface-2 rounded-sm text-xs font-medium text-primary flex items-center gap-1 transition"
                title="Open product full page in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Full Page</span>
              </Link>
            )}

            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 border border-border hover:bg-surface-2 rounded-sm text-ink-3 hover:text-ink transition"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Quick Specs Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 mt-4 border-t border-border text-xs">
          <div>
            <span className="text-ink-3 text-[11px] block">Standard Pack Size</span>
            <span className="font-mono font-medium text-ink">
              {product.pack_size_kg ? `${product.pack_size_kg} kg` : "—"}
            </span>
          </div>
          <div>
            <span className="text-ink-3 text-[11px] block">Std Purchase Rate</span>
            <span className="font-mono font-medium text-ink">
              {product.std_purchase_rate ? `${formatINR(Number(product.std_purchase_rate))}/kg` : "—"}
            </span>
          </div>
          <div>
            <span className="text-ink-3 text-[11px] block">Std Sale Rate</span>
            <span className="font-mono font-medium text-ink">
              {product.std_sale_rate ? `${formatINR(Number(product.std_sale_rate))}/kg` : "—"}
            </span>
          </div>
          <div>
            <span className="text-ink-3 text-[11px] block">Reorder Level</span>
            <span className="font-mono font-medium text-ink">
              {product.reorder_level_kg ? `${product.reorder_level_kg} kg` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Current Stock */}
          <div className="bg-surface border border-border rounded-sm p-4 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-ink-3 mb-1">
              <span className="font-medium uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-accent" />
                Current Stock
              </span>
              {stats.currentStock <= Number(product.reorder_level_kg || 0) && Number(product.reorder_level_kg || 0) > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-warning-bg border border-warning/30 text-warning font-semibold">
                  Low Stock
                </span>
              )}
            </div>
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {formatKg(stats.currentStock)}
            </div>
            <div className="mt-1 text-[11px] text-ink-3 flex items-center justify-between">
              <span>{stats.currentDrums > 0 ? `~${stats.currentDrums.toFixed(1)} drums` : "—"}</span>
              <span>Opening: {formatKg(stats.openingStock)}</span>
            </div>
          </div>

          {/* Purchases Summary */}
          <div className="bg-surface border border-border rounded-sm p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-ink-3 mb-1">
              <span className="font-medium uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <ArrowDownLeft className="w-3.5 h-3.5 text-success" />
                Total Purchases
              </span>
              <span className="text-[11px] font-mono text-ink-3">
                {purchaseItems.length} {purchaseItems.length === 1 ? "batch" : "batches"}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {formatKg(stats.totalPurchaseQty)}
            </div>
            <div className="mt-1 text-[11px] text-ink-3 flex items-center justify-between">
              <span>Spend: {formatINR(stats.totalPurchaseValue, true)}</span>
              <span className="font-medium text-ink">
                Avg: {formatINR(stats.avgPurchaseRate)}/kg
              </span>
            </div>
          </div>

          {/* Sales Summary */}
          <div className="bg-surface border border-border rounded-sm p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-ink-3 mb-1">
              <span className="font-medium uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-primary" />
                Total Sales
              </span>
              <span className="text-[11px] font-mono text-ink-3">
                {invoiceItems.length} {invoiceItems.length === 1 ? "invoice" : "invoices"}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {formatKg(stats.totalSalesQty)}
            </div>
            <div className="mt-1 text-[11px] text-ink-3 flex items-center justify-between">
              <span>Rev: {formatINR(stats.totalSalesValue, true)}</span>
              <span className="font-medium text-ink">
                Avg: {formatINR(stats.avgSaleRate)}/kg
              </span>
            </div>
          </div>

          {/* Profit Margin Spread */}
          <div className="bg-surface border border-border rounded-sm p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-ink-3 mb-1">
              <span className="font-medium uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-accent" />
                Rate Spread & Margin
              </span>
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-ink">
              {formatINR(stats.marginAmount)}
              <span className="text-xs text-ink-3 font-normal ml-1">/kg</span>
            </div>
            <div className="mt-1 text-[11px] text-ink-3 flex items-center justify-between">
              <span>Spread: Avg Sale − Purchase</span>
              <span className={`font-semibold font-mono ${stats.marginPct >= 0 ? "text-success" : "text-danger"}`}>
                {stats.marginPct > 0 ? "+" : ""}{stats.marginPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="border-b border-border flex items-center gap-4 text-xs font-medium">
        <button
          onClick={() => setActiveTab("purchases")}
          className={`pb-2.5 flex items-center gap-2 border-b-2 transition ${
            activeTab === "purchases"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-ink-3 hover:text-ink"
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          <span>Purchase Batches</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-2 border border-border text-ink-2 font-mono">
            {purchaseItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("sales")}
          className={`pb-2.5 flex items-center gap-2 border-b-2 transition ${
            activeTab === "sales"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-ink-3 hover:text-ink"
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          <span>Sales Invoices</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-2 border border-border text-ink-2 font-mono">
            {invoiceItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("movements")}
          className={`pb-2.5 flex items-center gap-2 border-b-2 transition ${
            activeTab === "movements"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-ink-3 hover:text-ink"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Stock Movements / Ledger</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-2 border border-border text-ink-2 font-mono">
            {stockMovements.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Purchases */}
      {activeTab === "purchases" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={purchaseSearch}
                onChange={(e) => setPurchaseSearch(e.target.value)}
                placeholder="Filter by invoice #, supplier..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="text-xs text-ink-3 font-mono flex items-center gap-3">
              <span>Filtered Qty: <strong>{formatKg(filteredPurchasesTotalQty)}</strong></span>
              <span>Total Value: <strong>{formatINR(filteredPurchasesTotalValue)}</strong></span>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Supplier / Vendor</th>
                    <th className="py-2.5 px-3 text-right">Printed Qty</th>
                    <th className="py-2.5 px-3 text-right">Qty (KG)</th>
                    <th className="py-2.5 px-3 text-right">Rate / Unit</th>
                    <th className="py-2.5 px-3 text-right">Rate / KG</th>
                    <th className="py-2.5 px-3 text-right">Taxable</th>
                    <th className="py-2.5 px-3 text-right">Total (Inc. GST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-ink-3">
                        {purchaseSearch ? "No matching purchase records found." : "No purchase transactions recorded for this product yet."}
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map((item: any) => {
                      const inv = item.purchase_invoice;
                      const sup = inv?.supplier;
                      const isImport = inv?.is_import;
                      const ratePerKg = Number(item.rate_per_kg) || Number(item.rate) || 0;
                      const rateUnit = Number(item.rate) || 0;
                      const lineTotal = Number(item.line_total) || Number(item.taxable_amount) || 0;

                      return (
                        <tr key={item.id} className="hover:bg-surface-2/60 transition">
                          <td className="py-2.5 px-3 text-ink-2 font-mono whitespace-nowrap">
                            {formatDate(inv?.invoice_date)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {inv ? (
                              <Link
                                href={`/purchases/${inv.id}`}
                                className="font-mono font-medium text-accent hover:underline flex items-center gap-1"
                              >
                                <span>#{inv.supplier_invoice_number}</span>
                                {isImport && (
                                  <span className="text-[9px] px-1 py-0.2 rounded-xs bg-accent/15 text-accent font-semibold">
                                    Import
                                  </span>
                                )}
                              </Link>
                            ) : (
                              <span className="font-mono text-ink-3">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {sup ? (
                              <Link
                                href={`/suppliers/${sup.id}`}
                                className="text-ink hover:text-accent hover:underline font-medium"
                              >
                                {sup.name}
                              </Link>
                            ) : (
                              <span className="text-ink font-medium">
                                {inv?.supplier_name_snapshot || "—"}
                              </span>
                            )}
                            {item.product_name_raw && item.product_name_raw !== product.name && (
                              <span className="text-[10px] text-ink-3 block font-mono">
                                In Invoice: &quot;{item.product_name_raw}&quot;
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right num text-ink font-mono whitespace-nowrap">
                            {Number(item.qty_printed || 0)} {item.unit_printed || "KG"}
                          </td>
                          <td className="py-2.5 px-3 text-right num font-semibold text-ink font-mono whitespace-nowrap">
                            {formatKg(item.qty_kg)}
                          </td>
                          <td className="py-2.5 px-3 text-right num text-ink-2 font-mono whitespace-nowrap">
                            {formatINR(rateUnit)}
                          </td>
                          <td className="py-2.5 px-3 text-right num font-medium text-ink font-mono whitespace-nowrap">
                            {formatINR(ratePerKg)}
                          </td>
                          <td className="py-2.5 px-3 text-right num text-ink-2 font-mono whitespace-nowrap">
                            {formatINR(Number(item.taxable_amount || 0))}
                          </td>
                          <td className="py-2.5 px-3 text-right num font-semibold text-ink font-mono whitespace-nowrap">
                            {formatINR(lineTotal)}
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
      )}

      {/* Tab 2: Sales */}
      {activeTab === "sales" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                placeholder="Filter by invoice #, customer..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="text-xs text-ink-3 font-mono flex items-center gap-3">
              <span>Filtered Qty: <strong>{formatKg(filteredSalesTotalQty)}</strong></span>
              <span>Total Value: <strong>{formatINR(filteredSalesTotalValue)}</strong></span>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Customer / Buyer</th>
                    <th className="py-2.5 px-3 text-right">Pack Size</th>
                    <th className="py-2.5 px-3 text-right">Qty (KG)</th>
                    <th className="py-2.5 px-3 text-right">Rate / KG</th>
                    <th className="py-2.5 px-3 text-right">Discount</th>
                    <th className="py-2.5 px-3 text-right">Taxable</th>
                    <th className="py-2.5 px-3 text-right">Total (Inc. GST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-ink-3">
                        {salesSearch ? "No matching sales records found." : "No sales recorded for this product yet."}
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((item: any) => {
                      const inv = item.invoice;
                      const cust = inv?.customer;
                      const rate = Number(item.rate) || 0;
                      const lineTotal = Number(item.line_total) || 0;
                      const discountStr = item.discount_pct
                        ? `${Number(item.discount_pct)}%`
                        : item.discount_amount
                        ? formatINR(Number(item.discount_amount))
                        : "—";

                      return (
                        <tr key={item.id} className="hover:bg-surface-2/60 transition">
                          <td className="py-2.5 px-3 text-ink-2 font-mono whitespace-nowrap">
                            {formatDate(inv?.invoice_date)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {inv ? (
                              <Link
                                href={`/invoices/${inv.id}`}
                                className="font-mono font-medium text-primary hover:underline flex items-center gap-1"
                              >
                                <span>#{inv.invoice_number}</span>
                              </Link>
                            ) : (
                              <span className="font-mono text-ink-3">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-ink font-medium">
                              {cust?.name || inv?.customer_name_snapshot || "—"}
                            </span>
                            {item.product_name_raw && item.product_name_raw !== product.name && (
                              <span className="text-[10px] text-ink-3 block font-mono">
                                In Invoice: &quot;{item.product_name_raw}&quot;
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right num text-ink-3 font-mono whitespace-nowrap">
                            {item.pack_size_kg ? `${item.pack_size_kg} kg` : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right num font-semibold text-ink font-mono whitespace-nowrap">
                            {formatKg(item.qty_kg)}
                          </td>
                          <td className="py-2.5 px-3 text-right num font-medium text-ink font-mono whitespace-nowrap">
                            {formatINR(rate)}
                          </td>
                          <td className="py-2.5 px-3 text-right num text-ink-3 font-mono whitespace-nowrap">
                            {discountStr}
                          </td>
                          <td className="py-2.5 px-3 text-right num text-ink-2 font-mono whitespace-nowrap">
                            {formatINR(Number(item.taxable_amount || 0))}
                          </td>
                          <td className="py-2.5 px-3 text-right num font-semibold text-ink font-mono whitespace-nowrap">
                            {formatINR(lineTotal)}
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
      )}

      {/* Tab 3: Stock Movements */}
      {activeTab === "movements" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                placeholder="Filter movements by type, note, party..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-right">Quantity (KG)</th>
                    <th className="py-2.5 px-3">Party / Counterparty</th>
                    <th className="py-2.5 px-3">Source & Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-ink-3">
                        {movementSearch ? "No matching movements found." : "No stock movements recorded yet."}
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((m: any) => {
                      const qty = Number(m.qty_kg);
                      const isPositive = m.type === "PURCHASE" || m.type === "OPENING" || (m.type === "ADJUSTMENT" && qty > 0);

                      let badgeClass = "bg-surface-2 text-ink-3 border-border";
                      if (m.type === "PURCHASE") badgeClass = "bg-accent/10 border-accent/20 text-accent";
                      else if (m.type === "SALE") badgeClass = "bg-primary/10 border-primary/20 text-primary";
                      else if (m.type === "OPENING") badgeClass = "bg-surface-2 text-ink-2 border-border font-medium";
                      else if (m.type === "ADJUSTMENT") badgeClass = "bg-warning-bg border-warning/30 text-warning";

                      return (
                        <tr key={m.id} className="hover:bg-surface-2/60 transition">
                          <td className="py-2.5 px-3 text-ink-2 font-mono whitespace-nowrap">
                            {formatDate(m.movement_date)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-xs text-[10px] font-semibold border ${badgeClass}`}>
                              {m.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap">
                            <span className={isPositive ? "text-success" : "text-danger"}>
                              {isPositive ? "+" : "−"}{formatKg(Math.abs(qty))}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-ink font-medium">
                            {m.party_text || "—"}
                          </td>
                          <td className="py-2.5 px-3 text-ink-3 text-[11px]">
                            <span className="font-mono text-ink-2 mr-2">{m.source}</span>
                            {m.note && <span>{m.note}</span>}
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
      )}
    </div>
  );
}
