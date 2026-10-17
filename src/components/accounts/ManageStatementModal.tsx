"use client";

import React, { useState } from "react";
import { formatINR, formatDate } from "@/lib/format";
import {
  X,
  Check,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Settings,
  Scale,
  Calendar,
  FileText,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportBatch {
  id: string;
  file_name: string;
  period_from: string;
  period_to: string;
  entries_added: number;
  created_at: string;
}

interface ManageStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  accountType?: "CUSTOMER" | "SUPPLIER";
  currentOpeningBalance: number;
  currentOpeningSide: "Dr" | "Cr";
  currentOpeningDate?: string;
  currentThroughDate?: string | null;
  creditDays?: number;
  importBatches?: ImportBatch[];
  onSuccess: () => void;
}

export function ManageStatementModal({
  isOpen,
  onClose,
  accountId,
  accountName,
  accountType = "CUSTOMER",
  currentOpeningBalance,
  currentOpeningSide,
  currentOpeningDate,
  currentThroughDate,
  creditDays = 30,
  importBatches = [],
  onSuccess,
}: ManageStatementModalProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "delete">("edit");

  // Form states for Edit
  const [openingBalance, setOpeningBalance] = useState<string>(
    currentOpeningBalance > 0 ? String(Math.abs(currentOpeningBalance)) : ""
  );
  const [openingSide, setOpeningSide] = useState<"Dr" | "Cr">(currentOpeningSide || "Dr");
  const [openingDate, setOpeningDate] = useState<string>(
    currentOpeningDate ? new Date(currentOpeningDate).toISOString().split("T")[0] : "2026-04-01"
  );
  const [throughDate, setThroughDate] = useState<string>(
    currentThroughDate ? new Date(currentThroughDate).toISOString().split("T")[0] : ""
  );
  const [termsDays, setTermsDays] = useState<string>(String(creditDays || 30));

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/ledger/accounts/${accountId}/statement`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openingBalance: parseFloat(openingBalance) || 0,
          openingSide,
          openingDate: openingDate || undefined,
          statementThroughDate: throughDate || null,
          creditDays: parseInt(termsDays) || 30,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "Failed to update statement settings");
      }

      setSuccessMsg("Statement settings updated successfully.");
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err?.message || "Failed to save statement settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStatementImports = async () => {
    const confirmed = confirm(
      `Are you sure you want to delete all imported statement transactions for ${accountName}?\n\nThis will remove all statement-imported entries and batches so you can re-upload cleanly if anything went wrong. Any sales invoices or manual entries will remain intact.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/ledger/accounts/${accountId}/statement?mode=all_imported`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "Failed to delete statement imports");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to delete statement data");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteEntireLedger = async () => {
    const confirmed = confirm(
      `⚠️ WARNING: Delete ENTIRE ledger for ${accountName}?\n\nThis will permanently delete ALL transactions (including manual entries and opening balance) for this account. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/ledger/accounts/${accountId}/statement?mode=all_entries`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "Failed to reset ledger");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to reset ledger");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteBatch = async (batchId: string, fileName: string) => {
    const confirmed = confirm(
      `Delete statement batch from file "${fileName}"?\n\nThis will remove entries imported from this specific file.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/ledger/accounts/${accountId}/statement?batchId=${encodeURIComponent(batchId)}`,
        { method: "DELETE" }
      );

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "Failed to delete statement batch");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to delete batch");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = confirm(
      `Delete account "${accountName}" from Ledger?\n\nThis will permanently remove this account from the ledger along with all its statement imports and ledger entries. (Any sales invoices in the main database will remain safe).\n\nAre you sure you want to proceed?`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/ledger/accounts/${accountId}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error?.message || json.error || "Failed to delete account");
      }

      onClose();
      window.location.href = "/accounts";
    } catch (err: any) {
      setError(err?.message || "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground text-sm">
                Manage Statement &bull; {accountName}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Edit opening balance, adjust statement dates, or delete statement if anything went wrong.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center px-6 border-b border-border bg-muted/10">
          <button
            type="button"
            onClick={() => setActiveTab("edit")}
            className={cn(
              "py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors",
              activeTab === "edit"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Edit Statement & Opening</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("delete")}
            className={cn(
              "py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors",
              activeTab === "delete"
                ? "border-rose-500 text-rose-600 dark:text-rose-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete / Reset Statement</span>
          </button>
        </div>

        {/* Tab 1: Edit Settings */}
        {activeTab === "edit" ? (
          <form onSubmit={handleSaveEdit} className="p-6 space-y-4 overflow-y-auto">
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Opening Balance Row */}
            <div className="p-4 rounded-xl border border-border bg-surface-2/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-primary" /> Opening Balance
                </span>
                <span className="text-[11px] text-ink-3">Balance brought forward at start of period</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-ink mb-1">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-ink mb-1">
                    Side (Dr / Cr)
                  </label>
                  <div className="grid grid-cols-2 gap-1 bg-surface p-1 rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setOpeningSide("Dr")}
                      className={cn(
                        "py-1 text-xs font-semibold rounded-md transition-colors",
                        openingSide === "Dr"
                          ? "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Debit (Dr)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpeningSide("Cr")}
                      className={cn(
                        "py-1 text-xs font-semibold rounded-md transition-colors",
                        openingSide === "Cr"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Credit (Cr)
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink mb-1">
                  As of Date
                </label>
                <input
                  type="date"
                  value={openingDate}
                  onChange={(e) => setOpeningDate(e.target.value)}
                  className="w-full sm:w-1/2 px-3 py-1.5 text-xs rounded-lg border border-border bg-surface text-ink font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Other Statement Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Statement Through Date
                </label>
                <input
                  type="date"
                  value={throughDate}
                  onChange={(e) => setThroughDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-[10px] text-ink-3 mt-0.5 block">
                  Last verified date on imported statements.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Default Payment Terms (Credit Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={termsDays}
                  onChange={(e) => setTermsDays(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-[10px] text-ink-3 mt-0.5 block">
                  Days after invoice date before bill becomes overdue.
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-border bg-surface hover:bg-surface-2 text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-primary text-white hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Check className="w-4 h-4 text-white" />
                <span>{saving ? "Saving..." : "Save Settings"}</span>
              </button>
            </div>
          </form>
        ) : (
          /* Tab 2: Delete / Reset Statement */
          <div className="p-6 space-y-5 overflow-y-auto">
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Imported Statement Batches List */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Statement Import Batches ({importBatches.length})
              </h4>

              {importBatches.length === 0 ? (
                <div className="p-3 rounded-lg bg-muted/30 border border-border/60 text-xs text-muted-foreground">
                  No imported statement batches recorded. (All transactions may have been entered manually or auto-created from invoices).
                </div>
              ) : (
                <div className="space-y-2">
                  {importBatches.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-lg border border-border bg-card flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-primary" />
                          <span>{b.file_name}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Period: {formatDate(b.period_from)} &rarr; {formatDate(b.period_to)} &bull;{" "}
                          {b.entries_added} entries &bull; Imported on {formatDate(b.created_at)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteBatch(b.id, b.file_name)}
                        disabled={deleting}
                        className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                        title="Delete this batch only"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Danger Zone: Action 1 - Delete Statement Imports */}
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/20 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-semibold text-rose-900 dark:text-rose-300 text-xs">
                    Delete Statement Imports (Recommended for Re-upload)
                  </h5>
                  <p className="text-[11px] text-rose-800/80 dark:text-rose-400/80 mt-0.5 leading-relaxed">
                    Removes all entries imported from statements for this account. Use this if the wrong statement PDF was uploaded or if figures don&apos;t reconcile. Sales invoices and manual receipts will be preserved.
                  </p>
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleDeleteStatementImports}
                  disabled={deleting}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deleting ? "Deleting..." : "Delete All Statement Imports"}</span>
                </button>
              </div>
            </div>

            {/* Danger Zone: Action 2 - Reset Entire Ledger */}
            <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-semibold text-foreground text-xs">
                    Reset Entire Account Ledger
                  </h5>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Wipes all transactions (including manual entries and opening balance) for this account to start with a completely empty ledger.
                  </p>
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleDeleteEntireLedger}
                  disabled={deleting}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-border bg-surface hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition-colors flex items-center gap-1.5 text-muted-foreground disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deleting ? "Resetting..." : "Reset Entire Ledger"}</span>
                </button>
              </div>
            </div>

            {/* Danger Zone: Action 3 - Delete Account from Ledger */}
            <div className="p-4 rounded-xl border border-rose-300 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30 space-y-3">
              <div className="flex items-start gap-2.5">
                <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-semibold text-rose-900 dark:text-rose-300 text-xs">
                    Delete Account from Ledger
                  </h5>
                  <p className="text-[11px] text-rose-800/80 dark:text-rose-400/80 mt-0.5 leading-relaxed">
                    Permanently removes this party from the Ledger entirely (for example, if the account was created by mistake or with the wrong customer name). All ledger entries for this account will be removed.
                  </p>
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-700 text-white hover:bg-rose-800 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deleting ? "Deleting Account..." : "Delete Account from Ledger"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
