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
  Pencil,
  Trash2,
  Plus,
  X,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { validateStatement } from "@/lib/ledger/parse/validate";
import { ExtractedStatement, StatementEntry } from "@/lib/ledger/parse/schema";

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
  // Local state for statement data to allow in-place editing before saving
  const [statementData, setStatementData] = useState<ExtractedStatement>(extracted);

  const closingSide =
    statementData?.printedTotals?.balanceSide ??
    (statementData?.openingSide === "Cr" ? "Cr" : "Dr");
  const suggestedType: "CUSTOMER" | "SUPPLIER" =
    (extracted as any)?.suggestedAccountType || (closingSide === "Cr" ? "SUPPLIER" : "CUSTOMER");

  const [accountType, setAccountType] = useState<"CUSTOMER" | "SUPPLIER">(suggestedType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Row editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editRowData, setEditRowData] = useState<{
    date: string;
    entryType: string;
    docNo: string;
    particularsRaw: string;
    debit: string;
    credit: string;
  }>({
    date: "",
    entryType: "SALE_INVOICE",
    docNo: "",
    particularsRaw: "",
    debit: "",
    credit: "",
  });

  // Opening balance editing state
  const [isEditingOpening, setIsEditingOpening] = useState(false);

  // When editing anything, upon clicking outside, discard the edit
  useEffect(() => {
    if (editingIndex === null && !isEditingOpening) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (editingIndex !== null && !target.closest(".import-edit-row")) {
        setEditingIndex(null);
      }
      if (isEditingOpening && !target.closest(".import-edit-opening")) {
        setIsEditingOpening(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [editingIndex, isEditingOpening]);
  const [editOpeningAmount, setEditOpeningAmount] = useState<string>(
    String(statementData?.openingBalance || 0)
  );
  const [editOpeningSide, setEditOpeningSide] = useState<"Dr" | "Cr">(
    statementData?.openingSide || "Dr"
  );

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

  // Live validation whenever statementData changes
  const liveValidation = useMemo(() => {
    try {
      return validateStatement(statementData);
    } catch {
      return validation || { isValid: false, errors: [], warnings: [] };
    }
  }, [statementData, validation]);

  const isValid = liveValidation?.isValid ?? false;
  const validationErrors: string[] = liveValidation?.errors ?? [];
  const validationWarnings: string[] = liveValidation?.warnings ?? [];

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

  const handleStartEdit = (idx: number) => {
    const row = statementData.entries[idx];
    setEditingIndex(idx);
    setEditRowData({
      date: row.date || "",
      entryType: row.entryType || (accountType === "SUPPLIER" ? "PURCHASE_INVOICE" : "SALE_INVOICE"),
      docNo: row.docNo || "",
      particularsRaw: row.particularsRaw || "",
      debit: row.debit > 0 ? String(row.debit) : "",
      credit: row.credit > 0 ? String(row.credit) : "",
    });
  };

  const handleSaveRow = (idx: number) => {
    const deb = parseFloat(editRowData.debit) || 0;
    const cred = parseFloat(editRowData.credit) || 0;

    const updatedEntries = [...statementData.entries];
    const prev = updatedEntries[idx];

    let docNo = editRowData.docNo.trim() || null;
    if (docNo) {
      docNo = docNo.replace(/^Bill\s*No\.?\s*/i, "").trim();
    }

    let cleanParticulars = editRowData.particularsRaw.trim();
    if (!cleanParticulars && docNo) {
      cleanParticulars = `Bill No. ${docNo}`;
    } else if (cleanParticulars && (editRowData.entryType === "SALE_INVOICE" || editRowData.entryType === "PURCHASE_INVOICE") && docNo) {
      cleanParticulars = `Bill No. ${docNo}`;
    }

    updatedEntries[idx] = {
      ...prev,
      date: editRowData.date || prev.date,
      entryType: editRowData.entryType as any,
      docNo,
      particularsRaw: cleanParticulars || prev.particularsRaw,
      debit: deb,
      credit: cred,
    };

    // Keep entries sorted chronologically by date
    updatedEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setStatementData({
      ...statementData,
      entries: updatedEntries,
    });
    setEditingIndex(null);
  };

  const handleDeleteRow = (idx: number) => {
    if (editingIndex === idx) setEditingIndex(null);
    const updatedEntries = statementData.entries.filter((_, i) => i !== idx);
    setStatementData({
      ...statementData,
      entries: updatedEntries,
    });
  };

  const handleAddRow = () => {
    const defaultDate =
      statementData.periodTo || statementData.periodFrom || new Date().toISOString().slice(0, 10);
    const defaultType = accountType === "SUPPLIER" ? "PURCHASE_INVOICE" : "SALE_INVOICE";
    const newEntry: StatementEntry = {
      date: defaultDate,
      entryType: defaultType,
      docNo: "",
      paymentMode: null,
      instrumentNo: null,
      instrumentDate: null,
      referencedDocs: [],
      priorYearRefs: [],
      referencesTruncated: false,
      particularsRaw: "",
      debit: 0,
      credit: 0,
      printedBalance: null,
      printedBalanceSide: null,
    };
    const newEntries = [...statementData.entries, newEntry];
    setStatementData({
      ...statementData,
      entries: newEntries,
    });
    setEditingIndex(newEntries.length - 1);
    setEditRowData({
      date: defaultDate,
      entryType: defaultType,
      docNo: "",
      particularsRaw: "",
      debit: "",
      credit: "",
    });
  };

  const handleSaveOpening = () => {
    const amt = parseFloat(editOpeningAmount) || 0;
    setStatementData({
      ...statementData,
      openingBalance: amt,
      openingSide: editOpeningSide,
    });
    setIsEditingOpening(false);
  };

  const handleSyncTotals = () => {
    if (!liveValidation) return;
    setStatementData({
      ...statementData,
      printedTotals: {
        debit: liveValidation.replayedDebitTotal,
        credit: liveValidation.replayedCreditTotal,
        balance: liveValidation.replayedClosing,
        balanceSide: liveValidation.replayedSide,
      },
    });
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
          statement: statementData,
          draft: statementData,
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
                {formatINR(extracted.openingBalance)}{" "}
                <span
                  className={cn(
                    "font-bold ml-0.5",
                    (extracted.openingBalanceSide || extracted.openingSide) === "Cr"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  )}
                >
                  {extracted.openingBalanceSide || extracted.openingSide}
                </span>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Account Type:</label>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-primary/10 text-primary">
                  Suggested from {closingSide === "Cr" ? "Credit (Cr)" : "Debit (Dr)"} closing
                </span>
              </div>
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
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Replay & Statement Totals Reconciled
          </h4>
          {(!isValid && validationErrors.length > 0 && liveValidation && (
            validationErrors.some((e) => e.includes("Total mismatch") || e.includes("Side mismatch"))
          )) && (
            <button
              type="button"
              onClick={handleSyncTotals}
              className="text-xs text-primary hover:text-primary/80 font-medium underline inline-flex items-center gap-1.5 self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Sync Statement Totals with Replayed Sum
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Debit Total</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {formatINR(statementData?.printedTotals?.debit ?? 0)}
            </span>
            {liveValidation && liveValidation.replayedDebitTotal !== statementData?.printedTotals?.debit && (
              <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                Replayed: {formatINR(liveValidation.replayedDebitTotal)}
              </span>
            )}
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Credit Total</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {formatINR(statementData?.printedTotals?.credit ?? 0)}
            </span>
            {liveValidation && liveValidation.replayedCreditTotal !== statementData?.printedTotals?.credit && (
              <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                Replayed: {formatINR(liveValidation.replayedCreditTotal)}
              </span>
            )}
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Closing Balance</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {formatINR(statementData?.printedTotals?.balance ?? 0)}{" "}
              <span
                className={cn(
                  "font-bold ml-0.5",
                  (statementData?.printedTotals?.balanceSide ?? "Dr") === "Cr"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                )}
              >
                {statementData?.printedTotals?.balanceSide ?? "Dr"}
              </span>
            </span>
            {liveValidation &&
              (liveValidation.replayedClosing !== statementData?.printedTotals?.balance ||
                liveValidation.replayedSide !== statementData?.printedTotals?.balanceSide) && (
                <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                  Replayed: {formatINR(liveValidation.replayedClosing)} {liveValidation.replayedSide}
                </span>
              )}
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
            <span className="text-xs text-muted-foreground block">Total Entries</span>
            <span className="font-mono font-semibold text-sm text-foreground">
              {statementData?.entries?.length || 0} rows
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Extracted Transactions ({statementData.entries?.length || 0} rows)
            </h4>
            <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded font-medium">
              Editable
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono">
              {statementData.periodFrom} &rarr; {statementData.periodTo}
            </span>
            <button
              type="button"
              onClick={handleAddRow}
              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Row
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Date</th>
                <th className="py-2.5 px-3.5 min-w-[340px]">Particulars / Doc No</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Debit (₹)</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Credit (₹)</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Balance</th>
                <th className="py-2.5 px-3.5 text-center whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3.5 text-center w-20 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-mono">
              {/* Line 1: Opening Balance */}
              <tr className="import-edit-opening bg-muted/40 font-medium border-b border-border">
                <td className="py-2.5 px-3.5 text-muted-foreground whitespace-nowrap">
                  {formatDate(statementData.periodFrom)}
                </td>
                <td className="py-2.5 px-3.5 text-foreground font-sans font-semibold min-w-[340px]">
                  {isEditingOpening ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-sans">Opening Balance</span>
                      <select
                        value={editOpeningSide}
                        onChange={(e) => setEditOpeningSide(e.target.value as "Dr" | "Cr")}
                        className="px-2 py-0.5 text-xs rounded border border-border bg-background font-sans"
                      >
                        <option value="Dr">Dr (Customer / Debtor)</option>
                        <option value="Cr">Cr (Supplier / Creditor)</option>
                      </select>
                    </div>
                  ) : (
                    "Opening Balance"
                  )}
                </td>
                <td className="py-2.5 px-3.5 text-right">
                  {isEditingOpening ? (
                    editOpeningSide === "Dr" ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editOpeningAmount}
                        onChange={(e) => setEditOpeningAmount(e.target.value)}
                        className="w-24 text-right px-2 py-0.5 text-xs rounded border border-primary/50 bg-background font-mono"
                      />
                    ) : (
                      "—"
                    )
                  ) : statementData.openingSide === "Dr" ? (
                    formatINR(statementData.openingBalance)
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2.5 px-3.5 text-right">
                  {isEditingOpening ? (
                    editOpeningSide === "Cr" ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editOpeningAmount}
                        onChange={(e) => setEditOpeningAmount(e.target.value)}
                        className="w-24 text-right px-2 py-0.5 text-xs rounded border border-primary/50 bg-background font-mono"
                      />
                    ) : (
                      "—"
                    )
                  ) : statementData.openingSide === "Cr" ? (
                    formatINR(statementData.openingBalance)
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2.5 px-3.5 text-right font-semibold">
                  {formatINR(statementData.openingBalance)}{" "}
                  <span
                    className={cn(
                      "font-bold ml-0.5",
                      statementData.openingSide === "Cr"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {statementData.openingSide}
                  </span>
                </td>
                <td className="py-2.5 px-3.5 text-center font-sans">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    Opening
                  </span>
                </td>
                <td className="py-2.5 px-3.5 text-center">
                  {isEditingOpening ? (
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={handleSaveOpening}
                        title="Save Opening Balance"
                        className="p-1 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingOpening(false)}
                        title="Cancel"
                        className="p-1 rounded bg-muted text-muted-foreground hover:bg-muted/80"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingOpening(true);
                        setEditOpeningAmount(String(statementData.openingBalance || 0));
                        setEditOpeningSide(statementData.openingSide || "Dr");
                      }}
                      title="Edit Opening Balance"
                      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>

              {/* Extracted Rows */}
              {statementData.entries?.map((row: any, idx: number) => {
                const isEditing = editingIndex === idx;
                const isMatchedInvoice =
                  row.docNo &&
                  existingInvoicesFound.some((inv: any) => inv.docNoNorm === row.docNoNorm);

                const rowDate = row.date || row.entryDate;

                if (isEditing) {
                  return (
                    <tr key={idx} className="import-edit-row bg-primary/5 border-l-2 border-l-primary">
                      <td className="py-2.5 px-3.5">
                        <input
                          type="date"
                          value={editRowData.date}
                          onChange={(e) => setEditRowData((prev) => ({ ...prev, date: e.target.value }))}
                          className="w-32 px-2 py-1 text-xs rounded border border-primary/50 bg-background font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-3.5 min-w-[340px]">
                        <div className="space-y-1.5 py-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={editRowData.entryType}
                              onChange={(e) =>
                                setEditRowData((prev) => ({ ...prev, entryType: e.target.value }))
                              }
                              className="px-2 py-1 text-xs rounded border border-border bg-background font-sans"
                            >
                              <option value="SALE_INVOICE">Sale Invoice (Dr)</option>
                              <option value="PURCHASE_INVOICE">Purchase Invoice (Cr)</option>
                              <option value="RECEIPT">Payment Received (Cr)</option>
                              <option value="PAYMENT">Payment Made (Dr)</option>
                              <option value="CREDIT_NOTE">Credit Note (Cr)</option>
                              <option value="DEBIT_NOTE">Debit Note (Dr)</option>
                              <option value="ADJUSTMENT">Journal Adjustment</option>
                            </select>
                            <input
                              type="text"
                              placeholder="Doc / Bill No"
                              value={editRowData.docNo}
                              onChange={(e) =>
                                setEditRowData((prev) => ({ ...prev, docNo: e.target.value }))
                              }
                              className="w-32 px-2 py-1 text-xs rounded border border-border bg-background font-sans"
                            />
                          </div>
                          <input
                            type="text"
                            placeholder="Particulars text"
                            value={editRowData.particularsRaw}
                            onChange={(e) =>
                              setEditRowData((prev) => ({ ...prev, particularsRaw: e.target.value }))
                            }
                            className="w-full px-2 py-1 text-xs rounded border border-border bg-background font-sans"
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={editRowData.debit}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditRowData((prev) => ({
                              ...prev,
                              debit: val,
                              credit: Number(val) > 0 ? "" : prev.credit,
                            }));
                          }}
                          className="w-24 text-right px-2 py-1 text-xs rounded border border-primary/50 bg-background font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={editRowData.credit}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditRowData((prev) => ({
                              ...prev,
                              credit: val,
                              debit: Number(val) > 0 ? "" : prev.debit,
                            }));
                          }}
                          className="w-24 text-right px-2 py-1 text-xs rounded border border-primary/50 bg-background font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <span className="text-[11px] text-muted-foreground italic font-sans">
                          Auto recomputed
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-sans">
                        <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded font-medium">
                          Editing
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSaveRow(idx)}
                            title="Save Row"
                            className="p-1 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingIndex(null)}
                            title="Cancel"
                            className="p-1 rounded bg-muted text-muted-foreground hover:bg-muted/80"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={idx} className="hover:bg-muted/20 group">
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
                      {row.printedBalanceSide && (
                        <span
                          className={cn(
                            "font-bold ml-0.5",
                            row.printedBalanceSide === "Cr"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          )}
                        >
                          {row.printedBalanceSide}
                        </span>
                      )}
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
                      ) : row.entryType === "PURCHASE_INVOICE" ? (
                        <span className="text-[10px] text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded font-medium">
                          Purchase Bill
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-sans">
                          {row.entryType}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(idx)}
                          title="Edit this row"
                          className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(idx)}
                          title="Delete this row"
                          className="p-1 rounded text-muted-foreground hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
