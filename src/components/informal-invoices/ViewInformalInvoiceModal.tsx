"use client";

import React from "react";
import Link from "next/link";
import {
  X,
  Calendar,
  Building2,
  Package,
  BookOpen,
  ArrowUpRight,
  ShieldCheck,
  Printer,
} from "lucide-react";
import { formatINR, formatDate, formatKg } from "@/lib/format";

interface ViewInformalInvoiceModalProps {
  invoice: any | null;
  onClose: () => void;
}

export function ViewInformalInvoiceModal({
  invoice,
  onClose,
}: ViewInformalInvoiceModalProps) {
  if (!invoice) return null;

  const totalQty = invoice.items?.reduce(
    (acc: number, it: any) => acc + Number(it.qty_kg),
    0
  ) || 0;

  const handlePrint = () => {
    window.print();
  };

  const informalLedgerId =
    invoice.ledger_entry?.account_id ||
    invoice.customer?.informal_ledger_account?.id ||
    null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150 print:bg-white print:p-0 print:static print:overflow-visible">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-150 print:border-none print:shadow-none print:max-w-none print:max-h-none print:overflow-visible">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border bg-card flex items-center justify-between gap-3 print:border-b-2 print:border-black">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-bold uppercase tracking-wider">
              Informal Invoice
            </span>
            <h2 className="text-lg font-bold text-foreground font-mono">
              {invoice.invoice_number}
            </h2>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handlePrint}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition"
              title="Print Invoice"
            >
              <Printer className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Print</span>
            </button>

            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {/* Metadata Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-muted/40 border border-border">
            <div>
              <span className="text-[11px] text-muted-foreground block mb-0.5">Invoice Date</span>
              <span className="font-semibold text-foreground font-mono">
                {formatDate(invoice.invoice_date)}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-muted-foreground block mb-0.5">Financial Year</span>
              <span className="font-semibold text-foreground font-mono">
                FY {invoice.financial_year}
              </span>
            </div>

            <div className="col-span-2">
              <span className="text-[11px] text-muted-foreground block mb-0.5">Customer Name</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground text-sm">
                  {invoice.customer_name_snapshot}
                </span>
                {invoice.customer?.id && (
                  <Link
                    href={`/customers`}
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    <span>View Customer</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3 text-right">Quantity (kg)</th>
                  <th className="py-2.5 px-3 text-right">Rate (₹/kg)</th>
                  <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {invoice.items?.map((it: any, idx: number) => (
                  <tr key={it.id} className="hover:bg-muted/20">
                    <td className="py-2.5 px-3 text-center text-muted-foreground font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-foreground">
                        {it.product?.name || it.product_name_raw}
                      </div>
                      {it.product?.code && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Code: {it.product.code}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-foreground">
                      {formatKg(Number(it.qty_kg))}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                      {formatINR(Number(it.rate))}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                      {formatINR(Number(it.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/30 font-bold">
                <tr>
                  <td colSpan={2} className="py-2.5 px-3 uppercase text-[11px] text-muted-foreground">
                    Total
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-foreground">
                    {formatKg(totalQty)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground">—</td>
                  <td className="py-2.5 px-3 text-right font-mono text-base text-foreground">
                    {formatINR(Number(invoice.total_amount))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes & Ledger Status */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
                Accounting & Tax Classification
              </span>
              <div className="flex items-center gap-2 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-foreground font-medium">Non-GST Informal Sales Transaction</span>
                <span className="text-muted-foreground">&bull; 0% Tax</span>
              </div>
              {invoice.notes && (
                <p className="text-[11px] text-muted-foreground italic mt-1">
                  &ldquo;{invoice.notes}&rdquo;
                </p>
              )}
            </div>

            {informalLedgerId && (
              <div className="print:hidden">
                <Link
                  href={`/accounts/${informalLedgerId}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition text-xs font-semibold"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>View Customer Informal Ledger</span>
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card flex items-center justify-end print:hidden">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
