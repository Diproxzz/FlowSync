"use client";

import React, { useState } from "react";
import { formatINR, formatDate } from "@/lib/format";
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, Building, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportPreviewProps {
  extracted: any;
  validation: any;
  partyMatch: any;
  existingInvoicesFound: any[];
  fileHash: string;
  fileName: string;
  isDuplicateFile?: boolean;
  onSaveSuccess: (accountId: string) => void;
  onCancel: () => void;
}

export function ImportPreview({
  extracted,
  validation,
  partyMatch,
  existingInvoicesFound,
  fileHash,
  fileName,
  isDuplicateFile = false,
  onSaveSuccess,
  onCancel,
}: ImportPreviewProps) {
  const [accountType, setAccountType] = useState<"CUSTOMER" | "SUPPLIER">("CUSTOMER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = validation?.isValid ?? false;
  const validationErrors: string[] = validation?.errors ?? [];
  const validationWarnings: string[] = validation?.warnings ?? [];

  const handleConfirmSave = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/ledger/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: extracted,
          draft: extracted,
          partyMatch,
          accountType,
          fileHash,
          fileName,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errorMsg =
          typeof data.error === "string"
            ? data.error
            : data.error?.message || data.message || "Failed to save statement";
        throw new Error(errorMsg);
      }

      onSaveSuccess(data.data.accountId);
    } catch (err: any) {
      setError(
        typeof err?.message === "string" ? err.message : "An error occurred while saving the statement."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Warning Banner if Duplicate File */}
      {isDuplicateFile && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold">Re-import Notice:</strong> This statement file has
            already been imported for this account. Re-saving will merge and skip duplicate entries.
          </div>
        </div>
      )}

      {/* Validation Status Card */}
      <div
        className={cn(
          "p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4",
          isValid
            ? "bg-emerald-50/60 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800"
            : "bg-rose-50/60 border-rose-200 text-rose-900 dark:bg-rose-950/20 dark:border-rose-800"
        )}
      >
        <div className="flex items-center gap-3">
          {isValid ? (
            <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-8 h-8 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <div>
            <h3 className="font-semibold text-base">
              {isValid
                ? "Exact Replay Verified — All Totals and Running Balances Match"
                : "Statement Validation Failed — Cannot Save"}
            </h3>
            <p className="text-xs opacity-85 mt-0.5">
              {isValid
                ? "Every printed running balance and printed total was verified by arithmetic replay."
                : "Discrepancy detected between printed numbers and running sum."}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!isValid || saving}
            onClick={handleConfirmSave}
            className={cn(
              "px-5 py-2.5 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2",
              isValid
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <span>{saving ? "Saving to Database..." : "Confirm & Save Statement"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          {error}
        </div>
      )}

      {/* Party Matching & Account Setup Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Statement Header Extracted */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            <span>Extracted From Statement</span>
          </div>

          <div className="space-y-1.5 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Account Name:</span>
              <p className="font-semibold text-foreground text-base">{extracted.accountName}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Period:</span>
              <p className="font-mono text-xs text-foreground">
                {extracted.periodFrom} &rarr; {extracted.periodTo}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Opening Balance:</span>
              <p className="font-mono text-xs text-foreground font-medium">
                {formatINR(extracted.openingBalance)} {extracted.openingBalanceSide}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Database Match & Party Resolution */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span className="flex items-center gap-2">
              <Building className="w-4 h-4 text-primary" />
              Database Party Match
            </span>
            <span className="text-[11px] font-mono lowercase">
              {partyMatch?.matchType || "new"}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            {partyMatch?.partyId ? (
              <div>
                <span className="text-xs text-muted-foreground">Matched Record:</span>
                <p className="font-semibold text-foreground">{partyMatch.matchedName}</p>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">GSTIN:</span>
                  {partyMatch.gstin ? (
                    <span className="font-mono font-medium text-foreground">{partyMatch.gstin}</span>
                  ) : (
                    <span className="text-amber-600 italic">Not on file (skipped)</span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  No existing party found
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  A new {accountType === "CUSTOMER" ? "customer" : "supplier"} will be automatically created
                  with <strong>GSTIN skipped</strong> per instruction.
                </p>
              </div>
            )}

            <div className="pt-2 border-t border-border flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground">Account Type:</label>
              <div className="flex items-center gap-3 text-xs font-medium">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="accountType"
                    checked={accountType === "CUSTOMER"}
                    onChange={() => setAccountType("CUSTOMER")}
                  />
                  <span>Customer (Debtor)</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="accountType"
                    checked={accountType === "SUPPLIER"}
                    onChange={() => setAccountType("SUPPLIER")}
                  />
                  <span>Supplier (Creditor)</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Totals Comparison Check */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Replay & Marg Totals Reconciled
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Debit Total (Marg)</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {formatINR(extracted?.totals?.debitTotal ?? extracted?.printedTotals?.debit ?? 0)}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Credit Total (Marg)</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {formatINR(extracted?.totals?.creditTotal ?? extracted?.printedTotals?.credit ?? 0)}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Replayed Closing</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {formatINR(extracted?.totals?.closing ?? extracted?.printedTotals?.balance ?? 0)}{" "}
              {extracted?.totals?.closingSide ?? extracted?.printedTotals?.balanceSide ?? "Dr"}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Exact Match</span>
          </div>
        </div>
      </div>

      {/* Extracted Rows Preview */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Extracted Entries ({extracted.entries?.length || 0})
          </span>
          <span className="text-xs text-muted-foreground">
            {existingInvoicesFound.length} bills already matched to system invoices
          </span>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/20 border-b border-border text-muted-foreground sticky top-0">
              <tr>
                <th className="py-2.5 px-3 w-[100px]">Date</th>
                <th className="py-2.5 px-3">Particulars</th>
                <th className="py-2.5 px-3 text-right w-[110px]">Debit</th>
                <th className="py-2.5 px-3 text-right w-[110px]">Credit</th>
                <th className="py-2.5 px-3 text-right w-[110px]">Balance</th>
                <th className="py-2.5 px-3 text-center w-[120px]">Database Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-mono">
              {/* Line 1: Opening Balance */}
              <tr className="bg-muted/40 font-medium border-b border-border">
                <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                  {formatDate(extracted.periodFrom)}
                </td>
                <td className="py-2 px-3 text-foreground font-sans font-semibold">
                  Opening Balance
                </td>
                <td className="py-2 px-3 text-right">
                  {extracted.openingSide === "Dr" ? formatINR(extracted.openingBalance) : "—"}
                </td>
                <td className="py-2 px-3 text-right">
                  {extracted.openingSide === "Cr" ? formatINR(extracted.openingBalance) : "—"}
                </td>
                <td className="py-2 px-3 text-right font-semibold">
                  {formatINR(extracted.openingBalance)} {extracted.openingSide}
                </td>
                <td className="py-2 px-3 text-center font-sans">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    Opening
                  </span>
                </td>
              </tr>

              {/* Extracted Rows */}
              {extracted.entries?.map((row: any, idx: number) => {
                const isMatchedInvoice =
                  row.docNo &&
                  existingInvoicesFound.some((inv: any) => inv.docNoNorm === row.docNoNorm);

                const rowDate = row.date || row.entryDate;

                return (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(rowDate)}
                    </td>
                    <td className="py-2 px-3 text-foreground font-sans">
                      <div>
                        {row.particularsRaw || row.docNo || "Entry"}
                        {row.referencesTruncated && (
                          <span className="ml-2 text-[10px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded">
                            Truncated
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right">{row.debit > 0 ? formatINR(row.debit) : "—"}</td>
                    <td className="py-2 px-3 text-right">{row.credit > 0 ? formatINR(row.credit) : "—"}</td>
                    <td className="py-2 px-3 text-right font-semibold">
                      {row.printedBalance !== null && row.printedBalance !== undefined
                        ? formatINR(row.printedBalance)
                        : "—"}{" "}
                      {row.printedBalanceSide || ""}
                    </td>
                    <td className="py-2 px-3 text-center font-sans">
                      {row.entryType === "SALE_INVOICE" ? (
                        isMatchedInvoice ? (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded font-medium">
                            Linked to invoice
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-600 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            Not uploaded yet
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
