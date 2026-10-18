"use client";

import React, { useState } from "react";
import { formatINR } from "@/lib/format";
import { PlusCircle, Copy, Check, Printer, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TotalDueBannerProps {
  partyName: string;
  totalDue: number; // positive = Dr, negative = Cr
  accountType?: "CUSTOMER" | "SUPPLIER";
  overdueAmount?: number;
  oldestBillNo?: string | null;
  oldestBillDate?: string | null;
  onAddReceipt?: () => void;
  onPrint?: () => void;
}

export function TotalDueBanner({
  partyName,
  totalDue,
  accountType = "CUSTOMER",
  overdueAmount = 0,
  oldestBillNo,
  oldestBillDate,
  onAddReceipt,
  onPrint,
}: TotalDueBannerProps) {
  const [copied, setCopied] = useState(false);
  const isCustomer = accountType === "CUSTOMER";

  const isDr = totalDue > 0.005;
  const isCr = totalDue < -0.005;
  const isZero = !isDr && !isCr;
  const absDue = Math.abs(totalDue);

  let titlePrefix = "ACCOUNT SETTLED";
  let subtitle = "No pending dues on record.";

  if (isCustomer) {
    if (isDr) {
      titlePrefix = "TOTAL DUE";
      subtitle = "Party owes you";
    } else if (isCr) {
      titlePrefix = "ADVANCE HELD";
      subtitle = "You owe party (credit balance)";
    }
  } else {
    if (isCr) {
      titlePrefix = "TOTAL PAYABLE";
      subtitle = "You owe party";
    } else if (isDr) {
      titlePrefix = "ADVANCE PAID";
      subtitle = "Party owes you (debit balance)";
    }
  }

  const formattedAmount = `${formatINR(absDue)} ${isDr ? "Dr" : isCr ? "Cr" : ""}`;

  const handleCopyReminder = () => {
    let text = `Dear ${partyName},\nThis is a friendly reminder that your outstanding balance with Indobest is ${formattedAmount}.`;
    if (isCustomer && overdueAmount > 0) {
      text += ` Overdue amount: ${formatINR(overdueAmount)}.`;
    }
    if (oldestBillNo) {
      text += ` Oldest unpaid invoice: ${oldestBillNo}${oldestBillDate ? ` (${oldestBillDate})` : ""}.`;
    }
    text += `\nPlease arrange for the payment at your earliest convenience.\nThank you,\nIndobest`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="sticky bottom-4 z-30 mt-6 shadow-xl rounded-2xl border border-border bg-card/95 backdrop-blur-md p-4 transition-all">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Due Highlights */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-3.5 h-12 rounded-full",
              isZero
                ? "bg-slate-400"
                : isCr
                ? "bg-emerald-500"
                : "bg-rose-500"
            )}
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-lg tracking-tight font-mono text-foreground flex items-baseline gap-1.5">
                {isZero ? (
                  titlePrefix
                ) : (
                  <>
                    <span>{titlePrefix}: </span>
                    <span className={isCr ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-foreground"}>
                      {formatINR(absDue)}
                    </span>
                    <span
                      className={
                        isDr
                          ? "text-rose-600 dark:text-rose-400 font-bold"
                          : "text-emerald-600 dark:text-emerald-400 font-bold"
                      }
                    >
                      {isDr ? "Dr" : "Cr"}
                    </span>
                  </>
                )}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                {subtitle}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {isCustomer && overdueAmount > 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Overdue: {formatINR(overdueAmount)}
                </span>
              )}
              {oldestBillNo && (
                <span>
                  Oldest open bill: <strong className="font-mono text-foreground">{oldestBillNo}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={handleCopyReminder}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border bg-surface hover:bg-surface-2 transition-colors text-ink"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-ink-3" />
                <span>Copy Reminder</span>
              </>
            )}
          </button>

          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border bg-surface hover:bg-surface-2 transition-colors text-ink"
            >
              <Printer className="w-3.5 h-3.5 text-ink-3" />
              <span>Print</span>
            </button>
          )}

          {onAddReceipt && (
            <button
              type="button"
              onClick={onAddReceipt}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:opacity-90 transition-all shadow-sm"
            >
              <PlusCircle className="w-4 h-4 text-white" />
              <span>{isCustomer ? "Add Receipt" : "Add Payment"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
