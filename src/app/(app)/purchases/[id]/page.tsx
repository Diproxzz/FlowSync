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
  Eye,
  Boxes,
  Truck,
  Hash,
} from "lucide-react";
import { formatINR, formatDate } from "@/lib/format";

interface PurchaseItem {
  id: string;
  line_no: number;
  product_name_raw: string;
  hsn: string | null;
  qty_printed: string;
  unit_printed: string;
  qty_kg: string;
  rate: string;
  rate_per_kg: string;
  discount: string;
  taxable_amount: string;
  cgst_pct: string;
  sgst_pct: string;
  igst_pct: string;
  cgst_amount: string | null;
  sgst_amount: string | null;
  igst_amount: string | null;
  line_total: string | null;
  product: {
    id: string;
    code: string;
    name: string;
    pack_size_kg: string | null;
    std_purchase_rate: string | null;
  };
  movement: {
    id: string;
    qty_kg: string;
    movement_date: string;
    type: string;
  } | null;
}

interface PurchaseRevision {
  id: string;
  version: number;
  snapshot: any;
  reason: string | null;
  created_at: string;
}

interface PurchaseDetail {
  id: string;
  supplier_invoice_number: string;
  invoice_date: string;
  received_date: string | null;
  financial_year: string;
  supplier_id: string;
  supplier_name_snapshot: string;
  supplier_gstin_snapshot: string | null;
  buyer_gstin_snapshot: string | null;
  reference_no: string | null;
  vehicle_no: string | null;
  taxable_total: string;
  cgst_total: string;
  sgst_total: string;
  igst_total: string;
  other_charges: string;
  tcs: string;
  round_off: string;
  grand_total: string;
  source_file_key: string | null;
  extraction_provider: string | null;
  extraction_model: string | null;
  warnings: any;
  version: number;
  created_at: string;
  updated_at: string;
  supplier: {
    id: string;
    name: string;
    gstin: string | null;
    address: string | null;
    state_code: string | null;
  };
  items: PurchaseItem[];
  revisions: PurchaseRevision[];
}

