"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Eye,
  Trash2,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatINR, formatDate } from "@/lib/format";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  financial_year: string;
  customer_name_snapshot: string;
  customer_gstin_snapshot: string | null;
  taxable_total: string;
  cgst_total: string;
  sgst_total: string;
  grand_total: string;
  source_file_key: string | null;
  items: Array<{ id: string; product_name_raw: string; qty_kg: string; line_total: string }>;
  customer: { id: string; name: string; gstin: string | null };
}

interface CustomerOption {
  id: string;
  name: string;
}

export default function InvoicesListPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  // Search & Sorting
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "number" | "customer" | "taxable" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filtering
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [financialYear, setFinancialYear] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  // Customers for filter dropdown
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  // Load customer options once
  useEffect(() => {
    fetch("/api/customers")
      .then((res) => res.json())
      .then((data) => {
        if (data.customers) {
          setCustomers(data.customers.map((c: any) => ({ id: c.id, name: c.name })));
        }
      })
      .catch((err) => console.error("Error loading customers:", err));
  }, []);

  const activeFilterCount = [
    customerId,
    financialYear,
    fromDate,
    toDate,
    minAmount,
    maxAmount,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setCustomerId("");
    setFinancialYear("");
    setFromDate("");
    setToDate("");
    setMinAmount("");
    setMaxAmount("");
    setPage(1);
  };

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (customerId) params.set("customerId", customerId);
      if (financialYear) params.set("financialYear", financialYear);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (minAmount) params.set("minAmount", minAmount);
      if (maxAmount) params.set("maxAmount", maxAmount);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("page", page.toString());
      params.set("limit", "50");

      const res = await fetch(`/api/invoices?${params.toString()}`);
      const data = await res.json();
      setInvoices(data.invoices || []);
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.pages || 1);
    } catch (err) {
      console.error("Error loading invoices:", err);
    } finally {
      setLoading(false);
    }
  }, [search, customerId, financialYear, fromDate, toDate, minAmount, maxAmount, sortBy, sortOrder, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInvoices();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadInvoices]);

  const handleSort = (column: "date" | "number" | "customer" | "taxable" | "amount") => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const handleDelete = async (id: string, number: string) => {
    if (
      !confirm(
        `Are you sure you want to delete invoice ${number}? This will also reverse all associated stock movements.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadInvoices();
      } else {
        alert("Failed to delete invoice");
      }
    } catch (err) {
      console.error("Failed to delete invoice:", err);
    }
  };

  const renderSortIcon = (column: "date" | "number" | "customer" | "taxable" | "amount") => {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-3 h-3 text-ink-3/50 group-hover:text-ink-3 transition" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-primary" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-primary" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">Invoices</h2>
          <p className="text-xs text-ink-3">
            Saved sales tax invoices, GST breakdowns, and linked inventory lines
          </p>
        </div>

        <Link
          href="/upload"
          className="h-9 px-3.5 bg-primary text-primary-fg rounded-sm text-xs font-semibold flex items-center gap-2 hover:opacity-90 transition self-start"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Upload Invoice</span>
        </Link>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5 bg-surface p-3 border border-border rounded-sm">
          {/* Search box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search invoice number, buyer, or GSTIN..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Sort Dropdown */}
          <div className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className="text-ink-3">Sort:</span>
            <select
              value={`${sortBy}_${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split("_");
                setSortBy(sb as any);
                setSortOrder(so as any);
                setPage(1);
              }}
              className="bg-bg border border-border rounded-sm px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="date_desc">Date (Newest first)</option>
              <option value="date_asc">Date (Oldest first)</option>
              <option value="number_asc">Invoice No (A → Z)</option>
              <option value="number_desc">Invoice No (Z → A)</option>
              <option value="customer_asc">Customer (A → Z)</option>
              <option value="customer_desc">Customer (Z → A)</option>
              <option value="amount_desc">Total Amount (High → Low)</option>
              <option value="amount_asc">Total Amount (Low → High)</option>
            </select>
          </div>

          {/* Filter Toggle Button */}
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`h-8 px-3 rounded-sm text-xs font-medium flex items-center gap-1.5 border transition ${
              isFilterOpen || activeFilterCount > 0
                ? "bg-primary/10 border-primary text-primary"
                : "bg-surface border-border text-ink-2 hover:bg-surface-2"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.2 bg-primary text-primary-fg text-[10px] font-bold rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Reset Filters */}
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="h-8 px-2.5 rounded-sm text-xs text-ink-3 hover:text-ink flex items-center gap-1 transition"
              title="Reset all filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          {/* Count Badge */}
          <div className="ml-auto text-xs text-ink-3 font-mono">
            {total} {total === 1 ? "invoice" : "invoices"}
          </div>
        </div>

        {/* Collapsible Filter Panel */}
        {isFilterOpen && (
          <div className="bg-surface border border-border rounded-sm p-4 text-xs space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="font-semibold text-ink flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-primary" /> Filter Invoices
              </span>
              <button
                onClick={() => setIsFilterOpen(false)}
                className="text-ink-3 hover:text-ink p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Customer Filter */}
              <div>
                <label className="block text-ink-3 text-[11px] font-medium mb-1">
                  Customer / Buyer
                </label>
                <select
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All Customers</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Financial Year Filter */}
              <div>
                <label className="block text-ink-3 text-[11px] font-medium mb-1">
                  Financial Year
                </label>
                <select
                  value={financialYear}
                  onChange={(e) => {
                    setFinancialYear(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All Years</option>
                  <option value="2026-27">2026-27</option>
                  <option value="2025-26">2025-26</option>
                  <option value="2024-25">2024-25</option>
                  <option value="2023-24">2023-24</option>
                </select>
              </div>

              {/* From Date */}
              <div>
                <label className="block text-ink-3 text-[11px] font-medium mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* To Date */}
              <div>
                <label className="block text-ink-3 text-[11px] font-medium mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Min Grand Total */}
              <div>
                <label className="block text-ink-3 text-[11px] font-medium mb-1">
                  Min Amount (₹)
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={minAmount}
                  onChange={(e) => {
                    setMinAmount(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Max Grand Total */}
              <div>
                <label className="block text-ink-3 text-[11px] font-medium mb-1">
                  Max Amount (₹)
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={maxAmount}
                  onChange={(e) => {
                    setMaxAmount(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-bg border border-border rounded-sm px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border select-none">
                <th
                  onClick={() => handleSort("number")}
                  className="py-2.5 px-3 cursor-pointer hover:text-ink transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Invoice No.</span>
                    {renderSortIcon("number")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("date")}
                  className="py-2.5 px-3 cursor-pointer hover:text-ink transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date</span>
                    {renderSortIcon("date")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("customer")}
                  className="py-2.5 px-3 cursor-pointer hover:text-ink transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Customer / Buyer</span>
                    {renderSortIcon("customer")}
                  </div>
                </th>
                <th className="py-2.5 px-3">Customer GSTIN</th>
                <th
                  onClick={() => handleSort("taxable")}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-ink transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Taxable Subtotal</span>
                    {renderSortIcon("taxable")}
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right">CGST</th>
                <th className="py-2.5 px-3 text-right">SGST</th>
                <th
                  onClick={() => handleSort("amount")}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-ink transition group font-semibold text-ink"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Grand Total</span>
                    {renderSortIcon("amount")}
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-3">
                    Loading invoices...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-3">
                    {search || activeFilterCount > 0 ? (
                      <div className="space-y-1">
                        <p>No invoices match the current search or filters.</p>
                        <button
                          onClick={() => {
                            setSearch("");
                            resetFilters();
                          }}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          Clear all filters
                        </button>
                      </div>
                    ) : (
                      "No invoices recorded yet. Click 'Upload Invoice' to scan and save your first sales invoice."
                    )}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-2/60 transition">
                    <td className="py-2.5 px-3 font-mono font-semibold text-primary">
                      <Link href={`/invoices/${inv.id}`} className="hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink-2">
                      {formatDate(inv.invoice_date)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-ink">
                      {inv.customer_name_snapshot}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink-3">
                      {inv.customer_gstin_snapshot || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right num text-ink-2">
                      {formatINR(Number(inv.taxable_total))}
                    </td>
                    <td className="py-2.5 px-3 text-right num text-ink-3">
                      {formatINR(Number(inv.cgst_total))}
                    </td>
                    <td className="py-2.5 px-3 text-right num text-ink-3">
                      {formatINR(Number(inv.sgst_total))}
                    </td>
                    <td className="py-2.5 px-3 text-right num font-semibold text-ink">
                      {formatINR(Number(inv.grand_total))}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="p-1 text-ink-3 hover:text-ink inline-block"
                        title="View details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDelete(inv.id, inv.invoice_number)}
                        className="p-1 text-ink-3 hover:text-danger inline-block"
                        title="Delete invoice"
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

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2.5 border-t border-border bg-surface-2/50 text-xs">
            <span className="text-ink-3">
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 rounded-sm border border-border bg-surface text-ink hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1 rounded-sm border border-border bg-surface text-ink hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
