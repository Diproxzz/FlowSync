"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Plus,
  Filter,
  AlertTriangle,
  CheckCircle2,
  ArrowUpDown,
  Download,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { formatINR, formatKg } from "@/lib/format";

interface StockRow {
  productId: string;
  code: string;
  name: string;
  category: string | null;
  opening: number;
  purchases: number;
  purchasesFromInvoices: number;
  purchasesFromLegacy: number;
  sales: number;
  adjustments: number;
  closing: number;
  packSizeKg: number | null;
  drums: number;
  purchaseRate: number | null;
  landingCost: number | null;
  saleRate: number | null;
  lastPurchaseRate: number | null;
  lastPurchaseDate: string | null;
  lastPurchaseSupplier: string | null;
  reorderSuggestionKg: number;
  reorderSuggestionDrums: number;
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

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    opening: string;
    packSizeKg: string;
    purchaseRate: string;
    landingCost: string;
    saleRate: string;
  }>({
    name: "",
    opening: "",
    packSizeKg: "",
    purchaseRate: "",
    landingCost: "",
    saleRate: "",
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

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

  const handleStartEdit = (r: StockRow) => {
    setEditingId(r.productId);
    setEditForm({
      name: r.name,
      opening: r.opening !== null && r.opening !== undefined ? String(r.opening) : "",
      packSizeKg: r.packSizeKg !== null && r.packSizeKg !== undefined ? String(r.packSizeKg) : "",
      purchaseRate: r.purchaseRate !== null && r.purchaseRate !== undefined ? String(r.purchaseRate) : "",
      landingCost: r.landingCost !== null && r.landingCost !== undefined ? String(r.landingCost) : "",
      saleRate: r.saleRate !== null && r.saleRate !== undefined ? String(r.saleRate) : "",
    });
    setSaveError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setSaveError(null);
  };

  // When editing anything, upon clicking outside, discard the edit
  useEffect(() => {
    if (!editingId) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".stock-edit-row")) {
        handleCancelEdit();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [editingId]);

  const handleSaveEdit = async (productId: string) => {
    setSavingId(productId);
    setSaveError(null);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          opening: editForm.opening !== "" ? Number(editForm.opening) : 0,
          pack_size_kg: editForm.packSizeKg !== "" ? Number(editForm.packSizeKg) : null,
          std_purchase_rate: editForm.purchaseRate !== "" ? Number(editForm.purchaseRate) : null,
          landing_cost: editForm.landingCost !== "" ? Number(editForm.landingCost) : null,
          std_sale_rate: editForm.saleRate !== "" ? Number(editForm.saleRate) : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error?.message || "Failed to update item");
        return;
      }

      setEditingId(null);
      setSaveSuccess("Item updated successfully");
      setTimeout(() => setSaveSuccess(null), 3000);
      await loadStock();
    } catch {
      setSaveError("An error occurred while saving item");
    } finally {
      setSavingId(null);
    }
  };

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

  const exportCsv = () => {
    const headers = [
      "Product Code",
      "Product Name",
      "Category",
      "Opening (kg)",
      "Purchases Total (kg)",
      "Purchases from Invoices (kg)",
      "Purchases Legacy (kg)",
      "Sales (kg)",
      "Adjustments (kg)",
      "Closing (kg)",
      "Pack Size (kg)",
      "Drums",
      "Std Purchase Rate (INR)",
      "Landing Cost (INR)",
      "Last Purchase Rate (INR/kg)",
      "Last Purchase Date",
      "Last Purchase Supplier",
      "Std Sale Rate (INR)",
      "Stock Valuation (INR)",
      "Sales Value (INR)",
      "Reorder Suggestion (kg)",
      "Status",
    ];

    const csvRows = [
      headers.join(","),
      ...filteredRows.map((r) =>
        [
          `"${r.code.replace(/"/g, '""')}"`,
          `"${r.name.replace(/"/g, '""')}"`,
          `"${(r.category || "").replace(/"/g, '""')}"`,
          r.opening,
          r.purchases,
          r.purchasesFromInvoices,
          r.purchasesFromLegacy,
          r.sales,
          r.adjustments,
          r.closing,
          r.packSizeKg ?? "",
          r.drums,
          r.purchaseRate ?? "",
          r.landingCost ?? "",
          r.lastPurchaseRate ?? "",
          r.lastPurchaseDate ?? "",
          `"${(r.lastPurchaseSupplier || "").replace(/"/g, '""')}"`,
          r.saleRate ?? "",
          r.stockValue,
          r.salesValue,
          r.reorderSuggestionKg,
          r.status,
        ].join(",")
      ),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `stock_summary_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

          <button
            onClick={exportCsv}
            className="px-3 py-1.5 rounded-sm text-xs font-medium border border-border bg-surface-2 text-ink-2 hover:bg-border transition flex items-center gap-1.5"
            title="Download CSV report of current stock with purchase metrics"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-3 bg-success-bg border border-success/30 rounded-sm text-xs text-success flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{saveSuccess}</span>
          </div>
          <button onClick={() => setSaveSuccess(null)} className="text-success hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {saveError && (
        <div className="p-3 bg-danger-bg border border-danger/30 rounded-sm text-xs text-danger flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{saveError}</span>
          </div>
          <button onClick={() => setSaveError(null)} className="text-danger hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
                <th className="py-2.5 px-3 text-right">Std Pur.</th>
                <th className="py-2.5 px-3 text-right font-semibold text-primary">Landing Cost</th>
                <th className="py-2.5 px-3 text-right">Last Purchase</th>
                <th className="py-2.5 px-3 text-right">Sale Rate</th>
                <th className="py-2.5 px-3 text-right font-medium text-ink">Stock Value</th>
                <th className="py-2.5 px-3 text-right font-medium text-amber-800">Reorder Suggestion</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={16} className="py-8 text-center text-ink-3">
                    Loading inventory...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-8 text-center text-ink-3">
                    No products match the criteria.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const isEditing = editingId === r.productId;

                  if (isEditing) {
                    const parsedOpening = editForm.opening !== "" ? Number(editForm.opening) : 0;
                    const previewClosing =
                      Math.round((parsedOpening + r.purchases - r.sales + r.adjustments) * 100) / 100;
                    const parsedPack = editForm.packSizeKg !== "" ? Number(editForm.packSizeKg) : null;
                    const previewDrums =
                      parsedPack && parsedPack > 0
                        ? Math.round((previewClosing / parsedPack) * 100) / 100
                        : null;
                    const parsedLanding =
                      editForm.landingCost !== "" ? Number(editForm.landingCost) : null;
                    const parsedPurchase =
                      editForm.purchaseRate !== "" ? Number(editForm.purchaseRate) : null;
                    const effRate = parsedLanding || parsedPurchase || 0;
                    const previewStockValue =
                      previewClosing > 0 && effRate > 0 ? previewClosing * effRate : 0;

                    const handleKeyDown = (e: React.KeyboardEvent) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveEdit(r.productId);
                      } else if (e.key === "Escape") {
                        handleCancelEdit();
                      }
                    };

                    return (
                      <tr key={r.productId} className="stock-edit-row bg-primary/5 border-2 border-primary/40">
                        {/* Product Code & Name */}
                        <td className="py-2 px-3">
                          <span className="font-mono font-semibold text-primary block">{r.code}</span>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            onKeyDown={handleKeyDown}
                            className="mt-1 w-full text-xs bg-bg border border-border rounded px-1.5 py-0.5 text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Name"
                          />
                        </td>

                        {/* Opening */}
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="any"
                            value={editForm.opening}
                            onChange={(e) => setEditForm({ ...editForm, opening: e.target.value })}
                            onKeyDown={handleKeyDown}
                            className="w-20 text-right text-xs bg-bg border border-border rounded px-1.5 py-0.5 text-ink num focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Opening"
                          />
                        </td>

                        {/* Purchases (read-only transactions) */}
                        <td className="py-2 px-3 text-right num text-ink-3">{r.purchases}</td>

                        {/* Sales (read-only transactions) */}
                        <td className="py-2 px-3 text-right num text-ink-3">{r.sales}</td>

                        {/* Adjustments (read-only) */}
                        <td className="py-2 px-3 text-right num text-ink-3">{r.adjustments}</td>

                        {/* Closing (computed preview) */}
                        <td className="py-2 px-3 text-right num font-semibold text-primary bg-primary/10">
                          {previewClosing}
                        </td>

                        {/* Pack Size */}
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="any"
                            value={editForm.packSizeKg}
                            onChange={(e) => setEditForm({ ...editForm, packSizeKg: e.target.value })}
                            onKeyDown={handleKeyDown}
                            className="w-16 text-right text-xs bg-bg border border-border rounded px-1.5 py-0.5 text-ink num focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Pack"
                          />
                        </td>

                        {/* Drums (computed preview) */}
                        <td className="py-2 px-3 text-right num text-ink-2">
                          {previewDrums !== null ? previewDrums : "—"}
                        </td>

                        {/* Std Purchase Rate */}
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="any"
                            value={editForm.purchaseRate}
                            onChange={(e) => setEditForm({ ...editForm, purchaseRate: e.target.value })}
                            onKeyDown={handleKeyDown}
                            className="w-20 text-right text-xs bg-bg border border-border rounded px-1.5 py-0.5 text-ink num focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Std Pur"
                          />
                        </td>

                        {/* Landing Cost (highlighted editable) */}
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="any"
                            value={editForm.landingCost}
                            onChange={(e) => setEditForm({ ...editForm, landingCost: e.target.value })}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="w-20 text-right text-xs bg-bg border border-primary rounded px-1.5 py-0.5 text-primary font-medium num focus:outline-none ring-1 ring-primary/40"
                            placeholder="Landing"
                          />
                        </td>

                        {/* Last Purchase (read-only) */}
                        <td className="py-2 px-3 text-right num text-ink-3">
                          {r.lastPurchaseRate ? `₹${r.lastPurchaseRate.toFixed(2)}` : "—"}
                        </td>

                        {/* Std Sale Rate */}
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="any"
                            value={editForm.saleRate}
                            onChange={(e) => setEditForm({ ...editForm, saleRate: e.target.value })}
                            onKeyDown={handleKeyDown}
                            className="w-20 text-right text-xs bg-bg border border-border rounded px-1.5 py-0.5 text-ink num focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Sale Rate"
                          />
                        </td>

                        {/* Stock Value (computed preview) */}
                        <td className="py-2 px-3 text-right num font-medium text-ink">
                          {formatINR(previewStockValue)}
                        </td>

                        {/* Reorder Suggestion */}
                        <td className="py-2 px-3 text-right num text-ink-3">
                          {r.reorderSuggestionKg > 0 ? `${formatKg(r.reorderSuggestionKg)}` : "—"}
                        </td>

                        {/* Status */}
                        <td className="py-2 px-3 text-center">
                          {r.status === "LOW STOCK" ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-danger-bg text-danger border border-danger/30">
                              LOW
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-success-bg text-success border border-success/30">
                              OK
                            </span>
                          )}
                        </td>

                        {/* Actions: Save & Cancel */}
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(r.productId)}
                              disabled={savingId === r.productId}
                              className="p-1.5 rounded bg-success text-primary-fg hover:opacity-90 transition disabled:opacity-50"
                              title="Save changes (Enter)"
                            >
                              {savingId === r.productId ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              disabled={savingId === r.productId}
                              className="p-1.5 rounded bg-surface-2 text-ink-3 hover:text-ink hover:bg-border transition disabled:opacity-50"
                              title="Cancel (Esc)"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={r.productId}
                      className="hover:bg-surface-2/60 transition group cursor-pointer"
                      onDoubleClick={() => handleStartEdit(r)}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-semibold text-primary">{r.code}</span>
                        <span className="text-ink-3 truncate max-w-[140px] block text-[11px]">{r.name}</span>
                      </td>
                      <td
                        onClick={() => handleStartEdit(r)}
                        className="py-2.5 px-3 text-right num text-ink-2 hover:text-primary hover:underline decoration-dotted"
                        title="Click to edit opening stock"
                      >
                        {r.opening}
                      </td>
                      <td className="py-2.5 px-3 text-right num text-ink-2">
                        <div className="group/tip relative inline-block cursor-help">
                          <span className="underline decoration-dotted decoration-ink-3/50">{r.purchases}</span>
                          <div className="hidden group-hover/tip:block absolute bottom-full right-0 mb-1 z-30 w-44 p-2 bg-ink text-surface text-[10px] rounded-xs shadow-md pointer-events-none text-left">
                            <div className="font-semibold border-b border-surface/20 pb-0.5 mb-1 text-surface-2">Purchases Breakdown</div>
                            <div>• {formatKg(r.purchasesFromInvoices)} from invoices</div>
                            <div>• {formatKg(r.purchasesFromLegacy)} from legacy</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right num text-ink-2">{r.sales}</td>
                      <td className="py-2.5 px-3 text-right num text-ink-3">{r.adjustments}</td>
                      <td className="py-2.5 px-3 text-right num font-semibold text-ink bg-surface-2/30">
                        {r.closing}
                      </td>
                      <td
                        onClick={() => handleStartEdit(r)}
                        className="py-2.5 px-3 text-right num text-ink-3 hover:text-primary hover:underline decoration-dotted"
                        title="Click to edit pack size"
                      >
                        {r.packSizeKg || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right num text-ink-2">{r.drums || "—"}</td>
                      <td
                        onClick={() => handleStartEdit(r)}
                        className="py-2.5 px-3 text-right num text-ink-2 hover:text-primary hover:underline decoration-dotted"
                        title="Click to edit standard purchase rate"
                      >
                        {r.purchaseRate ? formatINR(r.purchaseRate) : "—"}
                      </td>
                      {/* Landing Cost right next to Std Pur. */}
                      <td
                        onClick={() => handleStartEdit(r)}
                        className="py-2.5 px-3 text-right num font-medium hover:underline decoration-dotted cursor-pointer"
                        title="Click to edit landing cost"
                      >
                        {r.landingCost !== null && r.landingCost !== undefined ? (
                          <span className="text-primary font-semibold">{formatINR(r.landingCost)}</span>
                        ) : (
                          <span className="text-ink-4 hover:text-primary text-[11px]">+ Add</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right num text-ink-2">
                        {r.lastPurchaseRate ? (
                          <div>
                            <span className="font-medium">₹{r.lastPurchaseRate.toFixed(2)}</span>
                            {r.lastPurchaseDate && (
                              <span className="text-[10px] text-ink-3 block" title={r.lastPurchaseSupplier || ""}>
                                {new Date(r.lastPurchaseDate).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "2-digit",
                                })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-4">—</span>
                        )}
                      </td>
                      <td
                        onClick={() => handleStartEdit(r)}
                        className="py-2.5 px-3 text-right num text-ink-2 hover:text-primary hover:underline decoration-dotted"
                        title="Click to edit standard sale rate"
                      >
                        {r.saleRate ? formatINR(r.saleRate) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right num font-medium text-ink">
                        {formatINR(r.stockValue)}
                      </td>
                      <td className="py-2.5 px-3 text-right num">
                        {r.reorderSuggestionKg > 0 ? (
                          <div>
                            <span className="font-semibold text-amber-700">
                              {formatKg(r.reorderSuggestionKg)}
                            </span>
                            {r.reorderSuggestionDrums > 0 && (
                              <span className="text-[10px] text-ink-3 block">
                                ({r.reorderSuggestionDrums} dr)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-4">—</span>
                        )}
                      </td>
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
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(r)}
                          className="p-1.5 rounded text-ink-3 hover:text-primary hover:bg-surface-2 transition"
                          title="Edit product data, opening stock, rates"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
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
                <td colSpan={6} />
                <td className="py-2.5 px-3 text-right num">{formatINR(totalStockValue)}</td>
                <td colSpan={3} />
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
