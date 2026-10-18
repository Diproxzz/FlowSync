"use client";

import React from "react";
import { formatDate } from "@/lib/format";

export interface StatementHeaderProps {
  account: {
    id: string;
    displayName: string;
    accountType: "CUSTOMER" | "SUPPLIER";
    gstin?: string | null;
    gstinSource?: string | null;
    address?: string | null;
    stateCode?: string | null;
  };
  period: {
    from: string;
    to: string;
  };
}

export function StatementHeader({ account, period }: StatementHeaderProps) {
  const isCustomer = account.accountType === "CUSTOMER";
  const todayStr = new Date().toISOString().slice(0, 10);
  const safeTo = period.to > todayStr ? todayStr : period.to;

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4 print:p-4 print:space-y-3 print:border-black print:rounded-none print:shadow-none print:break-inside-avoid">
      {/* Letterhead Banner */}
      <div className="text-center border-b border-border pb-4 space-y-1 print:pb-2.5 print:border-black">
        <h2 className="text-xl font-black tracking-tight text-foreground font-mono uppercase print:text-lg print:text-black">
          INDOBEST
        </h2>
        <p className="text-xs text-muted-foreground font-medium print:text-[11px] print:text-black">
          19/10/2, GOBINDA KHATICK ROAD, KOLKATA-700046
        </p>
        <p className="text-[11px] text-muted-foreground print:text-[10px] print:text-black">
          Phone: <span className="font-mono text-foreground print:text-black font-semibold">8240892993</span> &nbsp;|&nbsp; E-Mail:{" "}
          <span className="font-mono text-foreground print:text-black font-semibold">indobest@gmail.com</span>
        </p>
      </div>

      {/* Account Info and Period */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pt-1">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-black">
              Ledger Account :
            </span>
            <h1 className="text-lg font-bold text-foreground tracking-tight font-mono print:text-base print:text-black">
              {account.displayName}
            </h1>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border print:border-black print:text-black print:bg-white ${
                isCustomer
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-accent/10 border-accent/20 text-accent"
              }`}
            >
              {isCustomer ? "Customer" : "Supplier"}
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-muted-foreground flex-wrap pt-0.5 print:text-black">
            {account.gstin ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted/60 border border-border text-foreground text-[11px] font-mono font-medium print:bg-transparent print:border-none print:p-0 print:text-black">
                GSTIN: {account.gstin}
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted/40 border border-border text-muted-foreground text-[11px] font-medium print:bg-transparent print:border-none print:p-0 print:text-black">
                GSTIN not on file
              </span>
            )}
            {account.stateCode && (
              <span className="px-1.5 py-0.5 rounded bg-muted/60 border border-border text-[11px] font-mono text-foreground print:bg-transparent print:border-none print:p-0 print:text-black">
                State: {account.stateCode}
              </span>
            )}
          </div>
          {account.address && (
            <p className="text-xs text-muted-foreground pt-0.5 print:text-[11px] print:text-black max-w-2xl">{account.address}</p>
          )}
        </div>

        {/* Period Box */}
        <div className="sm:text-right shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1 print:text-black">
            Statement Period
          </span>
          <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-mono font-semibold text-foreground shadow-2xs print:bg-white print:border-black print:text-black print:rounded-none">
            <span>
              {formatDate(period.from)} — {formatDate(safeTo)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
