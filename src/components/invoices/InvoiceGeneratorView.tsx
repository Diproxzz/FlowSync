"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Printer,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ChevronDown,
  Building2,
  Package,
  Calendar,
  History,
  Eye,
} from "lucide-react";
import { calculateInvoice, InvoiceLineItemInput } from "@/lib/invoices/calculations";
import { PrintableInvoice, CustomerInvoiceMeta, InvoiceHeaderMeta } from "./PrintableInvoice";

interface CustomerData {
  id: string;
  name: string;
  address: string | null;
  gstin: string | null;
  state_code: string | null;
  phone?: string;
  deliveryNote?: string;
  destination?: string;
}

interface ProductData {
  id: string;
  code: string;
  name: string;
  commercialName: string;
  default_hsn: string | null;
  pack_size_kg: string | number | null;
  std_sale_rate: string | number | null;
  aliases: string[];
}

interface FormLineItem {
  id: string;
  productId?: string;
  product: string;
  pack: string;
  batch: string;
  hsn: string;
  qty: string;
  rate: string;
  discountPct: string;
  gstPct: string;
}

const DELIVERY_NOTE_SUGGESTIONS = ["CYCLE VAN", "WB03D0517", "WB11D3608"];

export function InvoiceGeneratorView() {
  // Bootstrap data
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState<string>("IB26-27/0499");
  const [isInvoiceNumberTaken, setIsInvoiceNumberTaken] = useState(false);
  const [isCheckingNumber, setIsCheckingNumber] = useState(false);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);

  // Selected / active customer
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Form Fields
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [destination, setDestination] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [ewayBillNo, setEwayBillNo] = useState("");

  // Invoice Date (defaults to today DD-MM-YYYY)
  const todayFormatted = useMemo(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    const yr = d.getFullYear();
    return `${day}-${mon}-${yr}`;
  }, []);
  const [invoiceDate, setInvoiceDate] = useState(todayFormatted);

  // Line Items with per-row discount
  const [lines, setLines] = useState<FormLineItem[]>([
    {
      id: "line-1",
      product: "",
      pack: "",
      batch: "",
      hsn: "",
      qty: "",
      rate: "",
      discountPct: "0",
      gstPct: "18",
    },
  ]);

  // Product Autocomplete dropdown state (anchored relatively to the input holder)
  const [activeProductIndex, setActiveProductIndex] = useState<number | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState("");

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"form" | "preview" | "history">("form");

  // Load Bootstrap data
  const loadBootstrapData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/invoices/generate");
      if (!res.ok) throw new Error("Failed to load initial data");
      const data = await res.json();
      setCustomers(data.customers || []);
      setProducts(data.products || []);
      if (data.nextInvoiceNumber) {
        setInvoiceNumber(data.nextInvoiceNumber);
      }
      setRecentInvoices(data.recentInvoices || []);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load invoice generation data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBootstrapData();
  }, []);

  // Check if invoice number is duplicate whenever user edits it
  useEffect(() => {
    if (!invoiceNumber.trim()) {
      setIsInvoiceNumberTaken(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsCheckingNumber(true);
        const res = await fetch(`/api/invoices/generate?action=check_number&number=${encodeURIComponent(invoiceNumber.trim())}`);
        const data = await res.json();
        setIsInvoiceNumberTaken(!!data.exists);
      } catch {
        // ignore check errors
      } finally {
        setIsCheckingNumber(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [invoiceNumber]);

  // Close floating product dropdown when clicking outside
  useEffect(() => {
    const handleWindowClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".product-autocomplete-dropdown") && !target.closest(".product-input-field")) {
        setActiveProductIndex(null);
      }
    };
    window.addEventListener("mousedown", handleWindowClick);
    return () => window.removeEventListener("mousedown", handleWindowClick);
  }, []);

  // Filter Customers
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.gstin && c.gstin.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [customers, customerSearch]);

  // Filter Products for active line (search by commercialName, code, name, and aliases)
  const filteredProducts = useMemo(() => {
    if (!productSearchQuery.trim()) return products.slice(0, 10);
    const q = productSearchQuery.toLowerCase();
    return products
      .filter((p) => {
        const commercial = (p.commercialName || "").toLowerCase();
        const code = p.code.toLowerCase();
        const name = p.name.toLowerCase();
        const hasAliasMatch = p.aliases && p.aliases.some((a) => a.toLowerCase().includes(q));
        return commercial.includes(q) || code.includes(q) || name.includes(q) || hasAliasMatch;
      })
      .slice(0, 12);
  }, [products, productSearchQuery]);

  // Handle Customer Selection
  const handleSelectCustomer = (cust: CustomerData) => {
    setSelectedCustomer(cust);
    setCustomerName(cust.name);
    setCustomerAddress(cust.address || "");
    setCustomerPhone(cust.phone || "");
    setCustomerGstin(cust.gstin || "");
    setDeliveryNote(cust.deliveryNote || "");
    setDestination(cust.destination || "");
    setIsCustomerDropdownOpen(false);
  };

  // Check if non-WB GSTIN
  const isNonWestBengal = useMemo(() => {
    if (!customerGstin || customerGstin.trim().length < 2) return false;
    return !customerGstin.trim().startsWith("19");
  }, [customerGstin]);

  // Line item manipulation
  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}`,
        product: "",
        pack: "",
        batch: "",
        hsn: "",
        qty: "",
        rate: "",
        discountPct: "0",
        gstPct: "18",
      },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof FormLineItem, value: string) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Focus on product input: open autocomplete dropdown relative to active input
  const handleProductInputFocus = (idx: number) => {
    setActiveProductIndex(idx);
    setProductSearchQuery(lines[idx].product);
  };

  // Product selected from dropdown: fill Commercial Name and link productId
  const handleSelectProduct = (index: number, prod: ProductData) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        productId: prod.id,
        product: prod.commercialName || prod.name,
        pack: prod.pack_size_kg ? String(prod.pack_size_kg) : updated[index].pack,
        hsn: prod.default_hsn || updated[index].hsn,
        rate: prod.std_sale_rate ? String(prod.std_sale_rate) : updated[index].rate,
      };
      return updated;
    });
    setActiveProductIndex(null);
  };

  // Live Invoice Calculation with per-line discount support
  const calculation = useMemo(() => {
    const calcInput: InvoiceLineItemInput[] = lines.map((l, i) => ({
      sl: i + 1,
      qty: parseFloat(l.qty) || 0,
      pack: l.pack,
      product: l.product,
      batch: l.batch,
      hsn: l.hsn,
      rate: parseFloat(l.rate) || 0,
      discountPct: parseFloat(l.discountPct) || 0,
      gstPct: parseFloat(l.gstPct) || 18,
    }));
    return calculateInvoice(calcInput, 0);
  }, [lines]);

  // Customer & Header Meta for Printable Invoice
  const customerMeta: CustomerInvoiceMeta = useMemo(
    () => ({
      name: customerName,
      address: customerAddress,
      phone: customerPhone,
      gstin: customerGstin,
      stateCode: customerGstin ? customerGstin.substring(0, 2) : "19",
    }),
    [customerName, customerAddress, customerPhone, customerGstin]
  );

  const headerMeta: InvoiceHeaderMeta = useMemo(
    () => ({
      invoiceNumber: invoiceNumber,
      invoiceDate: invoiceDate,
      orderNo: orderNo,
      deliveryNote: deliveryNote,
      destination: destination,
      ewayBillNo: ewayBillNo,
      copyType: "ORIGINAL",
      hasWatermark: true,
    }),
    [invoiceNumber, invoiceDate, orderNo, deliveryNote, destination, ewayBillNo]
  );

  // Print Handler
  const handlePrint = () => {
    if (activeTab !== "preview") {
      setActiveTab("preview");
      setTimeout(() => {
        window.print();
      }, 150);
    } else {
      window.print();
    }
  };

  // Save Invoice
  const handleSaveInvoice = async () => {
    if (isInvoiceNumberTaken) {
      setErrorMessage(`Invoice number '${invoiceNumber}' already exists in database. Please specify a unique invoice number.`);
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage("Please select or specify a customer first.");
      return;
    }

    const hasEmptyLines = lines.some(
      (l) => !l.product.trim() || !(parseFloat(l.qty) > 0) || !(parseFloat(l.rate) > 0)
    );
    if (hasEmptyLines) {
      setErrorMessage("Please fill all product, quantity, and rate fields before saving.");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const payload = {
        invoiceNumber: invoiceNumber.trim(),
        date: invoiceDate,
        customerId: selectedCustomer?.id,
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim(),
        customerGstin: customerGstin.trim(),
        customerPhone: customerPhone.trim(),
        deliveryNote: deliveryNote.trim(),
        destination: destination.trim(),
        orderNo: orderNo.trim(),
        ewayBillNo: ewayBillNo.trim(),
        discountPct: 0,
        lines: lines.map((l) => ({
          productId: l.productId,
          productName: l.product.trim(),
          product: l.product.trim(),
          pack: l.pack.trim(),
          batch: l.batch.trim(),
          hsn: l.hsn.trim(),
          qty: parseFloat(l.qty) || 0,
          rate: parseFloat(l.rate) || 0,
          discountPct: parseFloat(l.discountPct) || 0,
          gstPct: parseFloat(l.gstPct) || 18,
        })),
      };

      const res = await fetch("/api/invoices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save invoice");
      }

      setSuccessMessage(`Invoice ${data.invoiceNumber} successfully created and saved! Stock summary updated.`);

      // Update cached customer destination for next time
      if (selectedCustomer) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === selectedCustomer.id ? { ...c, destination: destination.trim() } : c
          )
        );
      }

      // Refresh bootstrap data
      loadBootstrapData();
      setActiveTab("preview");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save invoice");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="no-print flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface border border-border p-4 rounded-sm">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-ink">Invoice Generation</h1>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {invoiceNumber}
            </span>
          </div>
          <p className="text-xs text-ink-3 mt-1">
            Pixel-faithful INDOBEST GST invoice creator with live calculations and stock integration.
          </p>
        </div>

        {/* Action Tabs & Buttons */}
        <div className="flex items-center gap-2">
          <div className="flex bg-surface-2 p-0.5 rounded border border-border">
            <button
              onClick={() => setActiveTab("form")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition ${
                activeTab === "form"
                  ? "bg-surface text-ink font-semibold shadow-sm"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              Invoice Form
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition flex items-center gap-1.5 ${
                activeTab === "preview"
                  ? "bg-surface text-ink font-semibold shadow-sm"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> A4 Preview
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition flex items-center gap-1.5 ${
                activeTab === "history"
                  ? "bg-surface text-ink font-semibold shadow-sm"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              <History className="w-3.5 h-3.5" /> Recent Invoices
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="px-3 py-1.5 text-xs font-medium border border-border rounded bg-surface hover:bg-surface-2 transition flex items-center gap-1.5 text-ink"
          >
            <Printer className="w-3.5 h-3.5 text-ink-2" /> Print / PDF
          </button>

          <button
            onClick={handleSaveInvoice}
            disabled={isSaving || isInvoiceNumberTaken}
            className="px-3.5 py-1.5 text-xs font-medium rounded bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition flex items-center gap-1.5 shadow-sm"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save & Issue
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="no-print p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-xs rounded-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="no-print p-3 bg-rose-500/10 border border-rose-500/20 text-rose-700 text-xs rounded-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* FORM TAB */}
      {activeTab === "form" && (
        <div className="no-print space-y-6">
          {/* Customer Selection Card */}
          <div className="bg-surface border border-border rounded-sm p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h2 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-primary" /> 1. Customer Details
              </h2>
              {isNonWestBengal && (
                <span className="text-[11px] font-medium text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> State Code is not 19 (West Bengal)
                </span>
              )}
            </div>

            {/* Customer Search Autocomplete */}
            <div className="relative">
              <label className="block text-xs font-medium text-ink-2 mb-1">
                Customer Name
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-ink-3 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setCustomerSearch(e.target.value);
                    setIsCustomerDropdownOpen(true);
                  }}
                  onFocus={() => setIsCustomerDropdownOpen(true)}
                  className="w-full pl-9 pr-8 py-2 text-xs bg-surface border border-border rounded-sm text-ink focus:outline-none focus:border-primary font-medium"
                />
                <button
                  type="button"
                  onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                  className="absolute right-2.5 top-2.5 text-ink-3 hover:text-ink"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Autocomplete Dropdown */}
              {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                <div className="absolute z-30 mt-1 w-full bg-surface border border-border rounded-sm shadow-lg max-h-60 overflow-y-auto divide-y divide-border">
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCustomer(c)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface-2 transition flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold text-ink">{c.name}</div>
                        <div className="text-[11px] text-ink-3 truncate max-w-md">
                          {c.address || ""}
                        </div>
                      </div>
                      <div className="text-[11px] font-mono text-ink-3">
                        {c.gstin || "URP"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Customer Auto-filled and Editable Fields (Hidden/Disabled until customer name typed or selected) */}
            <div className={!customerName.trim() ? "opacity-50 pointer-events-none" : ""}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1">
                    Multi-line Billing Address
                  </label>
                  <textarea
                    rows={3}
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-sm text-ink focus:outline-none focus:border-primary font-mono text-[11px]"
                  />
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-ink-2 mb-1">
                        GSTIN
                      </label>
                      <input
                        type="text"
                        value={customerGstin}
                        onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                        className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink font-mono focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-2 mb-1">
                        PH.NO.
                      </label>
                      <input
                        type="text"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Delivery Note with 3 suggestions and editable */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-medium text-ink-2">
                          DELIVERY NOTE
                        </label>
                      </div>
                      <input
                        type="text"
                        list="delivery-note-options"
                        value={deliveryNote}
                        onChange={(e) => setDeliveryNote(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink focus:outline-none focus:border-primary uppercase"
                      />
                      <datalist id="delivery-note-options">
                        {DELIVERY_NOTE_SUGGESTIONS.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                      <div className="flex gap-1 mt-1">
                        {DELIVERY_NOTE_SUGGESTIONS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setDeliveryNote(s)}
                            className="text-[9.5px] px-1.5 py-0.5 rounded border border-border bg-surface-2 text-ink-3 hover:text-ink hover:border-primary transition"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Destination (auto-filled for customer, editable, updated on save) */}
                    <div>
                      <label className="block text-xs font-medium text-ink-2 mb-1">
                        DESTINATION
                      </label>
                      <input
                        type="text"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink focus:outline-none focus:border-primary uppercase"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Metadata Row */}
          <div className="bg-surface border border-border rounded-sm p-4 space-y-4">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-2">
              <Calendar className="w-4 h-4 text-primary" /> 2. Invoice Details
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Editable Invoice Number with duplicate protection */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-medium text-ink-2">
                    Invoice Number
                  </label>
                  {isInvoiceNumberTaken && (
                    <span className="text-[10px] text-rose-600 font-bold">
                      Already Exists!
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value.trim().toUpperCase())}
                  className={`w-full px-3 py-1.5 text-xs bg-surface border rounded-sm font-bold font-mono focus:outline-none ${
                    isInvoiceNumberTaken
                      ? "border-rose-500 text-rose-600 bg-rose-500/5 focus:border-rose-600"
                      : "border-border text-primary focus:border-primary"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">
                  Invoice Date (DD-MM-YYYY)
                </label>
                <input
                  type="text"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink focus:outline-none focus:border-primary font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">
                  Order No.
                </label>
                <input
                  type="text"
                  value={orderNo}
                  onChange={(e) => setOrderNo(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">
                  E-WAY BILL NO.
                </label>
                <input
                  type="text"
                  value={ewayBillNo}
                  onChange={(e) => setEwayBillNo(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-sm text-ink focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Product Items Table with Disc % in between Rate and GST */}
          <div className="bg-surface border border-border rounded-sm p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4 text-primary" /> 3. Product Items & Taxes
              </h2>
              <button
                type="button"
                onClick={addLine}
                className="px-2.5 py-1 text-xs font-medium rounded border border-border bg-surface hover:bg-surface-2 transition flex items-center gap-1 text-ink"
              >
                <Plus className="w-3.5 h-3.5 text-primary" /> Add Row
              </button>
            </div>

            <div className="overflow-x-auto pb-32">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                    <th className="py-2 px-2 w-10 text-center">Sl.</th>
                    <th className="py-2 px-2 min-w-[220px]">Product Name (Commercial Name)</th>
                    <th className="py-2 px-2 w-16 text-right">Pack</th>
                    <th className="py-2 px-2 w-28">HSN</th>
                    <th className="py-2 px-2 w-20 text-right">Quantity</th>
                    <th className="py-2 px-2 w-24 text-right">Rate (₹)</th>
                    <th className="py-2 px-2 w-20 text-right">Disc %</th>
                    <th className="py-2 px-2 w-20 text-right">GST %</th>
                    <th className="py-2 px-2 w-24 text-right font-semibold">Taxable</th>
                    <th className="py-2 px-2 w-24 text-right font-semibold">Total</th>
                    <th className="py-2 px-1 w-8 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, idx) => {
                    const calcLine = calculation.items[idx];
                    return (
                      <tr key={line.id} className="hover:bg-surface-2/40 transition">
                        <td className="py-2 px-2 text-center font-mono text-ink-3">
                          {idx + 1}
                        </td>

                        {/* Product Input with Autocomplete relative to input holder */}
                        <td className="py-2 px-2 min-w-[220px]">
                          <div className="relative">
                            <input
                              type="text"
                              value={line.product}
                              onChange={(e) => {
                                updateLine(idx, "product", e.target.value);
                                setProductSearchQuery(e.target.value);
                                setActiveProductIndex(idx);
                              }}
                              onFocus={() => handleProductInputFocus(idx)}
                              className="product-input-field w-full px-2 py-1 text-xs bg-surface border border-border rounded-sm text-ink focus:outline-none focus:border-primary font-medium uppercase"
                              placeholder="Type product name..."
                            />

                            {/* Dropdown positioned directly relative to input holder with theme-aware styling */}
                            {activeProductIndex === idx && filteredProducts.length > 0 && (
                              <div className="product-autocomplete-dropdown absolute left-0 top-full mt-1 w-full min-w-[340px] z-50 bg-surface border border-border rounded-md shadow-2xl max-h-56 overflow-y-auto divide-y divide-border">
                                {filteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault(); // prevent blur before selection
                                      handleSelectProduct(idx, p);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-surface-2 transition flex justify-between items-center text-ink cursor-pointer"
                                  >
                                    <div>
                                      <span className="font-semibold text-ink">
                                        {p.commercialName}
                                      </span>
                                      {p.commercialName !== p.name && (
                                        <span className="text-[10px] text-ink-3 ml-1.5 font-normal">
                                          ({p.name})
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-mono text-ink-3 text-[11px] shrink-0 ml-2">
                                      HSN: {p.default_hsn || "—"} | Pack: {p.pack_size_kg || "—"}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Pack */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={line.pack}
                            onChange={(e) => updateLine(idx, "pack", e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-surface border border-border rounded-sm text-ink text-right font-mono"
                          />
                        </td>

                        {/* HSN with ample width (min-w-[95px]) so 8-digit HSN codes are fully visible */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={line.hsn}
                            onChange={(e) => updateLine(idx, "hsn", e.target.value)}
                            className="w-full min-w-[95px] px-2 py-1 text-xs bg-surface border border-border rounded-sm text-ink font-mono"
                          />
                        </td>

                        {/* Qty */}
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            step="any"
                            value={line.qty}
                            onChange={(e) => updateLine(idx, "qty", e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-surface border border-border rounded-sm text-ink text-right font-mono font-medium"
                          />
                        </td>

                        {/* Rate */}
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            step="any"
                            value={line.rate}
                            onChange={(e) => updateLine(idx, "rate", e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-surface border border-border rounded-sm text-ink text-right font-mono font-medium"
                          />
                        </td>

                        {/* Disc % in between Rate and GST */}
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max="100"
                            value={line.discountPct}
                            onChange={(e) => updateLine(idx, "discountPct", e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-surface border border-border rounded-sm text-ink text-right font-mono"
                          />
                        </td>

                        {/* GST % */}
                        <td className="py-2 px-2">
                          <select
                            value={line.gstPct}
                            onChange={(e) => updateLine(idx, "gstPct", e.target.value)}
                            className="w-full px-1.5 py-1 text-xs bg-surface border border-border rounded-sm text-ink text-right font-mono"
                          >
                            <option value="18">18%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="28">28%</option>
                            <option value="0">0%</option>
                          </select>
                        </td>

                        {/* Live Line Taxable */}
                        <td className="py-2 px-2 text-right font-mono font-medium text-ink">
                          ₹{calcLine ? calcLine.taxable : "0.00"}
                        </td>

                        {/* Live Line Total Amount */}
                        <td className="py-2 px-2 text-right font-mono font-semibold text-primary">
                          ₹{calcLine ? calcLine.amount : "0.00"}
                        </td>

                        {/* Remove Row */}
                        <td className="py-2 px-1 text-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-ink-3 hover:text-rose-600 transition p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>



            {/* Subtotal, Roundoff & Totals Summary Panel */}
            <div className="pt-4 border-t border-border flex flex-col md:flex-row justify-between gap-6">
              {/* GST Summary preview */}
              <div className="space-y-3 max-w-sm">
                <div className="p-2.5 bg-surface-2 border border-border rounded text-[11px] font-mono text-ink-2 space-y-1">
                  <div className="font-bold text-ink">GST Line:</div>
                  <div className="text-ink-3 break-all">{calculation.gstSummaryLine}</div>
                  <div className="font-bold text-ink pt-1">Amount in Words:</div>
                  <div className="text-ink-3 italic">{calculation.amountInWords}</div>
                </div>
              </div>

              {/* Totals Table matching layout (with Roundoff below CGST %) */}
              <div className="w-full md:w-80 space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-border text-ink-2">
                  <span>Total Quantity:</span>
                  <span className="font-mono font-bold text-ink">
                    {calculation.totalQty} kg
                  </span>
                </div>
                <div className="flex justify-between py-1 text-ink-2">
                  <span className="font-semibold text-ink">SUB TOTAL:</span>
                  <span className="font-mono font-bold text-ink">
                    ₹{calculation.subTotal}
                  </span>
                </div>

                {calculation.hasDiscount && (
                  <div className="flex justify-between py-1 text-emerald-600">
                    <span>Discount {calculation.discountPct > 0 ? `(${calculation.discountPct}%)` : ""}:</span>
                    <span className="font-mono">
                      −₹{calculation.discountAmount}
                    </span>
                  </div>
                )}

                <div className="flex justify-between py-1 text-ink-2">
                  <span>TAXABLE Total:</span>
                  <span className="font-mono font-medium text-ink">
                    ₹{calculation.taxableTotal}
                  </span>
                </div>

                <div className="flex justify-between py-1 text-ink-2">
                  <span>SGST {calculation.sgstRatePct}:</span>
                  <span className="font-mono">₹{calculation.sgstTotal}</span>
                </div>

                <div className="flex justify-between py-1 text-ink-2">
                  <span>CGST {calculation.cgstRatePct}:</span>
                  <span className="font-mono">₹{calculation.cgstTotal}</span>
                </div>

                {/* Roundoff row just below CGST %, matching Image 3 */}
                <div className="flex justify-between py-1 text-ink-2">
                  <span>Roundoff:</span>
                  <span className="font-mono">
                    {calculation.roundOffRaw > 0 ? "+" : calculation.roundOffRaw < 0 ? "−" : ""}
                    ₹{calculation.roundOff}
                  </span>
                </div>

                <div className="flex justify-between py-1 text-ink-3">
                  <span>CR/DR NOTE:</span>
                  <span className="font-mono">₹0.00</span>
                </div>

                <div className="flex justify-between py-2 border-t-2 border-border text-sm font-bold text-ink">
                  <span>GRAND TOTAL:</span>
                  <span className="font-mono text-primary text-base">
                    ₹{calculation.grandTotal}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW TAB */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          <div className="no-print flex items-center justify-between bg-surface border border-border p-3 rounded-sm">
            <span className="text-xs text-ink-2 font-medium">
              Standard A4 Portrait PDF Preview (Pixel-identical Layout)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="px-3 py-1.5 text-xs font-medium border border-border rounded bg-surface hover:bg-surface-2 transition flex items-center gap-1.5 text-ink"
              >
                <Printer className="w-3.5 h-3.5" /> Print Invoice
              </button>
            </div>
          </div>

          <div className="bg-neutral-100 p-4 md:p-8 rounded-sm overflow-x-auto shadow-inner flex justify-center print:bg-white print:p-0 print:m-0 print:shadow-none print:overflow-visible">
            <div className="shadow-2xl print:shadow-none print:p-0 print:m-0">
              <PrintableInvoice
                customer={customerMeta}
                meta={headerMeta}
                calculation={calculation}
              />
            </div>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === "history" && (
        <div className="no-print bg-surface border border-border rounded-sm p-4 space-y-4">
          <h2 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-2">
            <History className="w-4 h-4 text-primary" /> Generated Invoices History ({recentInvoices.length})
          </h2>

          {recentInvoices.length === 0 ? (
            <p className="text-xs text-ink-3 py-4 text-center">
              No generated invoices found yet. Invoices created using the generator will appear here for easy re-opening and re-printing.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
                    <th className="py-2.5 px-3">Invoice No.</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3 text-right">Grand Total</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-surface-2/60 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-primary">
                        {inv.invoice_number}
                      </td>
                      <td className="py-2.5 px-3 text-ink-2">
                        {new Date(inv.invoice_date).toLocaleDateString("en-GB")}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-ink">
                        {inv.customer_name_snapshot}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                        ₹{Number(inv.grand_total).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/invoices/generate?id=${inv.id}`);
                            const data = await res.json();
                            if (data.invoice) {
                              const d = data.invoice;
                              setInvoiceNumber(d.invoice_number);
                              const dt = new Date(d.invoice_date);
                              setInvoiceDate(
                                `${String(dt.getDate()).padStart(2, "0")}-${String(
                                  dt.getMonth() + 1
                                ).padStart(2, "0")}-${dt.getFullYear()}`
                              );
                              setCustomerName(d.customer_name_snapshot);
                              setCustomerAddress(d.customer?.address || "");
                              setCustomerGstin(d.customer_gstin_snapshot || "");
                              const meta = (d.warnings as any) || {};
                              setDeliveryNote(meta.deliveryNote || "");
                              setDestination(meta.destination || "");
                              setCustomerPhone(meta.phone || "");
                              setOrderNo(meta.orderNo || "");
                              setEwayBillNo(meta.ewayBillNo || "");
                              if (d.items && d.items.length > 0) {
                                setLines(
                                  d.items.map((it: any) => ({
                                    id: it.id,
                                    productId: it.product_id,
                                    product: it.product_name_raw,
                                    pack: it.pack_size_kg ? String(it.pack_size_kg) : "",
                                    batch: "",
                                    hsn: it.hsn || "",
                                    qty: String(it.qty_kg),
                                    rate: String(it.rate),
                                    discountPct: String(it.discount_pct || "0"),
                                    gstPct: String(
                                      (Number(it.cgst_pct) || 0) + (Number(it.sgst_pct) || 0) || 18
                                    ),
                                  }))
                                );
                              }
                              setActiveTab("preview");
                            }
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium border border-border rounded bg-surface hover:bg-surface-2 transition text-primary"
                        >
                          View / Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
