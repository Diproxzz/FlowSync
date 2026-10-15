"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileUp,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Plus,
  Check,
  Clock,
  ExternalLink,
  ChevronRight,
  Layers,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { DocumentViewer } from "@/components/upload/DocumentViewer";
import { PreviewForm } from "@/components/upload/PreviewForm";
import { DuplicateDialog } from "@/components/upload/DuplicateDialog";
import { DiffView } from "@/components/upload/DiffView";
import { ExtractedInvoice } from "@/lib/llm/schema";
import { CustomerResolution } from "@/lib/matching/customer";
import { ProductResolution } from "@/lib/matching/product";
import { formatINR } from "@/lib/format";

export interface QueueItem {
  id: string;
  file: File;
  status: "QUEUED" | "EXTRACTING" | "READY" | "SAVED" | "FAILED";
  error?: string;
  savedInvoiceId?: string;
  savedInvoiceNumber?: string;
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

const MAX_CONCURRENT_EXTRACTIONS = 2;

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [isModifyingDuplicate, setIsModifyingDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Set of IDs currently in extraction to avoid duplicate worker runs
  const runningExtractions = useRef<Set<string>>(new Set());

  // Background queue worker: process up to MAX_CONCURRENT_EXTRACTIONS at a time
  useEffect(() => {
    const activeCount = runningExtractions.current.size;
    if (activeCount >= MAX_CONCURRENT_EXTRACTIONS) return;

    const availableSlots = MAX_CONCURRENT_EXTRACTIONS - activeCount;
    const itemsToExtract = queue
      .filter((q) => q.status === "QUEUED" && !runningExtractions.current.has(q.id))
      .slice(0, availableSlots);

    itemsToExtract.forEach((item) => {
      startExtraction(item.id, item.file);
    });
  }, [queue]);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: QueueItem[] = Array.from(files).map((file) => ({
      id: Math.random().toString(36).substring(2, 10),
      file,
      status: "QUEUED",
    }));

    setQueue((prev) => [...prev, ...newItems]);
  };

