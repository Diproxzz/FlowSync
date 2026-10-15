"use client";

import { useEffect, useState } from "react";
import { Plus, Search, GitMerge, Edit2, CheckCircle2, AlertCircle } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  name_norm: string;
  gstin: string | null;
  address: string | null;
  state_code: string | null;
  aliases: Array<{ id: string; alias: string }>;
  _count?: { invoices: number };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [targetCustomerId, setTargetCustomerId] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    gstin: "",
    address: "",
  });

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const url = search ? `/api/customers?search=${encodeURIComponent(search)}` : "/api/customers";
      const res = await fetch(url);
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error?.message || "Failed to create customer" });
        return;
      }

      setIsAddOpen(false);
      loadCustomers();
    } catch {
      setMessage({ type: "error", text: "Failed to connect to server" });
    }
  };

  const handleEditCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setMessage(null);

    try {
      const res = await fetch(`/api/customers/${selectedCustomer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error?.message || "Failed to update customer" });
        return;
      }

      setIsEditOpen(false);
      loadCustomers();
    } catch {
      setMessage({ type: "error", text: "Failed to update customer" });
    }
  };

  const handleMergeCustomers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !targetCustomerId) return;
    setMessage(null);

    try {
      const res = await fetch("/api/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCustomerId: selectedCustomer.id,
          targetCustomerId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error?.message || "Failed to merge customers" });
        return;
      }

      setIsMergeOpen(false);
      setMessage({ type: "success", text: data.message });
      loadCustomers();
    } catch {
      setMessage({ type: "error", text: "Failed to merge customers" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">Customers Directory</h2>
          <p className="text-xs text-ink-3">Tanneries, leather goods manufacturers, GSTIN mappings and aliases</p>
        </div>

        <button
          onClick={() => {
            setFormData({ name: "", gstin: "", address: "" });
            setMessage(null);
            setIsAddOpen(true);
          }}
          className="h-9 px-3.5 bg-primary text-primary-fg rounded-sm text-xs font-medium flex items-center gap-2 hover:opacity-90 transition self-start"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Customer</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-sm text-xs flex items-center gap-2 ${
            message.type === "success"
              ? "bg-success-bg text-success border border-success/30"
              : "bg-danger-bg text-danger border border-danger/30"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3 bg-surface p-3 border border-border rounded-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer name, GSTIN, or alias..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="text-xs text-ink-3 font-mono">
          {customers.length} {customers.length === 1 ? "customer" : "customers"}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                <th className="py-2.5 px-3">Customer Name</th>
                <th className="py-2.5 px-3">GSTIN</th>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3">Address</th>
                <th className="py-2.5 px-3 text-right">Invoices</th>
                <th className="py-2.5 px-3 text-right">Aliases</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-3">
                    Loading customers...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-3">
                    No customers found. Customers are created automatically when sales invoices are confirmed.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/60 transition">
                    <td className="py-2.5 px-3 font-semibold text-ink">{c.name}</td>
                    <td className="py-2.5 px-3 font-mono">
                      {c.gstin ? (
                        <span className="px-1.5 py-0.5 rounded-sm bg-surface-2 text-ink-2 border border-border">
                          {c.gstin}
                        </span>
                      ) : (
                        <span className="text-warning italic text-[11px]">Unregistered</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink-3">{c.state_code || "19"}</td>
                    <td className="py-2.5 px-3 text-ink-3 max-w-xs truncate">{c.address || "—"}</td>
                    <td className="py-2.5 px-3 text-right num text-ink font-medium">
                      {c._count?.invoices ?? 0}
                    </td>
                    <td className="py-2.5 px-3 text-right num text-ink-3">
                      {c.aliases.length}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1">
                      <button
                        onClick={() => {
                          setSelectedCustomer(c);
                          setFormData({
                            name: c.name,
                            gstin: c.gstin || "",
                            address: c.address || "",
                          });
                          setIsEditOpen(true);
                        }}
                        className="p-1 text-ink-3 hover:text-ink hover:bg-surface-2 rounded-sm transition"
                        title="Edit customer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedCustomer(c);
                          setTargetCustomerId("");
                          setIsMergeOpen(true);
                        }}
                        className="p-1 text-ink-3 hover:text-accent hover:bg-surface-2 rounded-sm transition"
                        title="Merge customer"
                      >
                        <GitMerge className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Customer Modal */}
      {isEditOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg shadow-pop w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-ink mb-4">Edit Customer</h3>
            <form onSubmit={handleEditCustomer} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Company / Trade Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">GSTIN</label>
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                  placeholder="15-character GSTIN (e.g. 19AAACR6862N1ZP)"
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink font-mono uppercase"
                  maxLength={15}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
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

      {/* Add Customer Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg shadow-pop w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-ink mb-4">Add New Customer</h3>
            <form onSubmit={handleAddCustomer} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Company / Trade Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Rahman Industries Ltd"
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">GSTIN</label>
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                  placeholder="15-character GSTIN (e.g. 19AAACR6862N1ZP)"
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink font-mono uppercase"
                  maxLength={15}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Billing / Shipping address"
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink"
                />
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
                  Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge Customers Modal */}
      {isMergeOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg shadow-pop w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-ink mb-1">Merge Customer Record</h3>
            <p className="text-xs text-ink-3 mb-4">
              Merge duplicate customer <strong className="text-ink">{selectedCustomer.name}</strong> into another primary customer record.
              All invoices and aliases will be re-assigned.
            </p>

            <form onSubmit={handleMergeCustomers} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Target Customer (Keep this record)</label>
                <select
                  value={targetCustomerId}
                  onChange={(e) => setTargetCustomerId(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-bg border border-border rounded-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">Select target customer...</option>
                  {customers
                    .filter((c) => c.id !== selectedCustomer.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.gstin ? `(${c.gstin})` : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div className="p-3 bg-warning-bg/60 border border-warning/30 rounded-sm text-[11px] text-warning">
                <strong>Warning:</strong> The source record ({selectedCustomer.name}) will be deleted, and its name will be saved as an alias on the target customer so future invoices map automatically.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsMergeOpen(false)}
                  className="px-3 py-1.5 rounded-sm border border-border text-xs text-ink-2 hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!targetCustomerId}
                  className="px-3.5 py-1.5 rounded-sm bg-accent text-primary-fg text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  Confirm Merge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
