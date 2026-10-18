"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { formatINR, formatDate } from "@/lib/format";
import {
  Download,
  Printer,
  Search,
  FileSpreadsheet,
  X,
  ExternalLink,
  Building2,
  AlertTriangle,
  ArrowUpDown,
  BookOpen,
  Filter,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface DebtorItem {
  id: string;
  customerId: string | null;
  accountId: string | null;
  partyName: string;
  gstin: string | null;
  stateCode: string | null;
  totalInvoiced: number;
  totalOutstanding: number;
  monthlyAmounts: Record<string, number>;
  oldestBillNo: string | null;
  oldestBillDate: string | null;
  oldestAgeDays: number | null;
  overdueAmount: number;
  unpaidBillsCount: number;
  status: "CURRENT" | "DUE" | "OVERDUE";
}

export interface MonthColumn {
  key: string;
  label: string;
}

export interface DebtorSummary {
  totalDebtors: number;
  grandTotalOutstanding: number;
  grandTotalOverdue: number;
  monthTotals: Record<string, number>;
}

interface DebtorListViewProps {
  debtors: DebtorItem[];
  months: MonthColumn[];
  summary: DebtorSummary;
  onClose: () => void;
}

export function DebtorListView({
  debtors,
  months,
  summary,
  onClose,
}: DebtorListViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OVERDUE" | "CURRENT">("ALL");
  const [sortBy, setSortBy] = useState<"OUTSTANDING_DESC" | "NAME_ASC" | "AGE_DESC">("OUTSTANDING_DESC");
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // Filtered and sorted debtors
  const filteredDebtors = useMemo(() => {
    return debtors
      .filter((d) => {
        if (statusFilter === "OVERDUE" && d.status !== "OVERDUE") return false;
        if (statusFilter === "CURRENT" && d.status === "OVERDUE") return false;

        if (search.trim()) {
          const q = search.toLowerCase();
          const matchName = d.partyName.toLowerCase().includes(q);
          const matchBill = d.oldestBillNo && d.oldestBillNo.toLowerCase().includes(q);
          if (!matchName && !matchBill) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "OUTSTANDING_DESC") {
          return b.totalOutstanding - a.totalOutstanding;
        }
        if (sortBy === "NAME_ASC") {
          return a.partyName.localeCompare(b.partyName);
        }
        if (sortBy === "AGE_DESC") {
          return (b.oldestAgeDays || 0) - (a.oldestAgeDays || 0);
        }
        return 0;
      });
  }, [debtors, search, statusFilter, sortBy]);

  // Compute live footer totals for filtered items
  const filteredTotals = useMemo(() => {
    let grandOutstanding = 0;
    let grandOverdue = 0;
    const monthTotals: Record<string, number> = {};

    for (const m of months) {
      monthTotals[m.key] = 0;
    }

    for (const d of filteredDebtors) {
      grandOutstanding += d.totalOutstanding;
      grandOverdue += d.overdueAmount;
      for (const m of months) {
        monthTotals[m.key] = (monthTotals[m.key] || 0) + (d.monthlyAmounts[m.key] || 0);
      }
    }

    return {
      grandOutstanding: Math.round(grandOutstanding * 100) / 100,
      grandOverdue: Math.round(grandOverdue * 100) / 100,
      monthTotals,
    };
  }, [filteredDebtors, months]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "S.No",
      "Debtor Name",
      "Total Outstanding (Rs)",
      ...months.map((m) => `"${m.label} (Rs)"`),
      "Oldest Bill No",
      "Oldest Bill Date",
      "Age (Days)",
      "Overdue Amount (Rs)",
      "Status",
    ];

    const rows = filteredDebtors.map((d, idx) => [
      idx + 1,
      `"${d.partyName.replace(/"/g, '""')}"`,
      d.totalOutstanding.toFixed(2),
      ...months.map((m) => ((d.monthlyAmounts[m.key] || 0)).toFixed(2)),
      d.oldestBillNo || "",
      d.oldestBillDate ? formatDate(d.oldestBillDate) : "",
      d.oldestAgeDays !== null ? d.oldestAgeDays : "",
      d.overdueAmount.toFixed(2),
      d.status,
    ]);

    // Totals row
    const totalsRow = [
      "",
      `"TOTAL (${filteredDebtors.length} DEBTORS)"`,
      filteredTotals.grandOutstanding.toFixed(2),
      ...months.map((m) => (filteredTotals.monthTotals[m.key] || 0).toFixed(2)),
      "",
      "",
      "",
      filteredTotals.grandOverdue.toFixed(2),
      "",
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(",")), totalsRow.join(",")].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Debtors_List_Monthwise_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to Excel (.xlsx) using ExcelJS
  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true);
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "InVoiceR";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("Debtors Schedule", {
        views: [{ state: "frozen", ySplit: 5, xSplit: 2 }],
      });

      // Title & Header info
      worksheet.mergeCells("A1:E1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "INDOBEST — SCHEDULE OF SUNDRY DEBTORS (MONTHWISE CLASSIFICATION)";
      titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } };

      worksheet.mergeCells("A2:E2");
      const subCell = worksheet.getCell("A2");
      subCell.value = `As of: ${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })} | Total Outstanding: Rs. ${filteredTotals.grandOutstanding.toLocaleString("en-IN")}`;
      subCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF475569" } };

      // Table Header Row at Row 4
      const headerRowValues = [
        "S.No",
        "Debtor Name",
        "Total Outstanding",
        ...months.map((m) => m.label),
        "Oldest Bill",
        "Age (Days)",
        "Overdue",
        "Status",
      ];

      const headerRow = worksheet.getRow(4);
      headerRow.values = headerRowValues;
      headerRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 26;

      headerRow.eachCell((cell, colNumber) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1E293B" }, // dark slate
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF94A3B8" } },
          bottom: { style: "medium", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF94A3B8" } },
          right: { style: "thin", color: { argb: "FF94A3B8" } },
        };
      });

      // Left-align Debtor Name
      worksheet.getCell("B4").alignment = { vertical: "middle", horizontal: "left" };

      // Add Data Rows
      filteredDebtors.forEach((d, idx) => {
        const rowValues = [
          idx + 1,
          d.partyName,
          d.totalOutstanding,
          ...months.map((m) => d.monthlyAmounts[m.key] || 0),
          d.oldestBillNo ? `${d.oldestBillNo} (${d.oldestBillDate ? formatDate(d.oldestBillDate) : ""})` : "—",
          d.oldestAgeDays !== null ? `${d.oldestAgeDays} d` : "—",
          d.overdueAmount,
          d.status,
        ];

        const row = worksheet.addRow(rowValues);
        row.font = { name: "Arial", size: 9 };
        row.height = 20;

        // Center align S.No, Age, Status
        row.getCell(1).alignment = { horizontal: "center" };
        row.getCell(rowValues.length - 2).alignment = { horizontal: "right" };
        row.getCell(rowValues.length - 1).alignment = { horizontal: "center" };

        // Number format for currency columns
        row.getCell(3).numFmt = "₹#,##0.00";
        row.getCell(3).font = { name: "Arial", size: 9, bold: true };

        months.forEach((_, mIdx) => {
          const colIndex = 4 + mIdx;
          const cell = row.getCell(colIndex);
          cell.numFmt = "₹#,##0.00";
          if (Number(cell.value) > 0) {
            cell.font = { name: "Arial", size: 9, bold: true };
          } else {
            cell.value = "-";
            cell.font = { name: "Arial", size: 9, color: { argb: "FF94A3B8" } };
            cell.alignment = { horizontal: "center" };
          }
        });

        // Alternate zebra rows
        if (idx % 2 === 1) {
          row.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF8FAFC" },
            };
          });
        }
      });

      // Totals row
      const totalsRowValues = [
        "",
        `TOTAL (${filteredDebtors.length} DEBTORS)`,
        filteredTotals.grandOutstanding,
        ...months.map((m) => filteredTotals.monthTotals[m.key] || 0),
        "",
        "",
        filteredTotals.grandOverdue,
        "",
      ];

      const totalsRow = worksheet.addRow(totalsRowValues);
      totalsRow.font = { name: "Arial", size: 10, bold: true };
      totalsRow.height = 24;

      totalsRow.eachCell((cell, colNumber) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE2E8F0" },
        };
        cell.border = {
          top: { style: "medium", color: { argb: "FF0F172A" } },
          bottom: { style: "double", color: { argb: "FF0F172A" } },
        };
        if (colNumber === 3 || (colNumber >= 4 && colNumber < 4 + months.length) || colNumber === totalsRowValues.length - 1) {
          cell.numFmt = "₹#,##0.00";
        }
      });

      // Auto-fit column widths
      worksheet.columns.forEach((col, idx) => {
        let maxLen = 12;
        col.eachCell?.({ includeEmpty: false }, (cell) => {
          const len = cell.value ? String(cell.value).length : 0;
          if (len > maxLen) maxLen = len;
        });
        col.width = Math.min(Math.max(maxLen + 3, 10), 40);
      });
      worksheet.getColumn(1).width = 6;
      worksheet.getColumn(2).width = 32;

      // Write buffer and trigger browser download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Debtors_Schedule_Monthwise_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Excel export error:", err);
      // Fallback to CSV
      handleExportCSV();
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Trigger browser print
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:overflow-visible">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-[96vw] xl:max-w-7xl max-h-[94vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 print:border-none print:shadow-none print:max-w-none print:max-h-none print:overflow-visible">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:border-b-2 print:border-black">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-medium bg-card text-foreground border border-border shadow-2xs">
                Sundry Debtors Schedule
              </span>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>Monthwise Debtor List</span>
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Party-wise outstanding amounts classified by invoice month &bull; FY 2026–27
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap print:hidden">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors shadow-xs"
              title="Download Excel spreadsheet with monthwise columns"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isExportingExcel ? "Generating..." : "Download Excel"}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors shadow-xs"
              title="Download CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors shadow-xs"
              title="Print or Save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Letterhead (Only visible when printing) */}
        <div className="hidden print:block p-4 border-b border-black text-black">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-black tracking-tight">INDOBEST</h1>
              <p className="text-xs">19/10/2, GOBINDA KHATICK ROAD, KOLKATA-700046</p>
              <p className="text-xs font-mono">GSTIN: 19AAACR6862N1ZP &bull; Phone: 8240892993</p>
            </div>
            <div className="text-right">
              <h2 className="text-base font-bold uppercase">Schedule of Sundry Debtors</h2>
              <p className="text-xs">Monthwise Outstanding Classification</p>
              <p className="text-xs font-mono text-slate-600">
                Printed: {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
              </p>
            </div>
          </div>
        </div>

        {/* KPI Mini-Cards Bar */}
        <div className="p-3 sm:p-4 border-b border-border bg-muted/30 grid grid-cols-2 sm:grid-cols-4 gap-3 print:bg-transparent print:border-b">
          <div className="p-3 rounded-lg border border-border bg-card print:border print:border-slate-300 shadow-xs">
            <span className="text-[11px] font-medium text-muted-foreground block mb-0.5">
              Total Receivables
            </span>
            <span className="text-lg font-bold font-mono text-foreground">
              {formatINR(filteredTotals.grandOutstanding)}
            </span>
            <span className="text-[10px] text-muted-foreground block mt-0.5">
              Across {filteredDebtors.length} debtor parties
            </span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-card print:border print:border-slate-300">
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 block mb-0.5">
              Total Overdue (&gt;90d)
            </span>
            <span className="text-lg font-bold font-mono text-foreground">
              {formatINR(filteredTotals.grandOverdue)}
            </span>
            <span className="text-[10px] text-muted-foreground block mt-0.5">
              Past payment deadline
            </span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-card print:border print:border-slate-300">
            <span className="text-[11px] font-medium text-muted-foreground block mb-0.5">
              Active Debtors
            </span>
            <span className="text-lg font-bold text-foreground">
              {filteredDebtors.length}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                / {debtors.length}
              </span>
            </span>
            <span className="text-[10px] text-muted-foreground block mt-0.5">
              With positive closing dues
            </span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-card print:border print:border-slate-300">
            <span className="text-[11px] font-medium text-muted-foreground block mb-0.5">
              Month Columns
            </span>
            <span className="text-lg font-bold text-foreground font-mono">
              {months.length}
            </span>
            <span className="text-[10px] text-muted-foreground block mt-0.5">
              Billing periods classified
            </span>
          </div>
        </div>

        {/* Toolbar: Search, Filter Tabs & Sort */}
        <div className="p-3 border-b border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search debtor name or invoice #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter Tabs */}
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition",
                  statusFilter === "ALL"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All ({debtors.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("OVERDUE")}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition",
                  statusFilter === "OVERDUE"
                    ? "bg-background text-rose-600 dark:text-rose-400 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Overdue
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("CURRENT")}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition",
                  statusFilter === "CURRENT"
                    ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Current / Due
              </button>
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-1.5 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none"
              >
                <option value="OUTSTANDING_DESC">Highest Dues First</option>
                <option value="NAME_ASC">Name (A–Z)</option>
                <option value="AGE_DESC">Oldest Ageing First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scrollable Monthwise Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm border-b border-border text-foreground uppercase tracking-wider text-[11px] font-semibold print:bg-slate-100 print:text-black print:border-b-2 print:border-black">
              <tr>
                <th className="py-2.5 px-3 text-center w-10">#</th>
                <th className="py-2.5 px-3 min-w-[220px]">Debtor Name</th>
                <th className="py-2.5 px-3 text-right font-mono min-w-[130px] text-foreground">
                  Total Outstanding
                </th>

                {/* Dynamic Month Columns */}
                {months.map((m) => (
                  <th
                    key={m.key}
                    className="py-2.5 px-3 text-right font-mono min-w-[110px] whitespace-nowrap"
                  >
                    {m.label}
                  </th>
                ))}

                <th className="py-2.5 px-3 min-w-[130px] whitespace-nowrap">Oldest Bill</th>
                <th className="py-2.5 px-3 text-center min-w-[70px]">Ageing</th>
                <th className="py-2.5 px-3 text-center min-w-[90px]">Status</th>
                <th className="py-2.5 px-2 text-center w-10 print:hidden">Ledger</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border/60">
              {filteredDebtors.length === 0 ? (
                <tr>
                  <td
                    colSpan={7 + months.length}
                    className="py-12 text-center text-muted-foreground text-xs"
                  >
                    No debtors match your search/filter criteria.
                  </td>
                </tr>
              ) : (
                filteredDebtors.map((d, idx) => {
                  return (
                    <tr
                      key={d.id}
                      className="hover:bg-muted/40 transition group print:break-inside-avoid"
                    >
                      {/* S.No */}
                      <td className="py-2.5 px-3 text-center text-muted-foreground font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Debtor Name */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground group-hover:text-primary transition flex items-center gap-1.5">
                          {d.accountId ? (
                            <Link
                              href={`/accounts/${d.accountId}`}
                              className="hover:underline flex items-center gap-1"
                              title={`View ledger statement for ${d.partyName}`}
                            >
                              <span>{d.partyName}</span>
                              <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary opacity-0 group-hover:opacity-100 transition print:hidden" />
                            </Link>
                          ) : (
                            <span>{d.partyName}</span>
                          )}
                        </div>
                      </td>

                      {/* Total Outstanding */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                        {formatINR(d.totalOutstanding)}
                      </td>

                      {/* Monthwise Amounts */}
                      {months.map((m) => {
                        const amt = d.monthlyAmounts[m.key] || 0;
                        return (
                          <td
                            key={m.key}
                            className={cn(
                              "py-2.5 px-3 text-right font-mono whitespace-nowrap",
                              amt > 0
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground/60"
                            )}
                          >
                            {amt > 0 ? formatINR(amt) : "—"}
                          </td>
                        );
                      })}

                      {/* Oldest Bill */}
                      <td className="py-2.5 px-3 text-[11px]">
                        {d.oldestBillNo ? (
                          <div>
                            <span className="font-mono font-semibold text-foreground">
                              {d.oldestBillNo}
                            </span>
                            {d.oldestBillDate && (
                              <span className="text-muted-foreground ml-1">
                                ({formatDate(d.oldestBillDate)})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Ageing (Days) */}
                      <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                        {d.oldestAgeDays !== null ? (
                          <span
                            className={cn(
                              d.oldestAgeDays > 90
                                ? "text-rose-600 dark:text-rose-400 font-bold"
                                : "text-muted-foreground"
                            )}
                          >
                            {d.oldestAgeDays} d
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center">
                        {d.status === "OVERDUE" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Current
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-2 text-center print:hidden">
                        {d.accountId && (
                          <Link
                            href={`/accounts/${d.accountId}`}
                            className="p-1 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 rounded transition inline-block"
                            title="Open Ledger Statement"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Footer Totals Row */}
            <tfoot className="sticky bottom-0 z-10 bg-muted/95 backdrop-blur-sm border-t-2 border-border font-bold text-xs uppercase tracking-wide print:bg-slate-100 print:text-black print:border-t-2 print:border-b-2 print:border-black">
              <tr>
                <td className="py-3 px-3 text-center print:py-2">TOTAL</td>
                <td className="py-3 px-3 normal-case text-muted-foreground print:text-black print:py-2">
                  {filteredDebtors.length} debtor{filteredDebtors.length === 1 ? "" : "s"}
                </td>
                <td className="py-3 px-3 text-right font-mono text-sm text-foreground print:text-black print:py-2">
                  {formatINR(filteredTotals.grandOutstanding)}
                </td>

                {/* Month Totals */}
                {months.map((m) => (
                  <td
                    key={m.key}
                    className="py-3 px-3 text-right font-mono text-xs whitespace-nowrap text-foreground print:text-black print:py-2"
                  >
                    {formatINR(filteredTotals.monthTotals[m.key] || 0)}
                  </td>
                ))}

                <td colSpan={2} className="py-3 px-3 text-right font-mono text-[11px] text-muted-foreground normal-case print:py-2">
                  Overdue Total:
                </td>
                <td className="py-3 px-3 text-center font-mono text-xs text-rose-600 dark:text-rose-400 font-bold print:py-2">
                  {formatINR(filteredTotals.grandOverdue)}
                </td>
                <td className="print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
