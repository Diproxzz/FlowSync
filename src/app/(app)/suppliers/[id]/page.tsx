"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Receipt,
  TrendingUp,
  Package,
  Calendar,
  ExternalLink,
  Edit2,
  GitMerge,
  AlertCircle,
  FileText,
} from "lucide-react";
import { formatINR, formatKg, formatDate } from "@/lib/format";

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [supplier, setSupplier] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"invoices" | "products">("invoices");

  const loadSupplier = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/suppliers/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Supplier not found");
      setSupplier(data.supplier);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadSupplier();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading supplier profile...</div>;
  }

  if (!supplier) {
    return (
      <div className="p-8 text-center space-y-4">
        <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
        <h2 className="text-lg font-bold">Supplier Not Found</h2>
        <Link href="/suppliers" className="text-primary hover:underline text-sm">
          Return to Suppliers List
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/suppliers"
          className="p-2 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{supplier.name}</h1>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300">
              Supplier
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            GSTIN: <span className="font-mono text-foreground font-semibold">{supplier.gstin || "Unregistered"}</span>
            {supplier.state_code && <span className="ml-2">State: {supplier.state_code}</span>}
          </p>
        </div>
      </div>

      {supplier.alsoCustomer && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm flex items-center justify-between">
          <span>ℹ️ This supplier also operates as a Customer with the same GSTIN ({supplier.alsoCustomer.name}).</span>
          <Link href={`/customers/${supplier.alsoCustomer.id}`} className="font-semibold underline text-xs">
            View Customer Profile
          </Link>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl">
          <div className="text-xs text-muted-foreground font-medium">Total Spend</div>
          <div className="text-xl font-bold font-mono mt-1 text-foreground">{formatINR(supplier.total_spend)}</div>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl">
          <div className="text-xs text-muted-foreground font-medium">Purchase Invoices</div>
          <div className="text-xl font-bold mt-1 text-foreground">{supplier.purchase_invoices?.length || 0}</div>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl">
          <div className="text-xs text-muted-foreground font-medium">Distinct Products Bought</div>
          <div className="text-xl font-bold mt-1 text-foreground">{supplier.productsBought?.length || 0}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("invoices")}
          className={`py-3 px-4 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "invoices"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Receipt className="w-4 h-4" /> Purchase Invoices ({supplier.purchase_invoices?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("products")}
          className={`py-3 px-4 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "products"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Products & Rate Trends ({supplier.productsBought?.length || 0})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "invoices" ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Invoice Number</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Items</th>
                  <th className="px-6 py-3 font-medium text-right">Taxable</th>
                  <th className="px-6 py-3 font-medium text-right">Grand Total</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(!supplier.purchase_invoices || supplier.purchase_invoices.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      No purchase invoices recorded yet.
                    </td>
                  </tr>
                ) : (
                  supplier.purchase_invoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition">
                      <td className="px-6 py-4 font-semibold font-mono">{inv.supplier_invoice_number}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(inv.invoice_date)}</td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {inv.items?.length || 0} line(s): {inv.items?.map((it: any) => it.product?.name).filter(Boolean).slice(0, 2).join(", ")}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">{formatINR(inv.taxable_total)}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-foreground">{formatINR(inv.grand_total)}</td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/purchases/${inv.id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View Details <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(!supplier.productsBought || supplier.productsBought.length === 0) ? (
            <div className="col-span-2 py-8 text-center text-muted-foreground">No product purchase history available.</div>
          ) : (
            supplier.productsBought.map((p: any) => (
              <div key={p.productId} className="p-4 bg-card border border-border rounded-xl space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-foreground">{p.productName}</div>
                    <div className="text-xs font-mono text-muted-foreground">{p.productCode}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total Qty</div>
                    <div className="font-bold font-mono">{formatKg(p.totalQtyKg)}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs bg-muted/30 p-2.5 rounded-lg border border-border/50">
                  <div>Latest Cost: <strong className="font-mono text-foreground">{formatINR(p.latestRatePerKg)}/kg</strong></div>
                  <div>Weighted Avg: <strong className="font-mono text-foreground">{formatINR(p.avgRatePerKg)}/kg</strong></div>
                  <div>Total Spend: <strong className="font-mono text-foreground">{formatINR(p.totalSpend)}</strong></div>
                </div>

                {p.rates && p.rates.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Recent Rate History:</span>
                    <ul className="mt-1 space-y-0.5">
                      {p.rates.slice(0, 3).map((r: any, idx: number) => (
                        <li key={idx} className="flex justify-between font-mono text-[11px]">
                          <span>{r.date} ({r.invoiceNumber})</span>
                          <span>{formatINR(r.ratePerKg)}/kg</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
