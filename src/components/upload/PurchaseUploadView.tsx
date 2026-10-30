"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileUp,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Plus,
  Check,
  Clock,
  ExternalLink,
  ChevronRight,
  Layers,
  RotateCcw,
  Square,
  Ban,
  X,
} from "lucide-react";
import { DocumentViewer } from "./DocumentViewer";
import { PurchasePreviewForm } from "./PurchasePreviewForm";
import { DuplicateDialog } from "./DuplicateDialog";
import { ExtractedPurchaseInvoice } from "@/lib/llm/schema.purchase";
import { SupplierResolution } from "@/lib/matching/supplier";
import { ProductResolution } from "@/lib/matching/product";
import { formatINR } from "@/lib/format";

export interface PurchaseUploadJob {
  id: string;
  file_name: string;
  file_size: number;
  status: "QUEUED" | "PROCESSING" | "READY" | "SAVED" | "FAILED" | "CANCELLED";
  error?: string | null;
  saved_invoice_id?: string | null;
  saved_invoice_num?: string | null;
  extracted_data?: {
    draft: ExtractedPurchaseInvoice;
    validation: any;
    supplierMatch: SupplierResolution;
    productMatches: ProductResolution[];
    duplicate: any;
    fileToken: string;
    fileHash: string;
    pages: Array<{ pageNumber: number; pngBase64: string }>;
  } | null;
}

const STORAGE_KEY = "invoicer_purchase_upload_queue";

// Module-level in-memory stores that survive tab switching, unmounts, and background browser throttling
const globalPurchaseFiles = new Map<string, File>();
const globalPurchaseAbortControllers = new Map<string, AbortController>();
let isGlobalPurchaseQueueRunning = false;

