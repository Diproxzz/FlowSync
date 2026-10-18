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
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between print:p-2 print:rounded-none print:border print:border-black print:shadow-none print:bg-white">
        <div className="flex items-center justify-between text-muted-foreground text-xs font-medium print:text-[10px] print:text-black font-semibold">
          <span>Opening Balance</span>
          <Scale className="w-4 h-4 text-muted-foreground/70 print:hidden" />
        </div>
        <div className="mt-2 print:mt-1">
          <div className="text-xl font-semibold tracking-tight text-foreground font-mono print:text-xs print:text-black flex items-baseline gap-1">
            {openingDr ? (
              <>
                <span>{formatINR(openingBalance)}</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold text-sm print:text-xs print:text-black">Dr</span>
              </>
            ) : openingCr ? (
              <>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold print:text-black">{formatINR(Math.abs(openingBalance))}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm print:text-xs print:text-black">Cr</span>
              </>
            ) : (
              "₹0.00"
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 print:text-[9px] print:text-black">
            {!openingBalanceSet ? (
              <span className="text-amber-600 print:text-black flex items-center gap-1">
                <AlertCircle className="w-3 h-3 print:hidden" /> Not explicitly set
              </span>
            ) : (
              <span>Prior period carry-forward</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Period Debit */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between print:p-2 print:rounded-none print:border print:border-black print:shadow-none print:bg-white">
        <div className="flex items-center justify-between text-muted-foreground text-xs font-medium print:text-[10px] print:text-black font-semibold">
          <span>Period Debit</span>
          <ArrowUpRight className="w-4 h-4 text-blue-600 print:hidden" />
        </div>
        <div className="mt-2 print:mt-1">
          <div className="text-xl font-semibold tracking-tight text-foreground font-mono print:text-xs print:text-black">
            {formatINR(periodDebit)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 print:text-[9px] print:text-black">
            {isCustomer ? "Invoices & debit adjustments" : "Payments made & debits"}
          </div>
        </div>
      </div>

      {/* 3. Period Credit */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between print:p-2 print:rounded-none print:border print:border-black print:shadow-none print:bg-white">
        <div className="flex items-center justify-between text-muted-foreground text-xs font-medium print:text-[10px] print:text-black font-semibold">
          <span>Period Credit</span>
          <ArrowDownLeft className="w-4 h-4 text-emerald-600 print:hidden" />
        </div>
        <div className="mt-2 print:mt-1">
          <div className="text-xl font-semibold tracking-tight text-foreground font-mono print:text-xs print:text-black">
            {formatINR(periodCredit)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 print:text-[9px] print:text-black">
            {isCustomer ? "Receipts & credit adjustments" : "Purchase bills & credits"}
          </div>
        </div>
      </div>

      {/* 4. Total Due (High Visual Highlight) */}
      <div
        className={cn(
          "p-4 rounded-xl border-2 shadow-sm flex flex-col justify-between transition-all print:p-2 print:rounded-none print:border print:border-black print:shadow-none print:bg-white",
          isClosingZero
            ? "bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-800"
            : isClosingCr
            ? "bg-emerald-50/60 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-900"
            : "bg-rose-50/60 border-rose-300 dark:bg-rose-950/20 dark:border-rose-900"
        )}
      >
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider print:text-[10px] print:text-black">
          <span
            className={
              isClosingZero
                ? "text-slate-600 print:text-black font-bold"
                : isClosingCr
                ? "text-emerald-700 dark:text-emerald-400 print:text-black font-bold"
                : "text-rose-700 dark:text-rose-400 print:text-black font-bold"
            }
          >
            Total Due (Closing)
          </span>
          {isClosingZero ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 print:hidden" />
          ) : (
            <span
              className={cn(
                "px-2 py-0.5 text-[11px] print:text-[9px] font-bold rounded-full uppercase print:rounded-none print:border print:border-black print:bg-white print:text-black",
                isClosingCr
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200"
              )}
            >
              {isClosingCr ? "Cr" : "Dr"}
            </span>
          )}
        </div>
        <div className="mt-2 print:mt-1">
          <div
            className={cn(
              "text-2xl font-bold tracking-tight font-mono print:text-xs flex items-baseline gap-1.5",
              isClosingZero
                ? "text-foreground print:text-black"
                : isClosingCr
                ? "text-emerald-600 dark:text-emerald-400 print:text-black font-bold"
                : "text-rose-700 dark:text-rose-400 print:text-black font-bold"
            )}
          >
            {isClosingZero ? (
              "₹0.00 (Settled)"
            ) : (
              <>
                <span className={isClosingCr ? "text-emerald-600 dark:text-emerald-400 print:text-black font-bold" : "text-rose-700 dark:text-rose-400 print:text-black font-bold"}>
                  {formatINR(closingAbs)}
                </span>
                <span
                  className={
                    isClosingCr
                      ? "text-emerald-600 dark:text-emerald-400 print:text-black font-bold"
                      : "text-rose-600 dark:text-rose-400 print:text-black font-bold"
                  }
                >
                  {isClosingCr ? "Cr" : "Dr"}
                </span>
              </>
            )}
          </div>
          <div className="text-xs font-medium text-muted-foreground mt-0.5 print:text-[9px] print:text-black">
            {closingSubtext}
          </div>
        </div>
      </div>
    </div>
  );
}
