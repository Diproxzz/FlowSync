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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Opening Balance */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>Opening Balance</span>
          <Scale className="w-4 h-4 text-muted-foreground/70" />
        </div>
        <div className="mt-2">
          <div className="text-xl font-semibold tracking-tight text-foreground font-mono">
            {openingLabel}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {!openingBalanceSet ? (
              <span className="text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Not explicitly set
              </span>
            ) : (
              <span>Prior period carry-forward</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Period Debit */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>Period Debit</span>
          <ArrowUpRight className="w-4 h-4 text-blue-600" />
        </div>
        <div className="mt-2">
          <div className="text-xl font-semibold tracking-tight text-foreground font-mono">
            {formatINR(periodDebit)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {isCustomer ? "Invoices & debit adjustments" : "Payments made & debits"}
          </div>
        </div>
      </div>

      {/* 3. Period Credit */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>Period Credit</span>
          <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="mt-2">
          <div className="text-xl font-semibold tracking-tight text-foreground font-mono">
            {formatINR(periodCredit)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {isCustomer ? "Receipts & credit adjustments" : "Purchase bills & credits"}
          </div>
        </div>
      </div>

      {/* 4. Total Due (High Visual Highlight) */}
      <div
        className={cn(
          "p-4 rounded-xl border-2 shadow-sm flex flex-col justify-between transition-all",
          isClosingZero
            ? "bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-800"
            : (isCustomer && isClosingDr) || (!isCustomer && isClosingCr)
            ? "bg-rose-50/60 border-rose-300 dark:bg-rose-950/20 dark:border-rose-900"
            : "bg-emerald-50/60 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-900"
        )}
      >
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
          <span
            className={
              isClosingZero
                ? "text-slate-600"
                : (isCustomer && isClosingDr) || (!isCustomer && isClosingCr)
                ? "text-rose-700 dark:text-rose-400"
                : "text-emerald-700 dark:text-emerald-400"
            }
          >
            Total Due (Closing)
          </span>
          {isClosingZero ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <span
              className={cn(
                "px-2 py-0.5 text-[11px] font-bold rounded-full uppercase",
                isClosingDr
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
              )}
            >
              {isClosingDr ? "Dr" : "Cr"}
            </span>
          )}
        </div>
        <div className="mt-2">
          <div
            className={cn(
              "text-2xl font-bold tracking-tight font-mono",
              isClosingZero
                ? "text-foreground"
                : (isCustomer && isClosingDr) || (!isCustomer && isClosingCr)
                ? "text-rose-700 dark:text-rose-400"
                : "text-emerald-700 dark:text-emerald-400"
            )}
          >
            {closingFormatted}
          </div>
          <div className="text-xs font-medium text-muted-foreground mt-0.5">
            {closingSubtext}
          </div>
        </div>
      </div>
    </div>
  );
}
