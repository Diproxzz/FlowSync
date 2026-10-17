"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ImportPreview } from "@/components/accounts/ImportPreview";
import {
  FileSpreadsheet,
  UploadCloud,
  ArrowLeft,
  AlertCircle,
  FileCheck,
  Loader2,
  FileText,
} from "lucide-react";

export default function StatementImportPage() {
  const router = useRouter();

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extracted payload from /api/ledger/import/extract
  const [extractResult, setExtractResult] = useState<any>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file (Marg Ledger Account Statement).");
      return;
    }

    setFile(selectedFile);
    setError(null);
    setExtracting(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/ledger/import/extract", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to extract statement");
      }

      setExtractResult(json.data);
    } catch (err: any) {
      setError(err.message || "Failed to process statement PDF.");
    } finally {
      setExtracting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setExtractResult(null);
    setError(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Accounts</span>
        </Link>
      </div>

      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Import Statement</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a Marg "Ledger Account" statement PDF to verify and record entries.
        </p>
      </div>

      {/* Main Container */}
      {!extractResult ? (
        <div className="space-y-6">
          {/* Upload Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 bg-card"
            }`}
          >
            <input
              type="file"
              id="statement-file-input"
              accept=".pdf,application/pdf"
              onChange={handleFileInput}
              className="hidden"
            />

            {extracting ? (
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-sm font-semibold text-foreground">
                  Parsing and verifying statement replay...
                </p>
                <p className="text-xs text-muted-foreground">
                  Running exact arithmetic verification across all running balances and totals.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <div>
                  <label
                    htmlFor="statement-file-input"
                    className="text-sm font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Click to browse
                  </label>{" "}
                  <span className="text-sm text-muted-foreground">or drag and drop statement PDF</span>
                </div>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Supports Marg "Ledger Account" format with text layer. Deterministic replay checks ensure 100% precision.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Format Note */}
          <div className="p-4 rounded-xl border border-border bg-muted/30 text-xs text-muted-foreground space-y-1.5">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-primary" />
              Format Guarantee
            </div>
            <p>
              All statements are verified through exact arithmetic replay before saving. If any running balance or printed total does not reconcile, saving is strictly blocked.
            </p>
            <p>
              The original PDF bytes are never stored in the database, preserving privacy and keeping storage light.
            </p>
          </div>
        </div>
      ) : (
        /* Preview & Save View */
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="w-4 h-4 text-primary" />
              <span>File: <strong className="text-foreground">{extractResult.fileName}</strong></span>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Upload a different file
            </button>
          </div>

          <ImportPreview
            extracted={extractResult.extracted}
            validation={extractResult.validation}
            partyMatch={extractResult.partyMatch}
            existingInvoicesFound={extractResult.existingInvoicesFound || []}
            fileHash={extractResult.fileHash}
            fileName={extractResult.fileName}
            isDuplicateFile={extractResult.isDuplicateFile}
            onSaveSuccess={(accountId) => {
              router.push(`/accounts/${accountId}`);
            }}
            onCancel={handleReset}
          />
        </div>
      )}
    </div>
  );
}