  const startExtraction = async (id: string, file: File) => {
    runningExtractions.current.add(id);

    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: "EXTRACTING", error: undefined } : q))
    );

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/invoices/extract", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      runningExtractions.current.delete(id);

      if (!res.ok) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === id
              ? { ...q, status: "FAILED", error: data.error?.message || "Extraction failed" }
              : q
          )
        );
        return;
      }

      setQueue((prev) =>
        prev.map((q) =>
          q.id === id
            ? { ...q, status: "READY", extractionData: data }
            : q
        )
      );
    } catch (err: any) {
      runningExtractions.current.delete(id);
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id
            ? { ...q, status: "FAILED", error: err.message || "Network error during extraction" }
            : q
        )
      );
    }
  };

  const retryItem = (id: string) => {
    runningExtractions.current.delete(id);
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: "QUEUED", error: undefined } : q))
    );
  };

  const retryAllFailed = () => {
    setQueue((prev) =>
      prev.map((q) => (q.status === "FAILED" ? { ...q, status: "QUEUED", error: undefined } : q))
    );
  };

  const removeItem = (id: string) => {
    runningExtractions.current.delete(id);
    if (activeId === id) {
      setActiveId(null);
    }
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const clearCompleted = () => {
    setQueue((prev) => prev.filter((q) => q.status !== "SAVED"));
  };

  const clearAll = () => {
    runningExtractions.current.clear();
    setActiveId(null);
    setQueue([]);
  };

  // Derive counts and lists
  const currentItem = activeId ? queue.find((q) => q.id === activeId) : null;
  const readyItems = queue.filter((q) => q.status === "READY");
  const savedItems = queue.filter((q) => q.status === "SAVED");
  const failedItems = queue.filter((q) => q.status === "FAILED");
  const inProgressItems = queue.filter((q) => q.status === "QUEUED" || q.status === "EXTRACTING");

  const nextReadyItem = readyItems.find((q) => q.id !== activeId);
  const activeReadyIndex = currentItem ? readyItems.findIndex((q) => q.id === activeId) : -1;
  const prevReadyItem = activeReadyIndex > 0 ? readyItems[activeReadyIndex - 1] : null;
  const nextInReadyList =
    activeReadyIndex >= 0 && activeReadyIndex < readyItems.length - 1
      ? readyItems[activeReadyIndex + 1]
      : null;

  const allDone = queue.length > 0 && queue.every((q) => q.status === "SAVED");

  // Check if current item has a duplicate on initial review
  const activeDuplicate = currentItem?.extractionData?.duplicate;

  const handleSaveInvoice = async (payload: any, options?: { advanceToNext?: boolean }) => {
    if (!currentItem) return;
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

      const invNumber = payload.draft.invoice.number;
      setToastMessage(
        `Invoice #${invNumber} saved · ${
          data.newCustomerCreated ? "1 new customer" : "0 new customers"
        } · ${data.newProductsCreatedCount} new products`
      );

      // Mark current item as SAVED
      setQueue((prev) =>
        prev.map((q) =>
          q.id === currentItem.id
            ? {
                ...q,
                status: "SAVED",
                savedInvoiceId: data.invoice?.id,
                savedInvoiceNumber: invNumber,
              }
            : q
        )
      );

      setTimeout(() => {
        setToastMessage(null);
        setIsModifyingDuplicate(false);

        if (options?.advanceToNext && nextReadyItem) {
          // Immediately switch to the next ready invoice
          setActiveId(nextReadyItem.id);
        } else if (nextInReadyList) {
          setActiveId(nextInReadyList.id);
        } else if (nextReadyItem) {
          setActiveId(nextReadyItem.id);
        } else {
          // No more ready items right now
          setActiveId(null);
        }
      }, 1200);
    } catch (err) {
      console.error(err);
      alert("Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-5.5rem)]">
      {/* Hidden file input reusable across UI */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        className="hidden"
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-3.5 bg-success text-primary-fg rounded-sm shadow-pop flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: REVIEW MODE (Split view: Document left, PreviewForm right)        */}
      {/* ========================================================================= */}
      {currentItem && currentItem.status === "READY" && currentItem.extractionData ? (
        <div className="flex-1 flex flex-col min-h-0 space-y-3">
          {/* Top Multi-Upload Navigation Bar & Queue Ribbon */}
          <div className="bg-surface border border-border rounded-sm p-2.5 shadow-sm space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveId(null)}
                  className="px-2.5 py-1 text-xs border border-border rounded-sm text-ink hover:bg-surface-2 transition flex items-center gap-1.5 font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-ink-3" />
                  <span>Queue Overview</span>
                </button>

                <div className="h-4 w-px bg-border" />

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold text-ink">
                    Invoice #{currentItem.extractionData.draft.invoice.number || "—"}
                  </span>
                  <span className="text-ink-3">·</span>
                  <span className="text-ink-2 truncate max-w-[200px]">
                    {currentItem.extractionData.draft.customer.name || currentItem.file.name}
                  </span>
                  <span className="text-ink-3 font-mono text-[11px]">
                    ({activeReadyIndex + 1} of {readyItems.length} ready)
                  </span>
                </div>
              </div>

              {/* Action buttons on the right */}
              <div className="flex items-center gap-2">
                {/* Previous / Next Ready buttons */}
                <div className="flex items-center border border-border rounded-sm overflow-hidden">
                  <button
                    onClick={() => prevReadyItem && setActiveId(prevReadyItem.id)}
                    disabled={!prevReadyItem}
                    className="p-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-30 transition flex items-center"
                    title="Previous ready invoice"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-4 bg-border" />
                  <button
                    onClick={() => nextInReadyList && setActiveId(nextInReadyList.id)}
                    disabled={!nextInReadyList}
                    className="p-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-30 transition flex items-center"
                    title="Next ready invoice"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => startExtraction(currentItem.id, currentItem.file)}
                  className="px-2.5 py-1 text-xs border border-border rounded-sm text-ink-2 hover:bg-surface-2 transition flex items-center gap-1"
                  title="Re-extract with AI"
                >
                  <RefreshCw className="w-3 h-3 text-ink-3" />
                  <span>Re-extract</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs border border-border rounded-sm text-ink-2 hover:bg-surface-2 transition flex items-center gap-1"
                >
                  <Plus className="w-3 h-3 text-ink-3" />
                  <span>Add Files</span>
                </button>
              </div>
            </div>

            {/* Horizontal Queue Ribbon (Scrollable) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 border-t border-border/60 text-xs scrollbar-thin">
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider whitespace-nowrap pl-0.5">
                Batch ({queue.length}):
              </span>

              {queue.map((item, idx) => {
                const isActive = item.id === activeId;
                const isReady = item.status === "READY";
                const isSaved = item.status === "SAVED";
                const isExtracting = item.status === "EXTRACTING";
                const isFailed = item.status === "FAILED";
                const isQueued = item.status === "QUEUED";

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (isReady) setActiveId(item.id);
                    }}
                    disabled={!isReady && !isActive}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm border whitespace-nowrap transition text-[11px] font-medium ${
                      isActive
                        ? "bg-primary/10 border-primary text-primary font-semibold shadow-xs"
                        : isReady
                        ? "bg-surface hover:bg-surface-2 border-border text-ink cursor-pointer"
                        : isSaved
                        ? "bg-success-bg/40 border-success/30 text-success opacity-85"
                        : isExtracting
                        ? "bg-surface border-border text-primary"
                        : isFailed
                        ? "bg-danger-bg/40 border-danger/30 text-danger"
                        : "bg-surface-2/60 border-border/60 text-ink-3"
                    }`}
                  >
                    {isExtracting && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                    {isReady && <span className="w-2 h-2 rounded-full bg-primary" />}
                    {isSaved && <Check className="w-3 h-3 text-success" />}
                    {isFailed && <AlertTriangle className="w-3 h-3 text-danger" />}
                    {isQueued && <Clock className="w-3 h-3 text-ink-3" />}

                    <span className="font-mono">#{idx + 1}</span>
                    <span className="truncate max-w-[120px]">
                      {item.extractionData?.draft.invoice.number
                        ? `Inv #${item.extractionData.draft.invoice.number}`
                        : item.file.name}
                    </span>

                    {isSaved && <span className="text-[10px] text-success">Saved</span>}
                    {isExtracting && <span className="text-[10px] text-primary">Reading...</span>}
                  </button>
                );
              })}
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

            {/* Right Column: Editable Preview Form (Keyed to reset state on invoice change) */}
            <div className="lg:col-span-7 h-full min-h-[400px]">
              <PreviewForm
                key={currentItem.id}
                initialDraft={currentItem.extractionData.draft}
                customerMatch={currentItem.extractionData.customerMatch}
                productMatches={currentItem.extractionData.productMatches}
                fileToken={currentItem.extractionData.fileToken}
                mode={isModifyingDuplicate ? "replace" : "create"}
                onSave={handleSaveInvoice}
                onDiscard={() => setActiveId(null)}
                saving={saving}
                hasNextReady={Boolean(nextReadyItem)}
              />
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* MODE 2: BATCH OVERVIEW / UPLOAD DROPZONE MODE                             */
        /* ========================================================================= */
        <div className="space-y-6 max-w-4xl mx-auto w-full pt-4 overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
                <span>Upload Sales Invoices</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  Multi-file enabled
                </span>
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                Upload one or multiple scanned Marg ERP sales invoices in PDF, PNG, or JPG format.
              </p>
            </div>

            {/* Top Quick Actions */}
            <div className="flex items-center gap-2">
              {readyItems.length > 0 && (
                <button
                  onClick={() => setActiveId(readyItems[0].id)}
                  className="px-4 py-2 bg-primary text-primary-fg rounded-sm text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5 shadow-sm"
                >
                  <span>Review Ready Invoices ({readyItems.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {queue.length > 0 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 border border-border bg-surface text-ink rounded-sm text-xs font-medium hover:bg-surface-2 transition flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-ink-3" />
                  <span>Add More Invoices</span>
                </button>
              )}
            </div>
          </div>

          {/* All Done Celebration Card */}
          {allDone && (
            <div className="bg-success-bg/40 border border-success/30 rounded-sm p-6 text-center space-y-4 animate-in fade-in">
              <div className="w-12 h-12 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">Batch Processing Completed!</h3>
                <p className="text-xs text-ink-2 max-w-md mx-auto mt-1">
                  All {queue.length} uploaded invoices have been verified and saved to the database. Product stocks have been updated in the stock ledger.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => router.push("/invoices")}
                  className="px-4 py-2 bg-primary text-primary-fg rounded-sm text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5"
                >
                  <span>View Saved Invoices</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => router.push("/stock")}
                  className="px-4 py-2 border border-border bg-surface text-ink rounded-sm text-xs font-medium hover:bg-surface-2 transition"
                >
                  <span>Check Stock Ledger</span>
                </button>
                <button
                  onClick={clearAll}
                  className="px-4 py-2 border border-border text-ink-2 rounded-sm text-xs hover:bg-surface-2 transition"
                >
                  <span>Upload Another Batch</span>
                </button>
              </div>
            </div>
          )}

          {/* Batch Metrics / Stats Bar (when queue is active) */}
          {queue.length > 0 && !allDone && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-ink-3 uppercase tracking-wider block font-medium">
                  Total Files
                </span>
                <span className="text-lg font-bold text-ink num mt-0.5 block">{queue.length}</span>
              </div>

              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-primary uppercase tracking-wider block font-medium flex items-center gap-1">
                  {inProgressItems.length > 0 && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>Processing</span>
                </span>
                <span className="text-lg font-bold text-primary num mt-0.5 block">
                  {inProgressItems.length}
                </span>
              </div>

              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-ink-2 uppercase tracking-wider block font-medium">
                  Ready to Review
                </span>
                <span className="text-lg font-bold text-ink num mt-0.5 block">
                  {readyItems.length}
                </span>
              </div>

              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-success uppercase tracking-wider block font-medium">
                  Saved
                </span>
                <span className="text-lg font-bold text-success num mt-0.5 block">
                  {savedItems.length}
                </span>
              </div>

              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-danger uppercase tracking-wider block font-medium">
                  Failed
                </span>
                <span className="text-lg font-bold text-danger num mt-0.5 block">
                  {failedItems.length}
                </span>
              </div>
            </div>
          )}

          {/* Dropzone (Accepts multiple files) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFilesSelected(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border-strong bg-surface hover:bg-surface-2/40"
            }`}
          >
            <FileUp className="w-10 h-10 text-primary mx-auto mb-3" />
            <p className="text-sm font-semibold text-ink mb-1">
              Drag & drop one or multiple invoices here, or click to browse
            </p>
            <p className="text-xs text-ink-3 mb-4">
              Select multiple files simultaneously · PDF, PNG or JPG · up to 10 MB each
            </p>

            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-fg rounded-sm text-xs font-semibold hover:opacity-90 transition pointer-events-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Select Files (Multiple Allowed)</span>
            </button>
          </div>

          {/* Upload Queue Table */}
          {queue.length > 0 && (
            <div className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs">
              <div className="p-3 bg-surface-2 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-ink-3" />
                  <span className="text-xs font-semibold text-ink">
                    Invoice Queue ({savedItems.length} of {queue.length} completed)
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {failedItems.length > 0 && (
                    <button
                      onClick={retryAllFailed}
                      className="px-2.5 py-1 text-xs text-danger hover:bg-danger-bg rounded-sm transition flex items-center gap-1 font-medium"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry Failed ({failedItems.length})</span>
                    </button>
                  )}

                  {savedItems.length > 0 && (
                    <button
                      onClick={clearCompleted}
                      className="px-2.5 py-1 text-xs text-ink-2 hover:bg-surface rounded-sm transition"
                    >
                      Clear Completed
                    </button>
                  )}

                  <button
                    onClick={clearAll}
                    className="px-2.5 py-1 text-xs text-ink-3 hover:text-danger rounded-sm transition"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="divide-y divide-border text-xs">
                {queue.map((item, idx) => {
                  const draft = item.extractionData?.draft;

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-2/40 transition ${
                        item.status === "READY" ? "bg-primary/[0.02]" : ""
                      }`}
                    >
                      {/* File & invoice details */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-sm bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 text-ink-3 font-mono text-[11px] font-semibold">
                          #{idx + 1}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-ink truncate max-w-sm">
                              {item.file.name}
                            </span>
                            <span className="text-ink-3 font-mono text-[11px]">
                              ({(item.file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>

                          {/* Extracted preview summary if ready or saved */}
                          {draft && (
                            <div className="flex items-center gap-2 text-[11px] text-ink-2 flex-wrap">
                              <span className="font-semibold text-ink">
                                Inv #{draft.invoice.number || "—"}
                              </span>
                              <span>·</span>
                              <span className="text-ink-3">{draft.invoice.date || "No date"}</span>
                              <span>·</span>
                              <span className="text-ink truncate max-w-[180px]">
                                {draft.customer.name || "Customer not found"}
                              </span>
                              <span>·</span>
                              <span className="font-semibold text-ink font-mono">
                                {formatINR(draft.totals.grandTotal)}
                              </span>
                              <span>·</span>
                              <span className="text-ink-3">{draft.items.length} items</span>
                            </div>
                          )}

                          {item.status === "SAVED" && item.savedInvoiceNumber && (
                            <div className="text-[11px] text-success font-medium">
                              Saved to database as Invoice #{item.savedInvoiceNumber}
                            </div>
                          )}

                          {item.status === "FAILED" && (
                            <div className="text-[11px] text-danger font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              <span>{item.error || "Extraction failed"}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status indicator and actions */}
                      <div className="flex items-center gap-2.5 self-end sm:self-center flex-shrink-0">
                        {item.status === "QUEUED" && (
                          <span className="inline-flex items-center gap-1.5 text-ink-3 text-[11px] bg-surface-2 px-2.5 py-1 rounded-sm border border-border">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Queued</span>
                          </span>
                        )}

                        {item.status === "EXTRACTING" && (
                          <span className="inline-flex items-center gap-1.5 text-primary text-[11px] font-medium bg-primary/10 px-2.5 py-1 rounded-sm border border-primary/20">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Extracting with AI...</span>
                          </span>
                        )}

                        {item.status === "READY" && (
                          <button
                            onClick={() => setActiveId(item.id)}
                            className="px-3.5 py-1.5 bg-primary text-primary-fg rounded-sm font-semibold text-xs hover:opacity-90 transition flex items-center gap-1 shadow-xs"
                          >
                            <span>Review & Save</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}

                        {item.status === "SAVED" && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-success text-[11px] font-semibold bg-success-bg/60 px-2.5 py-1 rounded-sm border border-success/30">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Saved</span>
                            </span>
                            {item.savedInvoiceId && (
                              <button
                                onClick={() => router.push(`/invoices/${item.savedInvoiceId}`)}
                                className="p-1 text-ink-3 hover:text-ink transition"
                                title="View Saved Invoice"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {item.status === "FAILED" && (
                          <button
                            onClick={() => retryItem(item.id)}
                            className="px-2.5 py-1 bg-surface border border-danger/40 text-danger rounded-sm font-semibold text-[11px] hover:bg-danger-bg transition flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}

                        {/* Remove item button (allowed if not currently extracting) */}
                        {item.status !== "EXTRACTING" && (
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1 text-ink-3 hover:text-danger rounded-sm transition"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
            setActiveId(null);
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
