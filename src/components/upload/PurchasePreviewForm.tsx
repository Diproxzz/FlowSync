"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Save,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Calculator,
  UserCheck,
  Globe,
  Check,
} from "lucide-react";
import {
  ExtractedPurchaseInvoice,
  ExtractedPurchaseInvoiceItem,
} from "@/lib/llm/schema.purchase";
import {
  validatePurchaseInvoice,
  PurchaseValidationResult,
} from "@/lib/validation/purchase";
import { SupplierResolution } from "@/lib/matching/supplier";
import { ProductResolution } from "@/lib/matching/product";
import {
  PurchaseItemsTable,
  ProductOption,
  PurchaseItemResolution,
} from "./PurchaseItemsTable";
import { convertUnitToKg, normalizeUnit } from "@/lib/units/convert";
import { cn } from "@/lib/utils";

interface SupplierOption {
  id: string;
  name: string;
  gstin: string | null;
  address: string | null;
}

interface CustomerOption {
  id: string;
  name: string;
  gstin: string | null;
}

interface PurchasePreviewFormProps {
  initialDraft: ExtractedPurchaseInvoice;
  supplierMatch?: SupplierResolution | null;
  productMatches?: ProductResolution[];
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

export function PurchasePreviewForm({
  initialDraft,
  supplierMatch,
  productMatches = [],
  fileToken,
  mode,
  onSave,
  onDiscard,
  saving = false,
  hasNextReady = false,
}: PurchasePreviewFormProps) {
  const [draft, setDraft] = useState<ExtractedPurchaseInvoice>(() => {
    let base = { ...initialDraft };
    if (
      supplierMatch?.status === "MATCHED" &&
      supplierMatch.supplierName &&
      (supplierMatch.reason === "GSTIN" || initialDraft.supplier.gstin)
    ) {
      base.supplier = {
        ...base.supplier,
        name: supplierMatch.supplierName,
        gstin: supplierMatch.supplierGstin || base.supplier.gstin,
      };
    }
    return base;
  });

  const [supplierRes, setSupplierRes] = useState<SupplierResolution>(
    supplierMatch || { status: "NEW", confidence: 0 }
  );

  const [productResolutions, setProductResolutions] = useState<
    PurchaseItemResolution[]
  >(() => {
    return draft.items.map((it, idx) => {
      const pm = productMatches[idx];
      return {
        lineNo: it.lineNo,
        productId: pm?.status === "MATCHED" ? pm.productId : undefined,
        productCode: pm?.status === "MATCHED" ? pm.productCode : undefined,
        productName: pm?.status === "MATCHED" ? pm.productName : undefined,
        packSizeKg: it.packSizeKg || null,
        manualQtyKg: null,
        status: pm?.status === "MATCHED" ? "MATCHED" : "NEW",
      };
    });
  });

  const [suppliersList, setSuppliersList] = useState<SupplierOption[]>([]);
  const [customersList, setCustomersList] = useState<CustomerOption[]>([]);
  const [productsList, setProductsList] = useState<ProductOption[]>([]);
  const [updateStdRates, setUpdateStdRates] = useState<Record<string, boolean>>({});
  const [liveDuplicate, setLiveDuplicate] = useState<any>(null);

  // Load existing suppliers, customers & products
  useEffect(() => {
    Promise.all([
      fetch("/api/suppliers").then((r) => r.json()),
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ])
      .then(([sData, cData, pData]) => {
        if (sData.suppliers) setSuppliersList(sData.suppliers);
        if (cData.customers) setCustomersList(cData.customers);
        if (pData.products) setProductsList(pData.products);

        const cleanG = draft.supplier.gstin ? draft.supplier.gstin.trim().toUpperCase() : null;
        if (cleanG) {
          const matchedSup = sData.suppliers?.find(
            (s: SupplierOption) => s.gstin && s.gstin.trim().toUpperCase() === cleanG
          );
          const matchedCust = cData.customers?.find(
            (c: CustomerOption) => c.gstin && c.gstin.trim().toUpperCase() === cleanG
          );

          if (matchedSup) {
            setDraft((prev) => ({
              ...prev,
              supplier: {
                ...prev.supplier,
                name: matchedSup.name,
              },
            }));
            setSupplierRes({
              status: "MATCHED",
              supplierId: matchedSup.id,
              supplierName: matchedSup.name,
              supplierGstin: matchedSup.gstin,
              reason: "GSTIN",
              confidence: 1.0,
              alsoCustomer: matchedCust ? { id: matchedCust.id, name: matchedCust.name } : undefined,
            });
          } else if (matchedCust) {
            setDraft((prev) => ({
              ...prev,
              supplier: {
                ...prev.supplier,
                name: matchedCust.name,
              },
            }));
            setSupplierRes({
              status: "MATCHED",
              supplierName: matchedCust.name,
              supplierGstin: matchedCust.gstin,
              reason: "GSTIN",
              confidence: 1.0,
              alsoCustomer: { id: matchedCust.id, name: matchedCust.name },
            });
          }
        }
      })
      .catch(console.error);
  }, []);

  // Determine if IGST is active
  const isIgstActive =
    Boolean(draft.isImport) ||
    (draft.totals.igstTotal !== null &&
      draft.totals.igstTotal !== undefined &&
      Number(draft.totals.igstTotal) > 0) ||
    draft.items.some((it) => (it.igstPct || 0) > 0) ||
    (Number(draft.totals.cgstTotal || 0) === 0 &&
      Number(draft.totals.sgstTotal || 0) === 0 &&
      Boolean(draft.supplier.gstin) &&
      !draft.supplier.gstin?.startsWith("19"));

  // Live duplicate check on invoice number or supplier change
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!draft.invoice.number.trim()) return;
      try {
        const query = new URLSearchParams({
          number: draft.invoice.number,
        });
        if (supplierRes.supplierId) {
          query.set("supplierId", supplierRes.supplierId);
        } else if (draft.supplier.gstin) {
          query.set("gstin", draft.supplier.gstin);
        } else if (draft.supplier.name) {
          query.set("name", draft.supplier.name);
        }

        const res = await fetch(`/api/purchases/exists?${query.toString()}`);
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
  }, [draft.invoice.number, supplierRes.supplierId, draft.supplier.gstin, draft.supplier.name, mode]);

  // Recalculate totals
  const recalculateTotals = (
    items: ExtractedPurchaseInvoiceItem[],
    forceMode?: "intra" | "inter"
  ) => {
    const currentMode = forceMode || (isIgstActive ? "inter" : "intra");

    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    items.forEach((it) => {
      subtotal += it.taxableAmount;
      if (currentMode === "inter") {
        const i =
          Math.round(((it.taxableAmount * (it.igstPct || 0)) / 100) * 100) / 100;
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

    const otherCharges = Number(draft.totals.otherCharges || 0);
    const tcs = Number(draft.totals.tcs || 0);
    const exactSum =
      currentMode === "inter"
        ? subtotal + igst + otherCharges + tcs
        : subtotal + cgst + sgst + otherCharges + tcs;

    const roundedGrand = Math.round(exactSum);
    const roundOff = Math.round((roundedGrand - exactSum) * 100) / 100;

    return {
      taxableSubtotal: Math.round(subtotal * 100) / 100,
      cgstTotal: currentMode === "inter" ? 0 : Math.round(cgst * 100) / 100,
      sgstTotal: currentMode === "inter" ? 0 : Math.round(sgst * 100) / 100,
      igstTotal: currentMode === "inter" ? Math.round(igst * 100) / 100 : 0,
      otherCharges,
      tcs,
      roundOff,
      grandTotal: roundedGrand,
    };
  };

  const handleUpdateItem = (
    index: number,
    field: keyof ExtractedPurchaseInvoiceItem,
    value: any
  ) => {
    const nextItems = [...draft.items];
    const item = { ...nextItems[index], [field]: value };
    const pRes = productResolutions[index];

    if (field === "unitPrinted") {
      item.unitPrinted = normalizeUnit(String(value));
    }

    if (
      field === "qtyPrinted" ||
      field === "unitPrinted" ||
      field === "rate" ||
      field === "discount"
    ) {
      const qPrinted = Number(item.qtyPrinted) || 0;
      const r = Number(item.rate) || 0;
      const dPct = Number(item.discount) || 0;
      const discountMultiplier = dPct > 0 ? 1 - dPct / 100 : 1;
      item.taxableAmount = Math.max(0, Math.round(qPrinted * r * discountMultiplier * 100) / 100);

      const conv = convertUnitToKg({
        qtyPrinted: qPrinted,
        unitPrinted: item.unitPrinted,
        packSizeKg: pRes?.packSizeKg,
        manualQtyKg: pRes?.manualQtyKg,
        rate: r,
      });

      item.qtyKg = Number(conv.qtyKg);
      item.ratePerKg = Number(conv.ratePerKg);

      if (isIgstActive) {
        item.cgstPct = 0;
        item.sgstPct = 0;
        item.cgstAmount = 0;
        item.sgstAmount = 0;
        const igstAmt =
          Math.round(((item.taxableAmount * (item.igstPct || 0)) / 100) * 100) / 100;
        item.lineTotal = Math.round((item.taxableAmount + igstAmt) * 100) / 100;
      } else {
        item.igstPct = 0;
        const totalTaxPct = Number(item.cgstPct || 0) + Number(item.sgstPct || 0);
        const cPct = Number(item.cgstPct) > 0 ? Number(item.cgstPct) : totalTaxPct === 5 ? 2.5 : 9;
        const sPct = Number(item.sgstPct) > 0 ? Number(item.sgstPct) : totalTaxPct === 5 ? 2.5 : 9;
        item.cgstPct = cPct;
        item.sgstPct = sPct;
        const cAmt = Math.round(((item.taxableAmount * cPct) / 100) * 100) / 100;
        const sAmt = Math.round(((item.taxableAmount * sPct) / 100) * 100) / 100;
        item.cgstAmount = cAmt;
        item.sgstAmount = sAmt;
        item.lineTotal = Math.round((item.taxableAmount + cAmt + sAmt) * 100) / 100;
      }
    } else if (field === "taxableAmount") {
      const t = Number(value) || 0;
      item.taxableAmount = t;
      if (isIgstActive) {
        item.cgstPct = 0;
        item.sgstPct = 0;
        item.cgstAmount = 0;
        item.sgstAmount = 0;
        const igstAmt =
          Math.round(((t * (item.igstPct || 0)) / 100) * 100) / 100;
        item.lineTotal = Math.round((t + igstAmt) * 100) / 100;
      } else {
        item.igstPct = 0;
        const totalTaxPct = Number(item.cgstPct || 0) + Number(item.sgstPct || 0);
        const cPct = Number(item.cgstPct) > 0 ? Number(item.cgstPct) : totalTaxPct === 5 ? 2.5 : 9;
        const sPct = Number(item.sgstPct) > 0 ? Number(item.sgstPct) : totalTaxPct === 5 ? 2.5 : 9;
        item.cgstPct = cPct;
        item.sgstPct = sPct;
        const cAmt = Math.round(((t * cPct) / 100) * 100) / 100;
        const sAmt = Math.round(((t * sPct) / 100) * 100) / 100;
        item.cgstAmount = cAmt;
        item.sgstAmount = sAmt;
        item.lineTotal = Math.round((t + cAmt + sAmt) * 100) / 100;
      }
    } else if (field === "cgstPct" || field === "sgstPct" || field === "igstPct") {
      const p = Number(value) || 0;
      if (field === "igstPct") {
        item.igstPct = p;
        item.cgstPct = 0;
        item.sgstPct = 0;
        item.cgstAmount = 0;
        item.sgstAmount = 0;
        const igstAmt = Math.round(((item.taxableAmount * p) / 100) * 100) / 100;
        item.igstAmount = igstAmt;
        item.lineTotal = Math.round((item.taxableAmount + igstAmt) * 100) / 100;
      } else {
        item.igstPct = 0;
        item.igstAmount = 0;
        if (field === "cgstPct") item.cgstPct = p;
        if (field === "sgstPct") item.sgstPct = p;
        const cPct = Number(item.cgstPct || 0);
        const sPct = Number(item.sgstPct || 0);
        const cAmt = Math.round(((item.taxableAmount * cPct) / 100) * 100) / 100;
        const sAmt = Math.round(((item.taxableAmount * sPct) / 100) * 100) / 100;
        item.cgstAmount = cAmt;
        item.sgstAmount = sAmt;
        item.lineTotal = Math.round((item.taxableAmount + cAmt + sAmt) * 100) / 100;
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

  const handleUpdateResolution = (
    index: number,
    updates: Partial<PurchaseItemResolution>
  ) => {
    const next = [...productResolutions];
    next[index] = { ...next[index], ...updates };
    setProductResolutions(next);

    // Recompute unit conversion if packSize or manualQty changed
    if (updates.packSizeKg !== undefined || updates.manualQtyKg !== undefined) {
      const item = draft.items[index];
      const conv = convertUnitToKg({
        qtyPrinted: item.qtyPrinted,
        unitPrinted: item.unitPrinted,
        packSizeKg: next[index].packSizeKg,
        manualQtyKg: next[index].manualQtyKg,
        rate: item.rate,
      });
      handleUpdateItem(index, "qtyKg", Number(conv.qtyKg));
    }
  };

  const handleToggleUpdateStdRate = (productId: string) => {
    setUpdateStdRates((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const handleToggleTaxMode = (targetMode: "intra" | "inter") => {
    setDraft((prev) => {
      const nextItems = prev.items.map((it) => {
        const totalTaxPct = Math.round(
          (it.cgstPct || 0) + (it.sgstPct || 0) + (it.igstPct || 0)
        );
        if (targetMode === "inter") {
          const igstAmt =
            Math.round(((it.taxableAmount * totalTaxPct) / 100) * 100) / 100;
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
          const halfPct =
            totalTaxPct === 5
              ? 2.5
              : totalTaxPct === 18
              ? 9
              : totalTaxPct > 0
              ? totalTaxPct / 2
              : 9;
          const halfAmt =
            Math.round(((it.taxableAmount * halfPct) / 100) * 100) / 100;
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
      return {
        ...prev,
        items: nextItems,
        totals: newTotals,
      };
    });
  };

  const handleToggleImport = () => {
    setDraft((prev) => {
      const nextImport = !prev.isImport;
      const targetMode: "intra" | "inter" = nextImport
        ? "inter"
        : prev.supplier.gstin?.startsWith("19")
        ? "intra"
        : "inter";

      const nextItems = prev.items.map((it) => {
        const totalTaxPct = Math.round(
          (it.cgstPct || 0) + (it.sgstPct || 0) + (it.igstPct || 0)
        );
        if (targetMode === "inter") {
          const igstAmt =
            Math.round(((it.taxableAmount * totalTaxPct) / 100) * 100) / 100;
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
          const halfPct =
            totalTaxPct === 5
              ? 2.5
              : totalTaxPct === 18
              ? 9
              : totalTaxPct > 0
              ? totalTaxPct / 2
              : 9;
          const halfAmt =
            Math.round(((it.taxableAmount * halfPct) / 100) * 100) / 100;
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

      return {
        ...prev,
        isImport: nextImport,
        supplier: {
          ...prev.supplier,
          gstin: nextImport ? null : prev.supplier.gstin,
        },
        items: nextItems,
        totals: newTotals,
      };
    });
  };

  const updateTotal = (
    field: keyof ExtractedPurchaseInvoice["totals"],
    value: number
  ) => {
    setDraft((prev) => {
      const updatedTotals = {
        ...prev.totals,
        [field]: value,
      };

      if (field === "taxableSubtotal" && !isIgstActive) {
        const taxVal = Number(value) || 0;
        const rate = prev.items[0]?.cgstPct ? Number(prev.items[0].cgstPct) : 9;
        const c = Math.round(((taxVal * rate) / 100) * 100) / 100;
        const s = Math.round(((taxVal * rate) / 100) * 100) / 100;
        updatedTotals.cgstTotal = c;
        updatedTotals.sgstTotal = s;
        updatedTotals.grandTotal = Math.round(
          taxVal +
            c +
            s +
            Number(updatedTotals.otherCharges || 0) +
            Number(updatedTotals.tcs || 0) +
            (Number(updatedTotals.roundOff) || 0)
        );
      }

      return {
        ...prev,
        totals: updatedTotals,
      };
    });
  };

  const handleAddItem = () => {
    const nextLineNo = draft.items.length + 1;
    const newItem: ExtractedPurchaseInvoiceItem = {
      lineNo: nextLineNo,
      productNameRaw: "",
      hsn: "",
      qtyPrinted: 1,
      unitPrinted: "KG",
      qtyKg: 1,
      packSizeKg: null,
      rate: 0,
      ratePerKg: 0,
      discount: 0,
      taxableAmount: 0,
      cgstPct: isIgstActive ? 0 : 9,
      sgstPct: isIgstActive ? 0 : 9,
      igstPct: isIgstActive ? 18 : 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      lineTotal: 0,
    };

    setDraft({
      ...draft,
      items: [...draft.items, newItem],
    });

    setProductResolutions([
      ...productResolutions,
      {
        lineNo: nextLineNo,
        status: "NEW",
      },
    ]);
  };

  const handleDeleteItem = (index: number) => {
    if (draft.items.length <= 1) return;
    const nextItems = draft.items.filter((_, i) => i !== index);
    const nextTotals = recalculateTotals(nextItems);

    setDraft({
      ...draft,
      items: nextItems,
      totals: nextTotals,
    });
    setProductResolutions(productResolutions.filter((_, i) => i !== index));
  };

  // Run validation
  const productContexts = draft.items.map((it) => {
    const res = productResolutions.find((r) => r.lineNo === it.lineNo);
    return {
      lineNo: it.lineNo,
      productId: res?.productId,
      packSizeKg: res?.packSizeKg,
      manualQtyKg: res?.manualQtyKg,
    };
  });

  const validation = validatePurchaseInvoice(draft, undefined, productContexts);
  const blockingErrors = validation.issues.filter(
    (i) =>
      i.severity === "error" &&
      [
        "SUPPLIER_NAME_MISSING",
        "INVOICE_NUMBER_MISSING",
        "GSTIN_FORMAT",
        "GSTIN_CHECKSUM",
        "SUPPLIER_GSTIN_IS_COMPANY",
        "NO_ITEMS",
        "DATE_INVALID",
      ].includes(i.code)
  );
  const warnings = validation.issues.filter((i) => i.severity === "warning");
  const canSave = blockingErrors.length === 0;

  const handleSubmit = async (advance = false) => {
    if (!canSave) return;

    const payload = {
      draft: {
        ...draft,
        isImport: Boolean(draft.isImport),
        supplier: {
          ...draft.supplier,
          gstin: draft.isImport ? null : draft.supplier.gstin,
        },
      },
      supplierResolution: {
        action: supplierRes.supplierId ? "USE_MATCHED" : "CREATE_NEW",
        supplierId: supplierRes.supplierId,
        supplierName: draft.supplier.name,
        supplierGstin: draft.isImport ? null : draft.supplier.gstin,
        supplierAddress: draft.supplier.address,
      },
      productResolutions: draft.items.map((it, idx) => {
        const pRes = productResolutions[idx];
        return {
          lineNo: it.lineNo,
          action: pRes?.productId ? "USE_MATCHED" : "CREATE_NEW",
          productId: pRes?.productId,
          productCode: pRes?.productCode || it.productNameRaw,
          productName: pRes?.productName || it.productNameRaw,
          productNameRaw: it.productNameRaw,
          packSizeKg: pRes?.packSizeKg,
          manualQtyKg: pRes?.manualQtyKg,
        };
      }),
      mode,
      fileToken,
      updateStdPurchaseRates: updateStdRates,
      acknowledgeWarnings: true,
    };

    await onSave(payload, { advanceToNext: advance });
  };

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-sm overflow-hidden text-xs">
      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Live Duplicate Alert */}
        {liveDuplicate && (
          <div className="p-3 bg-danger-bg border border-danger/40 rounded-sm text-danger flex items-start gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Duplicate Detected:</strong> Invoice #{liveDuplicate.invoiceNumber} from {liveDuplicate.supplierName} already exists in database (saved on {liveDuplicate.invoiceDate?.split("T")[0]}).
            </div>
          </div>
        )}

        {/* 1. Header Card */}
        <div className="bg-bg border border-border rounded-sm p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink uppercase tracking-wide text-[11px]">
                Supplier & Invoice Details
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F4E6D7] dark:bg-[#3A2A1C] text-accent">
                Purchase
              </span>

              {/* Import Invoice Option */}
              <button
                type="button"
                onClick={handleToggleImport}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border transition text-[11px] font-medium ml-2 cursor-pointer shadow-xs select-none",
                  draft.isImport
                    ? "bg-accent/15 border-accent text-accent font-semibold"
                    : "bg-surface border-border text-ink-2 hover:bg-surface-2 hover:text-ink hover:border-ink-3"
                )}
                title="Click to toggle Import Invoice (Overseas Supplier with no GSTIN)"
              >
                <span
                  className={cn(
                    "w-3.5 h-3.5 rounded-xs border flex items-center justify-center transition-colors pointer-events-none",
                    draft.isImport
                      ? "bg-accent border-accent text-white"
                      : "border-border bg-surface-2"
                  )}
                >
                  {draft.isImport && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </span>
                <Globe className="w-3.5 h-3.5 pointer-events-none" />
                <span className="pointer-events-none">Import Invoice (Overseas)</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-3">Supplier Match:</span>
              {supplierRes.status === "MATCHED" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-success-bg text-success font-medium text-[11px]">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Matched ({supplierRes.reason})</span>
                </span>
              ) : supplierRes.status === "SUGGESTED" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-warning-bg text-warning font-medium text-[11px]">
                  <HelpCircle className="w-3 h-3" />
                  <span>Suggested Match</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-info-bg text-info font-medium text-[11px]">
                  <span>＋ New Supplier</span>
                </span>
              )}

              {supplierRes.alsoCustomer && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-primary/10 text-primary font-medium text-[11px]"
                  title="This supplier's GSTIN matches an existing customer in INDOBEST"
                >
                  <UserCheck className="w-3 h-3" />
                  <span>Also a Customer</span>
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">
                Supplier / Vendor Name *
              </label>
              <input
                type="text"
                value={draft.supplier.name}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    supplier: { ...draft.supplier, name: e.target.value },
                  })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink font-medium focus:outline-none focus:ring-1 focus:ring-accent"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">
                {draft.isImport
                  ? "Supplier GSTIN (Overseas · Not Applicable)"
                  : `Supplier GSTIN ${draft.supplier.gstin ? "✓" : "(Optional)"}`}
              </label>
              {draft.isImport ? (
                <div className="w-full px-2.5 py-1.5 text-xs bg-surface-2 border border-dashed border-border rounded-sm text-ink-3 font-mono flex items-center justify-between">
                  <span>Not Applicable (Foreign Supplier)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-xs bg-accent/10 text-accent font-semibold border border-accent/20">
                    Overseas · No GSTIN
                  </span>
                </div>
              ) : (
                <input
                  type="text"
                  value={draft.supplier.gstin || ""}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    const cleanG = val.trim();
                    let matchedName = draft.supplier.name;
                    if (cleanG) {
                      const matchedSup = suppliersList.find(
                        (s) => s.gstin && s.gstin.trim().toUpperCase() === cleanG
                      );
                      const matchedCust = customersList.find(
                        (c) => c.gstin && c.gstin.trim().toUpperCase() === cleanG
                      );

                      if (matchedSup) {
                        matchedName = matchedSup.name;
                        setSupplierRes({
                          status: "MATCHED",
                          supplierId: matchedSup.id,
                          supplierName: matchedSup.name,
                          supplierGstin: matchedSup.gstin,
                          reason: "GSTIN",
                          confidence: 1.0,
                          alsoCustomer: matchedCust ? { id: matchedCust.id, name: matchedCust.name } : undefined,
                        });
                      } else if (matchedCust) {
                        matchedName = matchedCust.name;
                        setSupplierRes({
                          status: "MATCHED",
                          supplierName: matchedCust.name,
                          supplierGstin: matchedCust.gstin,
                          reason: "GSTIN",
                          confidence: 1.0,
                          alsoCustomer: { id: matchedCust.id, name: matchedCust.name },
                        });
                      }
                    }
                    setDraft({
                      ...draft,
                      supplier: {
                        ...draft.supplier,
                        gstin: val || null,
                        name: matchedName,
                      },
                    });
                  }}
                  placeholder="15-character Supplier GSTIN"
                  className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink font-mono uppercase focus:outline-none focus:ring-1 focus:ring-accent"
                  maxLength={15}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">
                Supplier Invoice Number *
              </label>
              <input
                type="text"
                value={draft.invoice.number}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    invoice: { ...draft.invoice, number: e.target.value },
                  })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">
                Invoice Date *
              </label>
              <input
                type="date"
                value={draft.invoice.date}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    invoice: { ...draft.invoice, date: e.target.value },
                  })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">
                Goods Received Date (Optional)
              </label>
              <input
                type="date"
                value={draft.invoice.receivedDate || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    invoice: {
                      ...draft.invoice,
                      receivedDate: e.target.value || null,
                    },
                  })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink font-mono focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">
                Map to Existing Supplier
              </label>
              <select
                value={supplierRes.supplierId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const found = suppliersList.find((s) => s.id === val);
                  if (found) {
                    setSupplierRes({
                      status: "MATCHED",
                      supplierId: found.id,
                      supplierName: found.name,
                      supplierGstin: found.gstin,
                      reason: "NAME",
                      confidence: 1.0,
                    });
                    setDraft({
                      ...draft,
                      supplier: {
                        ...draft.supplier,
                        name: found.name,
                        gstin: found.gstin || draft.supplier.gstin,
                        address: found.address || draft.supplier.address,
                      },
                    });
                  } else {
                    setSupplierRes({ status: "NEW", confidence: 0 });
                  }
                }}
                className="w-full px-2 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Create as new supplier...</option>
                {suppliersList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.gstin ? `(${s.gstin})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 2. Items Table */}
        <PurchaseItemsTable
          items={draft.items}
          productResolutions={productResolutions}
          productsList={productsList}
          isIgstActive={isIgstActive}
          updateStdRates={updateStdRates}
          onUpdateItem={handleUpdateItem}
          onUpdateResolution={handleUpdateResolution}
          onToggleUpdateStdRate={handleToggleUpdateStdRate}
          onAddItem={handleAddItem}
          onDeleteItem={handleDeleteItem}
        />

        {/* 3. Totals Card */}
        <div className="bg-bg border border-border rounded-sm p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-ink uppercase tracking-wide text-[11px]">
                Purchase Totals
              </span>

              {/* Tax Mode Segmented Control & Chip */}
              <div className="flex items-center gap-1 bg-surface-2 p-0.5 rounded-sm border border-border text-[10px]">
                <button
                  type="button"
                  onClick={() => handleToggleTaxMode("intra")}
                  className={cn(
                    "px-2 py-0.5 rounded-xs transition",
                    !isIgstActive
                      ? "bg-accent text-accent-fg font-semibold shadow-xs"
                      : "text-ink-3 hover:text-ink"
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
                    isIgstActive
                      ? "bg-accent text-accent-fg font-semibold shadow-xs"
                      : "text-ink-3 hover:text-ink"
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
              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline font-semibold"
              title="Automatically recalculate subtotal, taxes, round-off, and grand total from line items"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Auto-Calculate from Lines</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* Taxable Subtotal */}
            <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 flex flex-col justify-between overflow-hidden">
              <label className="text-[11px] text-ink-3 block mb-1 font-medium truncate">
                Taxable Subtotal (₹)
              </label>
              <MoneyInput
                value={draft.totals.taxableSubtotal}
                onChange={(val) => updateTotal("taxableSubtotal", val)}
                className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                ₹{Number(draft.totals.taxableSubtotal || 0).toFixed(2)}
              </div>
            </div>

            {/* Taxes */}
            {!isIgstActive ? (
              <>
                <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 flex flex-col justify-between overflow-hidden">
                  <label className="text-[11px] text-ink-3 block mb-1 font-medium truncate">
                    CGST Total (₹)
                  </label>
                  <MoneyInput
                    value={draft.totals.cgstTotal}
                    onChange={(val) => updateTotal("cgstTotal", val)}
                    className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                    ₹{Number(draft.totals.cgstTotal || 0).toFixed(2)}
                  </div>
                </div>

                <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 flex flex-col justify-between overflow-hidden">
                  <label className="text-[11px] text-ink-3 block mb-1 font-medium truncate">
                    SGST Total (₹)
                  </label>
                  <MoneyInput
                    value={draft.totals.sgstTotal}
                    onChange={(val) => updateTotal("sgstTotal", val)}
                    className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                    ₹{Number(draft.totals.sgstTotal || 0).toFixed(2)}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 flex flex-col justify-between overflow-hidden sm:col-span-2">
                <label className="text-[11px] text-ink-3 block mb-1 font-medium truncate">
                  IGST Total (₹)
                </label>
                <MoneyInput
                  value={draft.totals.igstTotal || 0}
                  onChange={(val) => updateTotal("igstTotal", val)}
                  className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                  ₹{Number(draft.totals.igstTotal || 0).toFixed(2)}
                </div>
              </div>
            )}

            {/* Other Charges / Freight */}
            <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 flex flex-col justify-between overflow-hidden">
              <label className="text-[11px] text-ink-3 block mb-1 font-medium truncate">
                Other Charges / Freight (₹)
              </label>
              <MoneyInput
                value={draft.totals.otherCharges ?? 0}
                onChange={(val) => updateTotal("otherCharges", val)}
                placeholder="0.00"
                className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                ₹{Number(draft.totals.otherCharges || 0).toFixed(2)}
              </div>
            </div>

            {/* TCS */}
            <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 flex flex-col justify-between overflow-hidden">
              <label className="text-[11px] text-ink-3 block mb-1 font-medium truncate">
                TCS (₹)
              </label>
              <MoneyInput
                value={draft.totals.tcs ?? 0}
                onChange={(val) => updateTotal("tcs", val)}
                placeholder="0.00"
                className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                ₹{Number(draft.totals.tcs || 0).toFixed(2)}
              </div>
            </div>

            {/* Round-off */}
            <div className="bg-surface p-2.5 rounded-sm border border-border min-w-0 flex flex-col justify-between overflow-hidden">
              <label className="text-[11px] text-ink-3 block mb-1 font-medium truncate">
                Round-off (₹)
              </label>
              <MoneyInput
                value={draft.totals.roundOff ?? 0}
                onChange={(val) => updateTotal("roundOff", val)}
                placeholder="0.00"
                className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-semibold text-ink num focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="mt-1 text-right text-[10px] text-ink-3 font-mono truncate">
                {Number(draft.totals.roundOff || 0) >= 0
                  ? `+${Number(draft.totals.roundOff || 0).toFixed(2)}`
                  : Number(draft.totals.roundOff || 0).toFixed(2)}
              </div>
            </div>

            {/* Grand Total */}
            <div className="bg-surface p-2.5 rounded-sm border-2 border-accent min-w-0 flex flex-col justify-between overflow-hidden shadow-xs sm:col-span-2 lg:col-span-6">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-accent font-bold tracking-tight truncate">
                  Grand Total (₹)
                </label>
                <span className="text-[10px] text-accent font-mono font-semibold">
                  Invoice Final
                </span>
              </div>
              <MoneyInput
                value={draft.totals.grandTotal}
                onChange={(val) => updateTotal("grandTotal", val)}
                className="w-full px-2 py-1.5 bg-bg border border-accent/50 rounded-sm text-base font-extrabold text-ink num focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="mt-1 text-right text-[11px] text-accent font-mono font-bold truncate">
                ₹{Number(draft.totals.grandTotal || 0).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
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
                Purchase Verification Issues ({blockingErrors.length} format error
                {blockingErrors.length === 1 ? "" : "s"},{" "}
                {warnings.length} warning{warnings.length === 1 ? "" : "s"})
              </span>
            </div>

            <ul className="space-y-1 text-xs">
              {blockingErrors.map((e, idx) => (
                <li
                  key={`err-${idx}`}
                  className="text-danger flex items-center gap-1.5 font-medium"
                >
                  <span>✕</span> {e.message}
                </li>
              ))}
              {warnings.map((w, idx) => (
                <li
                  key={`warn-${idx}`}
                  className="text-warning flex items-center gap-1.5"
                >
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
              <span>
                {blockingErrors.length} error
                {blockingErrors.length > 1 ? "s" : ""} must be resolved to save
              </span>
            </span>
          ) : warnings.length > 0 ? (
            <span className="text-xs text-warning flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
              <span>
                {warnings.length} warning
                {warnings.length > 1 ? "s" : ""} detected — review or save
                directly
              </span>
            </span>
          ) : (
            <span className="text-xs font-semibold text-success flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>All purchase details and calculations verified</span>
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
                className="px-4 py-1.5 bg-accent text-accent-fg rounded-sm text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition flex items-center gap-1.5 shadow-sm"
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
              className="px-4 py-1.5 bg-accent text-accent-fg rounded-sm text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition flex items-center gap-1.5 shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? "Saving..."
                  : mode === "replace"
                  ? "Save Modifications"
                  : "Save Purchase"}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
