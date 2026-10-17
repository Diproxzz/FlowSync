"use client";

import React from "react";
import Link from "next/link";
import { formatINR, formatDate } from "@/lib/format";
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OpenItemRow {
  entryId: string;
  docNo: string | null;
  invoiceId: string | null;
  date: string;
  dueDate: string | null;
  originalAmount: number;
  settledAmount: number;
  outstandingAmount: number;
  status: "OPEN" | "PARTIALLY_SETTLED" | "SETTLED";
  ageDays: number | null;
  overdue: boolean;
  isOpening?: boolean;
}

interface OutstandingTableProps {
  items: OpenItemRow[];
  advance: number;
  closingBalance: number;
  closingSide: "Dr" | "Cr";
  creditDays?: number;
}

export function OutstandingTable({
  items,
  advance,
  closingBalance,
  closingSide,
  creditDays = 90,
}: OutstandingTableProps) {
  const totalOutstanding = items.reduce((acc, it) => acc + it.outstandingAmount, 0);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <th className="py-3 px-4">Bill / Document</th>
              <th className="py-3 px-4 w-[120px]">Date</th>
              <th className="py-3 px-4 w-[120px]">Due Date</th>
              <th className="py-3 px-4 text-right w-[130px]">Amount</th>
              <th className="py-3 px-4 text-right w-[130px]">Settled</th>
              <th className="py-3 px-4 text-right w-[140px]">Outstanding</th>
              <th className="py-3 px-4 text-center w-[90px]">Age</th>
              <th className="py-3 px-4 text-center w-[120px]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    <p className="font-medium text-foreground">No outstanding bills</p>
                    <p className="text-xs text-muted-foreground">
                      All invoices and prior balance have been fully settled.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isPaid = item.status === "SETTLED";
                const isPart = item.status === "PARTIALLY_SETTLED";

                return (
                  <tr
                    key={item.entryId}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      item.overdue && "bg-rose-50/30 dark:bg-rose-950/10"
                    )}
                  >
                    {/* Bill / Document */}
                    <td className="py-2.5 px-4 font-mono text-xs text-foreground">
                      {item.isOpening ? (
                        <span className="font-sans font-semibold text-foreground">
                          Opening Balance (prior-year bills)
                        </span>
                      ) : item.invoiceId ? (
                        <Link
                          href={`/invoices?search=${encodeURIComponent(item.docNo || "")}`}
                          className="text-primary font-medium hover:underline"
                        >
                          Bill No. {item.docNo}
                        </Link>
                      ) : (
                        <span>Bill No. {item.docNo || "—"}</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(item.date)}
                    </td>

                    {/* Due Date */}
                    <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap">
                      {item.dueDate ? (
                        <span
                          className={cn(
                            item.overdue
                              ? "text-rose-600 dark:text-rose-400 font-semibold"
                              : "text-muted-foreground"
                          )}
                        >
                          {formatDate(item.dueDate)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-foreground">
                      {formatINR(item.originalAmount)}
                    </td>

                    {/* Settled */}
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-muted-foreground">
                      {item.settledAmount > 0 ? formatINR(item.settledAmount) : "—"}
                    </td>

                    {/* Outstanding */}
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-foreground">
                      {formatINR(item.outstandingAmount)}
                    </td>

                    {/* Age */}
                    <td className="py-2.5 px-4 text-center font-mono text-xs text-muted-foreground">
                      {item.ageDays !== null ? `${item.ageDays} d` : "—"}
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-4 text-center">
                      {item.overdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                          <AlertCircle className="w-3 h-3" /> Overdue
                        </span>
                      ) : isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Settled
                        </span>
                      ) : isPart ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          <Clock className="w-3 h-3" /> Part Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          Open
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Footer Total */}
          <tfoot>
            <tr className="bg-muted/70 border-t-2 border-border font-semibold text-xs">
              <td colSpan={5} className="py-3 px-4 uppercase tracking-wider text-muted-foreground">
                Total Outstanding Bills
              </td>
              <td className="py-3 px-4 text-right font-mono text-sm text-foreground">
                {formatINR(totalOutstanding)}
              </td>
              <td colSpan={2}></td>
            </tr>

            {advance > 0.005 && (
              <tr className="bg-muted/40 border-t border-border/80 text-xs">
                <td colSpan={5} className="py-2.5 px-4 text-emerald-700 dark:text-emerald-400 font-medium">
                  Less: Unallocated Advance / Credit
                </td>
                <td className="py-2.5 px-4 text-right font-mono text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
                  −{formatINR(advance)}
                </td>
                <td colSpan={2}></td>
              </tr>
            )}

            <tr className="bg-muted/90 border-t border-border font-bold text-xs uppercase tracking-wider">
              <td colSpan={5} className="py-3 px-4 text-foreground">
                Net Closing Balance (Total Due)
              </td>
              <td className="py-3 px-4 text-right font-mono text-base text-foreground">
                {formatINR(Math.abs(closingBalance))}{" "}
                <span
                  className={cn(
                    "text-xs font-bold",
                    closingSide === "Dr"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {closingSide}
                </span>
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
