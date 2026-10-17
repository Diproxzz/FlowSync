"use client";

import React, { useState, useEffect } from "react";
import { formatINR, formatDate } from "@/lib/format";
import { X, Check, Calculator, AlertCircle, Plus, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface OpenItemSuggestion {
  targetEntryId: string;
  docNo: string | null;
  entryDate: string;
  originalAmount: number;
  outstandingBefore: number;
  suggestedAllocation: number;
  allocatedAmount: number; // editable
}

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  accountType?: "CUSTOMER" | "SUPPLIER";
  onSuccess: () => void;
}

export function ReceiptModal({
  isOpen,
  onClose,
  accountId,
  accountName,
  accountType = "CUSTOMER",
  onSuccess,
}: ReceiptModalProps) {
  const isCustomer = accountType === "CUSTOMER";
  const defaultEntryType = isCustomer ? "RECEIPT" : "PAYMENT";

  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<string>("CHEQUE");
  const [instrumentNo, setInstrumentNo] = useState<string>("");
  const [instrumentDate, setInstrumentDate] = useState<string>("");
  const [narration, setNarration] = useState<string>("");

  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<OpenItemSuggestion[]>([]);
  const [unallocatedAdvance, setUnallocatedAdvance] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch open item suggestions when amount changes
  useEffect(() => {
    if (!isOpen || !accountId) return;

    const numAmount = parseFloat(amount) || 0;
    setLoadingSuggestions(true);

    fetch(`/api/ledger/accounts/${accountId}/suggest?amount=${numAmount}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          const mapped: OpenItemSuggestion[] = (data.data.suggestions || []).map((s: any) => ({
            targetEntryId: s.targetEntryId,
            docNo: s.docNo,
            entryDate: s.entryDate,
            originalAmount: s.originalAmount,
            outstandingBefore: s.outstandingBefore,
            suggestedAllocation: s.suggestedAllocation,
            allocatedAmount: s.suggestedAllocation,
          }));
          setSuggestions(mapped);
          setUnallocatedAdvance(data.data.unallocatedAdvance || 0);
        }
      })
      .catch((err) => console.error("Error fetching suggestions:", err))
      .finally(() => setLoadingSuggestions(false));
  }, [isOpen, accountId, amount]);

  if (!isOpen) return null;

  const totalAllocated = suggestions.reduce((sum, s) => sum + (Number(s.allocatedAmount) || 0), 0);
  const currentAmountNum = parseFloat(amount) || 0;
  const currentUnallocated = Math.max(0, currentAmountNum - totalAllocated);

  const handleAllocationChange = (index: number, val: string) => {
    const parsed = parseFloat(val) || 0;
    const next = [...suggestions];
    const item = next[index];
    // Cannot exceed outstandingBefore
    const capped = Math.min(Math.max(0, parsed), item.outstandingBefore);
    next[index] = { ...item, allocatedAmount: capped };
    setSuggestions(next);
  };

  // Build live particulars preview
  const referencedBillDocs = suggestions
    .filter((s) => s.allocatedAmount > 0)
    .map((s) => (s.docNo ? s.docNo : "Opening Balance"));

  let particularsPreview = "";
  if (paymentMode === "CHEQUE") {
    particularsPreview = `Cheque No. : ${instrumentNo || "_______"}`;
  } else {
    particularsPreview = `${paymentMode}${instrumentNo ? ` : ${instrumentNo}` : ""}`;
  }
  if (instrumentDate) {
    const [y, m, d] = instrumentDate.split("-");
    if (d && m && y) particularsPreview += ` DT-${d}.${m}.${y}`;
  }
  if (referencedBillDocs.length > 0) {
    particularsPreview += ` Ag. ${referencedBillDocs.join(", ")}`;
  }

  const handleSubmit = async (addAnother = false) => {
    setError(null);
    if (!amount || currentAmountNum <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }

    if (totalAllocated > currentAmountNum + 0.01) {
      setError("Total allocated amount cannot exceed receipt amount.");
      return;
    }

    setSubmitting(true);
    try {
      const allocations = suggestions
        .filter((s) => s.allocatedAmount > 0)
        .map((s) => ({
          targetEntryId: s.targetEntryId,
          amount: s.allocatedAmount,
        }));

      const res = await fetch("/api/ledger/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          entryType: defaultEntryType,
          entryDate: date,
          amount: currentAmountNum,
          paymentMode,
          instrumentNo: instrumentNo || null,
          instrumentDate: instrumentDate || null,
          narration: narration || null,
          allocations,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save entry");
      }

      onSuccess();
      if (addAnother) {
        setAmount("");
        setInstrumentNo("");
        setNarration("");
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {isCustomer ? "Add Customer Receipt" : "Add Supplier Payment"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Account: <strong className="text-foreground">{accountName}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Row 1: Date & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Posting Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-mono text-muted-foreground">₹</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm font-mono font-medium rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Row 2: Mode, Instrument No., Instrument Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="CHEQUE">Cheque</option>
                <option value="NEFT">NEFT</option>
                <option value="RTGS">RTGS</option>
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                {paymentMode === "CHEQUE" ? "Cheque Number" : "Reference / UTR No."}
              </label>
              <input
                type="text"
                placeholder={paymentMode === "CHEQUE" ? "e.g. 002200" : "UTR or Ref #"}
                value={instrumentNo}
                onChange={(e) => setInstrumentNo(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Instrument Date
              </label>
              <input
                type="date"
                value={instrumentDate}
                onChange={(e) => setInstrumentDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Row 3: FIFO Bill Allocation Suggestions */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-primary" />
                FIFO Bill Allocation Suggestions (Oldest First)
              </span>
              <span className="text-[11px] text-muted-foreground">
                Auto-allocated oldest unpaid first
              </span>
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    <th className="py-2 px-3">Bill / Item</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3 text-right">Outstanding</th>
                    <th className="py-2 px-3 text-right w-[130px]">Allocate (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  {suggestions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted-foreground font-sans">
                        {currentAmountNum > 0
                          ? "No unpaid bills found. The amount will be kept as unallocated advance."
                          : "Enter an amount above to view FIFO bill allocation suggestions."}
                      </td>
                    </tr>
                  ) : (
                    suggestions.map((item, idx) => (
                      <tr key={item.targetEntryId} className="hover:bg-muted/30">
                        <td className="py-2 px-3 font-sans">
                          {item.docNo ? (
                            <span className="font-mono text-xs">Bill No. {item.docNo}</span>
                          ) : (
                            <span className="font-semibold text-foreground">Opening Balance</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {formatDate(item.entryDate)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {formatINR(item.outstandingBefore)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={item.allocatedAmount || ""}
                            onChange={(e) => handleAllocationChange(idx, e.target.value)}
                            className="w-full text-right px-2 py-1 text-xs font-mono font-medium rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Allocation Footer Summary */}
            <div className="flex items-center justify-between text-xs px-2 py-1 text-muted-foreground">
              <span>
                Allocated: <strong className="text-foreground font-mono">{formatINR(totalAllocated)}</strong>
              </span>
              <span>
                Advance: <strong className="text-emerald-600 font-mono">{formatINR(currentUnallocated)}</strong>
              </span>
            </div>
          </div>

          {/* Row 4: Live Particulars Preview */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border/80 text-xs space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Info className="w-3 h-3" /> Particulars Preview
            </span>
            <div className="font-mono text-foreground font-medium break-all">
              {particularsPreview || "—"}
            </div>
          </div>

          {/* Row 5: Narration */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Internal Narration / Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Received via cheque handed over by driver"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(true)}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted transition-colors text-foreground"
            >
              Save & Add Another
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
            >
              {submitting ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
