"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  GitMerge,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Receipt,
  Package,
  Calendar,
  Building2,
  ChevronRight,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";
import { formatINR, formatKg, formatDate } from "@/lib/format";

interface Supplier {
  id: string;
  name: string;
  name_norm: string;
  gstin: string | null;
  address: string | null;
  state_code: string | null;
  is_active: boolean;
  total_spend: number;
  invoices_count: number;
  aliases: Array<{ id: string; alias: string }>;
  alsoCustomer?: { id: string; name: string } | null;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [targetSupplierId, setTargetSupplierId] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Supplier Detail Drawer state
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailSupplier, setDetailSupplier] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<"invoices" | "products">("invoices");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    gstin: "",
    address: "",
  });

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const url = search ? `/api/suppliers?search=${encodeURIComponent(search)}` : "/api/suppliers";
      const res = await fetch(url);
      const data = await res.json();
      setSuppliers(data.suppliers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search]);

  const handleOpenAdd = () => {
    setFormData({ name: "", gstin: "", address: "" });
    setIsAddOpen(true);
  };

  const handleOpenEdit = (sup: Supplier) => {
    setSelectedSupplier(sup);
    setFormData({
      name: sup.name,
      gstin: sup.gstin || "",
      address: sup.address || "",
    });
    setIsEditOpen(true);
  };

  const handleOpenMerge = (sup: Supplier) => {
    setSelectedSupplier(sup);
    setTargetSupplierId("");
    setIsMergeOpen(true);
  };

  const handleOpenDetail = async (sup: Supplier) => {
    setSelectedSupplier(sup);
    setIsDetailOpen(true);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/suppliers/${sup.id}`);
      const data = await res.json();
      if (data.supplier) {
        setDetailSupplier(data.supplier);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create supplier");
      }
      setIsAddOpen(false);
      setMessage({ type: "success", text: `Supplier '${formData.name}' created successfully.` });
      loadSuppliers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/suppliers/${selectedSupplier.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to update supplier");
      }
      setIsEditOpen(false);
      setMessage({ type: "success", text: `Supplier '${formData.name}' updated successfully.` });
      loadSuppliers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  };

  const handleExecuteMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !targetSupplierId) return;
    setMessage(null);
    try {
      const res = await fetch("/api/suppliers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceSupplierId: selectedSupplier.id,
          targetSupplierId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to merge suppliers");
      }
      setIsMergeOpen(false);
      setMessage({ type: "success", text: data.message });
      loadSuppliers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
              Purchase
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage raw material vendors, purchase history, and product price trends.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition shadow-sm text-sm"
        >
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg flex items-center gap-2 text-sm ${
            message.type === "success"
              ? "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search supplier by name, GSTIN, or alias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Supplier Name</th>
                <th className="px-6 py-3 font-medium">GSTIN / State</th>
                <th className="px-6 py-3 font-medium text-right">Invoices</th>
                <th className="px-6 py-3 font-medium text-right">Total Spend</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    Loading suppliers...
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No suppliers found matching your query.
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-muted/30 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-foreground cursor-pointer hover:underline" onClick={() => handleOpenDetail(sup)}>
                        {sup.name}
                      </div>
                      {sup.aliases && sup.aliases.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Aliases: {sup.aliases.map((a) => a.alias).join(", ")}
                        </div>
                      )}
                      {sup.alsoCustomer && (
                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200">
                          Also a customer
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {sup.gstin ? (
                        <div className="font-mono text-xs text-foreground font-medium">
                          {sup.gstin}
                          {sup.state_code && (
                            <span className="ml-1 text-muted-foreground">({sup.state_code})</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Unregistered</span>
                      )}
                      {sup.address && <div className="text-xs text-muted-foreground truncate max-w-xs">{sup.address}</div>}
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{sup.invoices_count}</td>
                    <td className="px-6 py-4 text-right font-semibold font-mono text-foreground">
                      {formatINR(sup.total_spend)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenDetail(sup)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition"
                        title="View Purchase Details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(sup)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition"
                        title="Edit Supplier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenMerge(sup)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition"
                        title="Merge into another supplier"
                      >
                        <GitMerge className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Supplier Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Add New Supplier</h2>
              <button onClick={() => setIsAddOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAdd} className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Oceanic Solvent Industries"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">GSTIN (Optional)</label>
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                  placeholder="e.g. 24AAAFO4471D1ZN"
                  maxLength={15}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Address (Optional)</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                  placeholder="Registered address or location"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
                  Create Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Supplier Modal */}
      {isEditOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Edit Supplier</h2>
              <button onClick={() => setIsEditOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">GSTIN (Optional)</label>
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                  maxLength={15}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Address (Optional)</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge Supplier Modal */}
      {isMergeOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Merge Supplier</h2>
              <button onClick={() => setIsMergeOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Merge <strong className="text-foreground">{selectedSupplier.name}</strong> into another target supplier. All purchase invoices and aliases will be re-assigned.
            </p>
            <form onSubmit={handleExecuteMerge} className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Target Supplier *</label>
                <select
                  required
                  value={targetSupplierId}
                  onChange={(e) => setTargetSupplierId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">-- Select Target Supplier --</option>
                  {suppliers
                    .filter((s) => s.id !== selectedSupplier.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.gstin ? `(${s.gstin})` : ""}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMergeOpen(false)}
                  className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90">
                  Confirm Merge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {isDetailOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end">
          <div className="bg-card border-l border-border w-full max-w-2xl h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 border-b border-border flex items-start justify-between bg-muted/20">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">{selectedSupplier.name}</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300">
                    Supplier
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>GSTIN: <strong className="font-mono text-foreground">{selectedSupplier.gstin || "Unregistered"}</strong></span>
                  {selectedSupplier.state_code && <span>State: {selectedSupplier.state_code}</span>}
                  <span>Total Spend: <strong className="font-mono text-foreground">{formatINR(selectedSupplier.total_spend)}</strong></span>
                </div>
                {detailSupplier?.alsoCustomer && (
                  <div className="mt-2 text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 p-2 rounded border border-blue-500/20">
                    ℹ️ This supplier shares GSTIN with Customer <strong>{detailSupplier.alsoCustomer.name}</strong>.
                  </div>
                )}
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border px-6">
              <button
                onClick={() => setDetailTab("invoices")}
                className={`py-3 px-4 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
                  detailTab === "invoices"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Receipt className="w-4 h-4" /> Purchase Bills ({detailSupplier?.purchase_invoices?.length || 0})
              </button>
              <button
                onClick={() => setDetailTab("products")}
                className={`py-3 px-4 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
                  detailTab === "products"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingUp className="w-4 h-4" /> Products & Rate Trends ({detailSupplier?.productsBought?.length || 0})
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingDetail ? (
                <div className="py-12 text-center text-muted-foreground">Loading supplier intelligence...</div>
              ) : detailTab === "invoices" ? (
                <div className="space-y-3">
                  {(!detailSupplier?.purchase_invoices || detailSupplier.purchase_invoices.length === 0) ? (
                    <div className="py-8 text-center text-muted-foreground">No purchase invoices recorded yet.</div>
                  ) : (
                    detailSupplier.purchase_invoices.map((inv: any) => (
                      <Link
                        key={inv.id}
                        href={`/purchases/${inv.id}`}
                        className="p-4 rounded-lg border border-border bg-card hover:border-accent hover:bg-muted/30 transition flex items-center justify-between group cursor-pointer block"
                        title={`Open purchase invoice #${inv.supplier_invoice_number}`}
                      >
                        <div>
                          <div className="font-semibold text-foreground flex items-center gap-2 group-hover:text-accent transition">
                            <span className="font-mono">{inv.supplier_invoice_number}</span>
                            <span className="text-xs text-muted-foreground">({formatDate(inv.invoice_date)})</span>
                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent opacity-70 group-hover:opacity-100 transition" />
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {inv.items?.length || 0} items: {inv.items?.map((it: any) => it.product?.name).filter(Boolean).slice(0, 3).join(", ")}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-foreground group-hover:text-accent transition">{formatINR(inv.grand_total)}</div>
                          <div className="text-xs text-muted-foreground">Taxable: {formatINR(inv.taxable_total)}</div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {(!detailSupplier?.productsBought || detailSupplier.productsBought.length === 0) ? (
                    <div className="py-8 text-center text-muted-foreground">No product purchase history available.</div>
                  ) : (
                    detailSupplier.productsBought.map((p: any) => (
                      <div key={p.productId} className="p-4 rounded-lg border border-border bg-card space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-foreground">{p.productName}</div>
                            <div className="text-xs text-muted-foreground font-mono">{p.productCode}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Total Bought</div>
                            <div className="font-bold font-mono">{formatKg(p.totalQtyKg)}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs bg-muted/40 p-2 rounded">
                          <div>Latest Rate: <strong className="font-mono">{formatINR(p.latestRatePerKg)}/kg</strong></div>
                          <div>Avg Cost: <strong className="font-mono">{formatINR(p.avgRatePerKg)}/kg</strong></div>
                          <div>Total Spend: <strong className="font-mono">{formatINR(p.totalSpend)}</strong></div>
                        </div>
                        {p.rates && p.rates.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Recent rates: {p.rates.slice(0, 4).map((r: any) => `${r.date}: ₹${r.ratePerKg}/kg`).join(" | ")}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
