"use client";

import React from "react";
import { formatINR } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight, Scale, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryCardsProps {
  openingBalance: number; // positive = Dr, negative = Cr
  periodDebit: number;
  periodCredit: number;
  closingBalance: number; // positive = Dr, negative = Cr
  accountType?: "CUSTOMER" | "SUPPLIER";
  openingBalanceSet?: boolean;
}

export function SummaryCards({
  openingBalance,
  periodDebit,
  periodCredit,
  closingBalance,
  accountType = "CUSTOMER",
  openingBalanceSet = true,
}: SummaryCardsProps) {
  const isCustomer = accountType === "CUSTOMER";
  const isClosingDr = closingBalance > 0.005;
  const isClosingCr = closingBalance < -0.005;
  const isClosingZero = !isClosingDr && !isClosingCr;

  const openingDr = openingBalance > 0.005;
  const openingCr = openingBalance < -0.005;
  const openingLabel = openingDr
    ? `${formatINR(openingBalance)} Dr`
    : openingCr
    ? `${formatINR(Math.abs(openingBalance))} Cr`
    : "₹0.00";

  const closingAbs = Math.abs(closingBalance);
  const closingFormatted = isClosingZero
    ? "₹0.00 (Settled)"
    : `${formatINR(closingAbs)} ${isClosingDr ? "Dr" : "Cr"}`;

  // Description for closing
  let closingSubtext = "Account is fully settled";
  if (isCustomer) {
    if (isClosingDr) closingSubtext = "Party owes you (Receivable)";
    else if (isClosingCr) closingSubtext = "Advance held (You owe party)";
  } else {
    if (isClosingCr) closingSubtext = "You owe party (Payable)";
    else if (isClosingDr) closingSubtext = "Advance paid (Party owes you)";
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2 print:my-2 print:break-inside-avoid">
      {/* 1. Opening Balance */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between print:p-2.5 print:rounded-sm print:border-slate-300 print:shadow-none print:bg-slate-50/50">
        <div className="flex items-center justify-between text-muted-foreground text-xs font-medium print:text-[10px] print:text-slate-600">
          <span>Opening Balance</span>
          <Scale className="w-4 h-4 text-muted-foreground/70 print:w-3 print:h-3" />
        </div>
        <div className="mt-2 print:mt-1">
          <div className="text-xl font-semibold tracking-tight text-foreground font-mono print:text-sm print:text-black">
            {openingLabel}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 print:text-[9px] print:text-slate-500">
            {!openingBalanceSet ? (
              <span className="text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 print:w-2.5 print:h-2.5" /> Not explicitly set
              </span>
            ) : (
              <span>Prior period carry-forward</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Period Debit */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between print:p-2.5 print:rounded-sm print:border-slate-300 print:shadow-none print:bg-slate-50/50">
        <div className="flex items-center justify-between text-muted-foreground text-xs font-medium print:text-[10px] print:text-slate-600">
          <span>Period Debit</span>
          <ArrowUpRight className="w-4 h-4 text-blue-600 print:w-3 print:h-3" />
        </div>
        <div className="mt-2 print:mt-1">
          <div className="text-xl font-semibold tracking-tight text-foreground font-mono print:text-sm print:text-black">
            {formatINR(periodDebit)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 print:text-[9px] print:text-slate-500">
            {isCustomer ? "Invoices & debit adjustments" : "Payments made & debits"}
          </div>
        </div>
      </div>

      {/* 3. Period Credit */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between print:p-2.5 print:rounded-sm print:border-slate-300 print:shadow-none print:bg-slate-50/50">
        <div className="flex items-center justify-between text-muted-foreground text-xs font-medium print:text-[10px] print:text-slate-600">
          <span>Period Credit</span>
          <ArrowDownLeft className="w-4 h-4 text-emerald-600 print:w-3 print:h-3" />
        </div>
        <div className="mt-2 print:mt-1">
          <div className="text-xl font-semibold tracking-tight text-foreground font-mono print:text-sm print:text-black">
            {formatINR(periodCredit)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 print:text-[9px] print:text-slate-500">
            {isCustomer ? "Receipts & credit adjustments" : "Purchase bills & credits"}
          </div>
        </div>
      </div>

      {/* 4. Total Due (High Visual Highlight) */}
      <div
        className={cn(
          "p-4 rounded-xl border-2 shadow-sm flex flex-col justify-between transition-all print:p-2.5 print:rounded-sm print:border-slate-400 print:shadow-none print:bg-slate-50/50",
          isClosingZero
            ? "bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-800"
            : (isCustomer && isClosingDr) || (!isCustomer && isClosingCr)
            ? "bg-rose-50/60 border-rose-300 dark:bg-rose-950/20 dark:border-rose-900"
            : "bg-emerald-50/60 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-900"
        )}
      >
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider print:text-[10px]">
          <span
            className={
              isClosingZero
                ? "text-slate-600 print:text-slate-700"
                : (isCustomer && isClosingDr) || (!isCustomer && isClosingCr)
                ? "text-rose-700 dark:text-rose-400 print:text-rose-700"
                : "text-emerald-700 dark:text-emerald-400 print:text-emerald-700"
            }
          >
            Total Due (Closing)
          </span>
          {isClosingZero ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 print:w-3 print:h-3" />
          ) : (
            <span
              className={cn(
                "px-2 py-0.5 text-[11px] print:text-[9px] font-bold rounded-full uppercase",
                isClosingDr
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
              )}
            >
              {isClosingDr ? "Dr" : "Cr"}
            </span>
          )}
        </div>
        <div className="mt-2 print:mt-1">
          <div
            className={cn(
              "text-2xl font-bold tracking-tight font-mono print:text-sm",
              isClosingZero
                ? "text-foreground print:text-black"
                : (isCustomer && isClosingDr) || (!isCustomer && isClosingCr)
                ? "text-rose-700 dark:text-rose-400 print:text-rose-700"
                : "text-emerald-700 dark:text-emerald-400 print:text-emerald-700"
            )}
          >
            {closingFormatted}
          </div>
          <div className="text-xs font-medium text-muted-foreground mt-0.5 print:text-[9px] print:text-slate-500">
            {closingSubtext}
          </div>
        </div>
      </div>
    </div>
  );
}
