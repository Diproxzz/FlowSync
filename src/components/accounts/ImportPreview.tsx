"use client";

import React, { useState, useEffect, useMemo } from "react";
import { formatINR, formatDate } from "@/lib/format";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Building,
  FileSpreadsheet,
  ShieldCheck,
  Search,
  Link2,
  UserPlus,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PartyOption {
  id: string;
  name: string;
  gstin: string | null;
  address?: string | null;
}

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

  // Party matching & selection state
  const isAutoMatch = partyMatch?.status === "exact" || partyMatch?.status === "alias";
  const initialMatchedId = isAutoMatch ? (partyMatch?.matchedPartyId || partyMatch?.partyId || null) : null;
  const [partyMode, setPartyMode] = useState<"MATCHED" | "LINK_EXISTING" | "CREATE_NEW">(
    isAutoMatch ? "MATCHED" : "CREATE_NEW"
  );
  const [selectedPartyId, setSelectedPartyId] = useState<string>(initialMatchedId || "");
  const [partySearchTerm, setPartySearchTerm] = useState("");

  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [suppliers, setSuppliers] = useState<PartyOption[]>([]);
  const [loadingParties, setLoadingParties] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoadingParties(true);
    Promise.all([
      fetch("/api/customers").then((res) => (res.ok ? res.json() : { customers: [] })),
      fetch("/api/suppliers").then((res) => (res.ok ? res.json() : { suppliers: [] })),
    ])
      .then(([custData, suppData]) => {
        if (isMounted) {
          setCustomers(custData.customers || []);
          setSuppliers(suppData.suppliers || []);
        }
      })
      .catch((err) => console.error("Error loading parties:", err))
      .finally(() => {
        if (isMounted) setLoadingParties(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const isValid = validation?.isValid ?? false;
  const validationErrors: string[] = validation?.errors ?? [];
  const validationWarnings: string[] = validation?.warnings ?? [];

  // Active parties based on Account Type
  const activeParties = accountType === "CUSTOMER" ? customers : suppliers;

  const filteredParties = useMemo(() => {
    if (!partySearchTerm.trim()) return activeParties;
    const term = partySearchTerm.toLowerCase().trim();
    return activeParties.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.gstin && p.gstin.toLowerCase().includes(term))
    );
  }, [activeParties, partySearchTerm]);

  const selectedParty = useMemo(() => {
    const id = partyMode === "MATCHED" ? initialMatchedId : selectedPartyId;
    if (!id) return null;
    return activeParties.find((p) => p.id === id) || null;
  }, [activeParties, partyMode, initialMatchedId, selectedPartyId]);

  const handleAccountTypeChange = (newType: "CUSTOMER" | "SUPPLIER") => {
    setAccountType(newType);
    setPartySearchTerm("");
    if (partyMode === "MATCHED") {
      setPartyMode("CREATE_NEW");
      setSelectedPartyId("");
    } else if (partyMode === "LINK_EXISTING") {
      setSelectedPartyId("");
    }
  };

  const canSave =
    isValid &&
    !saving &&
    (partyMode !== "LINK_EXISTING" || !!selectedPartyId);

  const handleConfirmSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const effectivePartyId =
      partyMode === "LINK_EXISTING"
        ? selectedPartyId
        : partyMode === "MATCHED"
        ? initialMatchedId
        : null;

    try {
      const res = await fetch("/api/ledger/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: extracted,
          draft: extracted,
          partyMatch: effectivePartyId
            ? { ...partyMatch, partyId: effectivePartyId, matchedPartyId: effectivePartyId }
            : null,
          partyId: effectivePartyId,
          customerId: accountType === "CUSTOMER" ? effectivePartyId : null,
          supplierId: accountType === "SUPPLIER" ? effectivePartyId : null,
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

      const accountId = data?.data?.accountId || data?.accountId;
      if (!accountId) {
        throw new Error(data?.message || "Failed to retrieve account ID after import");
      }
      onSaveSuccess(accountId);
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
            disabled={!canSave}
            onClick={handleConfirmSave}
            title={
              partyMode === "LINK_EXISTING" && !selectedPartyId
                ? "Please select an existing customer/supplier before saving"
                : undefined
            }
            className={cn(
              "px-5 py-2.5 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2",
              canSave
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <span>
              {saving
                ? "Saving to Database..."
                : partyMode === "LINK_EXISTING" && !selectedPartyId
                ? "Select a Party to Link"
                : "Confirm & Save Statement"}
            </span>
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
            <span
              className={cn(
                "text-[11px] font-mono px-2 py-0.5 rounded-full capitalize",
                partyMode === "MATCHED"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : partyMode === "LINK_EXISTING"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
              )}
            >
              {partyMode === "MATCHED"
                ? "matched"
                : partyMode === "LINK_EXISTING"
                ? "linking"
                : "new"}
            </span>
          </div>

          <div className="space-y-3 text-sm">
            {/* Account Type Selector */}
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-border">
              <label className="text-xs font-medium text-muted-foreground">Account Type:</label>
              <div className="flex items-center gap-4 text-xs font-medium">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="accountType"
                    checked={accountType === "CUSTOMER"}
                    onChange={() => handleAccountTypeChange("CUSTOMER")}
                    className="text-primary focus:ring-primary"
                  />
                  <span>Customer (Debtor)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="accountType"
                    checked={accountType === "SUPPLIER"}
                    onChange={() => handleAccountTypeChange("SUPPLIER")}
                    className="text-primary focus:ring-primary"
                  />
                  <span>Supplier (Creditor)</span>
                </label>
              </div>
            </div>

            {/* Mode Selector Tabs */}
            <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg text-xs font-medium">
              {initialMatchedId && (
                <button
                  type="button"
                  onClick={() => {
                    setPartyMode("MATCHED");
                    setSelectedPartyId(initialMatchedId);
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md transition-all",
                    partyMode === "MATCHED"
                      ? "bg-card text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Auto-matched</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setPartyMode("CREATE_NEW");
                  setSelectedPartyId("");
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md transition-all",
                  partyMode === "CREATE_NEW"
                    ? "bg-card text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <UserPlus className="w-3.5 h-3.5 text-amber-600" />
                <span>Create New</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPartyMode("LINK_EXISTING");
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md transition-all",
                  partyMode === "LINK_EXISTING"
                    ? "bg-card text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Link2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Link to Existing</span>
              </button>
            </div>

            {/* Mode 1: Matched Display */}
            {partyMode === "MATCHED" && (
              <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/60 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Matched Database Record:</span>
                  <span className="font-mono text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-semibold">
                    100% Match
                  </span>
                </div>
                <p className="font-semibold text-foreground text-sm">{partyMatch.matchedName}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">GSTIN:</span>
                  {partyMatch.matchedGstin || partyMatch.gstin ? (
                    <span className="font-mono font-medium text-foreground">
                      {partyMatch.matchedGstin || partyMatch.gstin}
                    </span>
                  ) : (
                    <span className="text-amber-600 italic">Not on file</span>
                  )}
                </div>
              </div>
            )}

            {/* Mode 2: Create New Party */}
            {partyMode === "CREATE_NEW" && (
              <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 dark:bg-amber-950/20 dark:border-amber-900/60 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Create New {accountType === "CUSTOMER" ? "Customer" : "Supplier"}</span>
                </div>
                <p className="text-muted-foreground">
                  A new {accountType === "CUSTOMER" ? "customer" : "supplier"} will be automatically created
                  as <strong className="text-foreground">{extracted.accountName}</strong> with{" "}
                  <strong>GSTIN skipped</strong> per instruction.
                </p>
              </div>
            )}

            {/* Mode 3: Link to Existing Party */}
            {partyMode === "LINK_EXISTING" && (
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder={`Filter existing ${accountType.toLowerCase()}s by name or GSTIN...`}
                    value={partySearchTerm}
                    onChange={(e) => setPartySearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <select
                    value={selectedPartyId}
                    onChange={(e) => setSelectedPartyId(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-sans"
                  >
                    <option value="">
                      {loadingParties
                        ? "Loading existing parties..."
                        : filteredParties.length === 0
                        ? "No parties found matching search"
                        : `-- Select existing ${accountType.toLowerCase()} (${filteredParties.length} available) --`}
                    </option>
                    {filteredParties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.gstin ? `[GSTIN: ${p.gstin}]` : "[No GSTIN]"}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedParty ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/60 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                        {selectedParty.name}
                      </span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded font-medium">
                        Linked
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-800/90 dark:text-emerald-400/90">
                      <span>GSTIN: </span>
                      {selectedParty.gstin ? (
                        <span className="font-mono font-medium">{selectedParty.gstin}</span>
                      ) : (
                        <span className="italic text-muted-foreground">Not on file</span>
                      )}
                      {selectedParty.address && (
                        <span className="ml-2 text-muted-foreground truncate">
                          ({selectedParty.address})
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-emerald-700/90 dark:text-emerald-400/80 pt-0.5">
                      ✓ Will save alias &ldquo;{extracted.accountName}&rdquo; so future statements match automatically.
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    Please select an existing {accountType.toLowerCase()} from the dropdown above to link with this statement.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Totals Comparison Check */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Replay & Statement Totals Reconciled
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Debit Total</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {formatINR(extracted?.totals?.debitTotal ?? extracted?.printedTotals?.debit ?? 0)}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Credit Total</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {formatINR(extracted?.totals?.creditTotal ?? extracted?.printedTotals?.credit ?? 0)}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Closing Balance</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {formatINR(extracted?.totals?.closing ?? extracted?.printedTotals?.balance ?? 0)}{" "}
              {extracted?.totals?.closingSide ?? extracted?.printedTotals?.balanceSide ?? "Dr"}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Total Entries</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {extracted?.entries?.length || 0} rows
            </span>
          </div>
        </div>
      </div>

      {/* Validation Discrepancies if any */}
      {validationErrors.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 text-xs space-y-1">
          <strong className="font-semibold block text-sm">Discrepancy Details (Replay Failure):</strong>
          <ul className="list-disc pl-5 space-y-0.5">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Extracted Ledger Table Preview */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Extracted Transactions ({extracted.entries?.length || 0} rows)
          </h4>
          <span className="text-xs text-muted-foreground font-mono">
            {extracted.periodFrom} &rarr; {extracted.periodTo}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="py-2.5 px-3.5">Date</th>
                <th className="py-2.5 px-3.5 min-w-[340px]">Particulars / Doc No</th>
                <th className="py-2.5 px-3.5 text-right">Debit (₹)</th>
                <th className="py-2.5 px-3.5 text-right">Credit (₹)</th>
                <th className="py-2.5 px-3.5 text-right">Balance</th>
                <th className="py-2.5 px-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-mono">
              {/* Line 1: Opening Balance */}
              <tr className="bg-muted/40 font-medium border-b border-border">
                <td className="py-2.5 px-3.5 text-muted-foreground whitespace-nowrap">
                  {formatDate(extracted.periodFrom)}
                </td>
                <td className="py-2.5 px-3.5 text-foreground font-sans font-semibold min-w-[340px]">
                  Opening Balance
                </td>
                <td className="py-2.5 px-3.5 text-right">
                  {extracted.openingSide === "Dr" ? formatINR(extracted.openingBalance) : "—"}
                </td>
                <td className="py-2.5 px-3.5 text-right">
                  {extracted.openingSide === "Cr" ? formatINR(extracted.openingBalance) : "—"}
                </td>
                <td className="py-2.5 px-3.5 text-right font-semibold">
                  {formatINR(extracted.openingBalance)} {extracted.openingSide}
                </td>
                <td className="py-2.5 px-3.5 text-center font-sans">
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
                    <td className="py-2.5 px-3.5 text-muted-foreground whitespace-nowrap">
                      {formatDate(rowDate)}
                    </td>
                    <td className="py-2.5 px-3.5 text-foreground font-sans min-w-[340px] leading-relaxed break-words">
                      <div>
                        {row.particularsRaw || row.docNo || "Entry"}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5 text-right">{row.debit > 0 ? formatINR(row.debit) : "—"}</td>
                    <td className="py-2.5 px-3.5 text-right">{row.credit > 0 ? formatINR(row.credit) : "—"}</td>
                    <td className="py-2.5 px-3.5 text-right font-semibold">
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
