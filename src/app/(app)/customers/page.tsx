"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  BookOpen,
} from "lucide-react";
import { formatINR, formatKg, formatDate } from "@/lib/format";

interface Customer {
  id: string;
  name: string;
  name_norm: string;
  gstin: string | null;
  address: string | null;
  state_code: string | null;
  aliases: Array<{ id: string; alias: string }>;
  ledger_account?: { id: string; display_name: string } | null;
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

  const router = useRouter();

  const handleOpenLedger = async (c: Customer) => {
    if (c.ledger_account?.id) {
      router.push(`/accounts/${c.ledger_account.id}`);
      return;
    }
    try {
      const res = await fetch(`/api/customers/${c.id}`);
      const data = await res.json();
      if (data.customer?.ledgerAccountId) {
        router.push(`/accounts/${data.customer.ledgerAccountId}`);
      } else {
        router.push("/accounts");
      }
    } catch {
      router.push("/accounts");
    }
  };

  // Customer Detail Drawer state (Debtor List & Products Portfolio)
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<"monthly" | "products">("monthly");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleDeleteCustomer = async (c: Customer) => {
    if ((c._count?.invoices ?? 0) > 0) {
      setMessage({
        type: "error",
        text: `Cannot delete customer "${c.name}" because they have ${c._count?.invoices} associated invoice(s). Merge the customer or delete associated invoices first.`,
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete customer "${c.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setMessage(null);
      const res = await fetch(`/api/customers/${c.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error?.message || "Failed to delete customer",
        });
        return;
      }

      setMessage({
        type: "success",
        text: `Customer "${c.name}" deleted successfully.`,
      });
      if (selectedCustomer?.id === c.id) {
        setIsDetailOpen(false);
        setIsEditOpen(false);
        setSelectedCustomer(null);
      }
      loadCustomers();
    } catch {
      setMessage({ type: "error", text: "Failed to connect to server" });
    }
  };

  const handleOpenDetail = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDetailOpen(true);
    setLoadingDetail(true);
    setDetailTab("monthly");
    try {
      const res = await fetch(`/api/customers/${customer.id}`);
      const data = await res.json();
      if (res.ok) {
        setDetailCustomer(data);
      }
    } catch (err) {
      console.error("Failed to load customer details:", err);
    } finally {
      setLoadingDetail(false);
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
                  <tr
                    key={c.id}
                    onClick={() => handleOpenDetail(c)}
                    className="hover:bg-surface-2/80 transition cursor-pointer group"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-ink group-hover:text-primary transition flex items-center gap-1.5">
                        <span>{c.name}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0" />
                      </div>
                    </td>
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
                    <td className="py-2.5 px-3 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleOpenLedger(c)}
                        className="p-1 text-ink-3 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-surface-2 rounded-sm transition"
                        title="View Ledger Statement"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenDetail(c)}
                        className="p-1 text-ink-3 hover:text-primary hover:bg-surface-2 rounded-sm transition"
                        title="View Debtor Breakdown & Products"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                      </button>
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
                      <button
                        onClick={() => handleDeleteCustomer(c)}
                        className="p-1 text-ink-3 hover:text-danger hover:bg-danger-bg rounded-sm transition"
                        title="Delete customer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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

              <div className="flex items-center justify-between pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={() => selectedCustomer && handleDeleteCustomer(selectedCustomer)}
                  className="px-2.5 py-1.5 rounded-sm bg-danger-bg border border-danger/30 text-xs text-danger hover:bg-danger/20 transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Customer</span>
                </button>
                <div className="flex items-center gap-2">
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

      {/* Customer Detail Drawer / Debtor & Products Modal */}
      {isDetailOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-surface border border-border rounded-lg shadow-pop w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-border bg-surface-2/40 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-lg font-bold text-ink tracking-tight flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span>{selectedCustomer.name}</span>
                  </h3>
                  {selectedCustomer.gstin ? (
                    <span className="px-2 py-0.5 rounded-sm bg-primary/10 border border-primary/20 text-primary font-mono text-[11px] font-semibold">
                      GSTIN: {selectedCustomer.gstin}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-sm bg-warning/10 border border-warning/30 text-warning text-[11px] font-medium">
                      Unregistered Customer
                    </span>
                  )}
                  {selectedCustomer.state_code && (
                    <span className="px-1.5 py-0.5 rounded-sm bg-surface border border-border text-ink-3 text-[10px] font-mono">
                      State: {selectedCustomer.state_code}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-3">
                  {selectedCustomer.address || "No postal address recorded"}
                </p>
                {selectedCustomer.aliases && selectedCustomer.aliases.length > 0 && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
                    <span className="font-medium text-ink-2">Known Aliases:</span>
                    <span>{selectedCustomer.aliases.map((a: any) => a.alias).join(", ")}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {detailCustomer?.customer?.ledgerAccountId && (
                  <Link
                    href={`/accounts/${detailCustomer.customer.ledgerAccountId}`}
                    className="px-2.5 py-1.5 rounded-sm bg-surface border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition flex items-center gap-1.5 font-medium"
                    title="View Regular Ledger Statement"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Regular Ledger</span>
                    <ArrowUpRight className="w-3 h-3 opacity-70" />
                  </Link>
                )}
                {detailCustomer?.customer?.informalLedgerAccountId && (
                  <Link
                    href={`/accounts/${detailCustomer.customer.informalLedgerAccountId}`}
                    className="px-2.5 py-1.5 rounded-sm bg-surface border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 transition flex items-center gap-1.5 font-medium"
                    title="View Informal Ledger Statement"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Informal Ledger</span>
                    <ArrowUpRight className="w-3 h-3 opacity-70" />
                  </Link>
                )}
                <button
                  onClick={() => handleDeleteCustomer(selectedCustomer)}
                  className="px-2.5 py-1.5 rounded-sm bg-danger-bg border border-danger/30 text-xs text-danger hover:bg-danger/20 transition flex items-center gap-1.5"
                  title="Delete Customer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
                <Link
                  href={`/invoices?customerId=${encodeURIComponent(selectedCustomer.id)}`}
                  className="px-2.5 py-1.5 rounded-sm bg-surface border border-border text-xs text-ink-2 hover:bg-surface-2 transition flex items-center gap-1.5"
                  title="View all invoices in Invoices directory"
                >
                  <Receipt className="w-3.5 h-3.5 text-primary" />
                  <span>Invoices</span>
                  <ArrowUpRight className="w-3 h-3 text-ink-3" />
                </Link>
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="p-1.5 rounded-sm hover:bg-surface-2 text-ink-3 hover:text-ink transition"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* KPI Stat Cards */}
            <div className="p-5 border-b border-border bg-bg/50 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-sm bg-surface border border-primary/30 shadow-xs">
                <span className="text-[11px] font-medium text-primary block mb-0.5">Total Outstanding (Debtor)</span>
                <span className="text-lg font-bold text-ink num">
                  {loadingDetail ? "..." : formatINR(detailCustomer?.customer?.totalOutstanding || 0)}
                </span>
                <span className="text-[10px] text-ink-3 block mt-0.5">Current pending ledger due</span>
              </div>

              <div className="p-3 rounded-sm bg-surface border border-border shadow-xs">
                <span className="text-[11px] font-medium text-ink-3 block mb-0.5">Total Invoiced</span>
                <span className="text-lg font-bold text-ink num">
                  {loadingDetail ? "..." : formatINR(detailCustomer?.customer?.totalInvoiced ?? detailCustomer?.customer?.totalOutstanding ?? 0)}
                </span>
                <span className="text-[10px] text-ink-3 block mt-0.5">Billed tax invoices value</span>
              </div>

              <div className="p-3 rounded-sm bg-surface border border-border shadow-xs">
                <span className="text-[11px] font-medium text-ink-3 block mb-0.5">Chemicals Purchased</span>
                <span className="text-lg font-bold text-ink num">
                  {loadingDetail ? "..." : formatKg(detailCustomer?.customer?.totalVolumeKg || 0)}
                </span>
                <span className="text-[10px] text-ink-3 block mt-0.5">Total weight delivered</span>
              </div>

              <div className="p-3 rounded-sm bg-surface border border-border shadow-xs">
                <span className="text-[11px] font-medium text-ink-3 block mb-0.5">Products Bought</span>
                <span className="text-lg font-bold text-ink num">
                  {loadingDetail ? "..." : `${detailCustomer?.productsBought?.length || 0} items`}
                </span>
                <span className="text-[10px] text-ink-3 block mt-0.5">Chemical items portfolio</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-5 border-b border-border bg-surface flex items-center justify-between">
              <div className="flex gap-4">
                <button
                  onClick={() => setDetailTab("monthly")}
                  className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition ${
                    detailTab === "monthly"
                      ? "border-primary text-primary"
                      : "border-transparent text-ink-3 hover:text-ink"
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Monthly Outstanding (Debtor List)</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-2 border border-border text-ink-2">
                    {detailCustomer?.monthlyBreakdown?.length || 0} mos
                  </span>
                </button>

                <button
                  onClick={() => setDetailTab("products")}
                  className={`py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition ${
                    detailTab === "products"
                      ? "border-primary text-primary"
                      : "border-transparent text-ink-3 hover:text-ink"
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Products Bought Portfolio</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-2 border border-border text-ink-2">
                    {detailCustomer?.productsBought?.length || 0}
                  </span>
                </button>
              </div>
            </div>

            {/* Tab Contents */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {loadingDetail ? (
                <div className="py-16 text-center text-ink-3 text-xs flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span>Loading customer debtor & purchase history...</span>
                </div>
              ) : detailTab === "monthly" ? (
                /* Monthly Outstanding Debtor List */
                detailCustomer?.monthlyBreakdown?.length === 0 ? (
                  <div className="p-8 text-center text-xs text-ink-3 bg-surface-2/40 border border-border rounded-sm">
                    No billing history or invoices found for this customer.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {detailCustomer?.monthlyBreakdown?.map((month: any) => (
                      <div
                        key={month.monthKey}
                        className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs"
                      >
                        {/* Month Header Banner */}
                        <div className="p-3 bg-surface-2/70 border-b border-border flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-accent" />
                            <span className="font-bold text-xs text-ink">{month.monthLabel}</span>
                            <span className="text-[11px] text-ink-3">
                              ({month.invoicesCount} invoice{month.invoicesCount === 1 ? "" : "s"})
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <span className="text-[11px] text-ink-3 mr-1.5 font-mono">Billed:</span>
                              <span className="text-xs font-semibold text-ink font-mono">
                                {formatINR(month.grandTotal)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] text-ink-3 mr-1.5 font-mono">Outstanding:</span>
                              <span className="text-xs font-bold text-primary font-mono">
                                {formatINR(month.outstandingTotal ?? 0)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Invoices Table for this Month */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-bg/40 text-ink-3 text-[11px] border-b border-border font-medium">
                                <th className="py-2 px-3">Invoice No.</th>
                                <th className="py-2 px-3">Date</th>
                                <th className="py-2 px-3">Products Included</th>
                                <th className="py-2 px-3 text-right">Taxable</th>
                                <th className="py-2 px-3 text-right">Invoice Value</th>
                                <th className="py-2 px-3 text-right">Outstanding</th>
                                <th className="py-2 px-3 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {month.invoices.map((inv: any) => (
                                <tr key={inv.id} className="hover:bg-surface-2/40 transition">
                                  <td className="py-2 px-3">
                                    {inv.isInformal ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold font-mono">
                                          INF
                                        </span>
                                        <Link
                                          href={`/informal-invoices?search=${encodeURIComponent(inv.invoiceNumber)}`}
                                          className="hover:underline flex items-center gap-1 group font-mono font-semibold text-amber-600 dark:text-amber-400"
                                        >
                                          <span>{inv.invoiceNumber}</span>
                                          <ExternalLink className="w-3 h-3 opacity-70 group-hover:opacity-100 transition" />
                                        </Link>
                                      </div>
                                    ) : (
                                      <Link
                                        href={`/invoices/${inv.id}`}
                                        className="hover:underline flex items-center gap-1 group font-mono font-semibold text-primary"
                                        title={`Open invoice #${inv.invoiceNumber}`}
                                      >
                                        <span>{inv.invoiceNumber}</span>
                                        <ExternalLink className="w-3 h-3 text-ink-3 group-hover:text-primary transition" />
                                      </Link>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-ink-2 font-mono">{formatDate(inv.invoiceDate)}</td>
                                  <td className="py-2 px-3 text-ink-3 text-[11px] max-w-sm truncate" title={inv.itemsSummary}>
                                    {inv.itemsSummary || "—"}
                                  </td>
                                  <td className="py-2 px-3 text-right num text-ink-2">
                                    {formatINR(inv.taxableTotal)}
                                  </td>
                                  <td className="py-2 px-3 text-right num font-medium text-ink">
                                    {formatINR(inv.grandTotal)}
                                  </td>
                                  <td className="py-2 px-3 text-right num font-bold text-foreground">
                                    {formatINR(inv.outstandingAmount ?? 0)}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {inv.status === "SETTLED" ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                        Settled
                                      </span>
                                    ) : inv.status === "PARTIAL" ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                        Part Paid
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                                        Open
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                /* Products Bought Portfolio */
                detailCustomer?.productsBought?.length === 0 ? (
                  <div className="p-8 text-center text-xs text-ink-3 bg-surface-2/40 border border-border rounded-sm">
                    No chemical purchases recorded for this customer yet.
                  </div>
                ) : (
                  <div className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                            <th className="py-2.5 px-3">Chemical Product</th>
                            <th className="py-2.5 px-3 text-right">Total Quantity (kg)</th>
                            <th className="py-2.5 px-3 text-right">Last Purchase Rate</th>
                            <th className="py-2.5 px-3 text-right">Avg Rate</th>
                            <th className="py-2.5 px-3 text-right">Total Spend (₹)</th>
                            <th className="py-2.5 px-3 text-right">Last Purchase Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {detailCustomer?.productsBought?.map((prod: any) => (
                            <tr key={prod.productId} className="hover:bg-surface-2/40 transition">
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-ink">{prod.name}</div>
                                <div className="text-[10px] text-ink-3 font-mono">Code: {prod.code}</div>
                              </td>
                              <td className="py-2.5 px-3 text-right num font-semibold text-ink">
                                {formatKg(prod.totalQtyKg)}
                              </td>
                              <td className="py-2.5 px-3 text-right num font-mono text-ink-2">
                                {formatINR(prod.lastRate)} / kg
                              </td>
                              <td className="py-2.5 px-3 text-right num font-mono text-ink-3">
                                {formatINR(prod.avgRate)} / kg
                              </td>
                              <td className="py-2.5 px-3 text-right num font-bold text-primary">
                                {formatINR(prod.totalAmount)}
                              </td>
                              <td className="py-2.5 px-3 text-right num text-ink-3 font-mono">
                                {formatDate(prod.lastDate)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-surface-2/30 flex items-center justify-between">
              <div className="text-xs text-ink-3">
                Debtor Tracker · Month-by-month reconciliation
              </div>
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-1.5 rounded-sm bg-surface border border-border text-ink text-xs font-medium hover:bg-surface-2 transition"
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
