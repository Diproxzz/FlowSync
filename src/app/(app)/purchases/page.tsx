"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Eye,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Plus,
  ShoppingCart,
  Receipt,
} from "lucide-react";
import { formatINR, formatDate } from "@/lib/format";

interface PurchaseInvoiceItem {
  id: string;
  product_name_raw: string;
  qty_printed: string;
  unit_printed: string;
  qty_kg: string;
  rate: string;
  rate_per_kg: string;
  taxable_amount: string;
  line_total: string | null;
  product: { id: string; name: string; code: string };
}

interface PurchaseInvoiceRecord {
  id: string;
  supplier_invoice_number: string;
  invoice_date: string;
  received_date: string | null;
  financial_year: string;
  supplier_name_snapshot: string;
  supplier_gstin_snapshot: string | null;
  taxable_total: string;
  cgst_total: string;
  sgst_total: string;
  igst_total: string;
  other_charges: string;
  tcs: string;
  round_off: string;
  grand_total: string;
  source_file_key: string | null;
  version: number;
  supplier: { id: string; name: string; gstin: string | null };
  items: PurchaseInvoiceItem[];
}

interface SupplierOption {
  id: string;
  name: string;
}

function PurchasesListContent() {
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<PurchaseInvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  // Search & Sorting
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [sortBy, setSortBy] = useState<"date" | "number" | "supplier" | "taxable" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filtering
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(() => searchParams.get("supplierId") || "");
  const [financialYear, setFinancialYear] = useState(() => searchParams.get("financialYear") || "");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  useEffect(() => {
    fetch("/api/suppliers")
      .then((res) => res.json())
      .then((data) => {
        if (data.suppliers) {
          setSuppliers(data.suppliers.map((s: any) => ({ id: s.id, name: s.name })));
        }
      })
      .catch((err) => console.error("Error loading suppliers:", err));
  }, []);

  const activeFilterCount = [
    supplierId,
    financialYear,
    fromDate,
    toDate,
    minAmount,
    maxAmount,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSupplierId("");
    setFinancialYear("");
    setFromDate("");
    setToDate("");
    setMinAmount("");
    setMaxAmount("");
    setPage(1);
  };

  const loadPurchases = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (supplierId) params.set("supplierId", supplierId);
      if (financialYear) params.set("financialYear", financialYear);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (minAmount) params.set("minAmount", minAmount);
      if (maxAmount) params.set("maxAmount", maxAmount);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("page", page.toString());
      params.set("limit", "50");

      const res = await fetch(`/api/purchases?${params.toString()}`);
      const data = await res.json();
      setInvoices(data.invoices || []);
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.pages || 1);
    } catch (err) {
      console.error("Error loading purchases:", err);
    } finally {
      setLoading(false);
    }
  }, [search, supplierId, financialYear, fromDate, toDate, minAmount, maxAmount, sortBy, sortOrder, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPurchases();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadPurchases]);

  const handleSort = (column: "date" | "number" | "supplier" | "taxable" | "amount") => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const handleDelete = async (id: string, number: string, supplierName: string) => {
    if (
      !confirm(
        `Are you sure you want to delete purchase invoice ${number} from ${supplierName}? This will deduct the purchased stock from your inventory.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        if (data.negativeStockWarning) {
          alert(`Invoice deleted. Note: Stock for some products has dropped below zero.`);
        }
        loadPurchases();
      } else {
        alert(data.error?.message || "Failed to delete purchase invoice");
      }
    } catch (err) {
      console.error("Failed to delete purchase invoice:", err);
    }
  };

  const renderSortIcon = (column: "date" | "number" | "supplier" | "taxable" | "amount") => {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-3 h-3 text-ink-3/50 group-hover:text-ink-3 transition" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3 h-3 text-accent" />
    ) : (
      <ArrowDown className="w-3 h-3 text-accent" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-ink tracking-tight">Purchase Invoices</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#F4E6D7] dark:bg-[#3A2A1C] text-accent">
              Purchase
            </span>
            <span className="text-xs px-2 py-0.5 rounded-sm bg-surface-2 border border-border text-ink-2 font-mono">
              {total} bills
            </span>
          </div>
          <p className="text-xs text-ink-3 mt-0.5">
            Manage vendor bills, incoming material stock movements, and tax credits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/upload?type=purchase"
            className="px-3.5 py-1.5 bg-accent text-accent-fg rounded-sm text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload Purchase Bill</span>
          </Link>
        </div>
      </div>

      {/* Control Bar: Search & Filters */}
      <div className="bg-surface border border-border rounded-sm p-3 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by invoice number, supplier name, or GSTIN..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink max-w-[180px] truncate focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={financialYear}
              onChange={(e) => {
                setFinancialYear(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">All FY</option>
              <option value="2026-27">2026-27</option>
              <option value="2025-26">2025-26</option>
              <option value="2024-25">2024-25</option>
            </select>

            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`px-3 py-1.5 text-xs rounded-sm border transition flex items-center gap-1.5 font-medium ${
                isFilterOpen || activeFilterCount > 0
                  ? "bg-accent/10 border-accent text-accent"
                  : "bg-bg border-border text-ink hover:bg-surface-2"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-accent text-accent-fg text-[10px] flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Extended Filter Panel */}
        {isFilterOpen && (
          <div className="pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs animate-in fade-in">
            <div>
              <label className="block text-[11px] text-ink-3 mb-1 font-medium">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 bg-bg border border-border rounded-sm text-ink font-mono text-xs focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] text-ink-3 mb-1 font-medium">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 bg-bg border border-border rounded-sm text-ink font-mono text-xs focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] text-ink-3 mb-1 font-medium">Min Amount (₹)</label>
              <input
                type="number"
                placeholder="Min total"
                value={minAmount}
                onChange={(e) => {
                  setMinAmount(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 bg-bg border border-border rounded-sm text-ink font-mono text-xs focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] text-ink-3 mb-1 font-medium">Max Amount (₹)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Max total"
                  value={maxAmount}
                  onChange={(e) => {
                    setMaxAmount(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-bg border border-border rounded-sm text-ink font-mono text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {activeFilterCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className="p-1.5 text-ink-3 hover:text-danger rounded-sm transition flex-shrink-0"
                    title="Reset filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invoices Table */}
      <div className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                <th
                  onClick={() => handleSort("date")}
                  className="py-2.5 px-3 cursor-pointer select-none group min-w-[100px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date</span>
                    {renderSortIcon("date")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("number")}
                  className="py-2.5 px-3 cursor-pointer select-none group min-w-[120px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Invoice #</span>
                    {renderSortIcon("number")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("supplier")}
                  className="py-2.5 px-3 cursor-pointer select-none group min-w-[180px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Supplier</span>
                    {renderSortIcon("supplier")}
                  </div>
                </th>
                <th className="py-2.5 px-3 text-center min-w-[80px]">Tax Type</th>
                <th
                  onClick={() => handleSort("taxable")}
                  className="py-2.5 px-3 text-right cursor-pointer select-none group min-w-[110px]"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Taxable</span>
                    {renderSortIcon("taxable")}
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right min-w-[100px]">Taxes</th>
                <th className="py-2.5 px-3 text-right min-w-[90px]">Other/TCS</th>
                <th
                  onClick={() => handleSort("amount")}
                  className="py-2.5 px-3 text-right cursor-pointer select-none group min-w-[120px]"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Grand Total</span>
                    {renderSortIcon("amount")}
                  </div>
                </th>
                <th className="py-2.5 px-3 text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-ink-3">
                    Loading purchase invoices...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-ink-3">
                    No purchase invoices found matching your criteria.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const isIgst = Number(inv.igst_total) > 0;
                  const taxAmount = isIgst
                    ? Number(inv.igst_total)
                    : Number(inv.cgst_total) + Number(inv.sgst_total);
                  const otherAmt = Number(inv.other_charges) + Number(inv.tcs);

                  return (
                    <tr key={inv.id} className="hover:bg-surface-2/40 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-mono text-ink font-medium">
                          {formatDate(inv.invoice_date)}
                        </div>
                        {inv.received_date && (
                          <div className="text-[10px] text-ink-3 font-mono">
                            Rec: {formatDate(inv.received_date)}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <Link
                          href={`/purchases/${inv.id}`}
                          className="font-mono font-semibold text-accent hover:underline flex items-center gap-1.5"
                        >
                          <span>{inv.supplier_invoice_number}</span>
                          {inv.version > 1 && (
                            <span className="text-[10px] px-1 py-0.2 rounded-xs bg-surface-2 border border-border text-ink-3">
                              v{inv.version}
                            </span>
                          )}
                        </Link>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-medium text-ink truncate max-w-[220px]">
                          {inv.supplier_name_snapshot}
                        </div>
                        {inv.supplier_gstin_snapshot && (
                          <div className="text-[10px] text-ink-3 font-mono">
                            {inv.supplier_gstin_snapshot}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {isIgst ? (
                          <span className="px-1.5 py-0.5 rounded-xs bg-primary/10 text-primary font-mono text-[10px] font-semibold">
                            IGST
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-xs bg-surface-2 text-ink-2 font-mono text-[10px] font-semibold border border-border">
                            CGST+SGST
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-ink">
                        {formatINR(Number(inv.taxable_total))}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-ink-2">
                        {formatINR(taxAmount)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-ink-3">
                        {otherAmt > 0 ? formatINR(otherAmt) : "—"}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                        {formatINR(Number(inv.grand_total))}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/purchases/${inv.id}`}
                            className="p-1 text-ink-3 hover:text-accent rounded-sm transition"
                            title="View purchase details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() =>
                              handleDelete(
                                inv.id,
                                inv.supplier_invoice_number,
                                inv.supplier_name_snapshot
                              )
                            }
                            className="p-1 text-ink-3 hover:text-danger rounded-sm transition"
                            title="Delete purchase invoice"
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
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 bg-surface-2 border-t border-border flex items-center justify-between text-xs text-ink-2">
            <span>
              Showing {invoices.length} of {total} purchases
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="p-1 border border-border rounded-sm hover:bg-surface disabled:opacity-30 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono px-2">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="p-1 border border-border rounded-sm hover:bg-surface disabled:opacity-30 transition"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-ink-3">Loading purchases...</div>}>
      <PurchasesListContent />
    </Suspense>
  );
}
