"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
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

  return (
    <div className="bg-surface border border-border rounded-sm p-5 shadow-xs space-y-4">
      {/* Letterhead Banner */}
      <div className="text-center border-b border-border pb-4 space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-ink font-mono uppercase">
          INDOBEST
        </h2>
        <p className="text-xs text-ink-2 font-medium">
          19/10/2, GOBINDA KHATICK ROAD, KOLKATA-700046
        </p>
        <p className="text-[11px] text-ink-3">
          Phone: <span className="font-mono text-ink">8240892993</span> &nbsp;|&nbsp; E-Mail:{" "}
          <span className="font-mono text-ink">indobest@gmail.com</span>
        </p>
      </div>

      {/* Account Info and Period */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pt-1">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
              Ledger Account :
            </span>
            <h1 className="text-lg font-bold text-ink tracking-tight font-mono">
              {account.displayName}
            </h1>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                isCustomer
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-accent/10 border-accent/20 text-accent"
              }`}
            >
              {isCustomer ? "Customer" : "Supplier"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-ink-3 flex-wrap pt-0.5">
            {account.gstin ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-success-bg border border-success/30 text-success text-[11px] font-mono font-medium">
                <CheckCircle2 className="w-3 h-3" />
                GSTIN: {account.gstin}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-surface-2 border border-border text-ink-3 text-[11px] font-medium">
                <AlertCircle className="w-3 h-3 text-ink-3" />
                GSTIN not on file
              </span>
            )}
            {account.stateCode && (
              <span className="px-1.5 py-0.2 rounded-xs bg-surface-2 border border-border text-[11px] font-mono">
                State: {account.stateCode}
              </span>
            )}
          </div>
          {account.address && (
            <p className="text-xs text-ink-3 pt-0.5">{account.address}</p>
          )}
        </div>

        {/* Period Box */}
        <div className="sm:text-right shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 block mb-0.5">
            Statement Period
          </span>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-surface-2 border border-border text-xs font-mono font-medium text-ink">
            <Calendar className="w-3.5 h-3.5 text-accent" />
            <span>
              {formatDate(period.from)} — {formatDate(period.to)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
