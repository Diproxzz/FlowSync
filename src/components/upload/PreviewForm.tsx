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
  ArrowRight,
  Calculator,
} from "lucide-react";
import { ExtractedInvoice, ExtractedInvoiceItem } from "@/lib/llm/schema";
import { validateInvoice, Issue } from "@/lib/validation/invoice";
import { CustomerResolution } from "@/lib/matching/customer";
import { ProductResolution } from "@/lib/matching/product";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  onSave: (payload: any, options?: { advanceToNext?: boolean }) => Promise<void>;
  onDiscard: () => void;
  saving?: boolean;
  hasNextReady?: boolean;
}

function MoneyInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number | null | undefined;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const formatVal = (v: number | null | undefined) =>
    v !== undefined && v !== null && !isNaN(Number(v)) ? Number(v).toFixed(2) : "";

  const [localText, setLocalText] = useState(formatVal(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalText(formatVal(value));
    }
  }, [value, isFocused]);

  return (
    <input
      type="number"
      step="0.01"
      placeholder={placeholder}
      value={isFocused ? localText : formatVal(value)}
      onFocus={() => {
        setIsFocused(true);
        setLocalText(value !== undefined && value !== null ? String(value) : "");
      }}
      onChange={(e) => {
        setLocalText(e.target.value);
        const parsed = parseFloat(e.target.value);
        onChange(isNaN(parsed) ? 0 : parsed);
      }}
      onBlur={() => {
        setIsFocused(false);
        const parsed = parseFloat(localText);
        const clean = isNaN(parsed) ? 0 : parsed;
        onChange(clean);
        setLocalText(clean.toFixed(2));
      }}
      className={className}
    />
  );
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
  hasNextReady = false,
}: PreviewFormProps) {
  const [draft, setDraft] = useState<ExtractedInvoice>(() => {
    let base = { ...initialDraft };
    if (
      customerMatch?.status === "MATCHED" &&
      customerMatch.customerName &&
      (customerMatch.reason === "GSTIN" || initialDraft.customer.gstin)
    ) {
      base.customer = {
        ...base.customer,
        name: customerMatch.customerName,
      };
    }

    const isInter =
      (base.totals.igstTotal !== null && base.totals.igstTotal !== undefined && Number(base.totals.igstTotal) > 0) ||
      base.items.some((it) => (it.igstPct || 0) > 0) ||
      (Number(base.totals.cgstTotal || 0) === 0 && Number(base.totals.sgstTotal || 0) === 0 && Boolean(base.customer.gstin) && !base.customer.gstin?.startsWith("19"));

    if (!isInter) {
      const updatedItems = base.items.map((it) => {
        const totalTaxPct = Number(it.cgstPct || 0) + Number(it.sgstPct || 0);
        const resolvedGst = totalTaxPct > 0 ? totalTaxPct : 18;
        const halfPct = resolvedGst === 5 ? 2.5 : (resolvedGst === 18 ? 9 : resolvedGst / 2);
        const cgstPct = Number(it.cgstPct) > 0 ? Number(it.cgstPct) : halfPct;
        const sgstPct = Number(it.sgstPct) > 0 ? Number(it.sgstPct) : halfPct;
        const cgstAmount = Math.round(((it.taxableAmount * cgstPct) / 100) * 100) / 100;
        const sgstAmount = Math.round(((it.taxableAmount * sgstPct) / 100) * 100) / 100;
        return {
          ...it,
          cgstPct,
          sgstPct,
          igstPct: 0,
          cgstAmount,
          sgstAmount,
          lineTotal: it.lineTotal > 0 ? it.lineTotal : Math.round((it.taxableAmount + cgstAmount + sgstAmount) * 100) / 100,
        };
      });

      const sumCgst = Math.round(updatedItems.reduce((acc, it) => acc + (it.cgstAmount || 0), 0) * 100) / 100;
      const sumSgst = Math.round(updatedItems.reduce((acc, it) => acc + (it.sgstAmount || 0), 0) * 100) / 100;

      base.items = updatedItems;
      base.totals = {
        ...base.totals,
        cgstTotal: sumCgst > 0 ? sumCgst : Math.round((Number(base.totals.taxableSubtotal || 0) * 0.09) * 100) / 100,
        sgstTotal: sumSgst > 0 ? sumSgst : Math.round((Number(base.totals.taxableSubtotal || 0) * 0.09) * 100) / 100,
        igstTotal: 0,
      };
    }

    return base;
  });
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
        if (cData.customers) {
          setCustomersList(cData.customers);
          const cleanG = draft.customer.gstin ? draft.customer.gstin.trim().toUpperCase() : null;
          if (cleanG) {
            const matched = cData.customers.find(
              (c: CustomerOption) => c.gstin && c.gstin.trim().toUpperCase() === cleanG
            );
            if (matched) {
              setDraft((prev) => ({
                ...prev,
                customer: {
                  ...prev.customer,
                  name: matched.name,
                },
              }));
              setCustomerRes({
                status: "MATCHED",
                customerId: matched.id,
                customerName: matched.name,
                customerGstin: matched.gstin,
                reason: "GSTIN",
                confidence: 1.0,
              });
            }
          }
        }
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

  // Recalculate totals automatically when line values change (strictly mutually exclusive tax modes)
  const recalculateTotals = (items: ExtractedInvoiceItem[], forceMode?: "intra" | "inter") => {
    const currentMode = forceMode || (
      (draft.totals.igstTotal !== null && draft.totals.igstTotal !== undefined && Number(draft.totals.igstTotal) > 0) ||
      items.some((it) => (it.igstPct || 0) > 0) ||
      (Number(draft.totals.cgstTotal || 0) === 0 && Number(draft.totals.sgstTotal || 0) === 0 && Boolean(draft.customer.gstin) && !draft.customer.gstin?.startsWith("19"))
        ? "inter"
        : "intra"
    );

    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    items.forEach((it) => {
      subtotal += it.taxableAmount;
      if (currentMode === "inter") {
        const i = Math.round(((it.taxableAmount * (it.igstPct || 0)) / 100) * 100) / 100;
        igst += i;
      } else {
        const totalTaxPct = Number(it.cgstPct || 0) + Number(it.sgstPct || 0);
        let cPct = Number(it.cgstPct);
        let sPct = Number(it.sgstPct);
        if (!cPct && !sPct) {
          if (totalTaxPct === 5) {
            cPct = 2.5;
            sPct = 2.5;
          } else {
            cPct = 9;
            sPct = 9;
          }
        }
        const c = Math.round(((it.taxableAmount * cPct) / 100) * 100) / 100;
        const s = Math.round(((it.taxableAmount * sPct) / 100) * 100) / 100;
        cgst += c;
        sgst += s;
      }
    });

    const exactSum = currentMode === "inter" ? subtotal + igst : subtotal + cgst + sgst;
    // Derive round-off to nearest whole rupee if within 1 rupee
    const roundedGrand = Math.round(exactSum);
    const roundOff = Math.round((roundedGrand - exactSum) * 100) / 100;

    return {
      taxableSubtotal: Math.round(subtotal * 100) / 100,
      cgstTotal: currentMode === "inter" ? 0 : Math.round(cgst * 100) / 100,
      sgstTotal: currentMode === "inter" ? 0 : Math.round(sgst * 100) / 100,
      igstTotal: currentMode === "inter" ? Math.round(igst * 100) / 100 : 0,
      roundOff,
      grandTotal: roundedGrand,
    };
  };

  // Determine if IGST is active (if IGST total > 0 or line items have IGST or non-19 GSTIN)
  const isIgstActive =
    (draft.totals.igstTotal !== null && draft.totals.igstTotal !== undefined && Number(draft.totals.igstTotal) > 0) ||
    draft.items.some((it) => (it.igstPct || 0) > 0) ||
    (Number(draft.totals.cgstTotal || 0) === 0 && Number(draft.totals.sgstTotal || 0) === 0 && (
      draft.customer.gstin ? !draft.customer.gstin.startsWith("19") : false
    ));

  const updateItem = (index: number, field: keyof ExtractedInvoiceItem, value: any) => {
    const nextItems = [...draft.items];
    const item = { ...nextItems[index], [field]: value };

    // Auto calculate taxable amount if qty, rate, or discount changes
    if (field === "qtyKg" || field === "rate" || field === "discountPct") {
      const q = Number(item.qtyKg) || 0;
      const r = Number(item.rate) || 0;
      const d = item.discountPct !== null && item.discountPct !== undefined ? Number(item.discountPct) : 0;
      const discountMultiplier = d > 0 ? 1 - d / 100 : 1;
      item.taxableAmount = Math.round(q * r * discountMultiplier * 100) / 100;
      if (d > 0) {
        item.discountAmount = Math.round(q * r * (d / 100) * 100) / 100;
      } else {
        item.discountAmount = null;
      }

      // Mutual exclusivity: If IGST active, CGST and SGST must NOT be included.
      // If CGST/SGST active, IGST must NOT be calculated.
      if (isIgstActive) {
        item.cgstPct = 0;
        item.sgstPct = 0;
        item.cgstAmount = 0;
        item.sgstAmount = 0;
        const igstAmt = Math.round(((item.taxableAmount * (item.igstPct || 0)) / 100) * 100) / 100;
        item.lineTotal = Math.round((item.taxableAmount + igstAmt) * 100) / 100;
      } else {
        item.igstPct = 0;
        const totalTaxPct = Number(item.cgstPct || 0) + Number(item.sgstPct || 0);
        const cPct = Number(item.cgstPct) > 0 ? Number(item.cgstPct) : (totalTaxPct === 5 ? 2.5 : 9);
        const sPct = Number(item.sgstPct) > 0 ? Number(item.sgstPct) : (totalTaxPct === 5 ? 2.5 : 9);
        item.cgstPct = cPct;
        item.sgstPct = sPct;
        const cgstAmt = Math.round(((item.taxableAmount * cPct) / 100) * 100) / 100;
        const sgstAmt = Math.round(((item.taxableAmount * sPct) / 100) * 100) / 100;
        item.cgstAmount = cgstAmt;
        item.sgstAmount = sgstAmt;
        item.lineTotal = Math.round((item.taxableAmount + cgstAmt + sgstAmt) * 100) / 100;
      }
    } else if (field === "taxableAmount") {
      const t = Number(value) || 0;
      item.taxableAmount = t;
      if (isIgstActive) {
        item.cgstPct = 0;
        item.sgstPct = 0;
        item.cgstAmount = 0;
        item.sgstAmount = 0;
        const igstAmt = Math.round(((t * (item.igstPct || 0)) / 100) * 100) / 100;
        item.lineTotal = Math.round((t + igstAmt) * 100) / 100;
      } else {
        item.igstPct = 0;
        const totalTaxPct = Number(item.cgstPct || 0) + Number(item.sgstPct || 0);
        const cPct = Number(item.cgstPct) > 0 ? Number(item.cgstPct) : (totalTaxPct === 5 ? 2.5 : 9);
        const sPct = Number(item.sgstPct) > 0 ? Number(item.sgstPct) : (totalTaxPct === 5 ? 2.5 : 9);
        item.cgstPct = cPct;
        item.sgstPct = sPct;
        const cgstAmt = Math.round(((t * cPct) / 100) * 100) / 100;
        const sgstAmt = Math.round(((t * sPct) / 100) * 100) / 100;
        item.cgstAmount = cgstAmt;
        item.sgstAmount = sgstAmt;
        item.lineTotal = Math.round((t + cgstAmt + sgstAmt) * 100) / 100;
      }
    } else if (field === "lineTotal") {
      item.lineTotal = Number(value) || 0;
    }

    nextItems[index] = item;
    const nextTotals = recalculateTotals(nextItems);

    setDraft({
      ...draft,
      items: nextItems,
      totals: nextTotals,
    });
  };

  const handleToggleTaxMode = (targetMode: "intra" | "inter") => {
    const nextItems = draft.items.map((it) => {
      const totalTaxPct = Math.round((it.cgstPct || 0) + (it.sgstPct || 0) + (it.igstPct || 0));
      if (targetMode === "inter") {
        const igstAmt = Math.round(((it.taxableAmount * totalTaxPct) / 100) * 100) / 100;
        return {
          ...it,
          igstPct: totalTaxPct,
          cgstPct: 0,
          sgstPct: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          lineTotal: Math.round((it.taxableAmount + igstAmt) * 100) / 100,
        };
      } else {
        const halfPct = totalTaxPct === 5 ? 2.5 : (totalTaxPct === 18 ? 9 : (totalTaxPct > 0 ? totalTaxPct / 2 : 9));
        const halfAmt = Math.round(((it.taxableAmount * halfPct) / 100) * 100) / 100;
        return {
          ...it,
          igstPct: 0,
          cgstPct: halfPct,
          sgstPct: halfPct,
          cgstAmount: halfAmt,
          sgstAmount: halfAmt,
          lineTotal: Math.round((it.taxableAmount + halfAmt * 2) * 100) / 100,
        };
      }
    });

    const newTotals = recalculateTotals(nextItems, targetMode);
    setDraft({
      ...draft,
      items: nextItems,
      totals: newTotals,
    });
  };

  const updateTotal = (field: keyof ExtractedInvoice["totals"], value: number) => {
    setDraft((prev) => {
      const updatedTotals = {
        ...prev.totals,
        [field]: value,
      };

      // Auto-update CGST and SGST when taxableSubtotal changes
      if (field === "taxableSubtotal" && !isIgstActive) {
        const taxVal = Number(value) || 0;
        const rate = (prev.items[0]?.cgstPct) ? Number(prev.items[0].cgstPct) : 9;
        const c = Math.round(((taxVal * rate) / 100) * 100) / 100;
        const s = Math.round(((taxVal * rate) / 100) * 100) / 100;
        updatedTotals.cgstTotal = c;
        updatedTotals.sgstTotal = s;
        updatedTotals.grandTotal = Math.round(taxVal + c + s + (Number(updatedTotals.roundOff) || 0));
      }

      // Mutual exclusivity on direct totals edits:
      if (field === "igstTotal" && Number(value) > 0) {
        updatedTotals.cgstTotal = 0;
        updatedTotals.sgstTotal = 0;
      } else if ((field === "cgstTotal" || field === "sgstTotal") && Number(value) > 0) {
        updatedTotals.igstTotal = 0;
      }

      return {
        ...prev,
        totals: updatedTotals,
      };
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

  const blockingErrors = validation.issues.filter(
    (i) =>
      i.severity === "error" &&
      [
        "CUSTOMER_NAME_MISSING",
        "INVOICE_NUMBER_MISSING",
        "GSTIN_FORMAT",
        "GSTIN_CHECKSUM",
        "GSTIN_IS_COMPANY",
        "NO_ITEMS",
        "DATE_INVALID",
      ].includes(i.code)
  );

  const handleSubmit = async (advance = false) => {
    if (blockingErrors.length > 0) return;

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
      acknowledgeWarnings: true,
    };

    await onSave(payload, { advanceToNext: advance });
  };

  const canSave = blockingErrors.length === 0;

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
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  const cleanG = val.trim();
                  let matchedName = draft.customer.name;
                  if (cleanG) {
                    const matched = customersList.find(
                      (c) => c.gstin && c.gstin.trim().toUpperCase() === cleanG
                    );
                    if (matched) {
                      matchedName = matched.name;
                      setCustomerRes({
                        status: "MATCHED",
                        customerId: matched.id,
                        customerName: matched.name,
                        customerGstin: matched.gstin,
                        reason: "GSTIN",
                        confidence: 1.0,
                      });
                    }
                  }
                  setDraft({
                    ...draft,
                    customer: {
                      ...draft.customer,
                      gstin: val || null,
                      name: matchedName,
                    },
                  });
                }}
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
                    setDraft({
                      ...draft,
                      customer: {
                        ...draft.customer,
                        name: found.name,
                        gstin: found.gstin || draft.customer.gstin,
                      },
                    });
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
                  <th className="py-2 px-2.5 w-8 text-center">#</th>
                  <th className="py-2 px-2.5 min-w-[190px]">Product Description</th>
                  <th className="py-2 px-2.5 min-w-[140px]">Map to Product</th>
                  <th className="py-2 px-2.5 min-w-[120px]">HSN</th>
                  <th className="py-2 px-2.5 text-right min-w-[100px]">Qty (kg)</th>
                  <th className="py-2 px-2.5 text-right min-w-[85px]">Pack</th>
                  <th className="py-2 px-2.5 text-right min-w-[110px]">Rate (₹)</th>
                  <th className="py-2 px-2.5 text-right min-w-[70px]">Disc %</th>
                  <th className="py-2 px-2.5 text-right min-w-[130px]">Taxable (₹)</th>
                  <th className="py-2 px-2.5 text-right min-w-[75px]">{isIgstActive ? "IGST %" : "GST %"}</th>
                  <th className="py-2 px-2.5 text-right min-w-[130px]">Total (₹)</th>
                  <th className="py-2 px-2 text-center w-14">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {draft.items.map((item, index) => {
                  const pRes = productResList[index] || { status: "NEW" };
                  const isMultiProduct = item.productNameRaw.includes(",");

                  return (
                    <tr key={index} className="hover:bg-surface-2/40 transition">
                      <td className="py-2 px-2.5 text-ink-3 font-mono text-center">{item.lineNo}</td>

                      <td className="py-2 px-2.5">
                        <input
                          type="text"
                          value={item.productNameRaw}
                          onChange={(e) => updateItem(index, "productNameRaw", e.target.value)}
                          className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-ink text-xs"
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
                          className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-mono"
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
                          placeholder="e.g. 38241000"
                          className="w-full min-w-[110px] px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-mono text-center tracking-wider text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>

                      <td className="py-2 px-2.5 text-right">
                        <input
                          type="number"
                          step="any"
                          value={item.qtyKg}
                          onChange={(e) => updateItem(index, "qtyKg", parseFloat(e.target.value) || 0)}
                          className="w-full min-w-[90px] px-2 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num text-ink focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>

                      <td className="py-2 px-2.5 text-right">
                        <input
                          type="number"
                          step="any"
                          placeholder="—"
                          value={item.packSizeKg || ""}
                          onChange={(e) =>
                            updateItem(index, "packSizeKg", e.target.value ? parseFloat(e.target.value) : null)
                          }
                          className="w-full min-w-[75px] px-2 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num text-ink focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-ink-3 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>

                      <td className="py-2 px-2.5 text-right">
                        <input
                          type="number"
                          step="any"
                          value={item.rate}
                          onChange={(e) => updateItem(index, "rate", parseFloat(e.target.value) || 0)}
                          className="w-full min-w-[95px] px-2 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num text-ink focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>

                      <td className="py-2 px-2.5 text-right">
                        <input
                          type="number"
                          step="any"
                          placeholder="—"
                          value={item.discountPct ?? ""}
                          onChange={(e) =>
                            updateItem(
                              index,
                              "discountPct",
                              e.target.value === "" ? null : parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full min-w-[60px] px-1.5 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num placeholder:text-ink-3 text-ink focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          title="Line discount percentage"
                        />
                      </td>

                      <td className="py-2 px-2.5 text-right">
                        <input
                          type="number"
                          step="any"
                          value={item.taxableAmount}
                          onChange={(e) => updateItem(index, "taxableAmount", parseFloat(e.target.value) || 0)}
                          className="w-full min-w-[120px] px-2 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num font-medium text-ink focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>

                      <td className="py-2 px-2.5 text-right">
                        <select
                          value={
                            isIgstActive
                              ? Number(item.igstPct || 0)
                              : ((Number(item.cgstPct || 0) + Number(item.sgstPct || 0)) === 5
                                  ? 5
                                  : Math.round((item.cgstPct || 0) + (item.sgstPct || 0)))
                          }
                          onChange={(e) => {
                            const totalGst = parseFloat(e.target.value) || 0;
                            const nextItems = [...draft.items];
                            let cur = { ...nextItems[index] };
                            if (isIgstActive) {
                              cur.igstPct = totalGst;
                              cur.cgstPct = 0;
                              cur.sgstPct = 0;
                              cur.cgstAmount = 0;
                              cur.sgstAmount = 0;
                              const igstAmt = Math.round(((cur.taxableAmount * totalGst) / 100) * 100) / 100;
                              cur.lineTotal = Math.round((cur.taxableAmount + igstAmt) * 100) / 100;
                            } else {
                              const halfGst = totalGst === 5 ? 2.5 : (totalGst === 18 ? 9 : totalGst / 2);
                              cur.cgstPct = halfGst;
                              cur.sgstPct = halfGst;
                              cur.igstPct = 0;
                              const cgstAmt = Math.round(((cur.taxableAmount * halfGst) / 100) * 100) / 100;
                              const sgstAmt = Math.round(((cur.taxableAmount * halfGst) / 100) * 100) / 100;
                              cur.cgstAmount = cgstAmt;
                              cur.sgstAmount = sgstAmt;
                              cur.lineTotal = Math.round((cur.taxableAmount + cgstAmt + sgstAmt) * 100) / 100;
                            }
                            nextItems[index] = cur;
                            setDraft({ ...draft, items: nextItems, totals: recalculateTotals(nextItems) });
                          }}
                          className="w-full min-w-[65px] px-1.5 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num text-ink-2 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="18">18%</option>
                          <option value="12">12%</option>
                          <option value="5">5%</option>
                          <option value="28">28%</option>
                          <option value="0">0%</option>
                        </select>
                      </td>

                      <td className="py-2 px-2.5 text-right">
                        <input
                          type="number"
                          step="any"
                          value={item.lineTotal}
                          onChange={(e) => updateItem(index, "lineTotal", parseFloat(e.target.value) || 0)}
                          className="w-full min-w-[120px] px-2 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
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
          <div className="flex items-center justify-between pb-2 border-b border-border flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-ink uppercase tracking-wide text-[11px]">Invoice Totals</span>
              {/* Tax Mode Segmented Toggle (CGST+SGST vs IGST) */}
              <div className="flex items-center gap-1 bg-surface-2 p-0.5 rounded-sm border border-border text-[10px]">
                <button
                  type="button"
                  onClick={() => handleToggleTaxMode("intra")}
                  className={cn(
                    "px-2 py-0.5 rounded-xs transition",
                    !isIgstActive ? "bg-primary text-primary-fg font-semibold shadow-xs" : "text-ink-3 hover:text-ink"
                  )}
                  title="Intra-State GST (CGST + SGST)"
                >
                  CGST + SGST
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleTaxMode("inter")}
                  className={cn(
                    "px-2 py-0.5 rounded-xs transition",
                    isIgstActive ? "bg-primary text-primary-fg font-semibold shadow-xs" : "text-ink-3 hover:text-ink"
                  )}
                  title="Inter-State GST (IGST)"
                >
                  IGST
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const newTotals = recalculateTotals(draft.items);
                setDraft({ ...draft, totals: newTotals });
              }}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
              title="Automatically recalculate subtotal, taxes, round-off, and grand total from line items"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Auto-Calculate from Lines</span>
            </button>
          </div>

          <div
            className={cn(
              "grid gap-2.5",
              isIgstActive
                ? "grid-cols-2 sm:grid-cols-4"
                : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
            )}
          >
            {/* Taxable Subtotal */}
            <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 w-full flex flex-col justify-between overflow-hidden">
              <label className="text-[11px] text-ink-3 block mb-1 font-medium truncate">
                Taxable Subtotal (₹)
              </label>
              <MoneyInput
                value={draft.totals.taxableSubtotal}
                onChange={(val) => updateTotal("taxableSubtotal", val)}
                className="w-full min-w-0 px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                ₹{Number(draft.totals.taxableSubtotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Taxes: CGST & SGST (if intra-state) OR IGST (if inter-state) */}
            {!isIgstActive ? (
              <>
                <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 w-full flex flex-col justify-between overflow-hidden">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-ink-3 font-medium truncate">
                      CGST Total (₹)
                    </label>
                    <span className="text-[10px] text-ink-3 font-mono bg-surface-2 px-1 rounded">
                      {draft.items[0]?.cgstPct ? `${draft.items[0].cgstPct}%` : "9%"}
                    </span>
                  </div>
                  <MoneyInput
                    value={draft.totals.cgstTotal}
                    onChange={(val) => updateTotal("cgstTotal", val)}
                    className="w-full min-w-0 px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                    ₹{Number(draft.totals.cgstTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 w-full flex flex-col justify-between overflow-hidden">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-ink-3 font-medium truncate">
                      SGST Total (₹)
                    </label>
                    <span className="text-[10px] text-ink-3 font-mono bg-surface-2 px-1 rounded">
                      {draft.items[0]?.sgstPct ? `${draft.items[0].sgstPct}%` : "9%"}
                    </span>
                  </div>
                  <MoneyInput
                    value={draft.totals.sgstTotal}
                    onChange={(val) => updateTotal("sgstTotal", val)}
                    className="w-full min-w-0 px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                    ₹{Number(draft.totals.sgstTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 w-full flex flex-col justify-between overflow-hidden">
                <label className="text-[11px] text-ink-3 block mb-1 font-medium truncate">
                  IGST Total (₹)
                </label>
                <MoneyInput
                  value={draft.totals.igstTotal || 0}
                  onChange={(val) => updateTotal("igstTotal", val)}
                  className="w-full min-w-0 px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                  ₹{Number(draft.totals.igstTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            )}

            {/* Round-off */}
            <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 w-full flex flex-col justify-between overflow-hidden">
              <label className="text-[11px] text-ink-3 block mb-1 font-medium truncate">
                Round-off (₹)
              </label>
              <MoneyInput
                value={draft.totals.roundOff ?? 0}
                onChange={(val) => updateTotal("roundOff", val)}
                placeholder="0.00"
                className="w-full min-w-0 px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                {Number(draft.totals.roundOff || 0) >= 0 ? `+${Number(draft.totals.roundOff || 0).toFixed(2)}` : Number(draft.totals.roundOff || 0).toFixed(2)}
              </div>
            </div>

            {/* Grand Total */}
            <div className="bg-surface p-2.5 rounded-sm border-2 border-primary min-w-0 w-full flex flex-col justify-between overflow-hidden shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-primary font-bold tracking-tight truncate">
                  Grand Total (₹)
                </label>
                <span className="text-[10px] text-primary font-mono font-semibold">Final</span>
              </div>
              <MoneyInput
                value={draft.totals.grandTotal}
                onChange={(val) => updateTotal("grandTotal", val)}
                className="w-full min-w-0 px-2 py-1.5 bg-bg border border-primary/50 rounded-sm text-base font-extrabold text-ink num focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="mt-1 text-right text-[11px] text-primary font-mono font-bold truncate">
                ₹{Number(draft.totals.grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* Issues Box */}
        {(blockingErrors.length > 0 || warnings.length > 0) && (
          <div className="p-3 bg-surface border border-border rounded-sm space-y-2">
            <div className="flex items-center gap-2">
              {blockingErrors.length > 0 ? (
                <XCircle className="w-4 h-4 text-danger" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-warning" />
              )}
              <span className="font-semibold text-xs text-ink">
                Verification Issues ({blockingErrors.length} format error{blockingErrors.length === 1 ? "" : "s"}, {warnings.length} warning{warnings.length === 1 ? "" : "s"})
              </span>
            </div>

            <ul className="space-y-1 text-xs">
              {blockingErrors.map((e, idx) => (
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
          {blockingErrors.length > 0 ? (
            <span className="text-xs font-semibold text-danger flex items-center gap-1">
              <XCircle className="w-4 h-4" />
              <span>{blockingErrors.length} format error{blockingErrors.length > 1 ? "s" : ""} must be resolved to save</span>
            </span>
          ) : warnings.length > 0 ? (
            <span className="text-xs text-warning flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
              <span>{warnings.length} warning{warnings.length > 1 ? "s" : ""} detected — review or save directly</span>
            </span>
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

          {hasNextReady ? (
            <>
              <button
                type="button"
                disabled={!canSave || saving}
                onClick={() => handleSubmit(false)}
                className="px-3 py-1.5 border border-border text-xs text-ink hover:bg-surface-2 disabled:opacity-40 rounded-sm font-medium transition"
              >
                <span>Save</span>
              </button>

              <button
                type="button"
                disabled={!canSave || saving}
                onClick={() => handleSubmit(true)}
                className="px-4 py-1.5 bg-primary text-primary-fg rounded-sm text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition flex items-center gap-1.5 shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? "Saving..." : "Save & Next"}</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!canSave || saving}
              onClick={() => handleSubmit(false)}
              className="px-4 py-1.5 bg-primary text-primary-fg rounded-sm text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition flex items-center gap-1.5 shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saving..." : mode === "replace" ? "Save Modifications" : "Save Invoice"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
