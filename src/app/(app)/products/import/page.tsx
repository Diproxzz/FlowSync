"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { formatINR } from "@/lib/format";

interface PreviewRow {
  code: string;
  name: string;
  category: string | null;
  packSizeKg: number | null;
  stdPurchaseRate: number | null;
  stdSaleRate: number | null;
  reorderLevelKg: number | null;
  openingStockKg: number | null;
  action: "CREATE" | "UPDATE";
}

interface ImportSummary {
  total: number;
  creates: number;
  updates: number;
}

export default function ProductImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setSummary(null);
      setRows([]);
      setError(null);
      setImportDone(false);
    }
  };

  const runDryRun = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/products/import?dryRun=1", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "Failed to parse import file");
        setLoading(false);
        return;
      }

      setSummary(data.summary);
      setRows(data.rows || []);
    } catch {
      setError("An error occurred during file preview");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "Failed to execute import");
        setLoading(false);
        return;
      }

      setImportDone(true);
    } catch {
      setError("Failed to execute import");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link
          href="/products"
          className="p-1.5 rounded-sm text-ink-3 hover:text-ink hover:bg-surface-2 transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h2 className="text-xl font-semibold text-ink">Import Products</h2>
          <p className="text-xs text-ink-3">Upload CSV or Excel (.xlsx) file with catalogue and rates</p>
        </div>
      </div>

      {/* File Upload Box */}
      <div className="bg-surface border border-border rounded-sm p-6">
        <div className="border-2 border-dashed border-border-strong rounded-sm p-8 text-center bg-bg/50">
          <FileSpreadsheet className="w-10 h-10 text-primary mx-auto mb-3" />
          <p className="text-sm font-medium text-ink mb-1">
            {file ? file.name : "Select an Excel or CSV file to import"}
          </p>
          <p className="text-xs text-ink-3 mb-4">
            Expected columns: Product Code, Commercial Name, Packing Size, Purchase Rate, Sale Rate, Reorder Level
          </p>

          <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-fg rounded-sm text-xs font-medium cursor-pointer hover:opacity-90 transition">
            <Upload className="w-3.5 h-3.5" />
            <span>Choose File</span>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {file && !importDone && (
          <div className="mt-4 flex items-center justify-between pt-4 border-t border-border">
            <span className="text-xs text-ink-2">
              Ready to analyze: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
            </span>
            <button
              onClick={runDryRun}
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-fg rounded-sm text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "Analyzing..." : "Preview & Dry Run"}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-danger-bg border border-danger/30 rounded-sm text-xs text-danger flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {importDone && (
          <div className="mt-4 p-4 bg-success-bg border border-success/30 rounded-sm text-xs text-success flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>Import completed successfully! Products and opening stock updated.</span>
            </div>
            <Link
              href="/products"
              className="px-3 py-1 bg-surface text-ink border border-border rounded-sm hover:bg-surface-2 transition"
            >
              Back to Products
            </Link>
          </div>
        )}
      </div>

      {/* Dry Run Preview Summary & Table */}
      {summary && !importDone && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-surface border border-border p-4 rounded-sm">
              <span className="text-xs text-ink-3">Total Rows</span>
              <p className="text-xl font-semibold text-ink num mt-1">{summary.total}</p>
            </div>
            <div className="bg-surface border border-border p-4 rounded-sm">
              <span className="text-xs text-info font-medium">New Products to Create</span>
              <p className="text-xl font-semibold text-info num mt-1">+{summary.creates}</p>
            </div>
            <div className="bg-surface border border-border p-4 rounded-sm">
              <span className="text-xs text-warning font-medium">Existing to Update</span>
              <p className="text-xl font-semibold text-warning num mt-1">{summary.updates}</p>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-sm overflow-hidden">
            <div className="p-3 bg-surface-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">Dry Run Preview</span>
              <button
                onClick={handleConfirmImport}
                disabled={loading}
                className="px-4 py-1.5 bg-primary text-primary-fg rounded-sm text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? "Importing..." : "Confirm & Import to Database"}
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2/60 text-ink-2 font-medium border-b border-border">
                    <th className="py-2 px-3">Action</th>
                    <th className="py-2 px-3">Code</th>
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3 text-right">Pack Size</th>
                    <th className="py-2 px-3 text-right">Purchase Rate</th>
                    <th className="py-2 px-3 text-right">Sale Rate</th>
                    <th className="py-2 px-3 text-right">Reorder Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-surface-2/40">
                      <td className="py-2 px-3">
                        {r.action === "CREATE" ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-info-bg text-info">
                            ＋ CREATE
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-warning-bg text-warning">
                            ↻ UPDATE
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono font-semibold text-primary">{r.code}</td>
                      <td className="py-2 px-3 text-ink">{r.name}</td>
                      <td className="py-2 px-3 text-right num text-ink-2">
                        {r.packSizeKg ? `${r.packSizeKg} kg` : "—"}
                      </td>
                      <td className="py-2 px-3 text-right num font-medium text-ink">
                        {r.stdPurchaseRate ? formatINR(r.stdPurchaseRate) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right num font-medium text-ink">
                        {r.stdSaleRate ? formatINR(r.stdSaleRate) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right num text-ink-3">
                        {r.reorderLevelKg ? `${r.reorderLevelKg} kg` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
