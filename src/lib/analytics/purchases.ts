import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { getDateRange } from "./index";

export interface PurchaseAnalyticsFilter {
  period?: "this_month" | "last_30" | "fy" | "all" | "custom";
  from?: string;
  to?: string;
  supplierId?: string;
  productId?: string;
}

export interface PurchaseKpis {
  purchasesTaxable: number;
  inputGst: number;
  invoicesCount: number;
  volumeKg: number;
  activeSuppliersCount: number;
  netStockMovementKg: number; // kg bought - kg sold in period
}

export interface PurchaseVsSalesTrendPoint {
  period: string; // e.g. "Apr 2026"
  purchasesTaxable: number;
  salesTaxable: number;
  volumeKg: number;
  invoiceCount: number;
}

export interface TopSupplierItem {
  id: string;
  name: string;
  gstin: string | null;
  totalSpend: number;
  volumeKg: number;
  invoiceCount: number;
  pctShare: number;
  isTop3: boolean;
}

export interface TopPurchasedProduct {
  id: string;
  code: string;
  name: string;
  totalSpend: number;
  volumeKg: number;
  invoiceCount: number;
  avgRatePerKg: number;
  stdPurchaseRate: number | null;
}

export interface ProductPriceTrendPoint {
  productId: string;
  productCode: string;
  productName: string;
  stdPurchaseRate: number | null;
  months: Array<{
    period: string;
    avgRatePerKg: number;
    volumeKg: number;
  }>;
}

export interface SupplierPriceComparison {
  productId: string;
  productCode: string;
  productName: string;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    latestRatePerKg: number;
    avgRatePerKg: number;
    volumeKg: number;
  }>;
}

export interface GstInputSummary {
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  totalInputGst: number;
  byMonth: Array<{
    period: string;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }>;
  byHsn: Array<{
    hsn: string;
    taxable: number;
    taxAmount: number;
  }>;
}

export interface PurchaseQualityAlerts {
  invoicesWithWarningsCount: number;
  suppliersWithoutGstinCount: number;
  rateVarianceCount: number;
  lapsedSuppliers: Array<{
    id: string;
    name: string;
    lastPurchaseDate: string | null;
    daysSincePurchase: number;
  }>;
}

export interface PurchaseAnalyticsData {
  kpis: PurchaseKpis;
  trend: PurchaseVsSalesTrendPoint[];
  topSuppliers: TopSupplierItem[];
  top3ConcentrationPct: number;
  topProducts: TopPurchasedProduct[];
  priceTrends: ProductPriceTrendPoint[];
  supplierComparison: SupplierPriceComparison[];
  gstInput: GstInputSummary;
  quality: PurchaseQualityAlerts;
}

