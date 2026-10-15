"use client";

import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { formatINR } from "@/lib/format";
import { ExtractedInvoice } from "@/lib/llm/schema";

interface DiffViewProps {
  existingInvoice: any;
  draft: ExtractedInvoice;
  onApplyDiffField?: (field: string, value: any) => void;
}

export function DiffView({ existingInvoice, draft }: DiffViewProps) {
  if (!existingInvoice) return null;

  const diffItems: Array<{ field: string; saved: string; incoming: string; isDifferent: boolean }> = [
    {
      field: "Customer Name",
      saved: existingInvoice.customer_name_snapshot,
      incoming: draft.customer.name,
      isDifferent: existingInvoice.customer_name_snapshot !== draft.customer.name,
    },
    {
      field: "Customer GSTIN",
      saved: existingInvoice.customer_gstin_snapshot || "None",
      incoming: draft.customer.gstin || "None",
      isDifferent: (existingInvoice.customer_gstin_snapshot || "") !== (draft.customer.gstin || ""),
    },
    {
      field: "Invoice Date",
      saved: new Date(existingInvoice.invoice_date).toISOString().split("T")[0],
      incoming: draft.invoice.date,
      isDifferent: new Date(existingInvoice.invoice_date).toISOString().split("T")[0] !== draft.invoice.date,
    },
    {
      field: "Taxable Subtotal",
      saved: formatINR(Number(existingInvoice.taxable_total)),
      incoming: formatINR(draft.totals.taxableSubtotal),
      isDifferent: Number(existingInvoice.taxable_total) !== draft.totals.taxableSubtotal,
    },
    {
      field: "Grand Total",
      saved: formatINR(Number(existingInvoice.grand_total)),
      incoming: formatINR(draft.totals.grandTotal),
      isDifferent: Number(existingInvoice.grand_total) !== draft.totals.grandTotal,
    },
    {
      field: "Line Items Count",
      saved: `${existingInvoice.items?.length || 0} items`,
      incoming: `${draft.items.length} items`,
      isDifferent: (existingInvoice.items?.length || 0) !== draft.items.length,
    },
  ];

  const changedCount = diffItems.filter((d) => d.isDifferent).length;

  return (
    <div className="bg-surface border border-warning/40 rounded-sm p-4 space-y-3 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <h4 className="text-xs font-semibold text-ink">
            Comparison with Existing Version (v{existingInvoice.version})
          </h4>
        </div>
        <span className="text-[11px] font-medium text-warning px-2 py-0.5 rounded-sm bg-warning-bg">
          {changedCount} {changedCount === 1 ? "field differs" : "fields differ"}
        </span>
      </div>

      <div className="border border-border rounded-sm overflow-hidden text-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
              <th className="py-2 px-3">Field</th>
              <th className="py-2 px-3">Saved in Database</th>
              <th className="py-2 px-3">Incoming from Upload</th>
              <th className="py-2 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {diffItems.map((item, index) => (
              <tr
                key={index}
                className={item.isDifferent ? "bg-warning-bg/30 font-medium" : "hover:bg-surface-2/40"}
              >
                <td className="py-2 px-3 text-ink-2">{item.field}</td>
                <td className="py-2 px-3 text-ink-3 font-mono">{item.saved}</td>
                <td className="py-2 px-3 text-ink font-mono">{item.incoming}</td>
                <td className="py-2 px-3 text-center">
                  {item.isDifferent ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-warning font-semibold">
                      ▲ Changed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-ink-3">
                      <Check className="w-3 h-3 text-success" /> Same
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
