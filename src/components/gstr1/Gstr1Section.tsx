"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  FileSpreadsheet,
  FileText,
  FileType2,
  RefreshCw,
  Calendar,
  Receipt,
  Building2,
  UserCheck,
  Hash,
  Percent,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import type {
  Gstr1FilterMode,
  Gstr1Quarter,
  Gstr1Report,
  Gstr1InvoiceRow,
} from "@/lib/analytics/gstr1";

function getDefaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getDefaultFy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function getFyOptions(): string[] {
  const curStart = Number(getDefaultFy().split("-")[0]);
  const list: string[] = [];
  for (let y = curStart - 3; y <= curStart + 1; y++) {
    list.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return list.reverse();
}

export function Gstr1Section() {
  const [mode, setMode] = useState<Gstr1FilterMode>("month");
  const [month, setMonth] = useState<string>(getDefaultMonth);
  const [fy, setFy] = useState<string>(getDefaultFy);
  const [quarter, setQuarter] = useState<Gstr1Quarter>("Q3");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [report, setReport] = useState<Gstr1Report | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | "docx" | null>(null);
  const [activeTab, setActiveTab] = useState<"b2b" | "b2c" | "hsn" | "rates">("b2b");

  const fyOptions = useMemo(() => getFyOptions(), []);

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (mode === "month") params.set("month", month);
    if (mode === "quarter") {
      params.set("fy", fy);
      params.set("quarter", quarter);
    }
    if (mode === "fy") params.set("fy", fy);
    if (mode === "custom") {
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
    }
    return params;
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = buildQueryParams();
      const res = await fetch(`/api/gstr1?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load GSTR-1 data");
      const json = (await res.json()) as Gstr1Report;
      setReport(json);
    } catch (err: any) {
      setError(err?.message || "Unable to load GSTR-1 report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== "custom") {
      fetchReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, month, fy, quarter]);

  const handleExport = async (format: "pdf" | "xlsx" | "docx") => {
    try {
      setExporting(format);
      const params = buildQueryParams();
      params.set("format", format);
      const res = await fetch(`/api/gstr1/export?${params.toString()}`);
      if (!res.ok) throw new Error(`Export (${format.toUpperCase()}) failed`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = (report?.periodLabel || mode).replace(/[^a-zA-Z0-9_-]+/g, "_");
      a.href = url;
      a.download = `GSTR1_${slug}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const summary = report?.summary;

  return (
    <div className="space-y-5">
      {/* Header & Export Bar */}
      <div className="bg-surface border border-border rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            <h3 className="text-base font-bold text-ink tracking-tight">
              GSTR-1 Outward Supplies Return
            </h3>
            {report?.periodLabel && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-soft text-primary border border-primary/20">
                {report.periodLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-3 mt-1">
            CGST, SGST &amp; IGST liability breakdown across B2B, B2C, HSN, and GST rate slabs
          </p>
        </div>

        {/* Export Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading || exporting !== null}
            onClick={() => handleExport("pdf")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-danger-bg text-danger border border-danger/25 hover:opacity-90 disabled:opacity-50 transition"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{exporting === "pdf" ? "Exporting..." : "Export PDF"}</span>
          </button>
          <button
            type="button"
            disabled={loading || exporting !== null}
            onClick={() => handleExport("xlsx")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-success-bg text-success border border-success/25 hover:opacity-90 disabled:opacity-50 transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{exporting === "xlsx" ? "Exporting..." : "Export XLSX"}</span>
          </button>
          <button
            type="button"
            disabled={loading || exporting !== null}
            onClick={() => handleExport("docx")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-info-bg text-info border border-info/25 hover:opacity-90 disabled:opacity-50 transition"
          >
            <FileType2 className="w-3.5 h-3.5" />
            <span>{exporting === "docx" ? "Exporting..." : "Export DOCX"}</span>
          </button>
        </div>
      </div>

      {/* Period Filter Controls */}
      <div className="bg-surface border border-border rounded-lg p-3.5 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-ink-2 font-medium">
          <Calendar className="w-3.5 h-3.5 text-primary" />
          <span>Period:</span>
        </div>

        <div className="inline-flex flex-wrap p-0.5 bg-surface-2 border border-border rounded-sm">
          {(
            [
              { id: "month", label: "Monthly" },
              { id: "quarter", label: "Quarterly" },
              { id: "fy", label: "Financial Year" },
              { id: "custom", label: "Custom" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={`px-3 py-1 rounded-xs font-medium transition ${
                mode === tab.id
                  ? "bg-primary text-primary-fg font-semibold shadow-xs"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "month" && (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink font-mono"
          />
        )}

        {(mode === "quarter" || mode === "fy") && (
          <select
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink font-mono"
          >
            {fyOptions.map((opt) => (
              <option key={opt} value={opt}>
                FY {opt}
              </option>
            ))}
          </select>
        )}

        {mode === "quarter" && (
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value as Gstr1Quarter)}
            className="px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink"
          >
            <option value="Q1">Q1 (Apr – Jun)</option>
            <option value="Q2">Q2 (Jul – Sep)</option>
            <option value="Q3">Q3 (Oct – Dec)</option>
            <option value="Q4">Q4 (Jan – Mar)</option>
          </select>
        )}

        {mode === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink font-mono"
            />
            <span className="text-ink-3">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1 bg-bg border border-border rounded-sm text-xs text-ink font-mono"
            />
            <button
              type="button"
              onClick={fetchReport}
              className="px-3 py-1 bg-primary text-primary-fg rounded-sm font-semibold hover:opacity-90 transition"
            >
              Apply
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={fetchReport}
          title="Refresh GSTR-1 report"
          className="ml-auto p-1.5 border border-border bg-surface-2 text-ink-2 hover:text-ink rounded-sm transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="bg-danger-bg border border-danger/30 text-danger px-4 py-2.5 rounded-sm text-xs font-medium">
          {error}
        </div>
      )}

      {/* Tax KPI Cards: Taxable, CGST, SGST, IGST, Grand Total */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-xs text-ink-3 font-medium">Taxable Value</div>
          <div className="text-lg font-bold num text-ink mt-1">
            {formatINR(summary?.taxableTotal || 0)}
          </div>
          <div className="text-[11px] text-ink-3 mt-1">
            {summary?.totalInvoices || 0} invoices ({summary?.b2bCount || 0} B2B · {summary?.b2cCount || 0} B2C)
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-xs text-ink-3 font-medium">CGST Output</div>
          <div className="text-lg font-bold num text-primary mt-1">
            {formatINR(summary?.cgstTotal || 0)}
          </div>
          <div className="text-[11px] text-ink-3 mt-1">Central GST (Intra-State)</div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-xs text-ink-3 font-medium">SGST Output</div>
          <div className="text-lg font-bold num text-accent mt-1">
            {formatINR(summary?.sgstTotal || 0)}
          </div>
          <div className="text-[11px] text-ink-3 mt-1">State GST (Intra-State)</div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-xs text-ink-3 font-medium">IGST Output</div>
          <div className="text-lg font-bold num text-info mt-1">
            {formatINR(summary?.igstTotal || 0)}
          </div>
          <div className="text-[11px] text-ink-3 mt-1">Integrated GST (Inter-State)</div>
        </div>

        <div className="bg-surface border border-primary/30 rounded-lg p-4">
          <div className="text-xs text-ink-3 font-medium">Grand Invoice Value</div>
          <div className="text-lg font-bold num text-ink mt-1">
            {formatINR(summary?.grandTotal || 0)}
          </div>
          <div className="text-[11px] text-success font-medium mt-1">
            Total Tax: {formatINR(summary?.totalTax || 0)}
          </div>
        </div>
      </div>

      {/* Sub-Tabs for Detailed Tables */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-surface-2/50">
          {[
            { id: "b2b", label: `B2B Invoices (${report?.b2b.length || 0})`, icon: Building2 },
            { id: "b2c", label: `B2C Invoices (${report?.b2c.length || 0})`, icon: UserCheck },
            { id: "hsn", label: `HSN Summary (${report?.hsnSummary.length || 0})`, icon: Hash },
            { id: "rates", label: `Rate-wise Tax (${report?.rateSummary.length || 0})`, icon: Percent },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-fg font-semibold shadow-xs"
                    : "text-ink-2 hover:text-ink hover:bg-surface"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-ink-3">Loading GSTR-1 return data...</div>
        ) : (
          <div className="overflow-x-auto">
            {(activeTab === "b2b" || activeTab === "b2c") && (
              <InvoiceTable rows={activeTab === "b2b" ? report?.b2b || [] : report?.b2c || []} />
            )}

            {activeTab === "hsn" && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2/60 text-ink-3 border-b border-border font-medium">
                    <th className="py-2.5 px-3">HSN Code</th>
                    <th className="py-2.5 px-3 text-right">Line Items</th>
                    <th className="py-2.5 px-3 text-right">Total Qty (kg)</th>
                    <th className="py-2.5 px-3 text-right">Taxable Value</th>
                    <th className="py-2.5 px-3 text-right">CGST</th>
                    <th className="py-2.5 px-3 text-right">SGST</th>
                    <th className="py-2.5 px-3 text-right">IGST</th>
                    <th className="py-2.5 px-3 text-right">Total Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report?.hsnSummary && report.hsnSummary.length > 0 ? (
                    report.hsnSummary.map((h) => (
                      <tr key={h.hsn} className="hover:bg-surface-2/40 transition">
                        <td className="py-2.5 px-3 font-mono font-semibold text-ink">{h.hsn}</td>
                        <td className="py-2.5 px-3 text-right num text-ink-2">{h.itemCount}</td>
                        <td className="py-2.5 px-3 text-right num text-ink-2">
                          {h.totalQtyKg.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right num font-medium text-ink">
                          {formatINR(h.taxableValue)}
                        </td>
                        <td className="py-2.5 px-3 text-right num text-primary">
                          {formatINR(h.cgst)}
                        </td>
                        <td className="py-2.5 px-3 text-right num text-accent">
                          {formatINR(h.sgst)}
                        </td>
                        <td className="py-2.5 px-3 text-right num text-info">
                          {formatINR(h.igst)}
                        </td>
                        <td className="py-2.5 px-3 text-right num font-bold text-ink">
                          {formatINR(h.totalTax)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-ink-3">
                        No HSN records found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === "rates" && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2/60 text-ink-3 border-b border-border font-medium">
                    <th className="py-2.5 px-3">GST Rate Slab</th>
                    <th className="py-2.5 px-3 text-right">Taxable Value</th>
                    <th className="py-2.5 px-3 text-right">CGST</th>
                    <th className="py-2.5 px-3 text-right">SGST</th>
                    <th className="py-2.5 px-3 text-right">IGST</th>
                    <th className="py-2.5 px-3 text-right">Total Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report?.rateSummary && report.rateSummary.length > 0 ? (
                    report.rateSummary.map((r) => (
                      <tr key={r.rateLabel} className="hover:bg-surface-2/40 transition">
                        <td className="py-2.5 px-3 font-semibold text-ink">{r.rateLabel}</td>
                        <td className="py-2.5 px-3 text-right num font-medium text-ink">
                          {formatINR(r.taxableValue)}
                        </td>
                        <td className="py-2.5 px-3 text-right num text-primary">
                          {formatINR(r.cgst)}
                        </td>
                        <td className="py-2.5 px-3 text-right num text-accent">
                          {formatINR(r.sgst)}
                        </td>
                        <td className="py-2.5 px-3 text-right num text-info">
                          {formatINR(r.igst)}
                        </td>
                        <td className="py-2.5 px-3 text-right num font-bold text-ink">
                          {formatINR(r.totalTax)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-ink-3">
                        No tax rate records found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceTable({ rows }: { rows: Gstr1InvoiceRow[] }) {
  return (
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="bg-surface-2/60 text-ink-3 border-b border-border font-medium">
          <th className="py-2.5 px-3">Invoice No</th>
          <th className="py-2.5 px-3">Date</th>
          <th className="py-2.5 px-3">Customer</th>
          <th className="py-2.5 px-3">GSTIN</th>
          <th className="py-2.5 px-3">Supply</th>
          <th className="py-2.5 px-3 text-right">Taxable</th>
          <th className="py-2.5 px-3 text-right">CGST</th>
          <th className="py-2.5 px-3 text-right">SGST</th>
          <th className="py-2.5 px-3 text-right">IGST</th>
          <th className="py-2.5 px-3 text-right">Grand Total</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.length > 0 ? (
          rows.map((inv) => (
            <tr key={inv.id} className="hover:bg-surface-2/40 transition">
              <td className="py-2.5 px-3 font-mono font-semibold text-ink">
                {inv.invoiceNumber}
              </td>
              <td className="py-2.5 px-3 font-mono text-ink-2">{inv.invoiceDate}</td>
              <td className="py-2.5 px-3 font-medium text-ink">{inv.customerName}</td>
              <td className="py-2.5 px-3 font-mono text-ink-2">
                {inv.customerGstin || <span className="text-ink-3">Unregistered</span>}
              </td>
              <td className="py-2.5 px-3">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    inv.supplyType === "Inter-State"
                      ? "bg-info-bg text-info"
                      : "bg-primary-soft text-primary"
                  }`}
                >
                  {inv.supplyType}
                </span>
              </td>
              <td className="py-2.5 px-3 text-right num text-ink">{formatINR(inv.taxableValue)}</td>
              <td className="py-2.5 px-3 text-right num text-primary">{formatINR(inv.cgst)}</td>
              <td className="py-2.5 px-3 text-right num text-accent">{formatINR(inv.sgst)}</td>
              <td className="py-2.5 px-3 text-right num text-info">{formatINR(inv.igst)}</td>
              <td className="py-2.5 px-3 text-right num font-bold text-ink">
                {formatINR(inv.grandTotal)}
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={10} className="py-8 text-center text-ink-3">
              No invoices found in this category for the selected period.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
