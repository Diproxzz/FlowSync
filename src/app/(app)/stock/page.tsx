"use client";

import { useEffect, useState } from "react";
import { Search, Plus, Filter, AlertTriangle, CheckCircle2, ArrowUpDown } from "lucide-react";
import { formatINR, formatKg } from "@/lib/format";

interface StockRow {
  productId: string;
  code: string;
  name: string;
  category: string | null;
  opening: number;
  purchases: number;
  sales: number;
  adjustments: number;
  closing: number;
  packSizeKg: number | null;
  drums: number;
  purchaseRate: number | null;
  saleRate: number | null;
  stockValue: number;
  salesValue: number;
  reorderLevelKg: number | null;
  status: "LOW STOCK" | "OK";
}

export default function StockPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [isManualMovementOpen, setIsManualMovementOpen] = useState(false);

  // Manual movement form
  const [movementForm, setMovementForm] = useState({
    productId: "",
    type: "PURCHASE" as "PURCHASE" | "ADJUSTMENT",
    qtyKg: "",
    movementDate: new Date().toISOString().split("T")[0],
    partyText: "",
    note: "",
  });
  const [movementMessage, setMovementMessage] = useState<string | null>(null);

  const loadStock = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/stock/summary");
      const data = await res.json();
      setRows(data.summary || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, []);

  const handleRecordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setMovementMessage(null);

    if (!movementForm.productId || !movementForm.qtyKg) {
      setMovementMessage("Please select a product and enter quantity");
      return;
    }

    try {
      const res = await fetch("/api/stock/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: movementForm.productId,
          type: movementForm.type,
          qtyKg: Number(movementForm.qtyKg),
          movementDate: movementForm.movementDate,
          partyText: movementForm.partyText || null,
          note: movementForm.note || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMovementMessage(err.error?.message || "Failed to record movement");
        return;
      }

      setIsManualMovementOpen(false);
      setMovementForm({
        productId: "",
        type: "PURCHASE",
        qtyKg: "",
        movementDate: new Date().toISOString().split("T")[0],
        partyText: "",
        note: "",
      });
      loadStock();
    } catch {
      setMovementMessage("An error occurred recording stock movement");
    }
  };

  const filteredRows = rows.filter((r) => {
    const matchesSearch =
      r.code.toLowerCase().includes(search.toLowerCase()) ||
      r.name.toLowerCase().includes(search.toLowerCase());
    const matchesLowStock = !lowStockOnly || r.status === "LOW STOCK";
    return matchesSearch && matchesLowStock;
  });

  const totalOpening = filteredRows.reduce((sum, r) => sum + r.opening, 0);
  const totalPurchases = filteredRows.reduce((sum, r) => sum + r.purchases, 0);
  const totalSales = filteredRows.reduce((sum, r) => sum + r.sales, 0);
  const totalAdjustments = filteredRows.reduce((sum, r) => sum + r.adjustments, 0);
  const totalClosing = filteredRows.reduce((sum, r) => sum + r.closing, 0);
  const totalStockValue = filteredRows.reduce((sum, r) => sum + r.stockValue, 0);
  const totalSalesValue = filteredRows.reduce((sum, r) => sum + r.salesValue, 0);
  const lowStockCount = rows.filter((r) => r.status === "LOW STOCK").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">Stock Summary</h2>
          <p className="text-xs text-ink-3">Live chemical inventory, valuation and reorder levels (reconciled with 2026-27)</p>
        </div>

        <button
          onClick={() => {
            setMovementMessage(null);
            setIsManualMovementOpen(true);
          }}
          className="h-9 px-3.5 bg-primary text-primary-fg rounded-sm text-xs font-medium flex items-center gap-2 hover:opacity-90 transition self-start"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Record Movement</span>
        </button>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border p-4 rounded-sm">
          <span className="text-[11px] text-ink-3">Total Closing Stock</span>
          <p className="text-xl font-semibold text-ink num mt-1">{formatKg(totalClosing)}</p>
        </div>
        <div className="bg-surface border border-border p-4 rounded-sm">
          <span className="text-[11px] text-ink-3">Total Stock Valuation</span>
          <p className="text-xl font-semibold text-ink num mt-1">{formatINR(totalStockValue)}</p>
        </div>
        <div className="bg-surface border border-border p-4 rounded-sm">
          <span className="text-[11px] text-ink-3">Estimated Sales Value</span>
          <p className="text-xl font-semibold text-ink num mt-1">{formatINR(totalSalesValue)}</p>
        </div>
        <div className="bg-surface border border-border p-4 rounded-sm">
          <span className="text-[11px] text-ink-3">Low-Stock Items</span>
          <p className={`text-xl font-semibold num mt-1 ${lowStockCount > 0 ? "text-danger" : "text-success"}`}>
            {lowStockCount}
          </p>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface p-3 border border-border rounded-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product code..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium border transition flex items-center gap-1.5 ${
              lowStockOnly
                ? "bg-danger text-primary-fg border-danger"
                : "bg-surface-2 text-ink-2 border-border hover:bg-border"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Low Stock Only ({lowStockCount})</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                <th className="py-2.5 px-3">Product</th>
                <th className="py-2.5 px-3 text-right">Opening (kg)</th>
                <th className="py-2.5 px-3 text-right">Purchases (kg)</th>
                <th className="py-2.5 px-3 text-right">Sales (kg)</th>
                <th className="py-2.5 px-3 text-right">Adj (kg)</th>
                <th className="py-2.5 px-3 text-right font-semibold text-ink">Closing (kg)</th>
                <th className="py-2.5 px-3 text-right">Pack (kg)</th>
                <th className="py-2.5 px-3 text-right">Drums</th>
                <th className="py-2.5 px-3 text-right">Pur. Rate</th>
                <th className="py-2.5 px-3 text-right">Sale Rate</th>
                <th className="py-2.5 px-3 text-right font-medium text-ink">Stock Value</th>
                <th className="py-2.5 px-3 text-right">Reorder Level</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-ink-3">
                    Loading inventory...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-ink-3">
                    No products match the criteria.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.productId} className="hover:bg-surface-2/60 transition">
                    <td className="py-2.5 px-3 font-mono font-semibold text-primary">{r.code}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-2">{r.opening}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-2">{r.purchases}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-2">{r.sales}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-3">{r.adjustments}</td>
                    <td className="py-2.5 px-3 text-right num font-semibold text-ink bg-surface-2/30">
                      {r.closing}
                    </td>
                    <td className="py-2.5 px-3 text-right num text-ink-3">{r.packSizeKg || "—"}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-2">{r.drums || "—"}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-2">
                      {r.purchaseRate ? formatINR(r.purchaseRate) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right num text-ink-2">
                      {r.saleRate ? formatINR(r.saleRate) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right num font-medium text-ink">
                      {formatINR(r.stockValue)}
                    </td>
                    <td className="py-2.5 px-3 text-right num text-ink-3">{r.reorderLevelKg || "—"}</td>
                    <td className="py-2.5 px-3 text-center">
                      {r.status === "LOW STOCK" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-semibold bg-danger-bg text-danger border border-danger/30">
                          <AlertTriangle className="w-3 h-3" />
                          <span>LOW STOCK</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-medium bg-success-bg text-success border border-success/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>OK</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold text-ink border-t-2 border-border">
                <td className="py-2.5 px-3">TOTAL</td>
                <td className="py-2.5 px-3 text-right num">{Math.round(totalOpening * 10) / 10}</td>
                <td className="py-2.5 px-3 text-right num">{totalPurchases}</td>
                <td className="py-2.5 px-3 text-right num">{Math.round(totalSales * 10) / 10}</td>
                <td className="py-2.5 px-3 text-right num">{Math.round(totalAdjustments * 10) / 10}</td>
                <td className="py-2.5 px-3 text-right num text-primary">{Math.round(totalClosing * 10) / 10}</td>
                <td colSpan={4} />
                <td className="py-2.5 px-3 text-right num">{formatINR(totalStockValue)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Manual Movement Modal */}
      {isManualMovementOpen && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg shadow-pop w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-ink mb-1">Record Stock Movement</h3>
            <p className="text-xs text-ink-3 mb-4">
              Add supplier purchase stock-in or audit inventory adjustment
            </p>

            <form onSubmit={handleRecordMovement} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Product *</label>
                <select
                  value={movementForm.productId}
                  onChange={(e) => setMovementForm({ ...movementForm, productId: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">Select product...</option>
                  {rows.map((r) => (
                    <option key={r.productId} value={r.productId}>
                      {r.code} ({r.name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Movement Type *</label>
                  <select
                    value={movementForm.type}
                    onChange={(e) =>
                      setMovementForm({ ...movementForm, type: e.target.value as "PURCHASE" | "ADJUSTMENT" })
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
                  >
                    <option value="PURCHASE">Purchase (Stock In)</option>
                    <option value="ADJUSTMENT">Adjustment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Quantity (kg) *</label>
                  <input
                    type="number"
                    step="any"
                    value={movementForm.qtyKg}
                    onChange={(e) => setMovementForm({ ...movementForm, qtyKg: e.target.value })}
                    placeholder="e.g. 240"
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Date</label>
                  <input
                    type="date"
                    value={movementForm.movementDate}
                    onChange={(e) => setMovementForm({ ...movementForm, movementDate: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Party / Supplier</label>
                  <input
                    type="text"
                    value={movementForm.partyText}
                    onChange={(e) => setMovementForm({ ...movementForm, partyText: e.target.value })}
                    placeholder="e.g. ATC / CLM"
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Note / Reason</label>
                <input
                  type="text"
                  value={movementForm.note}
                  onChange={(e) => setMovementForm({ ...movementForm, note: e.target.value })}
                  placeholder="e.g. Physical stock audit correction"
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
                />
              </div>

              {movementMessage && (
                <p className="text-xs text-danger font-medium">✕ {movementMessage}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsManualMovementOpen(false)}
                  className="px-3 py-1.5 rounded-sm border border-border text-xs text-ink-2 hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-sm bg-primary text-primary-fg text-xs font-medium hover:opacity-90"
                >
                  Save Movement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
