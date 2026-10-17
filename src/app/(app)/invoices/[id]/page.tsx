"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Building2,
  FileText,
  Trash2,
  ExternalLink,
  History,
  AlertTriangle,
  CheckCircle,
  Eye,
  FileSpreadsheet,
} from "lucide-react";
import { formatINR, formatDate, formatKg } from "@/lib/format";

interface InvoiceItem {
  id: string;
  line_no: number;
  product_name_raw: string;
  hsn: string | null;
  qty_kg: string;
  pack_size_kg: string | null;
  rate: string;
  discount_pct: string | null;
  discount_amount: string | null;
  taxable_amount: string;
  cgst_pct: string;
  sgst_pct: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_pct?: string | null;
  igst_amount?: string | null;
  line_total: string;
  product: {
    id: string;
    code: string;
    name: string;
    hsn_code: string | null;
  };
}

interface InvoiceRevision {
  id: string;
  version: number;
  snapshot: any;
  reason: string;
  changed_at: string;
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  invoice_date: string;
  financial_year: string;
  customer_id: string;
  customer_name_snapshot: string;
  customer_gstin_snapshot: string | null;
  taxable_total: string;
  discount_total: string | null;
  discount_pct: string | null;
  cgst_total: string;
  sgst_total: string;
  igst_total: string;
  round_off: string;
  grand_total: string;
  source_file_key: string | null;
  extraction_provider: string | null;
  extraction_model: string | null;
  warnings: string[] | null;
  version: number;
  created_at: string;
  updated_at: string;
  customer: {
    id: string;
    name: string;
    gstin: string | null;
    city: string | null;
    state: string | null;
  };
  items: InvoiceItem[];
  revisions: InvoiceRevision[];
}

