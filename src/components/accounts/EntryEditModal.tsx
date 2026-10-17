"use client";

import React, { useState, useEffect } from "react";
import { formatINR } from "@/lib/format";
import { X, Check, AlertCircle, Plus, Edit2, Calendar, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatementRowForEdit {
  id: string;
  entry_date: string;
  sort_seq?: number;
  entry_type: string;
  particulars?: string;
  particulars_raw?: string;
  doc_no?: string | null;
  debit: number;
  credit: number;
  payment_mode?: string | null;
  instrument_no?: string | null;
  instrument_date?: string | null;
  narration?: string | null;
}

interface EntryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  accountType?: "CUSTOMER" | "SUPPLIER";
  entryToEdit?: StatementRowForEdit | null;
  onSuccess: () => void;
}

export function EntryEditModal({
  isOpen,
  onClose,
  accountId,
  accountName,
  accountType = "CUSTOMER",
  entryToEdit = null,
  onSuccess,
}: EntryEditModalProps) {
  const isCustomer = accountType === "CUSTOMER";
  const isEditMode = !!entryToEdit;

  const defaultType = isCustomer ? "RECEIPT" : "PAYMENT";

  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [entryType, setEntryType] = useState<string>(defaultType);
  const [debit, setDebit] = useState<string>("");
  const [credit, setCredit] = useState<string>("");
  const [particulars, setParticulars] = useState<string>("");
  const [docNo, setDocNo] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<string>("CHEQUE");
  const [instrumentNo, setInstrumentNo] = useState<string>("");
  const [instrumentDate, setInstrumentDate] = useState<string>("");
  const [narration, setNarration] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When entryToEdit changes or modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (entryToEdit) {
      const rowDate = entryToEdit.entry_date
        ? new Date(entryToEdit.entry_date).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      setDate(rowDate);
      setEntryType(entryToEdit.entry_type || defaultType);
      setDebit(entryToEdit.debit > 0 ? String(entryToEdit.debit) : "");
      setCredit(entryToEdit.credit > 0 ? String(entryToEdit.credit) : "");
      setParticulars(entryToEdit.particulars_raw || entryToEdit.particulars || "");
      setDocNo(entryToEdit.doc_no || "");
      setPaymentMode(entryToEdit.payment_mode || "NONE");
      setInstrumentNo(entryToEdit.instrument_no || "");
      setInstrumentDate(
        entryToEdit.instrument_date
          ? new Date(entryToEdit.instrument_date).toISOString().split("T")[0]
          : ""
      );
      setNarration(entryToEdit.narration || "");
    } else {
      // Reset for add mode
      setDate(new Date().toISOString().split("T")[0]);
      setEntryType(defaultType);
      setDebit("");
      setCredit("");
      setParticulars("");
      setDocNo("");
      setPaymentMode("CHEQUE");
      setInstrumentNo("");
      setInstrumentDate("");
      setNarration("");
    }
    setError(null);
  }, [isOpen, entryToEdit, defaultType]);

  // Quick auto-focus amount side when entry type changes in Add mode
  const handleTypeChange = (newType: string) => {
    setEntryType(newType);
    if (!isEditMode) {
      if (isCustomer) {
        if (newType === "RECEIPT" || newType === "CREDIT_NOTE") {
          if (debit && !credit) {
            setCredit(debit);
            setDebit("");
          }
        } else if (newType === "SALE_INVOICE" || newType === "DEBIT_NOTE") {
          if (credit && !debit) {
            setDebit(credit);
            setCredit("");
          }
        }
      } else {
        if (newType === "PAYMENT" || newType === "DEBIT_NOTE") {
          if (credit && !debit) {
            setDebit(credit);
            setCredit("");
          }
        } else if (newType === "PURCHASE_INVOICE" || newType === "CREDIT_NOTE") {
          if (debit && !credit) {
            setCredit(debit);
            setDebit("");
          }
        }
      }
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const debNum = parseFloat(debit) || 0;
    const credNum = parseFloat(credit) || 0;

    if (debNum <= 0 && credNum <= 0) {
      setError("Please specify a positive Debit or Credit amount.");
      return;
    }

    if (!particulars.trim()) {
      setError("Please provide a description or particulars for this line.");
      return;
    }

    setSubmitting(true);

    try {
      const payload: any = {
        accountId,
        entryDate: date,
        entryType,
        debit: debNum,
        credit: credNum,
        particulars: particulars.trim(),
        docNo: docNo.trim() || undefined,
        paymentMode: paymentMode === "NONE" ? undefined : paymentMode,
        instrumentNo: instrumentNo.trim() || undefined,
        instrumentDate: instrumentDate || undefined,
        narration: narration.trim() || undefined,
      };

      let res: Response;
      if (isEditMode && entryToEdit) {
        res = await fetch(`/api/ledger/entries/${entryToEdit.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/ledger/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok || json.success === false) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : json.error?.message || json.message || "Failed to save entry";
        throw new Error(msg);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save entry");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            {isEditMode ? (
              <Edit2 className="w-5 h-5 text-primary" />
            ) : (
              <Plus className="w-5 h-5 text-primary" />
            )}
            <div>
              <h3 className="font-semibold text-foreground text-sm">
                {isEditMode ? "Edit Statement Line" : "Add Statement Entry / Future Payment"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Account: <strong className="text-foreground">{accountName}</strong> ({accountType})
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

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Row 1: Date & Entry Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Transaction Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <span className="text-[10px] text-ink-3 mt-0.5 block">
                Can be a future date for scheduled / post-dated payments.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Entry Type *
              </label>
              <select
                value={entryType}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {isCustomer ? (
                  <>
                    <option value="RECEIPT" className="bg-surface text-ink">Payment / Receipt (Credit)</option>
                    <option value="SALE_INVOICE" className="bg-surface text-ink">Sale Invoice / Bill (Debit)</option>
                    <option value="CREDIT_NOTE" className="bg-surface text-ink">Credit Note (Credit)</option>
                    <option value="DEBIT_NOTE" className="bg-surface text-ink">Debit Note (Debit)</option>
                    <option value="ADJUSTMENT" className="bg-surface text-ink">Journal Adjustment</option>
                  </>
                ) : (
                  <>
                    <option value="PAYMENT" className="bg-surface text-ink">Payment to Supplier (Debit)</option>
                    <option value="PURCHASE_INVOICE" className="bg-surface text-ink">Purchase Invoice (Credit)</option>
                    <option value="DEBIT_NOTE" className="bg-surface text-ink">Debit Note (Debit)</option>
                    <option value="CREDIT_NOTE" className="bg-surface text-ink">Credit Note (Credit)</option>
                    <option value="ADJUSTMENT" className="bg-surface text-ink">Journal Adjustment</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Row 2: Debit & Credit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-lg bg-surface-2/40 border border-border">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Debit (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={debit}
                onChange={(e) => {
                  setDebit(e.target.value);
                  if (parseFloat(e.target.value) > 0) setCredit("");
                }}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-border bg-surface text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[10px] text-ink-3 mt-0.5 block">
                {isCustomer ? "Increases customer receivable (Dr)" : "Reduces supplier payable"}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Credit (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={credit}
                onChange={(e) => {
                  setCredit(e.target.value);
                  if (parseFloat(e.target.value) > 0) setDebit("");
                }}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-border bg-surface text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[10px] text-ink-3 mt-0.5 block">
                {isCustomer ? "Reduces customer balance (Payment / Cr)" : "Increases supplier payable"}
              </span>
            </div>
          </div>

          {/* Row 3: Particulars & Doc No */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-ink mb-1">
                Particulars / Description *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. By Cheque No. 492011, Advance payment, NEFT..."
                value={particulars}
                onChange={(e) => setParticulars(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Doc / Bill / Receipt No.
              </label>
              <input
                type="text"
                placeholder="e.g. RCP-001 or Bill No."
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
          </div>

          {/* Row 4: Payment Mode & Instrument Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="NONE" className="bg-surface text-ink">None / Not applicable</option>
                <option value="CHEQUE" className="bg-surface text-ink">Cheque</option>
                <option value="NEFT" className="bg-surface text-ink">NEFT</option>
                <option value="RTGS" className="bg-surface text-ink">RTGS</option>
                <option value="UPI" className="bg-surface text-ink">UPI</option>
                <option value="CASH" className="bg-surface text-ink">Cash</option>
                <option value="OTHER" className="bg-surface text-ink">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Instrument / Ref No.
              </label>
              <input
                type="text"
                placeholder="Cheque No / UTR / Txn ID"
                value={instrumentNo}
                onChange={(e) => setInstrumentNo(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Instrument Date
              </label>
              <input
                type="date"
                value={instrumentDate}
                onChange={(e) => setInstrumentDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
          </div>

          {/* Row 5: Notes / Narration */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Internal Narration / Remarks
            </label>
            <input
              type="text"
              placeholder="Optional remarks or reconciliation note"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-surface text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-border bg-surface hover:bg-surface-2 text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-primary text-white hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Check className="w-4 h-4 text-white" />
              <span>{submitting ? "Saving..." : isEditMode ? "Save Changes" : "Add Line to Statement"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
