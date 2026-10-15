"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Eye, Trash2, FileText, ArrowUpDown, Filter } from "lucide-react";
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

export default function InvoicesListPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const url = search ? `/api/invoices?search=${encodeURIComponent(search)}` : "/api/invoices";
      const res = await fetch(url);
      const data = await res.json();
      setInvoices(data.invoices || []);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInvoices();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleDelete = async (id: string, number: string) => {
    if (!confirm(`Are you sure you want to delete invoice ${number}? This will also reverse all associated stock movements.`)) {
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
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">Invoices</h2>
          <p className="text-xs text-ink-3">Saved sales tax invoices, GST breakdowns and linked inventory lines</p>
        </div>

        <Link
          href="/upload"
          className="h-9 px-3.5 bg-primary text-primary-fg rounded-sm text-xs font-semibold flex items-center gap-2 hover:opacity-90 transition self-start"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Upload Invoice</span>
        </Link>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3 bg-surface p-3 border border-border rounded-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number, buyer, or GSTIN..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="text-xs text-ink-3 font-mono">
          {total} {total === 1 ? "invoice" : "invoices"}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                <th className="py-2.5 px-3">Invoice No.</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Customer / Buyer</th>
                <th className="py-2.5 px-3">Customer GSTIN</th>
                <th className="py-2.5 px-3 text-right">Taxable Subtotal</th>
                <th className="py-2.5 px-3 text-right">CGST</th>
                <th className="py-2.5 px-3 text-right">SGST</th>
                <th className="py-2.5 px-3 text-right font-semibold text-ink">Grand Total</th>
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
                    No invoices recorded yet. Click &quot;Upload Invoice&quot; to scan and save your first sales invoice.
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
                    <td className="py-2.5 px-3 font-mono text-ink-2">{formatDate(inv.invoice_date)}</td>
                    <td className="py-2.5 px-3 font-medium text-ink">{inv.customer_name_snapshot}</td>
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
      </div>
    </div>
  );
}
