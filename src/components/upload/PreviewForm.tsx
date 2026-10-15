"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Trash2,
  Split,
  Save,
  Tag,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { ExtractedInvoice, ExtractedInvoiceItem } from "@/lib/llm/schema";
import { validateInvoice, Issue } from "@/lib/validation/invoice";
import { CustomerResolution } from "@/lib/matching/customer";
import { ProductResolution } from "@/lib/matching/product";
import { formatINR } from "@/lib/format";

interface ProductOption {
  id: string;
  code: string;
  name: string;
}

interface CustomerOption {
  id: string;
  name: string;
  gstin: string | null;
}

interface PreviewFormProps {
  initialDraft: ExtractedInvoice;
  customerMatch: CustomerResolution;
  productMatches: ProductResolution[];
  fileToken?: string;
  mode: "create" | "replace";
  onSave: (payload: any) => Promise<void>;
  onDiscard: () => void;
  saving?: boolean;
}

export function PreviewForm({
  initialDraft,
  customerMatch,
  productMatches,
  fileToken,
  mode,
  onSave,
  onDiscard,
  saving = false,
}: PreviewFormProps) {
  const [draft, setDraft] = useState<ExtractedInvoice>(initialDraft);
  const [customerRes, setCustomerRes] = useState(customerMatch);
  const [productResList, setProductResList] = useState(productMatches);
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(false);
  const [productsList, setProductsList] = useState<ProductOption[]>([]);
  const [customersList, setCustomersList] = useState<CustomerOption[]>([]);
  const [liveDuplicate, setLiveDuplicate] = useState<any>(null);

  // Load products and customers for selection dropdowns
  useEffect(() => {
    Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/customers").then((r) => r.json()),
    ])
      .then(([pData, cData]) => {
        if (pData.products) setProductsList(pData.products);
        if (cData.customers) setCustomersList(cData.customers);
      })
      .catch(console.error);
  }, []);

  // Live duplicate check on invoice number change (debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!draft.invoice.number.trim()) return;
      try {
        const res = await fetch(`/api/invoices/exists?number=${encodeURIComponent(draft.invoice.number)}`);
        const data = await res.json();
        if (data.exists && mode === "create") {
          setLiveDuplicate(data.invoice);
        } else {
          setLiveDuplicate(null);
        }
      } catch (err) {
        console.error(err);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [draft.invoice.number, mode]);

  // Run live validation whenever draft updates
  const validation = validateInvoice(draft);
  const errors = validation.issues.filter((i) => i.severity === "error");
  const warnings = validation.issues.filter((i) => i.severity === "warning");

  // Recalculate totals automatically when line values change
  const recalculateTotals = (items: ExtractedInvoiceItem[]) => {
    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    items.forEach((it) => {
      subtotal += it.taxableAmount;
      const c = it.cgstAmount !== null ? it.cgstAmount : (it.taxableAmount * it.cgstPct) / 100;
      const s = it.sgstAmount !== null ? it.sgstAmount : (it.taxableAmount * it.sgstPct) / 100;
      const i = (it.taxableAmount * (it.igstPct || 0)) / 100;
      cgst += c;
      sgst += s;
      igst += i;
    });

    const exactSum = subtotal + cgst + sgst + igst;
    // Derive round-off to nearest whole rupee if within 1 rupee
    const roundedGrand = Math.round(exactSum);
    const roundOff = Math.round((roundedGrand - exactSum) * 100) / 100;

    return {
      taxableSubtotal: Math.round(subtotal * 100) / 100,
      cgstTotal: Math.round(cgst * 100) / 100,
      sgstTotal: Math.round(sgst * 100) / 100,
      igstTotal: Math.round(igst * 100) / 100,
      roundOff,
      grandTotal: roundedGrand,
    };
  };

  const updateItem = (index: number, field: keyof ExtractedInvoiceItem, value: any) => {
    const nextItems = [...draft.items];
    const item = { ...nextItems[index], [field]: value };

    // Auto calculate taxable amount if qty or rate changes
    if (field === "qtyKg" || field === "rate") {
      const q = Number(item.qtyKg) || 0;
      const r = Number(item.rate) || 0;
      item.taxableAmount = Math.round(q * r * 100) / 100;

      // Also recalculate line total
      const cgstAmt = (item.taxableAmount * item.cgstPct) / 100;
      const sgstAmt = (item.taxableAmount * item.sgstPct) / 100;
      item.cgstAmount = Math.round(cgstAmt * 100) / 100;
      item.sgstAmount = Math.round(sgstAmt * 100) / 100;
      item.lineTotal = Math.round((item.taxableAmount + cgstAmt + sgstAmt) * 100) / 100;
    }

    nextItems[index] = item;
    const nextTotals = recalculateTotals(nextItems);

    setDraft({
      ...draft,
      items: nextItems,
      totals: nextTotals,
    });
  };

  const handleAddItem = () => {
    const nextLineNo = draft.items.length + 1;
    const newItem: ExtractedInvoiceItem = {
      lineNo: nextLineNo,
      productNameRaw: "",
      hsn: "",
      qtyKg: 0,
      packSizeKg: null,
      rate: 0,
      taxableAmount: 0,
      cgstPct: 9,
      sgstPct: 9,
      igstPct: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      lineTotal: 0,
    };

    setDraft({
      ...draft,
      items: [...draft.items, newItem],
    });

    setProductResList([
      ...productResList,
      {
        status: "NEW",
        confidence: 0,
      },
    ]);
  };

  const handleDeleteItem = (index: number) => {
    if (draft.items.length <= 1) return; // Keep at least one item
    const nextItems = draft.items.filter((_, i) => i !== index);
    const nextTotals = recalculateTotals(nextItems);

    setDraft({
      ...draft,
      items: nextItems,
      totals: nextTotals,
    });
    setProductResList(productResList.filter((_, i) => i !== index));
  };

  const handleSplitLine = (index: number) => {
    const item = draft.items[index];
    const halfQty = Math.round((item.qtyKg / 2) * 1000) / 1000;
    const halfTaxable = Math.round((item.taxableAmount / 2) * 100) / 100;
    const halfTotal = Math.round((item.lineTotal / 2) * 100) / 100;

    const names = item.productNameRaw.split(",").map((s) => s.trim());
    const name1 = names[0] || item.productNameRaw;
    const name2 = names.slice(1).join(", ") || `${item.productNameRaw} (Part 2)`;

    const updatedItem1: ExtractedInvoiceItem = {
      ...item,
      productNameRaw: name1,
      qtyKg: halfQty,
      taxableAmount: halfTaxable,
      lineTotal: halfTotal,
      cgstAmount: Math.round(((halfTaxable * item.cgstPct) / 100) * 100) / 100,
      sgstAmount: Math.round(((halfTaxable * item.sgstPct) / 100) * 100) / 100,
    };

    const newItem2: ExtractedInvoiceItem = {
      ...item,
      lineNo: draft.items.length + 1,
      productNameRaw: name2,
      qtyKg: item.qtyKg - halfQty,
      taxableAmount: item.taxableAmount - halfTaxable,
      lineTotal: item.lineTotal - halfTotal,
      cgstAmount: Math.round((((item.taxableAmount - halfTaxable) * item.cgstPct) / 100) * 100) / 100,
      sgstAmount: Math.round((((item.taxableAmount - halfTaxable) * item.sgstPct) / 100) * 100) / 100,
    };

    const nextItems = [...draft.items];
    nextItems[index] = updatedItem1;
    nextItems.splice(index + 1, 0, newItem2);

    setDraft({
      ...draft,
      items: nextItems,
      totals: recalculateTotals(nextItems),
    });
  };

  const handleSubmit = async () => {
    if (errors.length > 0) return;
    if (warnings.length > 0 && !acknowledgedWarnings) return;

    const payload = {
      draft,
      customerResolution: {
        action: customerRes.customerId ? "USE_MATCHED" : "CREATE_NEW",
        customerId: customerRes.customerId,
        customerName: draft.customer.name,
        customerGstin: draft.customer.gstin,
        customerAddress: draft.customer.address,
      },
      productResolutions: draft.items.map((it, idx) => {
        const pRes = productResList[idx];
        return {
          lineNo: it.lineNo,
          action: pRes?.productId ? "USE_MATCHED" : "CREATE_NEW",
          productId: pRes?.productId,
          productCode: pRes?.productCode || it.productNameRaw,
          productName: pRes?.productName || it.productNameRaw,
          productNameRaw: it.productNameRaw,
        };
      }),
      mode,
      fileToken,
      acknowledgeWarnings: acknowledgedWarnings,
    };

    await onSave(payload);
  };

  const canSave = errors.length === 0 && (warnings.length === 0 || acknowledgedWarnings);

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-sm overflow-hidden text-xs">
      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Live Duplicate Alert */}
        {liveDuplicate && (
          <div className="p-3 bg-danger-bg border border-danger/40 rounded-sm text-danger flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Duplicate Detected:</strong> Invoice #{liveDuplicate.invoiceNumber} is already in the database
              (saved on {liveDuplicate.invoiceDate?.split("T")[0]} for {liveDuplicate.customerName}).
            </div>
          </div>
        )}

        {/* 1. Header Card */}
        <div className="bg-bg border border-border rounded-sm p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="font-semibold text-ink uppercase tracking-wide text-[11px]">Invoice Header</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-3">Customer Match:</span>
              {customerRes.status === "MATCHED" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-success-bg text-success font-medium text-[11px]">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Matched ({customerRes.reason})</span>
                </span>
              ) : customerRes.status === "SUGGESTED" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-warning-bg text-warning font-medium text-[11px]">
                  <HelpCircle className="w-3 h-3" />
                  <span>Suggested Match</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-info-bg text-info font-medium text-[11px]">
                  <span>＋ New Customer</span>
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Customer / Buyer Name *</label>
              <input
                type="text"
                value={draft.customer.name}
                onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, name: e.target.value } })}
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">
                Customer GSTIN {draft.customer.gstin ? "✓" : "(Optional)"}
              </label>
              <input
                type="text"
                value={draft.customer.gstin || ""}
                onChange={(e) =>
                  setDraft({ ...draft, customer: { ...draft.customer, gstin: e.target.value.toUpperCase() || null } })
                }
                placeholder="15-character GSTIN (Leave blank if unregistered)"
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink font-mono uppercase"
                maxLength={15}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Invoice Number *</label>
              <input
                type="text"
                value={draft.invoice.number}
                onChange={(e) => setDraft({ ...draft, invoice: { ...draft.invoice, number: e.target.value } })}
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Invoice Date (YYYY-MM-DD) *</label>
              <input
                type="date"
                value={draft.invoice.date}
                onChange={(e) => setDraft({ ...draft, invoice: { ...draft.invoice, date: e.target.value } })}
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Map to Existing Customer</label>
              <select
                value={customerRes.customerId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const found = customersList.find((c) => c.id === val);
                  if (found) {
                    setCustomerRes({
                      status: "MATCHED",
                      customerId: found.id,
                      customerName: found.name,
                      customerGstin: found.gstin,
                      reason: "NAME",
                      confidence: 1.0,
                    });
                    if (found.gstin && !draft.customer.gstin) {
                      setDraft({ ...draft, customer: { ...draft.customer, gstin: found.gstin } });
                    }
                  } else {
                    setCustomerRes({ status: "NEW", confidence: 0 });
                  }
                }}
                className="w-full px-2 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink"
              >
                <option value="">Create as new customer...</option>
                {customersList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.gstin ? `(${c.gstin})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 2. Items Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink uppercase tracking-wide text-[11px]">
              Line Items ({draft.items.length})
            </span>
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Line</span>
            </button>
          </div>

          <div className="border border-border rounded-sm overflow-x-auto bg-surface">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                  <th className="py-2 px-2.5 w-8">#</th>
                  <th className="py-2 px-2.5 min-w-[180px]">Product Description</th>
                  <th className="py-2 px-2.5 min-w-[120px]">Map to Product</th>
                  <th className="py-2 px-2.5 w-20">HSN</th>
                  <th className="py-2 px-2.5 text-right w-20">Qty (kg)</th>
                  <th className="py-2 px-2.5 text-right w-20">Pack</th>
                  <th className="py-2 px-2.5 text-right w-24">Rate (₹)</th>
                  <th className="py-2 px-2.5 text-right w-28">Taxable (₹)</th>
                  <th className="py-2 px-2.5 text-right w-16">GST %</th>
                  <th className="py-2 px-2.5 text-right w-28">Total (₹)</th>
                  <th className="py-2 px-2 text-center w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {draft.items.map((item, index) => {
                  const pRes = productResList[index] || { status: "NEW" };
                  const isMultiProduct = item.productNameRaw.includes(",");

                  return (
                    <tr key={index} className="hover:bg-surface-2/40 transition">
                      <td className="py-2 px-2.5 text-ink-3 font-mono">{item.lineNo}</td>

                      <td className="py-2 px-2.5">
                        <input
                          type="text"
                          value={item.productNameRaw}
                          onChange={(e) => updateItem(index, "productNameRaw", e.target.value)}
                          className="w-full px-2 py-1 bg-bg border border-border rounded-sm text-ink text-xs"
                        />
                        {isMultiProduct && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="text-[10px] text-info">Multi-product cell</span>
                            <button
                              type="button"
                              onClick={() => handleSplitLine(index)}
                              className="text-[10px] text-primary underline flex items-center gap-0.5"
                            >
                              <Split className="w-2.5 h-2.5" />
                              <span>Split line</span>
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-2 px-2.5">
                        <select
                          value={pRes.productId || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const found = productsList.find((p) => p.id === val);
                            const nextList = [...productResList];
                            if (found) {
                              nextList[index] = {
                                productId: found.id,
                                productCode: found.code,
                                productName: found.name,
                                status: "MATCHED",
                                confidence: 1.0,
                              };
                            } else {
                              nextList[index] = {
                                productCode: item.productNameRaw,
                                productName: item.productNameRaw,
                                status: "NEW",
                                confidence: 0,
                              };
                            }
                            setProductResList(nextList);
                          }}
                          className="w-full px-2 py-1 bg-bg border border-border rounded-sm text-xs font-mono"
                        >
                          <option value="">＋ Create New ({item.productNameRaw || "Code"})</option>
                          {productsList.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} - {p.name}
                            </option>
                          ))}
                        </select>
                        <div className="mt-0.5">
                          {pRes.status === "MATCHED" ? (
                            <span className="text-[10px] text-success">✓ Matched: {pRes.productCode}</span>
                          ) : (
                            <span className="text-[10px] text-info">＋ New Product</span>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-2.5">
                        <input
                          type="text"
                          value={item.hsn || ""}
                          onChange={(e) => updateItem(index, "hsn", e.target.value || null)}
                          className="w-full px-1.5 py-1 bg-bg border border-border rounded-sm text-xs font-mono"
                        />
                      </td>

                      <td className="py-2 px-2.5 text-right">
                        <input
                          type="number"
                          step="any"
                          value={item.qtyKg}
                          onChange={(e) => updateItem(index, "qtyKg", parseFloat(e.target.value) || 0)}
                          className="w-20 px-1.5 py-1 bg-bg border border-border rounded-sm text-xs text-right num"
                        />
                      </td>

                      <td className="py-2 px-2.5 text-right">
                        <input
                          type="number"
                          step="any"
                          value={item.packSizeKg || ""}
                          onChange={(e) =>
                            updateItem(index, "packSizeKg", e.target.value ? parseFloat(e.target.value) : null)
                          }
                          className="w-16 px-1.5 py-1 bg-bg border border-border rounded-sm text-xs text-right num"
                        />
                      </td>

                      <td className="py-2 px-2.5 text-right">
                        <input
                          type="number"
                          step="any"
                          value={item.rate}
                          onChange={(e) => updateItem(index, "rate", parseFloat(e.target.value) || 0)}
                          className="w-20 px-1.5 py-1 bg-bg border border-border rounded-sm text-xs text-right num"
                        />
                      </td>

                      <td className="py-2 px-2.5 text-right num font-medium text-ink">
                        {formatINR(item.taxableAmount)}
                      </td>

                      <td className="py-2 px-2.5 text-right num text-ink-3">
                        {item.cgstPct + item.sgstPct}%
                      </td>

                      <td className="py-2 px-2.5 text-right num font-semibold text-ink">
                        {formatINR(item.lineTotal)}
                      </td>

                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(index)}
                          disabled={draft.items.length <= 1}
                          className="p-1 text-ink-3 hover:text-danger disabled:opacity-20 transition"
                          title="Delete line"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Totals Card */}
        <div className="bg-bg border border-border rounded-sm p-4 space-y-3">
          <span className="font-semibold text-ink uppercase tracking-wide text-[11px]">Invoice Totals</span>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-surface p-2.5 rounded-sm border border-border">
              <span className="text-[11px] text-ink-3 block">Taxable Subtotal</span>
              <span className="text-sm font-semibold text-ink num mt-0.5 block">
                {formatINR(draft.totals.taxableSubtotal)}
              </span>
            </div>

            <div className="bg-surface p-2.5 rounded-sm border border-border">
              <span className="text-[11px] text-ink-3 block">CGST 9%</span>
              <span className="text-sm font-semibold text-ink num mt-0.5 block">
                {formatINR(draft.totals.cgstTotal)}
              </span>
            </div>

            <div className="bg-surface p-2.5 rounded-sm border border-border">
              <span className="text-[11px] text-ink-3 block">SGST 9%</span>
              <span className="text-sm font-semibold text-ink num mt-0.5 block">
                {formatINR(draft.totals.sgstTotal)}
              </span>
            </div>

            <div className="bg-surface p-2.5 rounded-sm border border-border">
              <span className="text-[11px] text-ink-3 block">Round-off</span>
              <span className="text-sm font-semibold text-ink num mt-0.5 block">
                {formatINR(draft.totals.roundOff || 0)}
              </span>
            </div>

            <div className="bg-surface p-2.5 rounded-sm border-2 border-primary col-span-2 sm:col-span-1">
              <span className="text-[11px] text-primary font-medium block">Grand Total</span>
              <span className="text-base font-bold text-ink num mt-0.5 block">
                {formatINR(draft.totals.grandTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Issues Box */}
        {(errors.length > 0 || warnings.length > 0) && (
          <div className="p-3 bg-surface border border-border rounded-sm space-y-2">
            <div className="flex items-center gap-2">
              {errors.length > 0 ? (
                <XCircle className="w-4 h-4 text-danger" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-warning" />
              )}
              <span className="font-semibold text-xs text-ink">
                Verification Issues ({errors.length} errors, {warnings.length} warnings)
              </span>
            </div>

            <ul className="space-y-1 text-xs">
              {errors.map((e, idx) => (
                <li key={`err-${idx}`} className="text-danger flex items-center gap-1.5 font-medium">
                  <span>✕</span> {e.message}
                </li>
              ))}
              {warnings.map((w, idx) => (
                <li key={`warn-${idx}`} className="text-warning flex items-center gap-1.5">
                  <span>⚠</span> {w.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sticky Footer Bar */}
      <div className="h-14 px-5 bg-surface-2 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          {errors.length > 0 ? (
            <span className="text-xs font-semibold text-danger flex items-center gap-1">
              <XCircle className="w-4 h-4" />
              <span>{errors.length} errors must be resolved to save</span>
            </span>
          ) : warnings.length > 0 ? (
            <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledgedWarnings}
                onChange={(e) => setAcknowledgedWarnings(e.target.checked)}
                className="w-3.5 h-3.5 rounded-sm border-border text-primary"
              />
              <span className="font-medium text-warning">
                I have checked these {warnings.length} warnings
              </span>
            </label>
          ) : (
            <span className="text-xs font-semibold text-success flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>All arithmetic and validations verified</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onDiscard}
            className="px-3.5 py-1.5 rounded-sm border border-border text-xs text-ink hover:bg-border transition"
          >
            Discard
          </button>

          <button
            type="button"
            disabled={!canSave || saving}
            onClick={handleSubmit}
            className="px-4 py-1.5 bg-primary text-primary-fg rounded-sm text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition flex items-center gap-1.5 shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Saving..." : mode === "replace" ? "Save Modifications" : "Save Invoice"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
