"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Upload, Tag, Edit2, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatINR, formatKg } from "@/lib/format";

interface Product {
  id: string;
  code: string;
  name: string;
  category: string | null;
  default_hsn: string | null;
  pack_size_kg: string | null;
  std_purchase_rate: string | null;
  std_sale_rate: string | null;
  reorder_level_kg: string | null;
  is_active: boolean;
  needs_review: boolean;
  aliases: Array<{ id: string; alias: string }>;
  _count?: { invoice_items: number; stock_movements: number };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAliasOpen, setIsAliasOpen] = useState(false);
  const [newAlias, setNewAlias] = useState("");
  const [aliasError, setAliasError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    category: "",
    default_hsn: "",
    pack_size_kg: "",
    std_purchase_rate: "",
    std_sale_rate: "",
    reorder_level_kg: "",
    opening_stock_kg: "",
  });

  const loadProducts = async () => {
    try {
      setLoading(true);
      const url = search ? `/api/products?search=${encodeURIComponent(search)}` : "/api/products";
      const res = await fetch(url);
      const data = await res.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleEditClick = (p: Product) => {
    setSelectedProduct(p);
    setFormData({
      code: p.code,
      name: p.name,
      category: p.category || "",
      default_hsn: p.default_hsn || "",
      pack_size_kg: p.pack_size_kg || "",
      std_purchase_rate: p.std_purchase_rate || "",
      std_sale_rate: p.std_sale_rate || "",
      reorder_level_kg: p.reorder_level_kg || "",
      opening_stock_kg: "",
    });
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    try {
      const res = await fetch(`/api/products/${selectedProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          category: formData.category || null,
          default_hsn: formData.default_hsn || null,
          pack_size_kg: formData.pack_size_kg ? Number(formData.pack_size_kg) : null,
          std_purchase_rate: formData.std_purchase_rate ? Number(formData.std_purchase_rate) : null,
          std_sale_rate: formData.std_sale_rate ? Number(formData.std_sale_rate) : null,
          reorder_level_kg: formData.reorder_level_kg ? Number(formData.reorder_level_kg) : null,
        }),
      });

      if (res.ok) {
        setIsEditOpen(false);
        loadProducts();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsAddOpen(false);
        loadProducts();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to create product");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !newAlias.trim()) return;
    setAliasError(null);

    try {
      const res = await fetch(`/api/products/${selectedProduct.id}/aliases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias: newAlias.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAliasError(data.error?.message || "Failed to add alias");
        return;
      }

      setNewAlias("");
      // Update selected product aliases
      setSelectedProduct({
        ...selectedProduct,
        aliases: [data.alias, ...selectedProduct.aliases],
      });
      loadProducts();
    } catch {
      setAliasError("Failed to add alias");
    }
  };

  const handleDeleteAlias = async (aliasId: string) => {
    if (!selectedProduct) return;
    try {
      await fetch(`/api/products/${selectedProduct.id}/aliases/${aliasId}`, {
        method: "DELETE",
      });
      setSelectedProduct({
        ...selectedProduct,
        aliases: selectedProduct.aliases.filter((a) => a.id !== aliasId),
      });
      loadProducts();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">Products Master</h2>
          <p className="text-xs text-ink-3">Catalogue of chemicals, standard rates, packing sizes and aliases</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/products/import"
            className="h-9 px-3.5 bg-surface border border-border text-ink rounded-sm text-xs font-medium flex items-center gap-2 hover:bg-surface-2 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV/XLSX</span>
          </Link>

          <button
            onClick={() => {
              setFormData({
                code: "",
                name: "",
                category: "",
                default_hsn: "",
                pack_size_kg: "",
                std_purchase_rate: "",
                std_sale_rate: "",
                reorder_level_kg: "",
                opening_stock_kg: "",
              });
              setIsAddOpen(true);
            }}
            className="h-9 px-3.5 bg-primary text-primary-fg rounded-sm text-xs font-medium flex items-center gap-2 hover:opacity-90 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3 bg-surface p-3 border border-border rounded-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, commercial name, or alias..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="text-xs text-ink-3 font-mono">
          {products.length} {products.length === 1 ? "product" : "products"}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3">Commercial Name</th>
                <th className="py-2.5 px-3">HSN</th>
                <th className="py-2.5 px-3 text-right">Pack Size</th>
                <th className="py-2.5 px-3 text-right">Purchase Rate</th>
                <th className="py-2.5 px-3 text-right">Sale Rate</th>
                <th className="py-2.5 px-3 text-right">Reorder Level</th>
                <th className="py-2.5 px-3">Aliases</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-3">
                    Loading products...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-3">
                    No products found.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2/60 transition">
                    <td className="py-2.5 px-3 font-mono font-semibold text-primary">{p.code}</td>
                    <td className="py-2.5 px-3 text-ink">{p.name}</td>
                    <td className="py-2.5 px-3 font-mono text-ink-3">{p.default_hsn || "—"}</td>
                    <td className="py-2.5 px-3 text-right num text-ink-2">
                      {p.pack_size_kg ? `${p.pack_size_kg} kg` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right num font-medium text-ink">
                      {p.std_purchase_rate ? formatINR(Number(p.std_purchase_rate)) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right num font-medium text-ink">
                      {p.std_sale_rate ? formatINR(Number(p.std_sale_rate)) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right num text-ink-3">
                      {p.reorder_level_kg ? `${p.reorder_level_kg} kg` : "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => {
                          setSelectedProduct(p);
                          setNewAlias("");
                          setAliasError(null);
                          setIsAliasOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-surface-2 text-ink-2 hover:bg-border transition text-[11px]"
                      >
                        <Tag className="w-3 h-3 text-accent" />
                        <span>{p.aliases.length}</span>
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleEditClick(p)}
                        className="p-1 text-ink-3 hover:text-ink hover:bg-surface-2 rounded-sm transition"
                        title="Edit product"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg shadow-pop w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-ink mb-4">Edit Product: {selectedProduct.code}</h3>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Commercial Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Default HSN</label>
                  <input
                    type="text"
                    value={formData.default_hsn}
                    onChange={(e) => setFormData({ ...formData, default_hsn: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Pack Size (kg)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.pack_size_kg}
                    onChange={(e) => setFormData({ ...formData, pack_size_kg: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Standard Purchase Rate (₹/kg)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.std_purchase_rate}
                    onChange={(e) => setFormData({ ...formData, std_purchase_rate: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Standard Sale Rate (₹/kg)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.std_sale_rate}
                    onChange={(e) => setFormData({ ...formData, std_sale_rate: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Reorder Level (kg)</label>
                <input
                  type="number"
                  step="any"
                  value={formData.reorder_level_kg}
                  onChange={(e) => setFormData({ ...formData, reorder_level_kg: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-3 py-1.5 rounded-sm border border-border text-xs text-ink-2 hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-sm bg-primary text-primary-fg text-xs font-medium hover:opacity-90"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg shadow-pop w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-ink mb-4">Add New Product</h3>
            <form onSubmit={handleAddProduct} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Product Code *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g. SN-90"
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink font-mono uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Category</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g. Syntans"
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Commercial Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Defaults to code if blank"
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Purchase Rate (₹/kg)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.std_purchase_rate}
                    onChange={(e) => setFormData({ ...formData, std_purchase_rate: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Sale Rate (₹/kg)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.std_sale_rate}
                    onChange={(e) => setFormData({ ...formData, std_sale_rate: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Pack Size (kg)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.pack_size_kg}
                    onChange={(e) => setFormData({ ...formData, pack_size_kg: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-2 mb-1">Opening Stock (kg)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.opening_stock_kg}
                    onChange={(e) => setFormData({ ...formData, opening_stock_kg: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink num"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 rounded-sm border border-border text-xs text-ink-2 hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-sm bg-primary text-primary-fg text-xs font-medium hover:opacity-90"
                >
                  Create Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Aliases Modal */}
      {isAliasOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg shadow-pop w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-ink mb-1">
              Aliases for: <span className="font-mono text-primary">{selectedProduct.code}</span>
            </h3>
            <p className="text-xs text-ink-3 mb-4">
              Names as printed on scanned invoices that automatically map to this product.
            </p>

            <form onSubmit={handleAddAlias} className="flex gap-2 mb-4">
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="e.g. AA ACTOIL 120KG"
                className="flex-1 px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-primary text-primary-fg text-xs font-medium rounded-sm hover:opacity-90 transition"
              >
                Add Alias
              </button>
            </form>

            {aliasError && (
              <p className="text-xs text-danger mb-3 font-medium">✕ {aliasError}</p>
            )}

            <div className="border border-border rounded-sm divide-y divide-border max-h-60 overflow-y-auto">
              {selectedProduct.aliases.length === 0 ? (
                <div className="p-4 text-center text-xs text-ink-3">No aliases configured yet.</div>
              ) : (
                selectedProduct.aliases.map((a) => (
                  <div key={a.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-surface-2">
                    <span className="font-medium text-ink">{a.alias}</span>
                    <button
                      onClick={() => handleDeleteAlias(a.id)}
                      className="text-danger hover:underline text-[11px]"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-4 mt-2">
              <button
                onClick={() => setIsAliasOpen(false)}
                className="px-3.5 py-1.5 rounded-sm bg-surface-2 text-ink text-xs hover:bg-border transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