export default function PurchaseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<PurchaseRevision | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/purchases/${id}`);
        if (!res.ok) {
          throw new Error("Failed to load purchase invoice details");
        }
        const data = await res.json();
        setPurchase(data.purchase);
      } catch (err: any) {
        setError(err.message || "Error loading purchase invoice");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleDelete = async () => {
    if (!purchase) return;
    if (
      !confirm(
        `Are you sure you want to delete purchase invoice ${purchase.supplier_invoice_number}? This will reverse the added inventory stock movements.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        if (data.negativeStockWarning) {
          alert("Invoice deleted. Warning: some product stocks have dropped below zero.");
        }
        router.push("/purchases");
      } else {
        alert(data.error?.message || "Failed to delete purchase invoice");
      }
    } catch (err: any) {
      console.error(err);
      alert("Error deleting purchase invoice");
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-ink-3 text-xs">
        Loading purchase invoice details...
      </div>
    );
  }

  if (error || !purchase) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-danger text-sm">{error || "Purchase invoice not found"}</p>
        <Link
          href="/purchases"
          className="inline-flex items-center gap-2 text-xs text-accent hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Purchases
        </Link>
      </div>
    );
  }

  const isIgst = Number(purchase.igst_total) > 0;
  const otherChargesNum = Number(purchase.other_charges);
  const tcsNum = Number(purchase.tcs);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-ink-3">
            <Link href="/purchases" className="hover:text-ink transition flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Purchases
            </Link>
            <span>/</span>
            <span className="font-mono text-ink">{purchase.supplier_invoice_number}</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-ink tracking-tight font-mono">
              #{purchase.supplier_invoice_number}
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#F4E6D7] dark:bg-[#3A2A1C] text-accent">
              Purchase
            </span>
            {purchase.version > 1 && (
              <span className="px-2 py-0.5 rounded-sm bg-surface-2 border border-border text-[11px] font-mono text-ink-2">
                Version {purchase.version}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-sm bg-surface-2 border border-border text-ink-3 font-mono">
              FY {purchase.financial_year}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {purchase.source_file_key && (
            <button
              onClick={() => setShowPdf(!showPdf)}
              className="px-3.5 py-1.5 border border-border bg-surface text-ink rounded-sm text-xs font-medium hover:bg-surface-2 transition flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-accent" />
              <span>{showPdf ? "Hide PDF" : "View PDF"}</span>
            </button>
          )}

          <button
            onClick={handleDelete}
            className="px-3.5 py-1.5 border border-danger/30 text-danger hover:bg-danger-bg rounded-sm text-xs font-medium transition flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Purchase</span>
          </button>
        </div>
      </div>

      {/* PDF Viewer (Collapsible) */}
      {showPdf && purchase.source_file_key && (
        <div className="border border-border rounded-sm overflow-hidden bg-surface-2 p-2 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between pb-2 px-2 text-xs font-medium text-ink-2">
            <span>Original Purchase Invoice PDF</span>
            <a
              href={`/api/purchases/${purchase.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline flex items-center gap-1 text-[11px]"
            >
              <ExternalLink className="w-3 h-3" /> Open in New Tab
            </a>
          </div>
          <iframe
            src={`/api/purchases/${purchase.id}/file`}
            className="w-full h-[600px] rounded-xs border border-border bg-surface"
          />
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Supplier Info */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-accent" />
              <span>Supplier / Vendor</span>
            </span>
            <Link
              href={`/suppliers/${purchase.supplier_id}`}
              className="text-[11px] text-accent hover:underline flex items-center gap-0.5"
            >
              <span>Profile</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>
          <div>
            <div className="font-semibold text-ink text-sm">
              {purchase.supplier_name_snapshot}
            </div>
            <div className="text-xs text-ink-3 font-mono mt-0.5">
              GSTIN: {purchase.supplier_gstin_snapshot || "Unregistered"}
            </div>
            {purchase.supplier?.address && (
              <div className="text-xs text-ink-2 mt-1 leading-relaxed">
                {purchase.supplier.address}
              </div>
            )}
          </div>
        </div>

        {/* Invoice Metadata */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              <span>Dates & Shipping</span>
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ink-3">Invoice Date:</span>
              <span className="font-mono text-ink font-semibold">
                {formatDate(purchase.invoice_date)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-3">Goods Received Date:</span>
              <span className="font-mono text-ink">
                {purchase.received_date ? formatDate(purchase.received_date) : "—"}
              </span>
            </div>
            {purchase.reference_no && (
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Reference / Challan:</span>
                <span className="font-mono text-ink">{purchase.reference_no}</span>
              </div>
            )}
            {purchase.vehicle_no && (
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Vehicle No:</span>
                <span className="font-mono text-ink">{purchase.vehicle_no}</span>
              </div>
            )}
          </div>
        </div>

        {/* Summary Metric */}
        <div className="bg-surface border border-border rounded-sm p-4 space-y-2 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider">
              Total Purchase Value
            </span>
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-xs bg-surface-2 border border-border text-ink">
              {isIgst ? "Inter-State (IGST)" : "Intra-State"}
            </span>
          </div>
          <div>
            <div className="text-2xl font-bold text-accent font-mono">
              {formatINR(Number(purchase.grand_total))}
            </div>
            <div className="text-xs text-ink-3 mt-1">
              {purchase.items.length} line item{purchase.items.length === 1 ? "" : "s"} · Added to inventory
            </div>
          </div>
        </div>
      </div>

      {/* Items & Stock Movements Table */}
      <div className="space-y-2">
        <span className="font-semibold text-ink uppercase tracking-wide text-[11px] block">
          Purchased Items ({purchase.items.length})
        </span>

        <div className="border border-border rounded-sm overflow-x-auto bg-surface shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                <th className="py-2.5 px-3 w-8 text-center">#</th>
                <th className="py-2.5 px-3 min-w-[180px]">Product</th>
                <th className="py-2.5 px-3 min-w-[90px]">HSN</th>
                <th className="py-2.5 px-3 text-right min-w-[120px]">Printed Qty & Unit</th>
                <th className="py-2.5 px-3 text-right min-w-[90px]">Rate (₹)</th>
                <th className="py-2.5 px-3 text-right min-w-[100px]">Taxable (₹)</th>
                <th className="py-2.5 px-3 text-right min-w-[80px]">Tax %</th>
                <th className="py-2.5 px-3 text-right min-w-[100px]">Line Total (₹)</th>
                <th className="py-2.5 px-3 text-center min-w-[90px]">Stock Movement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {purchase.items.map((item) => {
                const taxPct = isIgst
                  ? Number(item.igst_pct)
                  : Number(item.cgst_pct) + Number(item.sgst_pct);

                return (
                  <tr key={item.id} className="hover:bg-surface-2/40 transition">
                    <td className="py-2.5 px-3 text-ink-3 font-mono text-center">
                      {item.line_no}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-ink">
                        {item.product.name}
                      </div>
                      <div className="text-[10px] text-ink-3 font-mono">
                        Code: {item.product.code} · Raw: {item.product_name_raw}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 font-mono text-ink-3">
                      {item.hsn || "—"}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-ink">
                      <div>
                        {Number(item.qty_printed).toLocaleString()} {item.unit_printed}
                      </div>
                      {item.unit_printed.toUpperCase() !== "KG" && (
                        <div className="text-[10px] text-ink-3">
                          ({Number(item.qty_kg).toLocaleString()} kg)
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-ink">
                      <div>
                        ₹{Number(item.rate).toFixed(2)}
                      </div>
                      {item.unit_printed.toUpperCase() !== "KG" && (
                        <div className="text-[10px] text-ink-3">
                          (₹{Number(item.rate_per_kg).toFixed(2)}/kg)
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono font-medium text-ink">
                      {formatINR(Number(item.taxable_amount))}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-ink-3">
                      {taxPct}% {isIgst ? "IGST" : "GST"}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                      {item.line_total ? formatINR(Number(item.line_total)) : "—"}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      {item.movement ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-success-bg text-success font-mono text-[10px] font-semibold">
                          <Boxes className="w-3 h-3" />
                          <span>+{Number(item.movement.qty_kg).toFixed(1)} kg</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals Breakdown */}
      <div className="bg-surface border border-border rounded-sm p-4 space-y-3 max-w-md ml-auto shadow-xs">
        <span className="font-semibold text-ink uppercase tracking-wide text-[11px] block pb-2 border-b border-border">
          Cost Breakdown
        </span>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-ink-2">
            <span>Taxable Subtotal:</span>
            <span className="font-mono text-ink font-semibold">
              {formatINR(Number(purchase.taxable_total))}
            </span>
          </div>

          {!isIgst ? (
            <>
              <div className="flex items-center justify-between text-ink-3">
                <span>CGST:</span>
                <span className="font-mono text-ink">
                  {formatINR(Number(purchase.cgst_total))}
                </span>
              </div>
              <div className="flex items-center justify-between text-ink-3">
                <span>SGST:</span>
                <span className="font-mono text-ink">
                  {formatINR(Number(purchase.sgst_total))}
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between text-ink-3">
              <span>IGST:</span>
              <span className="font-mono text-ink">
                {formatINR(Number(purchase.igst_total))}
              </span>
            </div>
          )}

          {otherChargesNum > 0 && (
            <div className="flex items-center justify-between text-ink-3">
              <span>Other Charges / Freight:</span>
              <span className="font-mono text-ink">{formatINR(otherChargesNum)}</span>
            </div>
          )}

          {tcsNum > 0 && (
            <div className="flex items-center justify-between text-ink-3">
              <span>TCS (Tax Collected at Source):</span>
              <span className="font-mono text-ink">{formatINR(tcsNum)}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-ink-3">
            <span>Round-off:</span>
            <span className="font-mono text-ink">
              {Number(purchase.round_off) >= 0
                ? `+${Number(purchase.round_off).toFixed(2)}`
                : Number(purchase.round_off).toFixed(2)}
            </span>
          </div>

          <div className="pt-2 border-t border-border flex items-center justify-between text-sm">
            <span className="font-bold text-ink">Grand Total:</span>
            <span className="font-mono font-bold text-accent text-base">
              {formatINR(Number(purchase.grand_total))}
            </span>
          </div>
        </div>
      </div>

      {/* Revision History (if version > 1) */}
      {purchase.revisions && purchase.revisions.length > 0 && (
        <div className="border border-border rounded-sm bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <History className="w-4 h-4 text-ink-3" />
            <span className="font-semibold text-xs text-ink">
              Revision History ({purchase.revisions.length} previous version{purchase.revisions.length === 1 ? "" : "s"})
            </span>
          </div>

          <div className="divide-y divide-border text-xs">
            {purchase.revisions.map((rev) => (
              <div key={rev.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-semibold font-mono text-ink">Version {rev.version}</span>
                  <span className="text-ink-3 ml-2">
                    {formatDate(rev.created_at)}
                  </span>
                  <p className="text-[11px] text-ink-3 mt-0.5">{rev.reason || "Updated"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
