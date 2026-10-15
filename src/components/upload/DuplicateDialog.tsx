"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, GitCompare, X, Eye } from "lucide-react";
import { formatINR, formatDate } from "@/lib/format";

interface DuplicateDialogProps {
  isOpen: boolean;
  invoiceNumber: string;
  duplicateInfo: {
    invoiceId: string;
    invoiceNumber: string;
    customerName: string;
    invoiceDate: string | Date;
    grandTotal: number | string;
    itemsCount: number;
  };
  onModify: () => void;
  onDiscard: () => void;
  onViewExisting: () => void;
}

export function DuplicateDialog({
  isOpen,
  invoiceNumber,
  duplicateInfo,
  onModify,
  onDiscard,
  onViewExisting,
}: DuplicateDialogProps) {
  const discardButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus starts on Discard to avoid accidental overwrite
      setTimeout(() => discardButtonRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-danger/40 rounded-lg shadow-pop w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-sm bg-danger-bg text-danger flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>

          <div className="flex-1">
            <h3 className="text-base font-semibold text-ink">
              Invoice <span className="font-mono">{invoiceNumber}</span> Already Exists
            </h3>

            <p className="text-xs text-ink-3 mt-1">
              A record with this exact invoice number is already stored in the system:
            </p>

            <div className="mt-3 p-3 bg-surface-2/60 border border-border rounded-sm text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-3">Customer:</span>
                <span className="font-medium text-ink">{duplicateInfo.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-3">Invoice Date:</span>
                <span className="font-mono text-ink">{formatDate(duplicateInfo.invoiceDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-3">Grand Total:</span>
                <span className="font-semibold text-ink num">{formatINR(Number(duplicateInfo.grandTotal))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-3">Lines:</span>
                <span className="font-mono text-ink-2">{duplicateInfo.itemsCount} line items</span>
              </div>
            </div>

            <p className="text-xs text-ink-2 mt-3">
              Do you want to modify the existing invoice, or discard this new upload?
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onViewExisting}
                className="px-3 py-1.5 text-xs text-ink-3 hover:text-ink hover:underline flex items-center gap-1 mr-auto"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View existing</span>
              </button>

              <button
                ref={discardButtonRef}
                type="button"
                onClick={onDiscard}
                className="px-3.5 py-2 rounded-sm border border-border text-xs font-medium text-ink hover:bg-surface-2 transition"
              >
                Don&apos;t save (discard)
              </button>

              <button
                type="button"
                onClick={onModify}
                className="px-4 py-2 rounded-sm bg-primary text-primary-fg text-xs font-medium hover:opacity-90 flex items-center gap-1.5 transition"
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Modify existing</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