export function PurchaseUploadView() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<PurchaseUploadJob[]>([]);
  const jobsRef = useRef<PurchaseUploadJob[]>([]);
  jobsRef.current = jobs;

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [isModifyingDuplicate, setIsModifyingDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Synchronous helper to update both jobsRef.current and React state
  const updateJobInState = useCallback((jobId: string, updates: Partial<PurchaseUploadJob>) => {
    jobsRef.current = jobsRef.current.map((j) => (j.id === jobId ? { ...j, ...updates } : j));
    setJobs([...jobsRef.current]);
  }, []);

  // Queue runner: processes one job at a time to protect local model/server resources
  const runQueue = useCallback(async () => {
    if (isGlobalPurchaseQueueRunning) return;
    isGlobalPurchaseQueueRunning = true;

    try {
      while (true) {
        // Find next queued job directly from the synchronous ref
        const nextJob = jobsRef.current.find((j) => j.status === "QUEUED");
        if (!nextJob) break;

        const jobId = nextJob.id;
        const file = globalPurchaseFiles.get(jobId);

        if (!file) {
          updateJobInState(jobId, {
            status: "FAILED",
            error: "File not in memory. Please re-upload.",
          });
          continue;
        }

        // Set status to PROCESSING synchronously
        updateJobInState(jobId, { status: "PROCESSING", error: null });

        const controller = new AbortController();
        globalPurchaseAbortControllers.set(jobId, controller);

        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/purchases/extract", {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });

          const data = await res.json();

          if (res.ok && data.draft) {
            updateJobInState(jobId, {
              status: "READY",
              error: null,
              extracted_data: {
                draft: data.draft,
                validation: data.validation,
                supplierMatch: data.supplierMatch,
                productMatches: data.productMatches,
                duplicate: data.duplicate,
                fileToken: data.fileToken,
                fileHash: data.fileHash,
                pages: data.pages || [],
              },
            });
          } else {
            updateJobInState(jobId, {
              status: "FAILED",
              error: data.error?.message || "Extraction failed",
            });
          }
        } catch (err: any) {
          if (err.name === "AbortError" || controller.signal.aborted) {
            updateJobInState(jobId, {
              status: "CANCELLED",
              error: "Cancelled by user",
            });
          } else {
            updateJobInState(jobId, {
              status: "FAILED",
              error: err.message || "Network error",
            });
          }
        } finally {
          globalPurchaseAbortControllers.delete(jobId);
        }
      }
    } finally {
      isGlobalPurchaseQueueRunning = false;
    }
  }, [updateJobInState]);

  // Restore jobs from sessionStorage on component mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // If files are still in memory (e.g. user switched tabs), restore QUEUED state!
          const sanitized = parsed.map((j: PurchaseUploadJob) => {
            if (j.status === "PROCESSING" || j.status === "QUEUED") {
              if (globalPurchaseFiles.has(j.id)) {
                return { ...j, status: "QUEUED" as const, error: null };
              }
              return {
                ...j,
                status: "FAILED" as const,
                error: "File not in memory after full browser reload. Please re-upload.",
              };
            }
            return j;
          });
          jobsRef.current = sanitized;
          setJobs(sanitized);

          // If any jobs are queued and queue is not running, start it
          if (sanitized.some((j) => j.status === "QUEUED")) {
            setTimeout(() => {
              runQueue();
            }, 100);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to restore purchase queue from sessionStorage:", e);
    }
  }, [runQueue]);

  // Tab visibility wake-up: when switching back to browser tab, ensure queue continues
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (!isGlobalPurchaseQueueRunning && jobsRef.current.some((j) => j.status === "QUEUED")) {
          runQueue();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [runQueue]);

  // Sync jobs to sessionStorage
  useEffect(() => {
    try {
      if (jobs.length === 0) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch (e) {
      // Storage quota fallback: strip heavy base64 raster pages
      try {
        const minimalJobs = jobs.map((j) => {
          if (!j.extracted_data) return j;
          return {
            ...j,
            extracted_data: {
              ...j.extracted_data,
              pages: (j.extracted_data.pages || []).map((p) => ({
                pageNumber: p.pageNumber,
                pngBase64: "",
              })),
            },
          };
        });
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(minimalJobs));
      } catch (err) {
        console.warn("sessionStorage quota exceeded:", err);
      }
    }
  }, [jobs]);

  // Handle file selection: immediately adds ALL files to the queue so user sees everything
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const newJobs: PurchaseUploadJob[] = fileList.map((file) => {
      const jobId = `pur_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      globalPurchaseFiles.set(jobId, file);
      return {
        id: jobId,
        file_name: file.name,
        file_size: file.size,
        status: "QUEUED",
      };
    });

    const updated = [...newJobs, ...jobsRef.current];
    jobsRef.current = updated;
    setJobs(updated);

    setTimeout(() => {
      runQueue();
    }, 50);
  };

  // Stop/Cancel a single job midway
  const handleStopJob = useCallback((jobId: string) => {
    const controller = globalPurchaseAbortControllers.get(jobId);
    if (controller) {
      controller.abort();
      globalPurchaseAbortControllers.delete(jobId);
    }
    jobsRef.current = jobsRef.current.map((j) =>
      j.id === jobId ? { ...j, status: "CANCELLED", error: "Cancelled by user" } : j
    );
    setJobs([...jobsRef.current]);
  }, []);

  // Cancel all ongoing and queued jobs midway
  const handleCancelAll = useCallback(() => {
    globalPurchaseAbortControllers.forEach((controller) => {
      try {
        controller.abort();
      } catch (_) {}
    });
    globalPurchaseAbortControllers.clear();

    jobsRef.current = jobsRef.current.map((j) =>
      j.status === "QUEUED" || j.status === "PROCESSING"
        ? { ...j, status: "CANCELLED", error: "Cancelled by user" }
        : j
    );
    setJobs([...jobsRef.current]);
  }, []);

  // Retry a failed or cancelled job
  const handleRetryJob = useCallback(
    (jobId: string) => {
      const file = globalPurchaseFiles.get(jobId);
      if (!file) {
        alert("Original file is no longer available in memory. Please click 'Add Bills' to re-upload.");
        return;
      }
      jobsRef.current = jobsRef.current.map((j) =>
        j.id === jobId ? { ...j, status: "QUEUED", error: null } : j
      );
      setJobs([...jobsRef.current]);
      setTimeout(() => {
        runQueue();
      }, 50);
    },
    [runQueue]
  );

  // Retry all failed and cancelled jobs
  const handleRetryAllFailed = useCallback(() => {
    let retriedCount = 0;
    jobsRef.current = jobsRef.current.map((j) => {
      if ((j.status === "FAILED" || j.status === "CANCELLED") && globalPurchaseFiles.has(j.id)) {
        retriedCount++;
        return { ...j, status: "QUEUED", error: null };
      }
      return j;
    });
    setJobs([...jobsRef.current]);

    if (retriedCount > 0) {
      setTimeout(() => {
        runQueue();
      }, 50);
    } else {
      alert("No files in memory available to retry. Please re-upload.");
    }
  }, [runQueue]);

  // Delete a job from the queue
  const handleDeleteJob = useCallback(
    (jobId: string) => {
      handleStopJob(jobId);
      if (activeJobId === jobId) setActiveJobId(null);
      globalPurchaseFiles.delete(jobId);
      jobsRef.current = jobsRef.current.filter((j) => j.id !== jobId);
      setJobs([...jobsRef.current]);
    },
    [handleStopJob, activeJobId]
  );

  // Clear completed jobs
  const handleClearCompleted = useCallback(() => {
    jobsRef.current = jobsRef.current.filter((j) => !["SAVED", "CANCELLED", "FAILED"].includes(j.status));
    setJobs([...jobsRef.current]);
  }, []);

  // Clear all jobs
  const handleClearAll = useCallback(() => {
    const hasActive = jobsRef.current.some((j) => j.status === "PROCESSING" || j.status === "QUEUED");
    if (hasActive) {
      if (!confirm("There are active extractions in progress. Cancel and clear all?")) return;
      handleCancelAll();
    }
    setActiveJobId(null);
    jobsRef.current = [];
    setJobs([]);
    globalPurchaseFiles.clear();
    sessionStorage.removeItem(STORAGE_KEY);
  }, [handleCancelAll]);

  // Derived job states
  const activeJob = activeJobId ? jobs.find((j) => j.id === activeJobId) : null;
  const readyJobs = jobs.filter((j) => j.status === "READY" && j.extracted_data);
  const savedJobs = jobs.filter((j) => j.status === "SAVED");
  const failedJobs = jobs.filter((j) => j.status === "FAILED" || j.status === "CANCELLED");
  const processingJobs = jobs.filter((j) => j.status === "PROCESSING");
  const queuedJobs = jobs.filter((j) => j.status === "QUEUED");
  const activeJobsCount = processingJobs.length + queuedJobs.length;

  const nextReadyJob = readyJobs.find((j) => j.id !== activeJobId);
  const activeReadyIndex = activeJob ? readyJobs.findIndex((j) => j.id === activeJobId) : -1;
  const prevReadyJob = activeReadyIndex > 0 ? readyJobs[activeReadyIndex - 1] : null;
  const nextInReadyList =
    activeReadyIndex >= 0 && activeReadyIndex < readyJobs.length - 1
      ? readyJobs[activeReadyIndex + 1]
      : null;

  const allDone = jobs.length > 0 && jobs.every((j) => j.status === "SAVED");
  const activeDuplicate = activeJob?.extracted_data?.duplicate;

  const handleSavePurchase = async (payload: any, options?: { advanceToNext?: boolean }) => {
    if (!activeJob || !activeJob.extracted_data) return;
    setSaving(true);

    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          fileHash: activeJob.extracted_data.fileHash,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error?.code === "DUPLICATE_INVOICE") {
          setIsDuplicateDialogOpen(true);
          setSaving(false);
          return;
        }
        alert(data.error?.message || "Failed to save purchase invoice");
        setSaving(false);
        return;
      }

      const invNumber = payload.draft.invoice.number;
      setToastMessage(
        `Purchase Invoice #${invNumber} saved · Stock updated (+${payload.draft.items.length} items)`
      );

      setJobs((prev) =>
        prev.map((j) =>
          j.id === activeJob.id
            ? {
                ...j,
                status: "SAVED",
                saved_invoice_id: data.invoiceId,
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
      alert("Failed to save purchase invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-8.5rem)]">
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

      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-3.5 bg-success text-primary-fg rounded-sm shadow-pop flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Split Screen Review Mode */}
      {activeJob && activeJob.extracted_data && activeJob.status === "READY" ? (
        <div className="flex-1 flex flex-col min-h-0 space-y-3">
          {/* Top Bar for Queue Navigation */}
          <div className="bg-surface border border-border rounded-sm p-2.5 shadow-sm space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveJobId(null)}
                  className="px-2.5 py-1 text-xs border border-border rounded-sm text-ink hover:bg-surface-2 transition flex items-center gap-1.5 font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-ink-3" />
                  <span>Queue Overview</span>
                  {activeJobsCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-mono font-semibold">
                      {activeJobsCount} processing
                    </span>
                  )}
                </button>

                <div className="h-4 w-px bg-border" />

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold text-ink">
                    Purchase Inv #{activeJob.extracted_data.draft.invoice.number || "—"}
                  </span>
                  <span className="text-ink-3">·</span>
                  <span className="text-ink-2 truncate max-w-[200px]">
                    {activeJob.extracted_data.draft.supplier.name || activeJob.file_name}
                  </span>
                  <span className="text-ink-3 font-mono text-[11px]">
                    ({activeReadyIndex + 1} of {readyJobs.length} ready)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeJobsCount > 0 && (
                  <button
                    onClick={handleCancelAll}
                    className="px-2.5 py-1 text-xs border border-danger/40 bg-surface text-danger hover:bg-danger-bg rounded-sm transition flex items-center gap-1 font-medium shadow-xs"
                    title="Stop all background extractions"
                  >
                    <Square className="w-3 h-3 fill-danger" />
                    <span>Stop All ({activeJobsCount})</span>
                  </button>
                )}

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
                  <span>Add Purchase Bills</span>
                </button>
              </div>
            </div>

            {/* Horizontal Queue Ribbon */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 border-t border-border/60 text-xs scrollbar-thin">
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider whitespace-nowrap pl-0.5">
                Purchases Queue ({jobs.length}):
              </span>

              {jobs.map((job, idx) => {
                const isActive = job.id === activeJobId;
                const isReady = job.status === "READY";
                const isSaved = job.status === "SAVED";
                const isProcessing = job.status === "PROCESSING";
                const isQueued = job.status === "QUEUED";
                const isFailed = job.status === "FAILED";
                const isCancelled = job.status === "CANCELLED";

                return (
                  <div
                    key={job.id}
                    onClick={() => {
                      if (isReady) setActiveJobId(job.id);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm border whitespace-nowrap transition text-[11px] font-medium ${
                      isActive
                        ? "bg-accent/15 border-accent text-accent font-semibold shadow-xs"
                        : isReady
                        ? "bg-surface hover:bg-surface-2 border-border text-ink cursor-pointer"
                        : isSaved
                        ? "bg-success-bg/40 border-success/30 text-success opacity-85"
                        : isProcessing
                        ? "bg-accent/5 border-accent/40 text-accent"
                        : isQueued
                        ? "bg-surface-2/60 border-border text-ink-3"
                        : isCancelled
                        ? "bg-warning-bg/40 border-warning/30 text-ink-2"
                        : "bg-danger-bg/40 border-danger/30 text-danger"
                    }`}
                  >
                    {isProcessing && <Loader2 className="w-3 h-3 animate-spin text-accent" />}
                    {isQueued && <Clock className="w-3 h-3 text-ink-3" />}
                    {isReady && <span className="w-2 h-2 rounded-full bg-accent" />}
                    {isSaved && <Check className="w-3 h-3 text-success" />}
                    {isFailed && <AlertTriangle className="w-3 h-3 text-danger" />}
                    {isCancelled && <Ban className="w-3 h-3 text-warning" />}

                    <span className="font-mono">#{idx + 1}</span>
                    <span className="truncate max-w-[120px]">
                      {job.extracted_data?.draft.invoice.number
                        ? `Inv #${job.extracted_data.draft.invoice.number}`
                        : job.file_name}
                    </span>

                    {isSaved && <span className="text-[10px] text-success">Saved</span>}
                    {isProcessing && <span className="text-[10px] text-accent">Extracting...</span>}
                    {isQueued && <span className="text-[10px] text-ink-3">Queued</span>}
                    {isCancelled && <span className="text-[10px] text-warning">Stopped</span>}

                    {/* Inline Stop/Cancel button inside the ribbon pill */}
                    {(isProcessing || isQueued) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStopJob(job.id);
                        }}
                        className="p-0.5 ml-0.5 text-danger hover:bg-danger-bg rounded transition flex items-center justify-center"
                        title={isProcessing ? "Stop extracting this bill" : "Cancel queued bill"}
                      >
                        <Square className="w-2.5 h-2.5 fill-danger" />
                      </button>
                    )}

                    {/* Inline Retry button for cancelled/failed */}
                    {(isCancelled || isFailed) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetryJob(job.id);
                        }}
                        className="p-0.5 ml-0.5 text-ink-3 hover:text-ink hover:bg-surface-2 rounded transition flex items-center justify-center"
                        title="Retry extracting this bill"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Duplicate Banner */}
          {activeDuplicate && !isModifyingDuplicate && (
            <div className="p-3 bg-danger-bg border border-danger/40 rounded-sm text-xs text-danger flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>Duplicate Warning:</strong> Purchase Invoice #{activeDuplicate.invoiceNumber} from {activeDuplicate.supplierName} already exists in database (saved {activeDuplicate.invoiceDate?.split("T")[0]}).
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

          {/* Split Screen Container */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
            <div className="lg:col-span-5 h-full min-h-[400px]">
              <DocumentViewer
                pages={activeJob.extracted_data.pages}
                fileToken={activeJob.extracted_data.fileToken || (activeJob as any).file_token}
              />
            </div>

            <div className="lg:col-span-7 h-full min-h-[400px]">
              <PurchasePreviewForm
                key={activeJob.id}
                initialDraft={activeJob.extracted_data.draft}
                supplierMatch={activeJob.extracted_data.supplierMatch}
                productMatches={activeJob.extracted_data.productMatches}
                fileToken={activeJob.extracted_data.fileToken}
                mode={isModifyingDuplicate ? "replace" : "create"}
                onSave={handleSavePurchase}
                onDiscard={() => setActiveJobId(null)}
                saving={saving}
                hasNextReady={Boolean(nextReadyJob)}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Queue Overview / Dropzone */
        <div className="space-y-5 max-w-4xl mx-auto w-full pt-2 overflow-y-auto pb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-ink">Upload Purchase Invoices</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#F4E6D7] dark:bg-[#3A2A1C] text-accent font-semibold">
                  Purchase
                </span>
              </div>
              <p className="text-xs text-ink-3 mt-1">
                Upload supplier purchase bills to automatically extract vendor data and increase product inventory.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {readyJobs.length > 0 && (
                <button
                  onClick={() => setActiveJobId(readyJobs[0].id)}
                  className="px-4 py-2 bg-accent text-accent-fg rounded-sm text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5 shadow-sm"
                >
                  <span>Review Ready Purchases ({readyJobs.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              {activeJobsCount > 0 && (
                <button
                  onClick={handleCancelAll}
                  className="px-3.5 py-2 border border-danger/40 bg-surface text-danger rounded-sm text-xs font-semibold hover:bg-danger-bg transition flex items-center gap-1.5 shadow-xs"
                >
                  <Square className="w-3.5 h-3.5 fill-danger" />
                  <span>Cancel All ({activeJobsCount})</span>
                </button>
              )}

              {jobs.length > 0 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 border border-border bg-surface text-ink rounded-sm text-xs font-medium hover:bg-surface-2 transition flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-ink-3" />
                  <span>Add Bills</span>
                </button>
              )}
            </div>
          </div>

          {/* All Done Card */}
          {allDone && (
            <div className="bg-success-bg/40 border border-success/30 rounded-sm p-6 text-center space-y-4 animate-in fade-in">
              <div className="w-12 h-12 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">All Purchase Bills Processed!</h3>
                <p className="text-xs text-ink-2 max-w-md mx-auto mt-1">
                  All {jobs.length} purchase invoices have been saved to the database. Product stocks have been increased in the stock ledger.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => router.push("/purchases")}
                  className="px-4 py-2 bg-accent text-accent-fg rounded-sm text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5"
                >
                  <span>View Purchases</span>
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

          {/* Batch Metrics */}
          {jobs.length > 0 && !allDone && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-ink-3 uppercase tracking-wider block font-medium">
                  Total Uploads
                </span>
                <span className="text-lg font-bold text-ink num mt-0.5 block">{jobs.length}</span>
              </div>

              <div className="bg-surface border border-border rounded-sm p-3">
                <span className="text-[11px] text-accent uppercase tracking-wider block font-medium flex items-center gap-1">
                  {processingJobs.length > 0 && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>Processing</span>
                </span>
                <span className="text-lg font-bold text-accent num mt-0.5 block">
                  {activeJobsCount}
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

          {/* Primary View: Upload Queue Table (Always Prominent when jobs exist) */}
          {jobs.length > 0 && (
            <div className="bg-surface border border-border rounded-sm overflow-hidden shadow-xs">
              <div className="p-3 bg-surface-2 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-accent" />
                  <span className="text-xs font-semibold text-ink">
                    Purchases Queue ({savedJobs.length} of {jobs.length} completed)
                  </span>
                  {activeJobsCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
                      {activeJobsCount} in progress
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {activeJobsCount > 0 && (
                    <button
                      onClick={handleCancelAll}
                      className="px-2.5 py-1 text-xs text-danger hover:bg-danger-bg rounded-sm transition flex items-center gap-1 font-medium border border-danger/30"
                      title="Cancel all running and queued extractions"
                    >
                      <Square className="w-3 h-3 fill-danger" />
                      <span>Stop All ({activeJobsCount})</span>
                    </button>
                  )}

                  {failedJobs.length > 0 && (
                    <button
                      onClick={handleRetryAllFailed}
                      className="px-2.5 py-1 text-xs text-ink-2 hover:bg-surface rounded-sm transition flex items-center gap-1 font-medium"
                      title="Retry all failed and stopped extractions"
                    >
                      <RotateCcw className="w-3 h-3 text-ink-3" />
                      <span>Retry Failed ({failedJobs.length})</span>
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
                  const isProcessing = job.status === "PROCESSING";
                  const isQueued = job.status === "QUEUED";

                  return (
                    <div
                      key={job.id}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-2/40 transition ${
                        job.status === "READY" ? "bg-accent/[0.03]" : ""
                      }`}
                    >
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

                          {draft && (
                            <div className="flex items-center gap-2 text-[11px] text-ink-2 flex-wrap">
                              <span className="font-semibold text-ink">
                                Inv #{draft.invoice.number || "—"}
                              </span>
                              <span>·</span>
                              <span className="text-ink-3">{draft.invoice.date || "No date"}</span>
                              <span>·</span>
                              <span className="text-ink truncate max-w-[180px]">
                                {draft.supplier.name || "Supplier"}
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
                              Saved to database as Purchase Invoice #{job.saved_invoice_num}
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
                              <span>{job.error || "Cancelled by user"}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 self-end sm:self-center flex-shrink-0">
                        {isQueued && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-ink-3 text-[11px] bg-surface-2 px-2.5 py-1 rounded-sm border border-border">
                              <Clock className="w-3.5 h-3.5 text-ink-3" />
                              <span>Queued</span>
                            </span>
                            <button
                              onClick={() => handleStopJob(job.id)}
                              className="px-2 py-1 bg-surface border border-border text-ink-3 hover:text-danger hover:bg-danger-bg rounded-sm font-medium text-[11px] transition flex items-center gap-1"
                              title="Cancel queued extraction"
                            >
                              <X className="w-3 h-3" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        )}

                        {isProcessing && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-accent text-[11px] font-medium bg-accent/10 px-2.5 py-1 rounded-sm border border-accent/20">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Extracting with AI...</span>
                            </span>
                            <button
                              onClick={() => handleStopJob(job.id)}
                              className="px-2.5 py-1 bg-surface border border-danger/40 text-danger hover:bg-danger-bg rounded-sm font-semibold text-[11px] transition flex items-center gap-1 shadow-xs"
                              title="Cancel extraction midway"
                            >
                              <Square className="w-3 h-3 fill-danger" />
                              <span>Stop</span>
                            </button>
                          </div>
                        )}

                        {job.status === "READY" && (
                          <button
                            onClick={() => setActiveJobId(job.id)}
                            className="px-3.5 py-1.5 bg-accent text-accent-fg rounded-sm font-semibold text-xs hover:opacity-90 transition flex items-center gap-1 shadow-xs"
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
                                onClick={() => router.push(`/purchases/${job.saved_invoice_id}`)}
                                className="p-1 text-ink-3 hover:text-ink transition"
                                title="View Saved Purchase"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {(job.status === "FAILED" || job.status === "CANCELLED") && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleRetryJob(job.id)}
                              className="px-2.5 py-1 bg-surface border border-border text-ink hover:bg-surface-2 rounded-sm font-medium text-[11px] transition flex items-center gap-1"
                              title="Retry extracting this bill"
                            >
                              <RotateCcw className="w-3 h-3 text-ink-3" />
                              <span>Retry</span>
                            </button>
                            <button
                              onClick={() => handleDeleteJob(job.id)}
                              className="px-2 py-1 bg-surface border border-danger/40 text-danger rounded-sm font-semibold text-[11px] hover:bg-danger-bg transition"
                              title="Remove from queue"
                            >
                              Remove
                            </button>
                          </div>
                        )}

                        {!isProcessing && !isQueued && job.status !== "FAILED" && job.status !== "CANCELLED" && (
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

          {/* Dropzone: Compact when queue has items, Full Hero when empty */}
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
            className={`border-2 border-dashed rounded-sm text-center cursor-pointer transition ${
              jobs.length > 0 ? "p-5" : "p-10"
            } ${
              isDragging
                ? "border-accent bg-accent/5"
                : "border-border-strong bg-surface hover:bg-surface-2/40"
            }`}
          >
            <FileUp className={`${jobs.length > 0 ? "w-6 h-6 mb-1.5" : "w-10 h-10 mb-3"} text-accent mx-auto`} />
            <p className={`${jobs.length > 0 ? "text-xs font-semibold" : "text-sm font-semibold"} text-ink mb-1`}>
              {jobs.length > 0
                ? "Drag & drop more purchase invoices to append to queue, or click to browse"
                : "Drag & drop purchase invoices here, or click to browse"}
            </p>
            <p className="text-xs text-ink-3 mb-3">
              Supports supplier tax invoices in PDF, PNG or JPG format · up to 10 MB each
            </p>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-accent-fg rounded-sm text-xs font-semibold hover:opacity-90 transition pointer-events-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{jobs.length > 0 ? "Add More Bills" : "Select Purchase Bills"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Duplicate Dialog */}
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
            router.push(`/purchases/${activeDuplicate.invoiceId}`);
          }}
        />
      )}
    </div>
  );
}
