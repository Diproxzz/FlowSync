"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Plus,
  Trash2,
  Calendar,
  Building2,
  Package,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileSignature,
  Info,
} from "lucide-react";
import { formatINR } from "@/lib/format";

interface ProductRow {
  id: string;
  productName: string;
  qtyKg: string;
  rate: string;
  amount: number;
}

interface CustomerSuggestion {
  id: string;
  name: string;
  hasRegularLedger: boolean;
  hasInformalLedger: boolean;
}

interface ProductSuggestion {
  id: string;
  code: string;
  name: string;
  category: string | null;
  stdSaleRate: number | null;
  packSizeKg: number | null;
}

interface NewInformalInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewInformalInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
}: NewInformalInvoiceModalProps) {
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ProductRow[]>([
    { id: "row-1", productName: "", qtyKg: "", rate: "", amount: 0 },
  ]);

  // Suggestions state
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerSuggestion[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [activeProductRowId, setActiveProductRowId] = useState<string | null>(null);
  const [productSuggestions, setProductSuggestions] = useState<ProductSuggestion[]>([]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load next invoice number on open
  useEffect(() => {
    if (isOpen) {
      fetch("/api/informal-invoices/next-number")
        .then((res) => res.json())
        .then((data) => {
          if (data.nextNumber) setInvoiceNumber(data.nextNumber);
        })
        .catch(() => setInvoiceNumber("INF-0001"));
    }
  }, [isOpen]);

  // Customer suggestions search
  useEffect(() => {
    if (!customerName.trim() || customerName.length < 1) {
      setCustomerSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/informal-invoices/suggestions?type=customer&q=${encodeURIComponent(customerName)}`)
        .then((res) => res.json())
        .then((data) => {
          setCustomerSuggestions(data.suggestions || []);
        })
        .catch(() => setCustomerSuggestions([]));
    }, 150);
    return () => clearTimeout(timer);
  }, [customerName]);

  // Product suggestions search
  const fetchProductSuggestions = (query: string) => {
    fetch(`/api/informal-invoices/suggestions?type=product&q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => setProductSuggestions(data.suggestions || []))
      .catch(() => setProductSuggestions([]));
  };

  const handleItemChange = (
    id: string,
    field: "productName" | "qtyKg" | "rate",
    value: string
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: value };
        const q = parseFloat(field === "qtyKg" ? value : it.qtyKg) || 0;
        const r = parseFloat(field === "rate" ? value : it.rate) || 0;
        updated.amount = Math.round(q * r * 100) / 100;
        return updated;
      })
    );

    if (field === "productName") {
      setActiveProductRowId(id);
      fetchProductSuggestions(value);
    }
  };

  const handleSelectProduct = (rowId: string, p: ProductSuggestion) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        const q = parseFloat(it.qtyKg) || 0;
        const r = p.stdSaleRate ?? parseFloat(it.rate) ?? 0;
        const amt = Math.round(q * r * 100) / 100;
        return {
          ...it,
          productName: p.name,
          rate: p.stdSaleRate !== null ? String(p.stdSaleRate) : it.rate,
          amount: amt,
        };
      })
    );
    setActiveProductRowId(null);
  };

  const handleAddRow = () => {
    setItems((prev) => [
      ...prev,
      { id: `row-${Date.now()}`, productName: "", qtyKg: "", rate: "", amount: 0 },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const totalInvoiceValue = items.reduce((acc, it) => acc + (it.amount || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customerName.trim()) {
      setError("Please provide a customer name.");
      return;
    }

    const validItems = items.filter((it) => it.productName.trim() && parseFloat(it.qtyKg) > 0);
    if (validItems.length === 0) {
      setError("Please enter at least one valid product line with quantity > 0.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/informal-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_date: invoiceDate,
          invoice_number: invoiceNumber.trim() || undefined,
          customer_name: customerName.trim(),
          notes: notes.trim() || undefined,
          items: validItems.map((it) => ({
            product_name: it.productName.trim(),
            qty_kg: parseFloat(it.qtyKg),
            rate: parseFloat(it.rate) || 0,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create informal invoice.");
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to save invoice.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border bg-card flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <FileSignature className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground tracking-tight">
                New Informal Invoice
              </h2>
              <p className="text-xs text-muted-foreground">
                Non-GST sales entry mapped to customer informal ledger & inventory
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Top Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-muted/40 border border-border">
            {/* Invoice Date */}
            <div>
              <label className="block text-[11px] font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Invoice Date *</span>
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono text-xs"
              />
            </div>

            {/* Invoice Number */}
            <div>
              <label className="block text-[11px] font-semibold text-foreground mb-1">
                Invoice Number *
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INF-0001"
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono text-xs font-semibold"
              />
            </div>

            {/* Customer Name with Auto-suggestions */}
            <div className="relative">
              <label className="block text-[11px] font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Customer Name *</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                placeholder="Type customer name (e.g. ABC Traders)"
                required
                autoComplete="off"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
              />

              {/* Customer Suggestions Dropdown */}
              {showCustomerDropdown && customerSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-border/60">
                  {customerSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomerName(c.name);
                        setShowCustomerDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-xs flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-foreground">{c.name}</span>
                      <div className="flex items-center gap-1">
                        {c.hasInformalLedger && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            Has Informal Ledger
                          </span>
                        )}
                        {c.hasRegularLedger && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                            Regular Customer
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Product Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-primary" />
                <span>Products Sold</span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                Auto-calculates amount (Qty &times; Rate) &bull; Zero GST
              </span>
            </div>

            <div className="border border-border rounded-xl overflow-visible bg-card">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 min-w-[240px]">Product Name *</th>
                    <th className="py-2.5 px-3 w-32 text-right">Quantity (kg) *</th>
                    <th className="py-2.5 px-3 w-32 text-right">Rate (₹/kg)</th>
                    <th className="py-2.5 px-3 w-36 text-right">Amount (₹)</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((it, idx) => (
                    <tr key={it.id} className="hover:bg-muted/20">
                      <td className="py-2 px-3 text-center text-muted-foreground font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Product Name with Suggestion Dropdown */}
                      <td className="py-2 px-3 relative">
                        <input
                          type="text"
                          value={it.productName}
                          onChange={(e) => handleItemChange(it.id, "productName", e.target.value)}
                          onFocus={() => {
                            setActiveProductRowId(it.id);
                            fetchProductSuggestions(it.productName);
                          }}
                          placeholder="Type chemical name (e.g. SUL, KR, etc.)"
                          required
                          autoComplete="off"
                          className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                        />

                        {/* Product Suggestions Dropdown */}
                        {activeProductRowId === it.id && productSuggestions.length > 0 && (
                          <div className="absolute left-3 right-3 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-border/60">
                            {productSuggestions.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleSelectProduct(it.id, p)}
                                className="w-full text-left px-3 py-2 hover:bg-muted text-xs flex items-center justify-between gap-2"
                              >
                                <div>
                                  <span className="font-semibold text-foreground mr-1.5">{p.name}</span>
                                  <span className="text-[10px] text-muted-foreground font-mono">[{p.code}]</span>
                                </div>
                                {p.stdSaleRate !== null && (
                                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                                    ₹{p.stdSaleRate}/kg
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          value={it.qtyKg}
                          onChange={(e) => handleItemChange(it.id, "qtyKg", e.target.value)}
                          placeholder="0.000"
                          required
                          className="w-full text-right px-2.5 py-1.5 bg-background border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                        />
                      </td>

                      {/* Rate */}
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={it.rate}
                          onChange={(e) => handleItemChange(it.id, "rate", e.target.value)}
                          placeholder="0.00"
                          required
                          className="w-full text-right px-2.5 py-1.5 bg-background border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                        />
                      </td>

                      {/* Line Amount */}
                      <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                        {formatINR(it.amount)}
                      </td>

                      {/* Delete Row */}
                      <td className="py-2 px-2 text-center">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(it.id)}
                            className="p-1 text-muted-foreground hover:text-rose-600 rounded transition"
                            title="Remove row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="p-2.5 bg-muted/30 border-t border-border flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs font-medium text-foreground hover:bg-muted transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Product</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Items: {items.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes & Total Value Bar */}
          <div className="p-4 rounded-xl bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1 max-w-md">
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Notes / Narration (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Remarks or dispatch details..."
                className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="text-right sm:border-l sm:border-border sm:pl-6">
              <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground mb-0.5">
                <Info className="w-3.5 h-3.5 text-emerald-600" />
                <span>Non-GST Transaction (0% Tax)</span>
              </div>
              <div className="flex items-baseline justify-end gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase">
                  Total Value:
                </span>
                <span className="text-2xl font-bold font-mono text-foreground">
                  {formatINR(totalInvoiceValue)}
                </span>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || totalInvoiceValue <= 0}
              className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition shadow-xs flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Informal Invoice</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
