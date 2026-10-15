"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, FileText, CheckCircle2, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { DocumentViewer } from "@/components/upload/DocumentViewer";
import { PreviewForm } from "@/components/upload/PreviewForm";
import { DuplicateDialog } from "@/components/upload/DuplicateDialog";
import { DiffView } from "@/components/upload/DiffView";
import { ExtractedInvoice } from "@/lib/llm/schema";
import { CustomerResolution } from "@/lib/matching/customer";
import { ProductResolution } from "@/lib/matching/product";

interface QueueItem {
  id: string;
  file: File;
  status: "QUEUED" | "EXTRACTING" | "READY" | "SAVED" | "FAILED";
  error?: string;
  extractionData?: {
    draft: ExtractedInvoice;
    validation: any;
    customerMatch: CustomerResolution;
    productMatches: ProductResolution[];
    duplicate: any;
    fileToken: string;
    pages: Array<{ pageNumber: number; pngBase64: string }>;
  };
}

export default function UploadPage() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [isModifyingDuplicate, setIsModifyingDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: QueueItem[] = Array.from(files).map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: "QUEUED",
    }));

    setQueue((prev) => [...prev, ...newItems]);

    // Start extraction for the newly added items
    newItems.forEach((item) => extractFile(item));
  };

  const extractFile = async (item: QueueItem) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: "EXTRACTING" } : q))
    );

    const formData = new FormData();
    formData.append("file", item.file);

    try {
      const res = await fetch("/api/invoices/extract", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "FAILED", error: data.error?.message || "Extraction failed" }
              : q
          )
        );
        return;
      }

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: "READY", extractionData: data }
            : q
        )
      );

      // Auto-select first ready item if none is currently selected
      setCurrentIndex((prev) => (prev === null ? 0 : prev));
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: "FAILED", error: err.message || "Network error during extraction" }
            : q
        )
      );
    }
  };

  const currentItem = currentIndex !== null ? queue[currentIndex] : null;

  // Check if current item has a duplicate on initial review
  const activeDuplicate = currentItem?.extractionData?.duplicate;

  const handleSaveInvoice = async (payload: any) => {
    setSaving(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error?.code === "DUPLICATE_INVOICE") {
          setIsDuplicateDialogOpen(true);
          setSaving(false);
          return;
        }
        alert(data.error?.message || "Failed to save invoice");
        setSaving(false);
        return;
      }

      setToastMessage(
        `Invoice #${payload.draft.invoice.number} saved · ${
          data.newCustomerCreated ? "1 new customer" : "0 new customers"
        } · ${data.newProductsCreatedCount} new products`
      );

      // Mark current queue item as saved
      if (currentItem) {
        setQueue((prev) =>
          prev.map((q) => (q.id === currentItem.id ? { ...q, status: "SAVED" } : q))
        );
      }

      // Move to next queue item or finish
      setTimeout(() => {
        setToastMessage(null);
        setIsModifyingDuplicate(false);
        const nextReadyIndex = queue.findIndex(
          (q, idx) => idx !== currentIndex && q.status === "READY"
        );
        if (nextReadyIndex !== -1) {
          setCurrentIndex(nextReadyIndex);
        } else {
          // If queue is done, redirect to invoices list
          router.push("/invoices");
        }
      }, 2000);
    } catch (err) {
      console.error(err);
      alert("Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-4 bg-success text-primary-fg rounded-sm shadow-pop flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* When no item is being reviewed, show full dropzone & queue */}
      {(!currentItem || currentItem.status !== "READY") && (
        <div className="space-y-6 max-w-3xl mx-auto w-full pt-6">
          <div>
            <h2 className="text-xl font-semibold text-ink">Upload Invoices</h2>
            <p className="text-xs text-ink-3">
              Upload scanned sales invoices in PDF, PNG, or JPG format for automated data extraction
            </p>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFilesSelected(e.dataTransfer.files);
            }}
            className="border-2 border-dashed border-border-strong bg-surface hover:bg-surface-2/40 transition rounded-sm p-10 text-center cursor-pointer"
          >
            <FileUp className="w-10 h-10 text-primary mx-auto mb-3" />
            <p className="text-sm font-semibold text-ink mb-1">
              Drag & drop invoice files here, or browse
            </p>
            <p className="text-xs text-ink-3 mb-4">PDF, PNG or JPG · up to 10 MB each</p>

            <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-fg rounded-sm text-xs font-semibold cursor-pointer hover:opacity-90 transition">
              <span>Select Files</span>
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
            </label>
          </div>

          {/* Upload Queue List */}
          {queue.length > 0 && (
            <div className="bg-surface border border-border rounded-sm overflow-hidden">
              <div className="p-3 bg-surface-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">
                  Upload Queue ({queue.filter((q) => q.status === "SAVED").length} of {queue.length} completed)
                </span>
              </div>

              <div className="divide-y divide-border text-xs">
                {queue.map((item, idx) => (
                  <div key={item.id} className="p-3 flex items-center justify-between hover:bg-surface-2/40">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-ink-3" />
                      <div>
                        <span className="font-medium text-ink">{item.file.name}</span>
                        <span className="text-ink-3 ml-2 font-mono text-[11px]">
                          ({(item.file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {item.status === "EXTRACTING" && (
                        <span className="inline-flex items-center gap-1.5 text-primary text-[11px] font-medium">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Reading invoice...</span>
                        </span>
                      )}
                      {item.status === "READY" && (
                        <button
                          onClick={() => setCurrentIndex(idx)}
                          className="px-3 py-1 bg-primary text-primary-fg rounded-sm font-semibold text-[11px] hover:opacity-90 transition"
                        >
                          Review & Save
                        </button>
                      )}
                      {item.status === "SAVED" && (
                        <span className="inline-flex items-center gap-1 text-success text-[11px] font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Saved</span>
                        </span>
                      )}
                      {item.status === "FAILED" && (
                        <span className="inline-flex items-center gap-1 text-danger text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{item.error || "Failed"}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Mode: Split View (Document on left, PreviewForm on right) */}
      {currentItem && currentItem.status === "READY" && currentItem.extractionData && (
        <div className="flex-1 flex flex-col min-h-0 space-y-3">
          {/* Top Bar for Queue Navigation */}
          <div className="flex items-center justify-between bg-surface p-2.5 border border-border rounded-sm">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-ink">Reviewing: {currentItem.file.name}</span>
              <span className="text-ink-3 font-mono">
                ({currentIndex! + 1} of {queue.length})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => extractFile(currentItem)}
                className="px-2.5 py-1 text-xs border border-border rounded-sm text-ink-2 hover:bg-surface-2 transition flex items-center gap-1"
                title="Re-extract with AI"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Re-extract</span>
              </button>

              <button
                onClick={() => setCurrentIndex(null)}
                className="px-2.5 py-1 text-xs border border-border rounded-sm text-ink-2 hover:bg-surface-2 transition"
              >
                Back to Queue
              </button>
            </div>
          </div>

          {/* Duplicate Banner / Diff View */}
          {activeDuplicate && !isModifyingDuplicate && (
            <div className="p-3 bg-danger-bg border border-danger/40 rounded-sm text-xs text-danger flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>Duplicate Warning:</strong> Invoice #{activeDuplicate.invoiceNumber} already exists in database
                  (saved {activeDuplicate.invoiceDate?.split("T")[0]} for {activeDuplicate.customerName}).
                </span>
              </div>
              <button
                onClick={() => setIsDuplicateDialogOpen(true)}
                className="px-3 py-1 bg-surface border border-danger text-danger rounded-sm font-semibold hover:bg-danger-bg transition"
              >
                Resolve Duplicate
              </button>
            </div>
          )}

          {isModifyingDuplicate && activeDuplicate?.existingInvoice && (
            <DiffView
              existingInvoice={activeDuplicate.existingInvoice}
              draft={currentItem.extractionData.draft}
            />
          )}

          {/* Split Screen Container */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
            {/* Left Column: Original Document Viewer */}
            <div className="lg:col-span-5 h-full min-h-[400px]">
              <DocumentViewer pages={currentItem.extractionData.pages} />
            </div>

            {/* Right Column: Editable Preview Form */}
            <div className="lg:col-span-7 h-full min-h-[400px]">
              <PreviewForm
                initialDraft={currentItem.extractionData.draft}
                customerMatch={currentItem.extractionData.customerMatch}
                productMatches={currentItem.extractionData.productMatches}
                fileToken={currentItem.extractionData.fileToken}
                mode={isModifyingDuplicate ? "replace" : "create"}
                onSave={handleSaveInvoice}
                onDiscard={() => setCurrentIndex(null)}
                saving={saving}
              />
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Dialog Modal */}
      {activeDuplicate && (
        <DuplicateDialog
          isOpen={isDuplicateDialogOpen}
          invoiceNumber={activeDuplicate.invoiceNumber}
          duplicateInfo={activeDuplicate}
          onModify={() => {
            setIsDuplicateDialogOpen(false);
            setIsModifyingDuplicate(true);
          }}
          onDiscard={() => {
            setIsDuplicateDialogOpen(false);
            setCurrentIndex(null);
          }}
          onViewExisting={() => {
            setIsDuplicateDialogOpen(false);
            router.push(`/invoices/${activeDuplicate.invoiceId}`);
          }}
        />
      )}
    </div>
  );
}
