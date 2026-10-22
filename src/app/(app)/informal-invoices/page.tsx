"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Eye,
  Trash2,
  FileSignature,
  RotateCcw,
  BookOpen,
  ArrowUpRight,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Package,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { formatINR, formatDate, formatKg } from "@/lib/format";
import { NewInformalInvoiceModal } from "@/components/informal-invoices/NewInformalInvoiceModal";
import { ViewInformalInvoiceModal } from "@/components/informal-invoices/ViewInformalInvoiceModal";

interface InformalInvoiceItem {
  id: string;
  product_name_raw: string;
  qty_kg: string;
  rate: string;
  amount: string;
  product?: { id: string; code: string; name: string } | null;
}

interface InformalInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  financial_year: string;
  customer_name_snapshot: string;
  total_amount: string;
  notes: string | null;
  customer?: { id: string; name: string } | null;
  items: InformalInvoiceItem[];
  ledger_entry?: { id: string; account_id: string } | null;
}

export default function InformalInvoicesPage() {
  const [invoices, setInvoices] = useState<InformalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [financialYear, setFinancialYear] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalValue, setTotalValue] = useState(0);

  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InformalInvoice | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "25");
      if (search.trim()) params.set("search", search.trim());
      if (financialYear) params.set("financialYear", financialYear);

      const res = await fetch(`/api/informal-invoices?${params.toString()}`);
      const data = await res.json();

      if (res.ok) {
        setInvoices(data.invoices || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.summary?.totalInvoices || 0);
        setTotalValue(data.summary?.totalValue || 0);
      }
    } catch (err) {
      console.error("Failed to load informal invoices:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, financialYear]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleDelete = async (inv: InformalInvoice) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete Informal Invoice ${inv.invoice_number} for ${inv.customer_name_snapshot}? This will automatically reverse its stock movements and ledger balance.`
    );
    if (!confirmed) return;

    try {
      setIsDeletingId(inv.id);
      const res = await fetch(`/api/informal-invoices/${inv.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to delete informal invoice.");
      }
      fetchInvoices();
    } catch (err: any) {
      alert(err.message || "Failed to delete.");
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <FileSignature className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>Informal Invoices</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Non-GST
                </span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fast entry for non-GST sales mapped to individual customer informal ledgers and inventory
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Informal Invoice</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-[11px] font-medium text-muted-foreground block mb-0.5">
            Total Informal Sales
          </span>
          <span className="text-xl font-bold font-mono text-foreground">
            {formatINR(totalValue)}
          </span>
          <span className="text-[10px] text-muted-foreground block mt-0.5">
            Strictly 0% GST (Non-Taxable)
          </span>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-[11px] font-medium text-muted-foreground block mb-0.5">
            Total Invoices
          </span>
          <span className="text-xl font-bold font-mono text-foreground">
            {totalCount}
          </span>
          <span className="text-[10px] text-muted-foreground block mt-0.5">
            Recorded informal transactions
          </span>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block mb-0.5">
            Inventory Linked
          </span>
          <span className="text-xl font-bold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>Active</span>
          </span>
          <span className="text-[10px] text-muted-foreground block mt-0.5">
            Stock Summary automatically updated
          </span>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 block mb-0.5">
            Party Ledger
          </span>
          <span className="text-xl font-bold text-foreground flex items-center gap-1.5">
            <BookOpen className="w-5 h-5 text-amber-600" />
            <span>Separate</span>
          </span>
          <span className="text-[10px] text-muted-foreground block mt-0.5">
            Dedicated customer informal accounts
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-3 bg-card border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search invoice #, customer name, or product..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={financialYear}
            onChange={(e) => {
              setFinancialYear(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none"
          >
            <option value="">All Financial Years</option>
            <option value="2026-27">FY 2026-27</option>
            <option value="2025-26">FY 2025-26</option>
          </select>

          {(search || financialYear) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFinancialYear("");
                setPage(1);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              <th className="py-2.5 px-3 min-w-[100px]">Date</th>
              <th className="py-2.5 px-3 min-w-[120px]">Invoice #</th>
              <th className="py-2.5 px-3 min-w-[200px]">Customer</th>
              <th className="py-2.5 px-3 min-w-[220px]">Products Sold</th>
              <th className="py-2.5 px-3 text-right min-w-[130px]">Total Value (₹)</th>
              <th className="py-2.5 px-3 text-center min-w-[130px]">Informal Ledger</th>
              <th className="py-2.5 px-3 text-center w-20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground text-xs">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Loading informal invoices...</span>
                  </div>
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-muted-foreground text-xs">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileSignature className="w-8 h-8 text-muted-foreground/40" />
                    <span className="font-semibold text-foreground text-sm">No Informal Invoices Found</span>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Record fast, non-GST sales transactions mapped directly to customer informal ledgers and stock inventory.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsNewModalOpen(true)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create First Informal Invoice</span>
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              invoices.map((inv, idx) => {
                const totalKg = inv.items.reduce((acc, it) => acc + Number(it.qty_kg), 0);
                const itemsSummary = inv.items
                  .map((it) => `${it.product?.name || it.product_name_raw} (${Number(it.qty_kg)} kg)`)
                  .join(", ");
                const ledgerAccountId = inv.ledger_entry?.account_id;

                return (
                  <tr key={inv.id} className="hover:bg-muted/30 transition group">
                    <td className="py-2.5 px-3 text-center text-muted-foreground font-mono text-[11px]">
                      {(page - 1) * 25 + idx + 1}
                    </td>

                    {/* Date */}
                    <td className="py-2.5 px-3 font-mono text-muted-foreground whitespace-nowrap">
                      {formatDate(inv.invoice_date)}
                    </td>

                    {/* Invoice # */}
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => setSelectedInvoice(inv)}
                        className="font-mono font-bold text-foreground hover:text-primary hover:underline text-left"
                      >
                        {inv.invoice_number}
                      </button>
                    </td>

                    {/* Customer */}
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{inv.customer_name_snapshot}</span>
                      </div>
                    </td>

                    {/* Products Sold */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[240px] text-foreground" title={itemsSummary}>
                          {itemsSummary}
                        </span>
                        {inv.items.length > 1 && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-muted border border-border text-muted-foreground font-mono shrink-0">
                            +{inv.items.length - 1}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono block">
                        Weight: {formatKg(totalKg)}
                      </span>
                    </td>

                    {/* Total Value */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                      {formatINR(Number(inv.total_amount))}
                    </td>

                    {/* Ledger Status */}
                    <td className="py-2.5 px-3 text-center">
                      {ledgerAccountId ? (
                        <Link
                          href={`/accounts/${ledgerAccountId}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition"
                          title="Open Customer Informal Ledger"
                        >
                          <BookOpen className="w-3 h-3" />
                          <span>Posted</span>
                          <ArrowUpRight className="w-2.5 h-2.5 opacity-70" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoice(inv)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(inv)}
                          disabled={isDeletingId === inv.id}
                          className="p-1 rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition disabled:opacity-50"
                          title="Delete Invoice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-border bg-card flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages} ({totalCount} total invoices)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <NewInformalInvoiceModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSuccess={() => {
          setIsNewModalOpen(false);
          fetchInvoices();
        }}
      />

      <ViewInformalInvoiceModal
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
    </div>
  );
}
