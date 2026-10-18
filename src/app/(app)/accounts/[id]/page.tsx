"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { StatementHeader } from "@/components/accounts/StatementHeader";
import { SummaryCards } from "@/components/accounts/SummaryCards";
import { StatementTable, StatementRow } from "@/components/accounts/StatementTable";
import { OutstandingTable, OpenItemRow } from "@/components/accounts/OutstandingTable";
import { TotalDueBanner } from "@/components/accounts/TotalDueBanner";
import { ReceiptModal } from "@/components/accounts/ReceiptModal";
import { EntryEditModal } from "@/components/accounts/EntryEditModal";
import { ManageStatementModal } from "@/components/accounts/ManageStatementModal";
import { formatINR } from "@/lib/format";
import {
  ArrowLeft,
  Calendar,
  Download,
  Printer,
  FileSpreadsheet,
  FileText,
  Clock,
  Layers,
  Filter,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function AccountStatementPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [statementData, setStatementData] = useState<any>(null);
  const [openItemsData, setOpenItemsData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"statement" | "openItems">("statement");

  // Date range filters
  const [periodPreset, setPeriodPreset] = useState<string>("FY");
  const [fromDate, setFromDate] = useState<string>("2026-04-01");
  const [toDate, setToDate] = useState<string>(() => {
    const today = new Date().toISOString().split("T")[0];
    return today;
  });

  // Modals
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [selectedEntryForEdit, setSelectedEntryForEdit] = useState<any | null>(null);

  useEffect(() => {
    if (accountId) {
      loadStatement();
      loadOpenItems();
    }
  }, [accountId, fromDate, toDate]);

  const loadStatement = async () => {
    setLoading(true);
    try {
      const url = `/api/ledger/accounts/${accountId}/statement?from=${fromDate}&to=${toDate}`;
      const res = await fetch(url);
      const json = await res.json();
      const payload = json.data || json;
      if (payload && (payload.account || payload.entries)) {
        setStatementData(payload);
      }
    } catch (err) {
      console.error("Failed to load statement:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadOpenItems = async () => {
    try {
      const url = `/api/ledger/accounts/${accountId}/open-items?asOf=${toDate}`;
      const res = await fetch(url);
      const json = await res.json();
      const payload = json.data || json;
      if (payload && (payload.items || payload.totalOverdue !== undefined)) {
        setOpenItemsData(payload);
      }
    } catch (err) {
      console.error("Failed to load open items:", err);
    }
  };

  const handlePeriodChange = (preset: string) => {
    setPeriodPreset(preset);
    const today = new Date().toISOString().split("T")[0];

    if (preset === "FY") {
      setFromDate("2026-04-01");
      const fyEnd = "2027-03-31";
      setToDate(fyEnd > today ? today : fyEnd);
    } else if (preset === "30D") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setFromDate(d.toISOString().split("T")[0]);
      setToDate(today);
    } else if (preset === "90D") {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      setFromDate(d.toISOString().split("T")[0]);
      setToDate(today);
    }
  };

  const handleVoidEntry = async (entryId: string) => {
    const reason = prompt("Enter void reason (required):");
    if (!reason || !reason.trim()) return;

    try {
      const res = await fetch(`/api/ledger/entries/${entryId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (json.success) {
        loadStatement();
        loadOpenItems();
      } else {
        alert(json.error || "Failed to void entry");
      }
    } catch (err) {
      alert("Error voiding entry");
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Are you sure you want to permanently delete this line from the statement?")) return;
    try {
      const res = await fetch(`/api/ledger/entries/${entryId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        loadStatement();
        loadOpenItems();
      } else {
        alert(json.error || "Failed to delete entry");
      }
    } catch (err) {
      alert("Error deleting entry");
    }
  };

  const handleExportCSV = () => {
    if (!statementData) return;
    const headers = ["Date", "Particulars", "Debit", "Credit", "Running Balance", "Side"];
    const rows = statementData.entries.map((r: any) => [
      r.entry_date,
      `"${(r.particulars || "").replace(/"/g, '""')}"`,
      r.debit > 0 ? r.debit.toFixed(2) : "",
      r.credit > 0 ? r.credit.toFixed(2) : "",
      Math.abs(r.running_balance).toFixed(2),
      r.balance_side,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Statement_${statementData.account.displayName.replace(/\s+/g, "_")}_${fromDate}_to_${toDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading && !statementData) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-center text-muted-foreground">
        Loading statement...
      </div>
    );
  }

  if (!statementData) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-center">
        <p className="text-muted-foreground">Account statement not found.</p>
        <Link href="/accounts" className="mt-4 inline-block text-primary underline text-sm">
          Return to accounts
        </Link>
      </div>
    );
  }

  const account = statementData.account;
  const isCustomer = account.accountType === "CUSTOMER";

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 print:max-w-none print:space-y-3 print-statement-page">
      {/* Top Navigation & Toolbar (hidden during print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Accounts</span>
        </Link>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset Buttons */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border text-xs">
            <button
              type="button"
              onClick={() => handlePeriodChange("FY")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                periodPreset === "FY" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              FY 2026-27
            </button>
            <button
              type="button"
              onClick={() => handlePeriodChange("90D")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                periodPreset === "90D" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Last 90 Days
            </button>
            <button
              type="button"
              onClick={() => handlePeriodChange("30D")}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium transition-colors",
                periodPreset === "30D" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Last 30 Days
            </button>
          </div>

          {/* Add Line button */}
          <button
            type="button"
            onClick={() => {
              setSelectedEntryForEdit(null);
              setIsEntryModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Line</span>
          </button>

          {/* Manage Statement (Edit/Delete) */}
          <button
            type="button"
            onClick={() => setIsManageModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
            title="Edit statement settings, opening balance, or delete/reset imported statement"
          >
            <Settings className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Manage Statement</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* 1. Statement Header Component */}
      <StatementHeader
        account={{
          id: account.id,
          displayName: account.displayName,
          accountType: account.accountType,
          gstin: account.gstin,
          gstinSource: account.gstinSource,
          address: account.address,
          stateCode: account.stateCode,
        }}
        period={{
          from: fromDate,
          to: toDate,
        }}
      />

      {/* 2. Summary Cards Component */}
      <SummaryCards
        openingBalance={statementData.summary?.openingBalance ?? statementData.margTotals?.openingBalance ?? 0}
        periodDebit={statementData.summary?.periodDebit ?? statementData.margTotals?.periodDebit ?? 0}
        periodCredit={statementData.summary?.periodCredit ?? statementData.margTotals?.periodCredit ?? 0}
        closingBalance={statementData.summary?.closingBalance ?? statementData.margTotals?.closingBalance ?? 0}
        accountType={account.accountType}
        openingBalanceSet={account.openingBalanceSet}
      />

      {/* 3. Tab Switcher (Statement vs Outstanding Bills) */}
      <div className="flex items-center justify-between border-b border-border print:hidden">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("statement")}
            className={cn(
              "py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors",
              activeTab === "statement"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="w-4 h-4" />
            <span>Statement View ({statementData.entries.length} entries)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("openItems")}
            className={cn(
              "py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors",
              activeTab === "openItems"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Clock className="w-4 h-4" />
            <span>
              Outstanding Bills (
              {openItemsData?.items?.filter(
                (it: any) => (it.outstandingAmount ?? it.outstanding ?? 0) > 0.005
              ).length || 0}
              )
            </span>
          </button>
        </div>
      </div>

      {/* 4. Active Tab Content */}
      {activeTab === "statement" ? (
        <StatementTable
          rows={statementData.entries}
          margTotals={statementData.margTotals}
          onVoidEntry={handleVoidEntry}
          onDeleteEntry={handleDeleteEntry}
          onEditEntry={(row) => {
            setSelectedEntryForEdit(row);
            setIsEntryModalOpen(true);
          }}
        />
      ) : (
        <OutstandingTable
          items={openItemsData?.items || []}
          advance={openItemsData?.advance || 0}
          closingBalance={statementData.summary?.closingBalance ?? statementData.margTotals?.closingBalance ?? 0}
          closingSide={statementData.summary?.closingSide ?? statementData.margTotals?.closingSide ?? "Dr"}
          creditDays={account.creditDays}
          accountType={account.accountType}
        />
      )}

      {/* 5. Sticky Total Due Banner */}
      <div className="print:hidden">
        <TotalDueBanner
          partyName={account.displayName}
          totalDue={statementData.summary?.closingBalance ?? statementData.margTotals?.closingBalance ?? 0}
          accountType={account.accountType}
          overdueAmount={statementData.summary?.overdueAmount ?? openItemsData?.totalOverdue ?? 0}
          oldestBillNo={statementData.summary?.oldestBillNo ?? statementData.totalDue?.oldestBill}
          oldestBillDate={statementData.summary?.oldestBillDate}
          onAddReceipt={() => setIsReceiptModalOpen(true)}
          onPrint={() => window.print()}
        />
      </div>

      {/* 6. Receipt Modal */}
      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        accountId={account.id}
        accountName={account.displayName}
        accountType={account.accountType}
        onSuccess={() => {
          loadStatement();
          loadOpenItems();
        }}
      />

      {/* 7. Add / Edit Statement Entry Modal */}
      <EntryEditModal
        isOpen={isEntryModalOpen}
        onClose={() => {
          setIsEntryModalOpen(false);
          setSelectedEntryForEdit(null);
        }}
        accountId={account.id}
        accountName={account.displayName}
        accountType={account.accountType}
        entryToEdit={selectedEntryForEdit}
        onSuccess={() => {
          loadStatement();
          loadOpenItems();
        }}
      />

      {/* 8. Manage / Delete Statement Modal */}
      <ManageStatementModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        accountId={account.id}
        accountName={account.displayName}
        accountType={account.accountType}
        currentOpeningBalance={statementData.summary?.openingBalance ?? statementData.margTotals?.openingBalance ?? 0}
        currentOpeningSide={statementData.summary?.openingSide ?? statementData.margTotals?.openingSide ?? "Dr"}
        currentOpeningDate={statementData.period?.from}
        currentThroughDate={account.statementThroughDate}
        creditDays={account.creditDays}
        importBatches={statementData.importBatches || []}
        onSuccess={() => {
          loadStatement();
          loadOpenItems();
        }}
      />
    </div>
  );
}
