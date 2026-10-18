"use client";

import React from "react";
import Link from "next/link";
import { formatINR, formatDate } from "@/lib/format";
import { FileText, ExternalLink, Ban, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatementRow {
  id: string;
  entry_date: string;
  sort_seq: number;
  entry_type: string;
  particulars: string;
  particulars_raw?: string;
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
  payment_mode?: string | null;
  instrument_no?: string | null;
  instrument_date?: string | null;
  narration?: string | null;
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
  onEditEntry?: (row: StatementRow) => void;
  onDeleteEntry?: (entryId: string) => void;
}

export function StatementTable({ rows, margTotals, onVoidEntry, onEditEntry, onDeleteEntry }: StatementTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm print:rounded-none print:border print:border-slate-400 print:shadow-none print:overflow-visible">
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full text-sm text-left border-collapse print:text-xs print:text-black">
          <thead>
            <tr className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold print:bg-slate-100 print:text-black print:border-b-2 print:border-black">
              <th className="py-3 px-4 w-[110px] print:py-1.5 print:px-2 print:w-[90px] print:text-black">Date</th>
              <th className="py-3 px-4 min-w-[280px] print:py-1.5 print:px-2 print:text-black">Particulars</th>
              <th className="py-3 px-4 text-right w-[140px] print:py-1.5 print:px-2 print:w-[110px] print:text-black">Debit</th>
              <th className="py-3 px-4 text-right w-[140px] print:py-1.5 print:px-2 print:w-[110px] print:text-black">Credit</th>
              <th className="py-3 px-4 text-right w-[150px] print:py-1.5 print:px-2 print:w-[120px] print:text-black">Balance</th>
              <th className="py-3 px-2 w-[50px] text-center print:hidden"></th>
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
                    <td className="py-2.5 px-4 text-foreground align-top min-w-[280px]">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Invoice direct link */}
                          {row.invoice_id ? (
                            <Link
                              href={`/invoices/${row.invoice_id}`}
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
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-foreground align-top print:py-1.5 print:px-2 print:text-xs print:text-black">
                      {isDebit ? formatINR(row.debit) : "—"}
                    </td>

                    {/* Credit */}
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-foreground align-top print:py-1.5 print:px-2 print:text-xs print:text-black">
                      {isCredit ? formatINR(row.credit) : "—"}
                    </td>

                    {/* Running Balance */}
                    <td
                      className={cn(
                        "py-2.5 px-4 text-right font-mono text-xs font-semibold whitespace-nowrap align-top print:py-1.5 print:px-2 print:text-xs",
                        row.balance_side === "Cr"
                          ? "text-emerald-600 dark:text-emerald-400 print:text-emerald-700"
                          : "text-foreground print:text-black"
                      )}
                    >
                      {formatINR(Math.abs(row.running_balance))}{" "}
                      <span
                        className={cn(
                          "ml-1 font-bold text-[11px] print:text-[10px]",
                          row.balance_side === "Dr"
                            ? "text-rose-600 dark:text-rose-400 print:text-rose-700"
                            : "text-emerald-600 dark:text-emerald-400 print:text-emerald-700"
                        )}
                      >
                        {row.balance_side}
                      </span>
                    </td>

                    {/* Actions (Hidden in print) */}
                    <td className="py-2.5 px-2 text-center align-top print:hidden">
                      {!row.is_void && (
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {onEditEntry && (
                            <button
                              type="button"
                              onClick={() => onEditEntry(row)}
                              className="text-muted-foreground hover:text-primary p-1 rounded hover:bg-muted transition-colors"
                              title="Edit line"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDeleteEntry && (
                            <button
                              type="button"
                              onClick={() => onDeleteEntry(row.id)}
                              className="text-muted-foreground hover:text-rose-600 p-1 rounded hover:bg-muted transition-colors"
                              title="Delete entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {row.source === "MANUAL" && onVoidEntry && (
                            <button
                              type="button"
                              onClick={() => onVoidEntry(row.id)}
                              className="text-muted-foreground hover:text-amber-600 p-1 rounded hover:bg-muted transition-colors"
                              title="Void entry"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Marg Totals Row */}
          <tfoot>
            <tr className="bg-muted/80 border-t-2 border-border font-semibold text-xs uppercase tracking-wide print:bg-slate-100 print:text-black print:border-t-2 print:border-b-2 print:border-black print:break-inside-avoid">
              <td className="py-3 px-4 font-mono print:py-2 print:px-2 print:text-xs">TOTAL</td>
              <td className="py-3 px-4 text-muted-foreground text-xs normal-case print:py-2 print:px-2 print:text-[10px] print:text-slate-700">
                Total (incl. opening) &bull; <span className="italic font-mono text-[11px] print:text-[10px]">Debit − Credit = Closing</span>
              </td>
              <td className="py-3 px-4 text-right font-mono text-sm text-foreground print:py-2 print:px-2 print:text-xs print:text-black">
                {formatINR(margTotals.debitTotal)}
              </td>
              <td className="py-3 px-4 text-right font-mono text-sm text-foreground print:py-2 print:px-2 print:text-xs print:text-black">
                {formatINR(margTotals.creditTotal)}
              </td>
              <td
                className={cn(
                  "py-3 px-4 text-right font-mono text-sm whitespace-nowrap print:py-2 print:px-2 print:text-xs",
                  margTotals.closingSide === "Cr"
                    ? "text-emerald-600 dark:text-emerald-400 print:text-emerald-700"
                    : "text-foreground print:text-black"
                )}
              >
                {formatINR(Math.abs(margTotals.closing))}{" "}
                <span
                  className={cn(
                    "ml-1 font-bold",
                    margTotals.closingSide === "Dr"
                      ? "text-rose-600 dark:text-rose-400 print:text-rose-700"
                      : "text-emerald-600 dark:text-emerald-400 print:text-emerald-700"
                  )}
                >
                  {margTotals.closingSide}
                </span>
              </td>
              <td className="print:hidden"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
