"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { formatINR, formatDate } from "@/lib/format";
import { AlertCircle, Clock, CheckCircle2, Filter, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OpenItemRow {
  id?: string;
  entryId?: string;
  docNo: string | null;
  invoiceId?: string | null;
  date?: string;
  entryDate?: string;
  dueDate?: string | null;
  amount?: number;
  originalAmount?: number;
  settled?: number;
  settledAmount?: number;
  outstanding?: number;
  outstandingAmount?: number;
  status: "OPEN" | "PART" | "PAID" | "PARTIALLY_SETTLED" | "SETTLED";
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
  accountType?: "CUSTOMER" | "SUPPLIER";
}

export function OutstandingTable({
  items,
  advance,
  closingBalance,
  closingSide,
  creditDays = 90,
  accountType = "CUSTOMER",
}: OutstandingTableProps) {
  const [filterMode, setFilterMode] = useState<"PENDING_ONLY" | "ALL">("PENDING_ONLY");
  const isSupplier = accountType === "SUPPLIER" || closingSide === "Cr";

  const normalizedItems = useMemo(() => {
    return items.map((item, idx) => {
      const origAmt = item.originalAmount ?? item.amount ?? 0;
      const setAmt = item.settledAmount ?? item.settled ?? 0;
      const outAmt = item.outstandingAmount ?? item.outstanding ?? 0;
      const dateVal = item.date || item.entryDate || "";
      const rowId = item.entryId || item.id || `open-item-${idx}`;

      const isPaid =
        item.status === "SETTLED" ||
        item.status === "PAID" ||
        outAmt <= 0.005;

      const isPart =
        item.status === "PARTIALLY_SETTLED" ||
        item.status === "PART" ||
        (outAmt > 0.005 && setAmt > 0.005);

      return {
        raw: item,
        id: rowId,
        docNo: item.docNo,
        invoiceId: item.invoiceId || null,
        date: dateVal,
        dueDate: item.dueDate,
        originalAmount: origAmt,
        settledAmount: setAmt,
        outstandingAmount: outAmt,
        isPaid,
        isPart,
        isOverdue: !isSupplier && item.overdue && outAmt > 0.005,
        ageDays: item.ageDays,
        isOpening: item.isOpening || /opening/i.test(item.docNo || ""),
      };
    });
  }, [items, isSupplier]);

  const pendingItems = useMemo(
    () => normalizedItems.filter((it) => it.outstandingAmount > 0.005),
    [normalizedItems]
  );

  const displayedItems = filterMode === "PENDING_ONLY" ? pendingItems : normalizedItems;

  const totalOutstanding = useMemo(
    () => normalizedItems.reduce((acc, it) => acc + it.outstandingAmount, 0),
    [normalizedItems]
  );

  const totalInvoiced = useMemo(
    () => normalizedItems.reduce((acc, it) => acc + it.originalAmount, 0),
    [normalizedItems]
  );

  const totalSettled = useMemo(
    () => normalizedItems.reduce((acc, it) => acc + it.settledAmount, 0),
    [normalizedItems]
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col space-y-3 p-4">
      {/* Top Filter and Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        {/* Toggle Pills */}
        <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => setFilterMode("PENDING_ONLY")}
            className={cn(
              "px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5",
              filterMode === "PENDING_ONLY"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Pending Bills ({pendingItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterMode("ALL")}
            className={cn(
              "px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5",
              filterMode === "ALL"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <span>All Bills ({normalizedItems.length})</span>
          </button>
        </div>

        {/* Aggregate Stats */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-muted-foreground">Total Invoiced: </span>
            <span className="font-semibold text-foreground">{formatINR(totalInvoiced)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Settled: </span>
            <span className="font-semibold text-emerald-600">{formatINR(totalSettled)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Outstanding: </span>
            <span className="font-bold text-rose-600">{formatINR(totalOutstanding)}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
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
            {displayedItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    <p className="font-medium text-foreground">
                      {filterMode === "PENDING_ONLY"
                        ? "No pending bills"
                        : "No bills on record"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {filterMode === "PENDING_ONLY"
                        ? "All invoices and prior opening balance have been fully settled."
                        : "No bills have been posted for this party."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              displayedItems.map((item) => {
                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      item.isOverdue && "bg-rose-50/40 dark:bg-rose-950/20"
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
                          href={`/invoices/${item.invoiceId}`}
                          className="text-primary font-medium hover:underline flex items-center gap-1.5"
                          title="View Invoice"
                        >
                          <span>Bill No. {item.docNo}</span>
                        </Link>
                      ) : item.docNo ? (
                        <Link
                          href={`/invoices?search=${encodeURIComponent(item.docNo)}`}
                          className="text-primary font-medium hover:underline"
                        >
                          Bill No. {item.docNo}
                        </Link>
                      ) : (
                        <span>—</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {item.date ? formatDate(item.date) : "—"}
                    </td>

                    {/* Due Date */}
                    <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap">
                      {item.dueDate ? (
                        <span
                          className={cn(
                            item.isOverdue
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
                      {item.ageDays !== null && item.ageDays !== undefined ? `${item.ageDays} d` : "—"}
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-4 text-center">
                      {item.isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" /> Settled
                        </span>
                      ) : item.isOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                          <AlertCircle className="w-3 h-3" /> Overdue
                        </span>
                      ) : item.isPart ? (
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
              <td
                className={cn(
                  "py-3 px-4 text-right font-mono text-base font-bold",
                  closingSide === "Cr"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-foreground"
                )}
              >
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
