"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
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
  Calendar,
  RefreshCw,
  Edit3,
  Save,
  RotateCcw,
  Info,
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
  hasBothAccounts?: boolean;
  hasInformal?: boolean;
  regularAccountId?: string | null;
  informalAccountId?: string | null;
  regularOutstanding?: number;
  informalOutstanding?: number;
  hasManualOverride?: boolean;
}

export interface MonthColumn {
  key: string;
  label: string;
  isRollupStart?: boolean;
}

export interface DebtorPeriodMeta {
  mode: "rolling" | "fy";
  asOfMonth: string;
  financialYear: string;
  periodTitle: string;
  startKey: string;
  endKey: string;
  availableRollingMonths?: Array<{ value: string; label: string }>;
  availableFinancialYears?: Array<{ value: string; label: string }>;
}

export interface DebtorSummary {
  totalDebtors: number;
  grandTotalOutstanding: number;
  grandTotalOverdue: number;
  monthTotals: Record<string, number>;
}

export interface DebtorListViewProps {
  debtors: DebtorItem[];
  months: MonthColumn[];
  summary: DebtorSummary;
  period?: DebtorPeriodMeta;
  onClose: () => void;
}

export function DebtorListView({
  debtors,
  months,
  summary,
  period,
  onClose,
}: DebtorListViewProps) {
  const [activeDebtors, setActiveDebtors] = useState<DebtorItem[]>(debtors);
  const [activeMonths, setActiveMonths] = useState<MonthColumn[]>(months);
  const [activeSummary, setActiveSummary] = useState<DebtorSummary>(summary);
  const [activePeriod, setActivePeriod] = useState<DebtorPeriodMeta>(() => {
    return (
      period || {
        mode: "rolling",
        asOfMonth: "2026-10",
        financialYear: "2026-27",
        periodTitle: "12 Months: Nov 2025 – Oct 2026",
        startKey: "2025-11",
        endKey: "2026-10",
        availableRollingMonths: [],
        availableFinancialYears: [],
      }
    );
  });
  const [loadingPeriod, setLoadingPeriod] = useState(false);

  useEffect(() => {
    setActiveDebtors(debtors);
    setActiveMonths(months);
    setActiveSummary(summary);
    if (period) setActivePeriod(period);
  }, [debtors, months, summary, period]);

  const handlePeriodChange = async (
    newMode: "rolling" | "fy",
    newAsOfMonth: string,
    newFY: string
  ) => {
    setLoadingPeriod(true);
    try {
      const params = new URLSearchParams();
      params.set("mode", newMode);
      if (newMode === "rolling") {
        params.set("asOfMonth", newAsOfMonth);
      } else {
        params.set("financialYear", newFY);
      }
      const res = await fetch(`/api/ledger/debtors?${params.toString()}`);
      const json = await res.json();
      const payload = json.data || json;
      if (payload.debtors && payload.months) {
        setActiveDebtors(payload.debtors);
        setActiveMonths(payload.months);
        if (payload.summary) setActiveSummary(payload.summary);
        if (payload.period) setActivePeriod(payload.period);
      }
    } catch (err) {
      console.error("Failed to reload debtor list:", err);
    } finally {
      setLoadingPeriod(false);
    }
  };
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OVERDUE" | "CURRENT">("ALL");
  const [sortBy, setSortBy] = useState<"OUTSTANDING_DESC" | "NAME_ASC" | "AGE_DESC">("OUTSTANDING_DESC");
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<Record<string, Record<string, number>>>({});
  const [savingEdits, setSavingEdits] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const getDebtorMonthly = (d: DebtorItem): Record<string, number> => {
    if (!pendingEdits[d.id]) return d.monthlyAmounts;
    return {
      ...d.monthlyAmounts,
      ...pendingEdits[d.id],
    };
  };

  const getDebtorTotal = (d: DebtorItem): number => {
    if (!pendingEdits[d.id]) return d.totalOutstanding;
    const amounts = getDebtorMonthly(d);
    return Math.round(activeMonths.reduce((sum, m) => sum + (amounts[m.key] || 0), 0) * 100) / 100;
  };

  const handleCellChange = (debtorId: string, partyName: string, monthKey: string, val: number) => {
    setPendingEdits((prev) => {
      const debtorEdits = prev[debtorId] ? { ...prev[debtorId] } : {};
      debtorEdits[monthKey] = val;
      return {
        ...prev,
        [debtorId]: debtorEdits,
      };
    });
  };

  const editContainerRef = useRef<HTMLDivElement>(null);

  const handleCancelEdits = () => {
    setPendingEdits({});
    setIsEditing(false);
  };

  // When editing anything, upon clicking outside, discard the edit
  useEffect(() => {
    if (!isEditing) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest(".edit-controls") &&
        editContainerRef.current &&
        !editContainerRef.current.contains(target)
      ) {
        handleCancelEdits();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancelEdits();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditing]);

  const handleSaveEdits = async () => {
    if (Object.keys(pendingEdits).length === 0) {
      setIsEditing(false);
      return;
    }

    setSavingEdits(true);
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);

    try {
      const updates = Object.entries(pendingEdits).map(([debtorId, monthEdits]) => {
        const debtor = activeDebtors.find((d) => d.id === debtorId);
        return {
          debtorId,
          partyName: debtor ? debtor.partyName : debtorId,
          monthlyAmounts: {
            ...(debtor ? debtor.monthlyAmounts : {}),
            ...monthEdits,
          },
        };
      });

      const res = await fetch("/api/ledger/debtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: activePeriod.mode,
          updates,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to save debtor schedule");
      }

      setActiveDebtors((prev) =>
        prev.map((d) => {
          if (!pendingEdits[d.id]) return d;
          const updatedMonthly = {
            ...d.monthlyAmounts,
            ...pendingEdits[d.id],
          };
          const updatedTotal = Math.round(
            activeMonths.reduce((sum, m) => sum + (updatedMonthly[m.key] || 0), 0) * 100
          ) / 100;

          return {
            ...d,
            monthlyAmounts: updatedMonthly,
            totalOutstanding: updatedTotal,
            hasManualOverride: true,
          };
        })
      );

      setPendingEdits({});
      setIsEditing(false);
      setSaveSuccessMessage("Debtor breakdown schedule saved successfully.");
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Save error:", err);
      setSaveErrorMessage(err.message || "Failed to save changes. Please try again.");
    } finally {
      setSavingEdits(false);
    }
  };

  const handleResetDebtor = async (partyName: string, debtorId: string) => {
    try {
      setLoadingPeriod(true);
      await fetch("/api/ledger/debtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: activePeriod.mode,
          resetPartyName: partyName,
        }),
      });
      setPendingEdits((prev) => {
        const copy = { ...prev };
        delete copy[debtorId];
        return copy;
      });
      await handlePeriodChange(activePeriod.mode, activePeriod.asOfMonth, activePeriod.financialYear);
      setSaveSuccessMessage(`Reset ${partyName} to automated calculation.`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error("Reset error:", err);
    } finally {
      setLoadingPeriod(false);
    }
  };


  // Filtered and sorted debtors
  const filteredDebtors = useMemo(() => {
    return activeDebtors
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
  }, [activeDebtors, search, statusFilter, sortBy]);

  // Compute live footer totals for filtered items
  const filteredTotals = useMemo(() => {
    let grandOutstanding = 0;
    let grandOverdue = 0;
    const monthTotals: Record<string, number> = {};

    for (const m of activeMonths) {
      monthTotals[m.key] = 0;
    }

    for (const d of filteredDebtors) {
      const rowAmounts = getDebtorMonthly(d);
      const rowTotal = getDebtorTotal(d);
      grandOutstanding += rowTotal;
      grandOverdue += d.overdueAmount;
      for (const m of activeMonths) {
        monthTotals[m.key] = (monthTotals[m.key] || 0) + (rowAmounts[m.key] || 0);
      }
    }

    return {
      grandOutstanding: Math.round(grandOutstanding * 100) / 100,
      grandOverdue: Math.round(grandOverdue * 100) / 100,
      monthTotals,
    };
  }, [filteredDebtors, activeMonths]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "S.No",
      "Debtor Name",
      "Total Outstanding (Rs)",
      ...activeMonths.map((m) => `"${m.label} (Rs)"`),
      "Oldest Bill No",
      "Oldest Bill Date",
      "Age (Days)",
      "Overdue Amount (Rs)",
      "Status",
    ];

    const rows = filteredDebtors.map((d, idx) => [
      idx + 1,
      `"${d.partyName.replace(/"/g, '""')}"`,
      getDebtorTotal(d).toFixed(2),
      ...activeMonths.map((m) => ((getDebtorMonthly(d)[m.key] || 0)).toFixed(2)),
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
      ...activeMonths.map((m) => (filteredTotals.monthTotals[m.key] || 0).toFixed(2)),
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
      `Debtors_Schedule_${activePeriod.mode === "fy" ? activePeriod.financialYear : activePeriod.asOfMonth}_${new Date().toISOString().split("T")[0]}.csv`
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
      titleCell.value = `INDOBEST — SCHEDULE OF SUNDRY DEBTORS (${activePeriod.periodTitle.toUpperCase()})`;
      titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } };

      worksheet.mergeCells("A2:E2");
      const subCell = worksheet.getCell("A2");
      subCell.value = `As of: ${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })} | Total Outstanding: Rs. ${filteredTotals.grandOutstanding.toLocaleString("en-IN")} | *First column (${activeMonths[0]?.label}) includes prior dues`;
      subCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF475569" } };

      // Table Header Row at Row 4
      const headerRowValues = [
        "S.No",
        "Debtor Name",
        "Total Outstanding",
        ...activeMonths.map((m) => m.label),
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
          getDebtorTotal(d),
          ...activeMonths.map((m) => getDebtorMonthly(d)[m.key] || 0),
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

        activeMonths.forEach((_, mIdx) => {
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
        ...activeMonths.map((m) => filteredTotals.monthTotals[m.key] || 0),
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
        if (colNumber === 3 || (colNumber >= 4 && colNumber < 4 + activeMonths.length) || colNumber === totalsRowValues.length - 1) {
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
      a.download = `Debtors_Schedule_${activePeriod.mode === "fy" ? activePeriod.financialYear : activePeriod.asOfMonth}_${new Date().toISOString().split("T")[0]}.xlsx`;
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
              {activePeriod.periodTitle} &bull; 12-Month Schedule Format
            </p>
          </div>

          {/* Action Buttons */}
          <div className="edit-controls flex items-center gap-2 flex-wrap print:hidden">
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

            {/* Edit Breakdown Toggle Button */}
            <button
              type="button"
              onClick={() => {
                if (isEditing) {
                  handleCancelEdits();
                } else {
                  setIsEditing(true);
                }
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors shadow-xs cursor-pointer",
                isEditing
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/25"
                  : "border-border bg-card text-foreground hover:bg-muted"
              )}
              title={isEditing ? "Exit Edit Mode" : "Make 12-month breakdown columns editable"}
            >
              {isEditing ? (
                <>
                  <X className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Cancel Editing</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5 text-primary" />
                  <span>Edit Schedule</span>
                </>
              )}
            </button>

            {isEditing && (
              <button
                type="button"
                onClick={handleSaveEdits}
                disabled={savingEdits || Object.keys(pendingEdits).length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-xs disabled:opacity-50 cursor-pointer"
                title="Save changes to monthly breakdown"
              >
                {savingEdits ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save ({Object.keys(pendingEdits).length})</span>
              </button>
            )}

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

        {/* Period Selector Bar: Option 1 (Last 12 Months) vs Option 2 (Current Financial Year) */}
        <div className="px-4 py-2.5 bg-muted/20 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs print:hidden">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Format:
            </span>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 shadow-2xs">
              <button
                type="button"
                onClick={() => handlePeriodChange("rolling", "", "")}
                disabled={loadingPeriod}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer",
                  activePeriod.mode === "rolling"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Last 12 Months</span>
              </button>
              <button
                type="button"
                onClick={() => handlePeriodChange("fy", "", "")}
                disabled={loadingPeriod}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer",
                  activePeriod.mode === "fy"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Current Financial Year</span>
              </button>
            </div>

            {loadingPeriod && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                Updating schedule...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
            <span className="font-semibold text-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border shadow-2xs">
              {activePeriod.periodTitle}
            </span>
            <span className="hidden sm:inline">&bull;</span>
            <span className="italic text-muted-foreground">
              *First column ({activeMonths[0]?.label?.replace("*", "")}) includes all prior dues
            </span>
          </div>
        </div>

        {/* Edit Mode Notice Banner */}
        {isEditing && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Editable Schedule Active:</strong> Type new amounts into any of the 12 month columns. Row totals and column totals recalculate automatically.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEdits}
                disabled={savingEdits || Object.keys(pendingEdits).length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-semibold text-xs shadow-xs cursor-pointer disabled:opacity-50"
              >
                {savingEdits ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                <span>Save All Changes ({Object.keys(pendingEdits).length})</span>
              </button>
              <button
                type="button"
                onClick={handleCancelEdits}
                className="px-2.5 py-1 bg-background border border-border text-foreground hover:bg-muted rounded-md text-xs cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Feedback Banners */}
        {saveSuccessMessage && (
          <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2 print:hidden">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{saveSuccessMessage}</span>
          </div>
        )}
        {saveErrorMessage && (
          <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/30 text-rose-900 dark:text-rose-200 text-xs flex items-center gap-2 print:hidden">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{saveErrorMessage}</span>
          </div>
        )}

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
                / {activeDebtors.length}
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
              {activeMonths.length}
            </span>
            <span className="text-[10px] text-muted-foreground block mt-0.5">
              12-Month format breakdown
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
                All ({activeDebtors.length})
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
        <div ref={editContainerRef} className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm border-b border-border text-foreground uppercase tracking-wider text-[11px] font-semibold print:bg-slate-100 print:text-black print:border-b-2 print:border-black">
              <tr>
                <th className="py-2.5 px-3 text-center w-10">#</th>
                <th className="py-2.5 px-3 min-w-[220px]">Debtor Name</th>
                <th className="py-2.5 px-3 text-right font-mono min-w-[130px] text-foreground">
                  Total Outstanding
                </th>

                {/* 12-Month Schedule Columns */}
                {activeMonths.map((m) => (
                  <th
                    key={m.key}
                    className="py-2.5 px-3 text-right font-mono min-w-[110px] whitespace-nowrap"
                    title={m.isRollupStart ? "Includes all dues from this month and prior periods" : undefined}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>{m.label}</span>
                      {m.isRollupStart && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-primary/10 text-primary font-normal normal-case">
                          prior+
                        </span>
                      )}
                      {isEditing && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold normal-case">
                          edit
                        </span>
                      )}
                    </div>
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
                    colSpan={7 + activeMonths.length}
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
                        <div className="font-semibold text-foreground group-hover:text-primary transition flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap">
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
                            {d.hasBothAccounts && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-semibold border border-primary/20">
                                Combined
                              </span>
                            )}
                            {!d.hasBothAccounts && d.hasInformal && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                                Informal
                              </span>
                            )}
                          </div>
                          {d.hasBothAccounts && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 font-normal flex items-center gap-2">
                              <span>Reg: {formatINR(d.regularOutstanding || 0)}</span>
                              <span>•</span>
                              <span>Inf: {formatINR(d.informalOutstanding || 0)}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Total Outstanding */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                        {formatINR(getDebtorTotal(d))}
                      </td>

                      {/* Monthwise Amounts */}
                      {activeMonths.map((m) => {
                        const cellModified = pendingEdits[d.id]?.[m.key] !== undefined;
                        const amt = cellModified ? pendingEdits[d.id][m.key] : (d.monthlyAmounts[m.key] || 0);

                        if (isEditing) {
                          return (
                            <td key={m.key} className="py-1 px-1.5 text-right font-mono min-w-[105px]">
                              <input
                                type="number"
                                step="any"
                                value={amt === 0 ? "" : amt}
                                placeholder="0"
                                onChange={(e) => {
                                  const rawVal = e.target.value.trim();
                                  const val = rawVal === "" ? 0 : parseFloat(rawVal) || 0;
                                  handleCellChange(d.id, d.partyName, m.key, val);
                                }}
                                className={cn(
                                  "w-full text-right px-2 py-1 text-xs font-mono rounded border transition-colors focus:outline-none focus:ring-1 focus:ring-primary",
                                  cellModified
                                    ? "bg-amber-500/15 border-amber-500 text-foreground font-bold shadow-2xs"
                                    : "bg-background border-border text-foreground hover:border-muted-foreground/50"
                                )}
                              />
                            </td>
                          );
                        }

                        return (
                          <td
                            key={m.key}
                            onDoubleClick={() => setIsEditing(true)}
                            className={cn(
                              "py-2.5 px-3 text-right font-mono whitespace-nowrap",
                              amt > 0
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground/60",
                              d.hasManualOverride && amt > 0 && "text-primary font-bold"
                            )}
                            title={d.hasManualOverride ? "Custom saved schedule amount (double-click to edit)" : "Double-click to edit"}
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
                        {d.hasManualOverride && (
                          <button
                            type="button"
                            onClick={() => handleResetDebtor(d.partyName, d.id)}
                            title={`Reset ${d.partyName} back to automated calculation`}
                            className="p-1 mr-1 text-muted-foreground hover:text-amber-600 rounded transition inline-block cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {d.hasBothAccounts ? (
                          <div className="flex items-center justify-center gap-1">
                            {d.regularAccountId && (
                              <Link
                                href={`/accounts/${d.regularAccountId}`}
                                className="px-1.5 py-0.5 text-[10px] rounded border border-border text-muted-foreground hover:text-primary hover:border-primary transition font-mono"
                                title="Regular Ledger Statement"
                              >
                                Reg
                              </Link>
                            )}
                            {d.informalAccountId && (
                              <Link
                                href={`/accounts/${d.informalAccountId}`}
                                className="px-1.5 py-0.5 text-[10px] rounded border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:text-amber-500 hover:border-amber-500 transition font-mono"
                                title="Informal Ledger Statement"
                              >
                                Inf
                              </Link>
                            )}
                          </div>
                        ) : (
                          d.accountId && (
                            <Link
                              href={`/accounts/${d.accountId}`}
                              className="p-1 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 rounded transition inline-block"
                              title="Open Ledger Statement"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                            </Link>
                          )
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
                {activeMonths.map((m) => (
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
