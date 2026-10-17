"use client";

import React from "react";
import Link from "next/link";
import { formatINR, formatDate } from "@/lib/format";
import { AlertTriangle, FileText, ExternalLink, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatementRow {
  id: string;
  entry_date: string;
  sort_seq: number;
  entry_type: string;
  particulars: string;
  doc_no?: string | null;
  invoice_id?: string | null;
  purchase_invoice_id?: string | null;
  referenced_docs?: string[];
  prior_year_refs?: string[];
  references_truncated?: boolean;
  debit: number;
  credit: number;
  running_balance: number;
  balance_side: "Dr" | "Cr";
  is_void?: boolean;
  source?: string;
}

interface StatementTableProps {
  rows: StatementRow[];
  margTotals: {
    debitTotal: number;
    creditTotal: number;
    closing: number;
    closingSide: "Dr" | "Cr";
  };
  onVoidEntry?: (entryId: string) => void;
}

export function StatementTable({ rows, margTotals, onVoidEntry }: StatementTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <th className="py-3 px-4 w-[110px]">Date</th>
              <th className="py-3 px-4">Particulars</th>
              <th className="py-3 px-4 text-right w-[140px]">Debit</th>
              <th className="py-3 px-4 text-right w-[140px]">Credit</th>
              <th className="py-3 px-4 text-right w-[150px]">Balance</th>
              <th className="py-3 px-2 w-[50px] text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No ledger entries recorded for this period.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const prevRow = idx > 0 ? rows[idx - 1] : null;
                const rowDate = (row as any).entry_date || (row as any).date;
                const prevDate = prevRow ? ((prevRow as any).entry_date || (prevRow as any).date) : null;
                // Same day hide date repeat for clean visual matching Marg statements
                const isSameDate = prevRow && prevDate === rowDate;

                const isDebit = row.debit > 0;
                const isCredit = row.credit > 0;
                const isOpening = row.entry_type === "OPENING" || (row as any).entryType === "OPENING";

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors group",
                      row.is_void && "opacity-50 line-through bg-muted/20",
                      isOpening && "bg-muted/20 font-medium"
                    )}
                  >
                    {/* Date */}
                    <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap text-muted-foreground align-top">
                      {isSameDate ? (
                        <span className="text-muted-foreground/30 select-none">〃</span>
                      ) : (
                        formatDate(rowDate)
                      )}
                    </td>

                    {/* Particulars */}
                    <td className="py-2.5 px-4 text-foreground align-top">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Invoice direct link */}
                          {row.invoice_id ? (
                            <Link
                              href={`/invoices?search=${encodeURIComponent(row.doc_no || "")}`}
                              className="text-primary font-medium hover:underline inline-flex items-center gap-1 group-hover:text-primary/90"
                            >
                              <span>{row.particulars}</span>
                              <ExternalLink className="w-3 h-3 text-muted-foreground" />
                            </Link>
                          ) : (
                            <span className={cn(isOpening ? "font-semibold text-foreground" : "font-mono text-xs")}>
                              {row.particulars}
                            </span>
                          )}

                          {/* Truncation warning indicator */}
                          {row.references_truncated && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-sans"
                              title="Reference list was truncated in source statement"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Ref truncated
                            </span>
                          )}
                        </div>

                        {/* Chips for referenced bills if any */}
                        {row.referenced_docs && row.referenced_docs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {row.referenced_docs.map((ref) => {
                              const isPriorYear =
                                row.prior_year_refs && row.prior_year_refs.includes(ref);
                              return (
                                <span
                                  key={ref}
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[11px] font-mono",
                                    isPriorYear
                                      ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                      : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200/50"
                                  )}
                                  title={isPriorYear ? "Prior year bill" : "Current FY bill"}
                                >
                                  {isPriorYear ? `*${ref}` : ref}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Debit */}
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-foreground align-top">
                      {isDebit ? formatINR(row.debit) : "—"}
                    </td>

                    {/* Credit */}
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-foreground align-top">
                      {isCredit ? formatINR(row.credit) : "—"}
                    </td>

                    {/* Running Balance */}
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold whitespace-nowrap text-foreground align-top">
                      {formatINR(Math.abs(row.running_balance))}{" "}
                      <span
                        className={cn(
                          "ml-1 font-bold text-[11px]",
                          row.balance_side === "Dr"
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {row.balance_side}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-2 text-center align-top">
                      {row.source === "MANUAL" && !row.is_void && onVoidEntry && (
                        <button
                          type="button"
                          onClick={() => onVoidEntry(row.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-600 p-1 rounded transition-opacity"
                          title="Void entry"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Marg Totals Row */}
          <tfoot>
            <tr className="bg-muted/80 border-t-2 border-border font-semibold text-xs uppercase tracking-wide">
              <td className="py-3 px-4 font-mono">TOTAL</td>
              <td className="py-3 px-4 text-muted-foreground text-xs normal-case">
                Total (incl. opening) &bull; <span className="italic font-mono text-[11px]">Debit − Credit = Closing</span>
              </td>
              <td className="py-3 px-4 text-right font-mono text-sm text-foreground">
                {formatINR(margTotals.debitTotal)}
              </td>
              <td className="py-3 px-4 text-right font-mono text-sm text-foreground">
                {formatINR(margTotals.creditTotal)}
              </td>
              <td className="py-3 px-4 text-right font-mono text-sm whitespace-nowrap text-foreground">
                {formatINR(Math.abs(margTotals.closing))}{" "}
                <span
                  className={cn(
                    "ml-1 font-bold",
                    margTotals.closingSide === "Dr"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {margTotals.closingSide}
                </span>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
