"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Square,
  Ban,
} from "lucide-react";
import { DocumentViewer } from "@/components/upload/DocumentViewer";
import { PreviewForm } from "@/components/upload/PreviewForm";
import { DuplicateDialog } from "@/components/upload/DuplicateDialog";
import { DiffView } from "@/components/upload/DiffView";
import { DocumentTypeToggle } from "@/components/upload/DocumentTypeToggle";
import { PurchaseUploadView } from "@/components/upload/PurchaseUploadView";
import { ExtractedInvoice } from "@/lib/llm/schema";
import { CustomerResolution } from "@/lib/matching/customer";
import { ProductResolution } from "@/lib/matching/product";
import { formatINR } from "@/lib/format";

export interface UploadJobItem {
  id: string;
  file_name: string;
  file_size: number;
  status: "QUEUED" | "PROCESSING" | "READY" | "SAVED" | "FAILED" | "CANCELLED";
  error?: string | null;
  saved_invoice_id?: string | null;
  saved_invoice_num?: string | null;
  created_at: string;
  updated_at: string;
  extracted_data?: {
    draft: ExtractedInvoice;
    validation: any;
    customerMatch: CustomerResolution;
    productMatches: ProductResolution[];
    duplicate: any;
    fileToken: string;
    pages: Array<{ pageNumber: number; pngBase64: string }>;
  } | null;
}

function UploadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentType = searchParams?.get("type") === "purchase" ? "PURCHASE" : "SALES";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<UploadJobItem[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [isModifyingDuplicate, setIsModifyingDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Fetch jobs from PostgreSQL
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/upload/jobs", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error("Failed to load upload jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Polling loop: If any jobs are QUEUED or PROCESSING, poll every 2.5s
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "QUEUED" || j.status === "PROCESSING");
    if (!hasActive && uploadingCount === 0) return;

    const interval = setInterval(() => {
      fetchJobs();
    }, 2500);

    return () => clearInterval(interval);
  }, [jobs, uploadingCount, fetchJobs]);

  // Handle uploading files into PostgreSQL queue
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    setUploadingCount((prev) => prev + fileList.length);

    // Upload each file to create PostgreSQL job records
    for (const file of fileList) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/upload/jobs", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setJobs((prev) => [data.job, ...prev.filter((j) => j.id !== data.job.id)]);
        } else {
          const errData = await res.json().catch(() => ({}));
          alert(`Failed to upload ${file.name}: ${errData.error?.message || "Upload error"}`);
        }
      } catch (err: any) {
        console.error("Upload error:", err);
        alert(`Network error uploading ${file.name}`);
      } finally {
        setUploadingCount((prev) => Math.max(0, prev - 1));
      }
    }

    // Refresh jobs list from PostgreSQL
    fetchJobs();
  };

  // Manually stop/cancel a job
  const handleStopJob = async (id: string) => {
    try {
      const res = await fetch(`/api/upload/jobs/${id}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id ? { ...j, status: "CANCELLED", error: "Stopped by user" } : j
          )
        );
      }
    } catch (err) {
      console.error("Failed to stop job:", err);
    }
  };

  // Retry single job
  const handleRetryJob = async (id: string) => {
    try {
      await fetch(`/api/upload/jobs/${id}/retry`, { method: "POST" });
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, status: "QUEUED", error: null } : j))
      );
      fetchJobs();
    } catch (err) {
      console.error("Failed to retry job:", err);
    }
  };

  // Retry all failed jobs
  const handleRetryAllFailed = async () => {
    try {
      await fetch("/api/upload/jobs/retry-failed", { method: "POST" });
      setJobs((prev) =>
        prev.map((j) =>
          j.status === "FAILED" || j.status === "CANCELLED"
            ? { ...j, status: "QUEUED", error: null }
            : j
        )
      );
      fetchJobs();
    } catch (err) {
      console.error("Failed to retry all failed jobs:", err);
    }
  };

  // Delete a job
  const handleDeleteJob = async (id: string) => {
    try {
      if (activeJobId === id) setActiveJobId(null);
      await fetch(`/api/upload/jobs/${id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (err) {
      console.error("Failed to delete job:", err);
    }
  };

  // Clear completed/saved jobs
  const handleClearCompleted = async () => {
    try {
      await fetch("/api/upload/jobs?scope=completed", { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => !["SAVED", "CANCELLED", "FAILED"].includes(j.status)));
    } catch (err) {
      console.error("Failed to clear completed jobs:", err);
    }
  };

  // Clear all jobs
  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to clear the upload queue?")) return;
    try {
      setActiveJobId(null);
      await fetch("/api/upload/jobs", { method: "DELETE" });
      setJobs([]);
    } catch (err) {
      console.error("Failed to clear all jobs:", err);
    }
  };

  // Active review item
  const activeJob = activeJobId ? jobs.find((j) => j.id === activeJobId) : null;
  const readyJobs = jobs.filter((j) => j.status === "READY" && j.extracted_data);
  const savedJobs = jobs.filter((j) => j.status === "SAVED");
  const failedJobs = jobs.filter((j) => j.status === "FAILED" || j.status === "CANCELLED");
  const processingJobs = jobs.filter((j) => j.status === "QUEUED" || j.status === "PROCESSING");

  const nextReadyJob = readyJobs.find((j) => j.id !== activeJobId);
  const activeReadyIndex = activeJob ? readyJobs.findIndex((j) => j.id === activeJobId) : -1;
  const prevReadyJob = activeReadyIndex > 0 ? readyJobs[activeReadyIndex - 1] : null;
  const nextInReadyList =
    activeReadyIndex >= 0 && activeReadyIndex < readyJobs.length - 1
      ? readyJobs[activeReadyIndex + 1]
      : null;

  const allDone = jobs.length > 0 && jobs.every((j) => j.status === "SAVED");
  const activeDuplicate = activeJob?.extracted_data?.duplicate;

  // Save invoice and update PostgreSQL job
  const handleSaveInvoice = async (payload: any, options?: { advanceToNext?: boolean }) => {
    if (!activeJob) return;
    setSaving(true);

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          uploadJobId: activeJob.id,
        }),
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

      // Update local job status
      setJobs((prev) =>
        prev.map((j) =>
          j.id === activeJob.id
            ? {
                ...j,
                status: "SAVED",
                saved_invoice_id: data.invoice?.id,
                saved_invoice_num: invNumber,
              }
            : j
        )
      );

      setTimeout(() => {
        setToastMessage(null);
        setIsModifyingDuplicate(false);

        if (options?.advanceToNext && nextReadyJob) {
          setActiveJobId(nextReadyJob.id);
        } else if (nextInReadyList) {
          setActiveJobId(nextInReadyList.id);
        } else if (nextReadyJob) {
          setActiveJobId(nextReadyJob.id);
        } else {
          setActiveJobId(null);
        }
      }, 1200);
    } catch (err) {
      console.error(err);
      alert("Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  if (currentType === "PURCHASE") {
    return (
      <div className="space-y-3 flex flex-col h-[calc(100vh-5.5rem)]">
        <div className="flex items-center justify-between pb-1 border-b border-border/60">
          <DocumentTypeToggle currentType="PURCHASE" />
        </div>
        <PurchaseUploadView />
      </div>
    );
  }

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-5.5rem)]">
      {/* Document Type Toggle */}
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <DocumentTypeToggle currentType="SALES" />
      </div>

      {/* Hidden file input */}
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
      {/* MODE 1: REVIEW MODE (Split View)                                          */}
      {/* ========================================================================= */}
      {activeJob && activeJob.extracted_data && (activeJob.status === "READY" || activeJob.status === "FAILED") ? (
        <div className="flex-1 flex flex-col min-h-0 space-y-3">
          {/* Top Bar for Queue Navigation & Job Status */}
          <div className="bg-surface border border-border rounded-sm p-2.5 shadow-sm space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveJobId(null)}
                  className="px-2.5 py-1 text-xs border border-border rounded-sm text-ink hover:bg-surface-2 transition flex items-center gap-1.5 font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-ink-3" />
                  <span>Queue Overview</span>
                </button>

                <div className="h-4 w-px bg-border" />

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold text-ink">
                    Invoice #{activeJob.extracted_data.draft.invoice.number || "—"}
                  </span>
                  <span className="text-ink-3">·</span>
                  <span className="text-ink-2 truncate max-w-[200px]">
                    {activeJob.extracted_data.draft.customer.name || activeJob.file_name}
                  </span>
                  <span className="text-ink-3 font-mono text-[11px]">
                    ({activeReadyIndex + 1} of {readyJobs.length} ready)
                  </span>
                </div>
              </div>

              {/* Action buttons on the right */}
              <div className="flex items-center gap-2">
                <div className="flex items-center border border-border rounded-sm overflow-hidden">
                  <button
                    onClick={() => prevReadyJob && setActiveJobId(prevReadyJob.id)}
                    disabled={!prevReadyJob}
                    className="p-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-30 transition flex items-center"
                    title="Previous ready invoice"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-px h-4 bg-border" />
                  <button
                    onClick={() => nextInReadyList && setActiveJobId(nextInReadyList.id)}
                    disabled={!nextInReadyList}
                    className="p-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-30 transition flex items-center"
                    title="Next ready invoice"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

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
                Queue ({jobs.length}):
              </span>

              {jobs.map((job, idx) => {
                const isActive = job.id === activeJobId;
                const isReady = job.status === "READY";
                const isSaved = job.status === "SAVED";
                const isProcessing = job.status === "PROCESSING" || job.status === "QUEUED";
                const isFailed = job.status === "FAILED" || job.status === "CANCELLED";

                return (
                  <button
                    key={job.id}
                    onClick={() => {
                      if (isReady || (isFailed && job.extracted_data)) setActiveJobId(job.id);
                    }}
                    disabled={!isReady && !isActive && !(isFailed && job.extracted_data)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm border whitespace-nowrap transition text-[11px] font-medium ${
                      isActive
                        ? "bg-primary/10 border-primary text-primary font-semibold shadow-xs"
                        : isReady
                        ? "bg-surface hover:bg-surface-2 border-border text-ink cursor-pointer"
                        : isSaved
                        ? "bg-success-bg/40 border-success/30 text-success opacity-85"
                        : isProcessing
                        ? "bg-surface border-border text-primary"
                        : isFailed
                        ? "bg-danger-bg/40 border-danger/30 text-danger"
                        : "bg-surface-2/60 border-border/60 text-ink-3"
                    }`}
                  >
                    {isProcessing && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                    {isReady && <span className="w-2 h-2 rounded-full bg-primary" />}
                    {isSaved && <Check className="w-3 h-3 text-success" />}
                    {isFailed && <AlertTriangle className="w-3 h-3 text-danger" />}

                    <span className="font-mono">#{idx + 1}</span>
                    <span className="truncate max-w-[120px]">
                      {job.extracted_data?.draft.invoice.number
                        ? `Inv #${job.extracted_data.draft.invoice.number}`
                        : job.file_name}
                    </span>

                    {isSaved && <span className="text-[10px] text-success">Saved</span>}
                    {isProcessing && <span className="text-[10px] text-primary">Processing...</span>}
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
              draft={activeJob.extracted_data.draft}
            />
          )}

          {activeJob.status === "FAILED" && (
            <div className="p-3 bg-warning-bg/60 border border-warning/40 rounded-sm text-xs text-ink flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                <span>
                  <strong>Manual Review Mode:</strong> AI extraction reached provider rate limits. You can fill in or adjust the invoice fields on the right while referencing the original document on the left.
                </span>
              </div>
              <button
                onClick={() => handleRetryJob(activeJob.id)}
                className="px-3 py-1 bg-surface border border-warning text-ink rounded-sm font-semibold hover:bg-warning-bg transition flex items-center gap-1 text-[11px]"
              >
                <RotateCcw className="w-3 h-3 text-warning" />
                <span>Retry AI</span>
              </button>
            </div>
          )}

          {/* Split Screen Container */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
            {/* Left Column: Document Viewer */}
            <div className="lg:col-span-5 h-full min-h-[400px]">
              <DocumentViewer pages={activeJob.extracted_data.pages} />
            </div>

            {/* Right Column: Editable Preview Form */}
            <div className="lg:col-span-7 h-full min-h-[400px]">
              <PreviewForm
                key={activeJob.id}
                initialDraft={activeJob.extracted_data.draft}
                customerMatch={activeJob.extracted_data.customerMatch}
                productMatches={activeJob.extracted_data.productMatches}
                fileToken={activeJob.extracted_data.fileToken}
                mode={isModifyingDuplicate ? "replace" : "create"}
                onSave={handleSaveInvoice}
                onDiscard={() => setActiveJobId(null)}
                saving={saving}
                hasNextReady={Boolean(nextReadyJob)}
              />
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* MODE 2: QUEUE OVERVIEW / DROPZONE                                        */
        /* ========================================================================= */
        <div className="space-y-6 max-w-4xl mx-auto w-full pt-4 overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
                <span>Upload Sales Invoices</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  Automated Processing
                </span>
              </h2>
              <p className="text-xs text-ink-3 mt-1">
                Upload invoices in PDF or image format for automated data extraction.
              </p>
            </div>

            {/* Top Quick Actions */}
            <div className="flex items-center gap-2">
              {readyJobs.length > 0 && (
                <button
                  onClick={() => setActiveJobId(readyJobs[0].id)}
                  className="px-4 py-2 bg-primary text-primary-fg rounded-sm text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5 shadow-sm"
                >
                  <span>Review Ready Invoices ({readyJobs.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {jobs.length > 0 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 border border-border bg-surface text-ink rounded-sm text-xs font-medium hover:bg-surface-2 transition flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-ink-3" />
                  <span>Add Invoices</span>
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
                <h3 className="text-base font-semibold text-ink">All Invoices Processed!</h3>
                <p className="text-xs text-ink-2 max-w-md mx-auto mt-1">
                  All {jobs.length} uploaded invoices have been verified and saved to PostgreSQL. Product stocks are updated in the stock ledger.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => router.push("/invoices")}
                  className="px-4 py-2 bg-primary text-primary-fg rounded-sm text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5"
                >
                  <span>View Invoices</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => router.push("/stock")}
                  className="px-4 py-2 border border-border bg-surface text-ink rounded-sm text-xs font-medium hover:bg-surface-2 transition"
                >
                  <span>Check Stock Ledger</span>
                </button>
                <button
                  onClick={handleClearAll}
                  className="px-4 py-2 border border-border text-ink-2 rounded-sm text-xs hover:bg-surface-2 transition"
                >
                  <span>Upload Another Batch</span>
                </button>
              </div>
            </div>
          )}

          {/* Batch Metrics / Stats Bar */}
          {jobs.length > 0 && !allDone && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-ink-3 uppercase tracking-wider block font-medium">
                  Total Uploads
                </span>
                <span className="text-lg font-bold text-ink num mt-0.5 block">{jobs.length}</span>
              </div>

              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-primary uppercase tracking-wider block font-medium flex items-center gap-1">
                  {processingJobs.length > 0 && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>Processing</span>
                </span>
                <span className="text-lg font-bold text-primary num mt-0.5 block">
                  {processingJobs.length}
                </span>
              </div>

              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-ink-2 uppercase tracking-wider block font-medium">
                  Ready to Review
                </span>
                <span className="text-lg font-bold text-ink num mt-0.5 block">
                  {readyJobs.length}
                </span>
              </div>

              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-success uppercase tracking-wider block font-medium">
                  Saved
                </span>
                <span className="text-lg font-bold text-success num mt-0.5 block">
                  {savedJobs.length}
                </span>
              </div>

              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-danger uppercase tracking-wider block font-medium">
                  Failed / Stopped
                </span>
                <span className="text-lg font-bold text-danger num mt-0.5 block">
                  {failedJobs.length}
                </span>
              </div>
            </div>
          )}

          {/* Dropzone */}
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
              Uploads process in the background independently · PDF, PNG or JPG · up to 10 MB each
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
          {jobs.length > 0 && (
            <div className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs">
              <div className="p-3 bg-surface-2 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-ink-3" />
                  <span className="text-xs font-semibold text-ink">
                    Upload Queue ({savedJobs.length} of {jobs.length} completed)
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {failedJobs.length > 0 && (
                    <button
                      onClick={handleRetryAllFailed}
                      className="px-2.5 py-1 text-xs text-danger hover:bg-danger-bg rounded-sm transition flex items-center gap-1 font-medium"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry All Failed ({failedJobs.length})</span>
                    </button>
                  )}

                  {savedJobs.length > 0 && (
                    <button
                      onClick={handleClearCompleted}
                      className="px-2.5 py-1 text-xs text-ink-2 hover:bg-surface rounded-sm transition"
                    >
                      Clear Completed
                    </button>
                  )}

                  <button
                    onClick={handleClearAll}
                    className="px-2.5 py-1 text-xs text-ink-3 hover:text-danger rounded-sm transition"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="divide-y divide-border text-xs">
                {jobs.map((job, idx) => {
                  const draft = job.extracted_data?.draft;
                  const isProcessing = job.status === "QUEUED" || job.status === "PROCESSING";

                  return (
                    <div
                      key={job.id}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-2/40 transition ${
                        job.status === "READY" ? "bg-primary/[0.02]" : ""
                      }`}
                    >
                      {/* File Details */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-sm bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 text-ink-3 font-mono text-[11px] font-semibold">
                          #{idx + 1}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-ink truncate max-w-sm">
                              {job.file_name}
                            </span>
                            <span className="text-ink-3 font-mono text-[11px]">
                              ({(job.file_size / 1024).toFixed(1)} KB)
                            </span>
                          </div>

                          {/* Preview Details */}
                          {draft && (
                            <div className="flex items-center gap-2 text-[11px] text-ink-2 flex-wrap">
                              <span className="font-semibold text-ink">
                                Inv #{draft.invoice.number || "—"}
                              </span>
                              <span>·</span>
                              <span className="text-ink-3">{draft.invoice.date || "No date"}</span>
                              <span>·</span>
                              <span className="text-ink truncate max-w-[180px]">
                                {draft.customer.name || "Customer"}
                              </span>
                              <span>·</span>
                              <span className="font-semibold text-ink font-mono">
                                {formatINR(draft.totals.grandTotal)}
                              </span>
                              <span>·</span>
                              <span className="text-ink-3">{draft.items.length} items</span>
                            </div>
                          )}

                          {job.status === "SAVED" && job.saved_invoice_num && (
                            <div className="text-[11px] text-success font-medium">
                              Saved to database as Invoice #{job.saved_invoice_num}
                            </div>
                          )}

                          {job.status === "FAILED" && (
                            <div className="text-[11px] text-danger font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              <span>{job.error || "Extraction failed"}</span>
                            </div>
                          )}

                          {job.status === "CANCELLED" && (
                            <div className="text-[11px] text-ink-3 font-medium flex items-center gap-1">
                              <Ban className="w-3 h-3 flex-shrink-0 text-warning" />
                              <span>{job.error || "Upload stopped"}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status indicator and actions */}
                      <div className="flex items-center gap-2.5 self-end sm:self-center flex-shrink-0">
                        {job.status === "QUEUED" && (
                          <span className="inline-flex items-center gap-1.5 text-ink-3 text-[11px] bg-surface-2 px-2.5 py-1 rounded-sm border border-border">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Queued</span>
                          </span>
                        )}

                        {job.status === "PROCESSING" && (
                          <span className="inline-flex items-center gap-1.5 text-primary text-[11px] font-medium bg-primary/10 px-2.5 py-1 rounded-sm border border-primary/20">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Extracting with AI...</span>
                          </span>
                        )}

                        {job.status === "READY" && (
                          <button
                            onClick={() => setActiveJobId(job.id)}
                            className="px-3.5 py-1.5 bg-primary text-primary-fg rounded-sm font-semibold text-xs hover:opacity-90 transition flex items-center gap-1 shadow-xs"
                          >
                            <span>Review & Save</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}

                        {job.status === "SAVED" && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-success text-[11px] font-semibold bg-success-bg/60 px-2.5 py-1 rounded-sm border border-success/30">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Saved</span>
                            </span>
                            {job.saved_invoice_id && (
                              <button
                                onClick={() => router.push(`/invoices/${job.saved_invoice_id}`)}
                                className="p-1 text-ink-3 hover:text-ink transition"
                                title="View Saved Invoice"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Retry button for failed or stopped jobs */}
                        {(job.status === "FAILED" || job.status === "CANCELLED") && (
                          <div className="flex items-center gap-1.5">
                            {job.extracted_data && (
                              <button
                                onClick={() => setActiveJobId(job.id)}
                                className="px-2.5 py-1 bg-surface border border-border text-ink hover:bg-surface-2 rounded-sm font-semibold text-[11px] transition flex items-center gap-1"
                                title="Open Document Viewer and enter details manually"
                              >
                                <FileText className="w-3 h-3 text-ink-3" />
                                <span>Enter Manually</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleRetryJob(job.id)}
                              className="px-2.5 py-1 bg-surface border border-danger/40 text-danger rounded-sm font-semibold text-[11px] hover:bg-danger-bg transition flex items-center gap-1"
                              title="Retry extracting this invoice"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Retry</span>
                            </button>
                          </div>
                        )}

                        {/* Manual STOP button: Allows user to cancel a queued or processing job */}
                        {isProcessing && (
                          <button
                            onClick={() => handleStopJob(job.id)}
                            className="px-2.5 py-1 bg-surface border border-border text-danger hover:bg-danger-bg rounded-sm font-medium text-[11px] transition flex items-center gap-1"
                            title="Stop uploading this invoice"
                          >
                            <Square className="w-3 h-3 fill-danger" />
                            <span>Stop</span>
                          </button>
                        )}

                        {/* Delete / Remove button */}
                        {!isProcessing && (
                          <button
                            onClick={() => handleDeleteJob(job.id)}
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
            setActiveJobId(null);
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

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-ink-3">Loading upload...</div>}>
      <UploadPageContent />
    </Suspense>
  );
}