export default function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFile, setShowFile] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<InvoiceRevision | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/invoices/${id}`);
        if (!res.ok) {
          throw new Error("Failed to load invoice details");
        }
        const data = await res.json();
        setInvoice(data.invoice);
      } catch (err: any) {
        setError(err.message || "Error loading invoice");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleDelete = async () => {
    if (!invoice) return;
    if (
      !confirm(
        `Are you sure you want to delete invoice ${invoice.invoice_number}? This will reverse all inventory stock movements for its line items.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/invoices");
      } else {
        alert("Failed to delete invoice");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting invoice");
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-ink-3 text-xs">
        Loading invoice details...
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-danger text-sm">{error || "Invoice not found"}</p>
        <Link
          href="/invoices"
          className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Invoices
        </Link>
      </div>
    );
  }

  const warnings = Array.isArray(invoice.warnings) ? invoice.warnings : [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-ink-3">
            <Link href="/invoices" className="hover:text-ink transition flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Invoices
            </Link>
            <span>/</span>
            <span className="font-mono text-ink">{invoice.invoice_number}</span>
          </div>

          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold font-mono text-ink tracking-tight">
              {invoice.invoice_number}
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
              FY {invoice.financial_year}
            </span>
            {invoice.version > 1 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/15 text-accent border border-accent/25">
                Rev v{invoice.version}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {invoice.source_file_key && (
            <button
              onClick={() => setShowFile(!showFile)}
              className="h-8 px-3 border border-border bg-surface text-ink hover:bg-surface-2 rounded-sm text-xs font-medium flex items-center gap-1.5 transition"
            >
              <Eye className="w-3.5 h-3.5 text-ink-3" />
              <span>{showFile ? "Hide Source" : "View Source PDF"}</span>
            </button>
          )}

          <button
            onClick={handleDelete}
            className="h-8 px-3 border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 rounded-sm text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Warnings Banner if any */}
      {warnings.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-sm p-3 flex items-start gap-3 text-xs text-warning-fg">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Review Warnings:</span>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Customer Box */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span className="flex items-center gap-1.5 font-medium">
              <Building2 className="w-3.5 h-3.5 text-primary" /> Customer / Buyer
            </span>
            <Link
              href={`/customers`}
              className="text-primary hover:underline flex items-center gap-0.5 text-[11px]"
            >
              View <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-ink">{invoice.customer_name_snapshot}</h4>
            <div className="mt-1 text-xs font-mono text-ink-2">
              GSTIN: {invoice.customer_gstin_snapshot || "URP (Unregistered)"}
            </div>
            {invoice.customer.city && (
              <div className="text-xs text-ink-3">
                {invoice.customer.city}, {invoice.customer.state || "West Bengal"}
              </div>
            )}
          </div>
        </div>

        {/* Invoice Meta */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-ink-3 font-medium">
            <Calendar className="w-3.5 h-3.5 text-primary" /> Invoice Details
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-ink-3">Date:</span>
              <p className="font-mono font-medium text-ink">{formatDate(invoice.invoice_date)}</p>
            </div>
            <div>
              <span className="text-ink-3">Status:</span>
              <p className="font-medium text-emerald-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Confirmed
              </p>
            </div>
            <div>
              <span className="text-ink-3">Extraction Provider:</span>
              <p className="font-mono text-ink-2 text-[11px]">
                {invoice.extraction_provider || "manual"}
              </p>
            </div>
            <div>
              <span className="text-ink-3">Extracted At:</span>
              <p className="text-ink-2 text-[11px]">
                {new Date(invoice.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-3 font-medium">
            <span>Grand Total</span>
            <span className="font-mono text-[11px]">INR ₹</span>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {formatINR(Number(invoice.grand_total))}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-ink-3">
              <span>Taxable: {formatINR(Number(invoice.taxable_total))}</span>
              <span>GST: {formatINR(Number(invoice.cgst_total) + Number(invoice.sgst_total) + Number(invoice.igst_total))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Optional Split View: Source PDF Viewer */}
      {showFile && invoice.source_file_key && (
        <div className="bg-surface border border-border rounded-sm overflow-hidden">
          <div className="bg-surface-2 px-4 py-2 border-b border-border flex items-center justify-between text-xs">
            <span className="font-medium text-ink flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-primary" /> Original Scanned Document
            </span>
            <a
              href={`/api/invoices/${invoice.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1 text-[11px]"
            >
              Open in new tab <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="h-[650px] w-full bg-surface-2">
            <iframe
              src={`/api/invoices/${invoice.id}/file`}
              className="w-full h-full border-0"
              title="Original Document PDF"
            />
          </div>
        </div>
      )}

      {/* Line Items Table */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3">
          Line Items ({invoice.items.length})
        </h3>
        <div className="bg-surface border border-border rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            {(() => {
              const isIgst = Number(invoice.igst_total || 0) > 0;
              const hasLineDiscount = invoice.items.some(
                (item) => item.discount_pct && Number(item.discount_pct) > 0
              );
              const hasOverallDiscount =
                Boolean(invoice.discount_total && Number(invoice.discount_total) > 0) ||
                Boolean(invoice.discount_pct && Number(invoice.discount_pct) > 0);

              const fallbackIgstPct =
                isIgst && Number(invoice.taxable_total) > 0
                  ? Math.round((Number(invoice.igst_total) / Number(invoice.taxable_total)) * 100)
                  : 0;

              return (
                <>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                        <th className="py-2.5 px-3 w-10">#</th>
                        <th className="py-2.5 px-3">Description on Bill</th>
                        <th className="py-2.5 px-3">Mapped Product</th>
                        <th className="py-2.5 px-3">HSN</th>
                        <th className="py-2.5 px-3 text-right">Quantity</th>
                        <th className="py-2.5 px-3 text-right">Unit Rate</th>
                        {hasLineDiscount && <th className="py-2.5 px-3 text-right">Disc %</th>}
                        <th className="py-2.5 px-3 text-right">Taxable</th>
                        <th className="py-2.5 px-3 text-right">{isIgst ? "IGST %" : "GST %"}</th>
                        <th className="py-2.5 px-3 text-right font-semibold text-ink">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoice.items.map((item) => {
                        const itemGstPct =
                          Number(item.igst_pct || 0) > 0
                            ? Number(item.igst_pct)
                            : (Number(item.cgst_pct || 0) + Number(item.sgst_pct || 0) > 0
                                ? Number(item.cgst_pct || 0) + Number(item.sgst_pct || 0)
                                : fallbackIgstPct);

                        return (
                          <tr key={item.id} className="hover:bg-surface-2/60 transition">
                            <td className="py-2.5 px-3 font-mono text-ink-3">{item.line_no}</td>
                            <td className="py-2.5 px-3 font-medium text-ink">
                              {item.product_name_raw}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold text-primary px-1.5 py-0.5 rounded-sm bg-primary/10 text-[11px]">
                                  {item.product.code}
                                </span>
                                <span className="text-ink-2 truncate max-w-[200px]" title={item.product.name}>
                                  {item.product.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-ink-3">
                              {item.hsn || item.product.hsn_code || "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right num text-ink font-medium">
                              {formatKg(Number(item.qty_kg))}
                            </td>
                            <td className="py-2.5 px-3 text-right num text-ink-2">
                              ₹{Number(item.rate).toFixed(2)}
                            </td>
                            {hasLineDiscount && (
                              <td className="py-2.5 px-3 text-right num text-ink-2">
                                {item.discount_pct && Number(item.discount_pct) > 0 ? (
                                  <span className="font-mono font-medium text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[11px]">
                                    {Number(item.discount_pct)}%
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-right num text-ink-2">
                              {formatINR(Number(item.taxable_amount))}
                            </td>
                            <td className="py-2.5 px-3 text-right num text-ink-3">
                              {itemGstPct}%
                            </td>
                            <td className="py-2.5 px-3 text-right num font-semibold text-ink">
                              {formatINR(Number(item.line_total))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Breakdown & Totals Box */}
                  <div className="p-4 bg-surface-2/40 border-t border-border flex flex-col sm:flex-row justify-between gap-6">
                    <div className="text-xs text-ink-3 space-y-1">
                      <p>• All line items deduct stock directly from inventory via transaction ledger.</p>
                      {isIgst ? (
                        <p>
                          • GST rate: Inter-State IGST{" "}
                          {Number(invoice.items[0]?.igst_pct || 0) > 0
                            ? invoice.items[0]?.igst_pct
                            : fallbackIgstPct}
                          %.
                        </p>
                      ) : (
                        <p>
                          • GST rates: Intra-State CGST {invoice.items[0]?.cgst_pct || "9"}% + SGST{" "}
                          {invoice.items[0]?.sgst_pct || "9"}%.
                        </p>
                      )}
                    </div>

                    <div className="w-full sm:w-72 space-y-1.5 text-xs">
                      <div className="flex justify-between py-1 text-ink-2">
                        <span>Taxable Subtotal:</span>
                        <span className="num font-mono">{formatINR(Number(invoice.taxable_total))}</span>
                      </div>
                      {hasOverallDiscount && (
                        <div className="flex justify-between py-1 text-emerald-600 font-medium">
                          <span>
                            Trade Discount{invoice.discount_pct ? ` (${Number(invoice.discount_pct)}%)` : ""}:
                          </span>
                          <span className="num font-mono">
                            {invoice.discount_total ? `-${formatINR(Number(invoice.discount_total))}` : `${Number(invoice.discount_pct)}%`}
                          </span>
                        </div>
                      )}
                      {isIgst ? (
                        <div className="flex justify-between py-1 text-ink-3">
                          <span>IGST Subtotal:</span>
                          <span className="num font-mono">{formatINR(Number(invoice.igst_total))}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between py-1 text-ink-3">
                            <span>CGST Subtotal:</span>
                            <span className="num font-mono">{formatINR(Number(invoice.cgst_total))}</span>
                          </div>
                          <div className="flex justify-between py-1 text-ink-3">
                            <span>SGST Subtotal:</span>
                            <span className="num font-mono">{formatINR(Number(invoice.sgst_total))}</span>
                          </div>
                        </>
                      )}
                      {Number(invoice.round_off) !== 0 && (
                        <div className="flex justify-between py-1 text-ink-3">
                          <span>Round Off:</span>
                          <span className="num font-mono">
                            {Number(invoice.round_off) > 0 ? "+" : ""}
                            {Number(invoice.round_off).toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 border-t border-border text-sm font-bold text-ink">
                        <span>Grand Total:</span>
                        <span className="num font-mono text-primary">
                          {formatINR(Number(invoice.grand_total))}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Revision History */}
      {invoice.revisions && invoice.revisions.length > 0 && (
        <div className="space-y-2 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Revision History ({invoice.revisions.length})
          </h3>
          <div className="bg-surface border border-border rounded-sm overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                  <th className="py-2 px-3">Revision</th>
                  <th className="py-2 px-3">Changed At</th>
                  <th className="py-2 px-3">Reason / Note</th>
                  <th className="py-2 px-3 text-right">Grand Total (Snapshot)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoice.revisions.map((rev) => (
                  <tr key={rev.id} className="hover:bg-surface-2/60 transition">
                    <td className="py-2 px-3 font-mono font-medium text-primary">v{rev.version}</td>
                    <td className="py-2 px-3 text-ink-3">{new Date(rev.changed_at).toLocaleString()}</td>
                    <td className="py-2 px-3 text-ink">{rev.reason}</td>
                    <td className="py-2 px-3 text-right num text-ink font-mono">
                      {rev.snapshot?.grand_total ? formatINR(Number(rev.snapshot.grand_total)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