export async function getPurchaseAnalytics(
  filter: PurchaseAnalyticsFilter = {}
): Promise<PurchaseAnalyticsData> {
  const { start, end } = getDateRange(filter as any);

  const purchaseWhere: Prisma.PurchaseInvoiceWhereInput = {
    invoice_date: {
      gte: start,
      lte: end,
    },
    ...(filter.supplierId ? { supplier_id: filter.supplierId } : {}),
    ...(filter.productId
      ? { items: { some: { product_id: filter.productId } } }
      : {}),
  };

  const salesWhere: Prisma.InvoiceWhereInput = {
    invoice_date: {
      gte: start,
      lte: end,
    },
    ...(filter.productId
      ? { items: { some: { product_id: filter.productId } } }
      : {}),
  };

  // Fetch purchase invoices and sales invoices concurrently
  const [purchases, salesInvoices, allSuppliers, products] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: purchaseWhere,
      include: {
        supplier: true,
        items: {
          include: { product: true },
          where: filter.productId ? { product_id: filter.productId } : undefined,
        },
      },
      orderBy: { invoice_date: "asc" },
    }),
    prisma.invoice.findMany({
      where: salesWhere,
      include: {
        items: {
          where: filter.productId ? { product_id: filter.productId } : undefined,
        },
      },
      orderBy: { invoice_date: "asc" },
    }),
    prisma.supplier.findMany({
      where: { is_active: true },
      include: {
        purchase_invoices: {
          orderBy: { invoice_date: "desc" },
          take: 1,
        },
      },
    }),
    prisma.product.findMany({
      where: { is_active: true },
    }),
  ]);

  // 1. KPI Aggregation
  let purchasesTaxable = new Decimal(0);
  let cgstTotal = new Decimal(0);
  let sgstTotal = new Decimal(0);
  let igstTotal = new Decimal(0);
  let purchaseVolumeKg = new Decimal(0);
  const activeSupplierIds = new Set<string>();

  for (const inv of purchases) {
    purchasesTaxable = purchasesTaxable.plus(new Decimal(inv.taxable_total.toString()));
    cgstTotal = cgstTotal.plus(new Decimal(inv.cgst_total.toString()));
    sgstTotal = sgstTotal.plus(new Decimal(inv.sgst_total.toString()));
    igstTotal = igstTotal.plus(new Decimal(inv.igst_total.toString()));
    activeSupplierIds.add(inv.supplier_id);

    for (const it of inv.items) {
      purchaseVolumeKg = purchaseVolumeKg.plus(new Decimal(it.qty_kg.toString()));
    }
  }

  let salesVolumeKg = new Decimal(0);
  for (const sinv of salesInvoices) {
    for (const it of sinv.items) {
      salesVolumeKg = salesVolumeKg.plus(new Decimal(it.qty_kg.toString()));
    }
  }

  const inputGst = cgstTotal.plus(sgstTotal).plus(igstTotal);
  const netStockMovementKg = purchaseVolumeKg.minus(salesVolumeKg);

  const kpis: PurchaseKpis = {
    purchasesTaxable: purchasesTaxable.toDecimalPlaces(2).toNumber(),
    inputGst: inputGst.toDecimalPlaces(2).toNumber(),
    invoicesCount: purchases.length,
    volumeKg: purchaseVolumeKg.toDecimalPlaces(2).toNumber(),
    activeSuppliersCount: activeSupplierIds.size,
    netStockMovementKg: netStockMovementKg.toDecimalPlaces(2).toNumber(),
  };

  // 2. Trend: Purchases vs Sales by Month
  const monthMap = new Map<
    string,
    { purchases: Decimal; sales: Decimal; volumeKg: Decimal; count: number }
  >();

  const getMonthKey = (d: Date) => {
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
  };

  for (const inv of purchases) {
    const k = getMonthKey(inv.invoice_date);
    if (!monthMap.has(k)) {
      monthMap.set(k, {
        purchases: new Decimal(0),
        sales: new Decimal(0),
        volumeKg: new Decimal(0),
        count: 0,
      });
    }
    const cur = monthMap.get(k)!;
    cur.purchases = cur.purchases.plus(new Decimal(inv.taxable_total.toString()));
    cur.count += 1;
    for (const it of inv.items) {
      cur.volumeKg = cur.volumeKg.plus(new Decimal(it.qty_kg.toString()));
    }
  }

  for (const sinv of salesInvoices) {
    const k = getMonthKey(sinv.invoice_date);
    if (!monthMap.has(k)) {
      monthMap.set(k, {
        purchases: new Decimal(0),
        sales: new Decimal(0),
        volumeKg: new Decimal(0),
        count: 0,
      });
    }
    const cur = monthMap.get(k)!;
    cur.sales = cur.sales.plus(new Decimal(sinv.taxable_total.toString()));
  }

  const trend: PurchaseVsSalesTrendPoint[] = Array.from(monthMap.entries()).map(
    ([period, m]) => ({
      period,
      purchasesTaxable: m.purchases.toDecimalPlaces(2).toNumber(),
      salesTaxable: m.sales.toDecimalPlaces(2).toNumber(),
      volumeKg: m.volumeKg.toDecimalPlaces(2).toNumber(),
      invoiceCount: m.count,
    })
  );

  // 3. Top Suppliers & Concentration
  const supplierSpendMap = new Map<
    string,
    {
      id: string;
      name: string;
      gstin: string | null;
      spend: Decimal;
      volume: Decimal;
      count: number;
    }
  >();

  for (const inv of purchases) {
    const sId = inv.supplier_id;
    if (!supplierSpendMap.has(sId)) {
      supplierSpendMap.set(sId, {
        id: sId,
        name: inv.supplier_name_snapshot,
        gstin: inv.supplier_gstin_snapshot,
        spend: new Decimal(0),
        volume: new Decimal(0),
        count: 0,
      });
    }
    const cur = supplierSpendMap.get(sId)!;
    cur.spend = cur.spend.plus(new Decimal(inv.taxable_total.toString()));
    cur.count += 1;
    for (const it of inv.items) {
      cur.volume = cur.volume.plus(new Decimal(it.qty_kg.toString()));
    }
  }

  const sortedSuppliers = Array.from(supplierSpendMap.values()).sort((a, b) =>
    b.spend.minus(a.spend).toNumber()
  );

  let top3Spend = new Decimal(0);
  const topSuppliers: TopSupplierItem[] = sortedSuppliers.map((s, idx) => {
    const isTop3 = idx < 3;
    if (isTop3) top3Spend = top3Spend.plus(s.spend);
    const pctShare = purchasesTaxable.isZero()
      ? 0
      : s.spend.dividedBy(purchasesTaxable).times(100).toDecimalPlaces(1).toNumber();

    return {
      id: s.id,
      name: s.name,
      gstin: s.gstin,
      totalSpend: s.spend.toDecimalPlaces(2).toNumber(),
      volumeKg: s.volume.toDecimalPlaces(2).toNumber(),
      invoiceCount: s.count,
      pctShare,
      isTop3,
    };
  });

  const top3ConcentrationPct = purchasesTaxable.isZero()
    ? 0
    : top3Spend.dividedBy(purchasesTaxable).times(100).toDecimalPlaces(1).toNumber();

  // 4. Top Products Bought
  const productSpendMap = new Map<
    string,
    {
      id: string;
      code: string;
      name: string;
      spend: Decimal;
      volume: Decimal;
      count: number;
      stdRate: number | null;
    }
  >();

  for (const inv of purchases) {
    for (const it of inv.items) {
      const pId = it.product_id;
      if (!productSpendMap.has(pId)) {
        productSpendMap.set(pId, {
          id: pId,
          code: it.product.code,
          name: it.product.name,
          spend: new Decimal(0),
          volume: new Decimal(0),
          count: 0,
          stdRate: it.product.std_purchase_rate
            ? Number(it.product.std_purchase_rate)
            : null,
        });
      }
      const cur = productSpendMap.get(pId)!;
      cur.spend = cur.spend.plus(new Decimal(it.taxable_amount.toString()));
      cur.volume = cur.volume.plus(new Decimal(it.qty_kg.toString()));
      cur.count += 1;
    }
  }

  const topProducts: TopPurchasedProduct[] = Array.from(
    productSpendMap.values()
  )
    .sort((a, b) => b.spend.minus(a.spend).toNumber())
    .slice(0, 15)
    .map((p) => {
      const avgRatePerKg = p.volume.isZero()
        ? 0
        : p.spend.dividedBy(p.volume).toDecimalPlaces(2).toNumber();
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        totalSpend: p.spend.toDecimalPlaces(2).toNumber(),
        volumeKg: p.volume.toDecimalPlaces(2).toNumber(),
        invoiceCount: p.count,
        avgRatePerKg,
        stdPurchaseRate: p.stdRate,
      };
    });

  // 5. Product Price Trend (Monthly weighted average ₹/kg vs std_purchase_rate)
  const productMonthMap = new Map<
    string,
    Map<string, { spend: Decimal; volume: Decimal }>
  >();

  for (const inv of purchases) {
    const monthKey = getMonthKey(inv.invoice_date);
    for (const it of inv.items) {
      if (!productMonthMap.has(it.product_id)) {
        productMonthMap.set(it.product_id, new Map());
      }
      const pMap = productMonthMap.get(it.product_id)!;
      if (!pMap.has(monthKey)) {
        pMap.set(monthKey, { spend: new Decimal(0), volume: new Decimal(0) });
      }
      const entry = pMap.get(monthKey)!;
      entry.spend = entry.spend.plus(new Decimal(it.taxable_amount.toString()));
      entry.volume = entry.volume.plus(new Decimal(it.qty_kg.toString()));
    }
  }

  const priceTrends: ProductPriceTrendPoint[] = topProducts
    .slice(0, 8)
    .map((p) => {
      const pMap = productMonthMap.get(p.id) || new Map();
      const months = Array.from(pMap.entries()).map(([period, v]) => ({
        period,
        avgRatePerKg: v.volume.isZero()
          ? 0
          : v.spend.dividedBy(v.volume).toDecimalPlaces(2).toNumber(),
        volumeKg: v.volume.toDecimalPlaces(2).toNumber(),
      }));

      return {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        stdPurchaseRate: p.stdPurchaseRate,
        months,
      };
    });

  // 6. Supplier Price Comparison for products bought from > 1 supplier
  const prodSupplierMap = new Map<
    string,
    Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        spend: Decimal;
        volume: Decimal;
        latestDate: Date;
        latestRate: Decimal;
      }
    >
  >();

  for (const inv of purchases) {
    for (const it of inv.items) {
      if (!prodSupplierMap.has(it.product_id)) {
        prodSupplierMap.set(it.product_id, new Map());
      }
      const sMap = prodSupplierMap.get(it.product_id)!;
      if (!sMap.has(inv.supplier_id)) {
        sMap.set(inv.supplier_id, {
          supplierId: inv.supplier_id,
          supplierName: inv.supplier_name_snapshot,
          spend: new Decimal(0),
          volume: new Decimal(0),
          latestDate: inv.invoice_date,
          latestRate: new Decimal(it.rate_per_kg.toString()),
        });
      }
      const entry = sMap.get(inv.supplier_id)!;
      entry.spend = entry.spend.plus(new Decimal(it.taxable_amount.toString()));
      entry.volume = entry.volume.plus(new Decimal(it.qty_kg.toString()));
      if (inv.invoice_date >= entry.latestDate) {
        entry.latestDate = inv.invoice_date;
        entry.latestRate = new Decimal(it.rate_per_kg.toString());
      }
    }
  }

  const supplierComparison: SupplierPriceComparison[] = [];
  for (const [pId, sMap] of Array.from(prodSupplierMap.entries())) {
    if (sMap.size > 1) {
      const prod = products.find((p) => p.id === pId);
      if (prod) {
        supplierComparison.push({
          productId: prod.id,
          productCode: prod.code,
          productName: prod.name,
          suppliers: Array.from(sMap.values()).map((s: any) => ({
            supplierId: s.supplierId,
            supplierName: s.supplierName,
            latestRatePerKg: s.latestRate.toDecimalPlaces(2).toNumber(),
            avgRatePerKg: s.volume.isZero()
              ? 0
              : s.spend.dividedBy(s.volume).toDecimalPlaces(2).toNumber(),
            volumeKg: s.volume.toDecimalPlaces(2).toNumber(),
          })),
        });
      }
    }
  }

  // 7. Input GST Breakdown (by Month & by HSN)
  const gstMonthMap = new Map<
    string,
    { cgst: Decimal; sgst: Decimal; igst: Decimal }
  >();
  const hsnMap = new Map<string, { taxable: Decimal; tax: Decimal }>();

  for (const inv of purchases) {
    const monthKey = getMonthKey(inv.invoice_date);
    if (!gstMonthMap.has(monthKey)) {
      gstMonthMap.set(monthKey, {
        cgst: new Decimal(0),
        sgst: new Decimal(0),
        igst: new Decimal(0),
      });
    }
    const gCur = gstMonthMap.get(monthKey)!;
    gCur.cgst = gCur.cgst.plus(new Decimal(inv.cgst_total.toString()));
    gCur.sgst = gCur.sgst.plus(new Decimal(inv.sgst_total.toString()));
    gCur.igst = gCur.igst.plus(new Decimal(inv.igst_total.toString()));

    for (const it of inv.items) {
      const hsnKey = it.hsn || "Uncategorized";
      if (!hsnMap.has(hsnKey)) {
        hsnMap.set(hsnKey, { taxable: new Decimal(0), tax: new Decimal(0) });
      }
      const hEntry = hsnMap.get(hsnKey)!;
      hEntry.taxable = hEntry.taxable.plus(new Decimal(it.taxable_amount.toString()));
      const taxAmt = new Decimal(it.cgst_amount?.toString() || 0)
        .plus(new Decimal(it.sgst_amount?.toString() || 0))
        .plus(new Decimal(it.igst_amount?.toString() || 0));
      hEntry.tax = hEntry.tax.plus(taxAmt);
    }
  }

  const gstInput: GstInputSummary = {
    cgstTotal: cgstTotal.toDecimalPlaces(2).toNumber(),
    sgstTotal: sgstTotal.toDecimalPlaces(2).toNumber(),
    igstTotal: igstTotal.toDecimalPlaces(2).toNumber(),
    totalInputGst: inputGst.toDecimalPlaces(2).toNumber(),
    byMonth: Array.from(gstMonthMap.entries()).map(([period, m]) => ({
      period,
      cgst: m.cgst.toDecimalPlaces(2).toNumber(),
      sgst: m.sgst.toDecimalPlaces(2).toNumber(),
      igst: m.igst.toDecimalPlaces(2).toNumber(),
      total: m.cgst.plus(m.sgst).plus(m.igst).toDecimalPlaces(2).toNumber(),
    })),
    byHsn: Array.from(hsnMap.entries())
      .map(([hsn, v]) => ({
        hsn,
        taxable: v.taxable.toDecimalPlaces(2).toNumber(),
        taxAmount: v.tax.toDecimalPlaces(2).toNumber(),
      }))
      .sort((a, b) => b.taxable - a.taxable),
  };

  // 8. Quality & Lapsed Suppliers
  const now = new Date();
  const lapsedSuppliersList: PurchaseQualityAlerts["lapsedSuppliers"] = [];
  let suppliersWithoutGstinCount = 0;

  for (const s of allSuppliers) {
    if (!s.gstin) suppliersWithoutGstinCount += 1;

    const latestInv = s.purchase_invoices[0];
    if (latestInv) {
      const diffDays = Math.floor(
        (now.getTime() - latestInv.invoice_date.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays >= 90) {
        lapsedSuppliersList.push({
          id: s.id,
          name: s.name,
          lastPurchaseDate: latestInv.invoice_date.toISOString().split("T")[0],
          daysSincePurchase: diffDays,
        });
      }
    } else {
      lapsedSuppliersList.push({
        id: s.id,
        name: s.name,
        lastPurchaseDate: null,
        daysSincePurchase: 999,
      });
    }
  }

  let invoicesWithWarningsCount = 0;
  let rateVarianceCount = 0;

  for (const inv of purchases) {
    if (inv.warnings && Array.isArray(inv.warnings) && inv.warnings.length > 0) {
      invoicesWithWarningsCount += 1;
    }
    for (const it of inv.items) {
      if (it.product.std_purchase_rate) {
        const std = Number(it.product.std_purchase_rate);
        const actual = Number(it.rate_per_kg);
        if (std > 0 && Math.abs(actual - std) / std > 0.2) {
          rateVarianceCount += 1;
        }
      }
    }
  }

  return {
    kpis,
    trend,
    topSuppliers,
    top3ConcentrationPct,
    topProducts,
    priceTrends,
    supplierComparison,
    gstInput,
    quality: {
      invoicesWithWarningsCount,
      suppliersWithoutGstinCount,
      rateVarianceCount,
      lapsedSuppliers: lapsedSuppliersList.slice(0, 10),
    },
  };
}
