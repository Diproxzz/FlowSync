import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

export interface AnalyticsFilter {
  period?: "this_month" | "last_30" | "fy" | "all" | "custom";
  from?: string;
  to?: string;
  customerId?: string;
  productId?: string;
}

export interface KpiSummary {
  revenueTaxable: number;
  revenueGrand: number;
  volumeKg: number;
  invoicesCount: number;
  activeCustomersCount: number;
  avgRealizationPerKg: number;
  prevRevenueTaxable: number;
  prevVolumeKg: number;
  prevAvgRealizationPerKg: number;
  revenueDeltaPct: number | null;
  volumeDeltaPct: number | null;
  realizationDeltaPct: number | null;
}

export interface TrendPoint {
  period: string; // e.g. "Apr 26", "2026-10"
  revenue: number;
  volumeKg: number;
  invoiceCount: number;
}

export interface TopItem {
  id: string;
  name: string;
  code?: string;
  revenue: number;
  volumeKg: number;
  invoiceCount: number;
  avgRate: number;
  purchaseCostPerKg?: number | null;
  marginPerKg?: number | null;
  marginBasis?: "ACTUAL" | "ESTIMATED";
}

export interface AbcProduct {
  id: string;
  code: string;
  name: string;
  revenue: number;
  volumeKg: number;
  cumulativePct: number;
  classification: "A" | "B" | "C";
}

export interface GstSummary {
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  grandTotal: number;
  intrastateTaxable: number;
  interstateTaxable: number;
}

export interface MovementVelocity {
  fastMoving: Array<{ id: string; code: string; name: string; volumeKg: number; closingStock: number }>;
  slowOrDead: Array<{ id: string; code: string; name: string; closingStock: number; daysSinceLastSale: number | null }>;
}

export interface AnalyticsData {
  kpis: KpiSummary;
  trend: TrendPoint[];
  topProducts: TopItem[];
  topCustomers: TopItem[];
  abcProducts: AbcProduct[];
  gstSummary: GstSummary;
  velocity: MovementVelocity;
  quality: {
    unreviewedProducts: number;
    invoicesWithWarnings: number;
  };
}

export function getDateRange(filter: AnalyticsFilter): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  let start: Date;
  let end: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (filter.period === "this_month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (filter.period === "last_30") {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
  } else if (filter.period === "fy") {
    const curMonth = now.getMonth() + 1;
    const fyYear = curMonth >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    start = new Date(fyYear, 3, 1); // 1st April
    end = new Date(fyYear + 1, 2, 31, 23, 59, 59, 999); // 31st March
  } else if (filter.period === "custom" && filter.from) {
    start = new Date(filter.from);
    start.setHours(0, 0, 0, 0);
    if (filter.to) {
      end = new Date(filter.to);
      end.setHours(23, 59, 59, 999);
    }
  } else {
    // "all" - defaults to FY start (2026-04-01) or earliest records
    start = new Date("2026-04-01");
  }

  // Calculate matching prior period for delta comparison
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return { start, end, prevStart, prevEnd };
}

export async function getDashboardAnalytics(filter: AnalyticsFilter = {}): Promise<AnalyticsData> {
  const { start, end, prevStart, prevEnd } = getDateRange(filter);

  // Invoice where condition
  const invoiceWhere: Prisma.InvoiceWhereInput = {
    invoice_date: {
      gte: start,
      lte: end,
    },
    ...(filter.customerId ? { customer_id: filter.customerId } : {}),
    ...(filter.productId ? { items: { some: { product_id: filter.productId } } } : {}),
  };

  const prevInvoiceWhere: Prisma.InvoiceWhereInput = {
    invoice_date: {
      gte: prevStart,
      lte: prevEnd,
    },
    ...(filter.customerId ? { customer_id: filter.customerId } : {}),
    ...(filter.productId ? { items: { some: { product_id: filter.productId } } } : {}),
  };

  // 1. Fetch Invoices for current and prev period
  const [currentInvoices, prevInvoices] = await Promise.all([
    prisma.invoice.findMany({
      where: invoiceWhere,
      include: {
        customer: true,
        items: {
          include: { product: true },
          where: filter.productId ? { product_id: filter.productId } : undefined,
        },
      },
      orderBy: { invoice_date: "asc" },
    }),
    prisma.invoice.findMany({
      where: prevInvoiceWhere,
      include: {
        items: {
          where: filter.productId ? { product_id: filter.productId } : undefined,
        },
      },
    }),
  ]);

  // If there are no invoices yet in the period, fallback or combine with legacy transactions
  // to ensure charts and volume calculations show data
  const legacyMovements = await prisma.stockMovement.findMany({
    where: {
      source: "LEGACY_XLSX",
      type: "SALE",
      movement_date: { gte: start, lte: end },
      ...(filter.productId ? { product_id: filter.productId } : {}),
    },
    include: { product: true },
  });

  // 2. Compute Current KPIs
  let curTaxable = new Decimal(0);
  let curGrand = new Decimal(0);
  let curVolume = new Decimal(0);
  const customerSet = new Set<string>();

  for (const inv of currentInvoices) {
    if (filter.productId) {
      // Line level aggregation for specific product
      for (const it of inv.items) {
        curTaxable = curTaxable.plus(it.taxable_amount.toString());
        curGrand = curGrand.plus(it.line_total.toString());
        curVolume = curVolume.plus(it.qty_kg.toString());
      }
    } else {
      curTaxable = curTaxable.plus(inv.taxable_total.toString());
      curGrand = curGrand.plus(inv.grand_total.toString());
      for (const it of inv.items) {
        curVolume = curVolume.plus(it.qty_kg.toString());
      }
    }
    customerSet.add(inv.customer_id);
  }

  // Include legacy sales volume if invoices are few
  for (const leg of legacyMovements) {
    curVolume = curVolume.plus(leg.qty_kg.toString());
    // Estimate taxable if product std_sale_rate exists
    if (leg.product.std_sale_rate) {
      const legRev = new Decimal(leg.qty_kg.toString()).times(leg.product.std_sale_rate.toString());
      curTaxable = curTaxable.plus(legRev);
      curGrand = curGrand.plus(legRev.times(1.18)); // 18% standard GST
    }
  }

  const curTaxableNum = curTaxable.toNumber();
  const curGrandNum = curGrand.toNumber();
  const curVolumeNum = curVolume.toNumber();
  const curAvgRealization = curVolumeNum > 0 ? curTaxableNum / curVolumeNum : 0;

  // Compute Prior KPIs
  let prevTaxable = new Decimal(0);
  let prevVolume = new Decimal(0);
  for (const inv of prevInvoices) {
    if (filter.productId) {
      for (const it of inv.items) {
        prevTaxable = prevTaxable.plus(it.taxable_amount.toString());
        prevVolume = prevVolume.plus(it.qty_kg.toString());
      }
    } else {
      prevTaxable = prevTaxable.plus(inv.taxable_total.toString());
      for (const it of inv.items) {
        prevVolume = prevVolume.plus(it.qty_kg.toString());
      }
    }
  }
  const prevTaxableNum = prevTaxable.toNumber();
  const prevVolumeNum = prevVolume.toNumber();
  const prevAvgRealization = prevVolumeNum > 0 ? prevTaxableNum / prevVolumeNum : 0;

  // Percentage Deltas
  const revenueDeltaPct = prevTaxableNum > 0 ? ((curTaxableNum - prevTaxableNum) / prevTaxableNum) * 100 : null;
  const volumeDeltaPct = prevVolumeNum > 0 ? ((curVolumeNum - prevVolumeNum) / prevVolumeNum) * 100 : null;
  const realizationDeltaPct =
    prevAvgRealization > 0 ? ((curAvgRealization - prevAvgRealization) / prevAvgRealization) * 100 : null;

  const kpis: KpiSummary = {
    revenueTaxable: Math.round(curTaxableNum * 100) / 100,
    revenueGrand: Math.round(curGrandNum * 100) / 100,
    volumeKg: Math.round(curVolumeNum * 1000) / 1000,
    invoicesCount: currentInvoices.length,
    activeCustomersCount: customerSet.size,
    avgRealizationPerKg: Math.round(curAvgRealization * 100) / 100,
    prevRevenueTaxable: Math.round(prevTaxableNum * 100) / 100,
    prevVolumeKg: Math.round(prevVolumeNum * 1000) / 1000,
    prevAvgRealizationPerKg: Math.round(prevAvgRealization * 100) / 100,
    revenueDeltaPct: revenueDeltaPct !== null ? Math.round(revenueDeltaPct * 10) / 10 : null,
    volumeDeltaPct: volumeDeltaPct !== null ? Math.round(volumeDeltaPct * 10) / 10 : null,
    realizationDeltaPct: realizationDeltaPct !== null ? Math.round(realizationDeltaPct * 10) / 10 : null,
  };

  // 3. Trends (grouped by month YYYY-MM)
  const monthMap = new Map<string, { revenue: Decimal; volume: Decimal; count: number }>();

  for (const inv of currentInvoices) {
    const key = inv.invoice_date.toISOString().substring(0, 7); // "YYYY-MM"
    if (!monthMap.has(key)) {
      monthMap.set(key, { revenue: new Decimal(0), volume: new Decimal(0), count: 0 });
    }
    const bucket = monthMap.get(key)!;
    bucket.count += 1;
    bucket.revenue = bucket.revenue.plus(inv.taxable_total.toString());
    for (const it of inv.items) {
      bucket.volume = bucket.volume.plus(it.qty_kg.toString());
    }
  }

  // Also fold in legacy movements if monthMap is empty or sparse
  for (const leg of legacyMovements) {
    const key = leg.movement_date.toISOString().substring(0, 7);
    if (!monthMap.has(key)) {
      monthMap.set(key, { revenue: new Decimal(0), volume: new Decimal(0), count: 0 });
    }
    const bucket = monthMap.get(key)!;
    bucket.volume = bucket.volume.plus(leg.qty_kg.toString());
    if (leg.product.std_sale_rate) {
      bucket.revenue = bucket.revenue.plus(
        new Decimal(leg.qty_kg.toString()).times(leg.product.std_sale_rate.toString())
      );
    }
  }

  const sortedMonths = Array.from(monthMap.keys()).sort();
  const trend: TrendPoint[] = sortedMonths.map((m) => {
    const b = monthMap.get(m)!;
    return {
      period: m,
      revenue: Math.round(b.revenue.toNumber()),
      volumeKg: Math.round(b.volume.toNumber()),
      invoiceCount: b.count,
    };
  });

  // 4. Top Products & Top Customers
  const productAgg = new Map<string, { code: string; name: string; revenue: Decimal; volume: Decimal; count: number }>();
  const customerAgg = new Map<string, { name: string; revenue: Decimal; volume: Decimal; count: number }>();

  for (const inv of currentInvoices) {
    // Customer agg
    if (!customerAgg.has(inv.customer_id)) {
      customerAgg.set(inv.customer_id, {
        name: inv.customer_name_snapshot,
        revenue: new Decimal(0),
        volume: new Decimal(0),
        count: 0,
      });
    }
    const cBucket = customerAgg.get(inv.customer_id)!;
    cBucket.count += 1;
    cBucket.revenue = cBucket.revenue.plus(inv.taxable_total.toString());

    // Product agg from invoice lines
    for (const it of inv.items) {
      cBucket.volume = cBucket.volume.plus(it.qty_kg.toString());

      if (!productAgg.has(it.product_id)) {
        productAgg.set(it.product_id, {
          code: it.product.code,
          name: it.product.name,
          revenue: new Decimal(0),
          volume: new Decimal(0),
          count: 0,
        });
      }
      const pBucket = productAgg.get(it.product_id)!;
      pBucket.count += 1;
      pBucket.revenue = pBucket.revenue.plus(it.taxable_amount.toString());
      pBucket.volume = pBucket.volume.plus(it.qty_kg.toString());
    }
  }

  // Include legacy sales in product/customer aggregation if relevant
  for (const leg of legacyMovements) {
    if (!productAgg.has(leg.product_id)) {
      productAgg.set(leg.product_id, {
        code: leg.product.code,
        name: leg.product.name,
        revenue: new Decimal(0),
        volume: new Decimal(0),
        count: 0,
      });
    }
    const pBucket = productAgg.get(leg.product_id)!;
    pBucket.volume = pBucket.volume.plus(leg.qty_kg.toString());
    if (leg.product.std_sale_rate) {
      pBucket.revenue = pBucket.revenue.plus(
        new Decimal(leg.qty_kg.toString()).times(leg.product.std_sale_rate.toString())
      );
    }
  }

  const productIds = Array.from(productAgg.keys());
  const [purchaseLinesInPeriod, productCatalog] = await Promise.all([
    prisma.purchaseInvoiceItem.findMany({
      where: {
        product_id: { in: productIds },
        purchase_invoice: {
          invoice_date: { gte: start, lte: end },
        },
      },
      select: {
        product_id: true,
        taxable_amount: true,
        qty_kg: true,
      },
    }),
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, std_purchase_rate: true },
    }),
  ]);

  const purchaseSpendMap = new Map<string, { spend: Decimal; volume: Decimal }>();
  for (const pl of purchaseLinesInPeriod) {
    if (!purchaseSpendMap.has(pl.product_id)) {
      purchaseSpendMap.set(pl.product_id, { spend: new Decimal(0), volume: new Decimal(0) });
    }
    const b = purchaseSpendMap.get(pl.product_id)!;
    b.spend = b.spend.plus(new Decimal(pl.taxable_amount.toString()));
    b.volume = b.volume.plus(new Decimal(pl.qty_kg.toString()));
  }

  const catalogStdRateMap = new Map<string, number | null>();
  for (const p of productCatalog) {
    catalogStdRateMap.set(p.id, p.std_purchase_rate ? Number(p.std_purchase_rate) : null);
  }

  const topProducts: TopItem[] = Array.from(productAgg.entries())
    .map(([id, val]) => {
      const rev = val.revenue.toNumber();
      const vol = val.volume.toNumber();
      const avgRate = vol > 0 ? Math.round((rev / vol) * 100) / 100 : 0;

      const pBuy = purchaseSpendMap.get(id);
      let purchaseCostPerKg: number | null = null;
      let marginPerKg: number | null = null;
      let marginBasis: "ACTUAL" | "ESTIMATED" | undefined = undefined;

      if (pBuy && pBuy.volume.greaterThan(0)) {
        purchaseCostPerKg = Math.round(pBuy.spend.dividedBy(pBuy.volume).toNumber() * 100) / 100;
        marginPerKg = Math.round((avgRate - purchaseCostPerKg) * 100) / 100;
        marginBasis = "ACTUAL";
      } else {
        const stdRate = catalogStdRateMap.get(id);
        if (stdRate !== undefined && stdRate !== null && stdRate > 0) {
          purchaseCostPerKg = stdRate;
          marginPerKg = Math.round((avgRate - stdRate) * 100) / 100;
          marginBasis = "ESTIMATED";
        }
      }

      return {
        id,
        code: val.code,
        name: val.name,
        revenue: Math.round(rev),
        volumeKg: Math.round(vol),
        invoiceCount: val.count,
        avgRate,
        purchaseCostPerKg,
        marginPerKg,
        marginBasis,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const topCustomers: TopItem[] = Array.from(customerAgg.entries())
    .map(([id, val]) => {
      const rev = val.revenue.toNumber();
      const vol = val.volume.toNumber();
      return {
        id,
        name: val.name,
        revenue: Math.round(rev),
        volumeKg: Math.round(vol),
        invoiceCount: val.count,
        avgRate: vol > 0 ? Math.round((rev / vol) * 100) / 100 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // 5. ABC Pareto Analysis on Products
  const allProductsRanked = Array.from(productAgg.entries())
    .map(([id, val]) => ({
      id,
      code: val.code,
      name: val.name,
      revenue: val.revenue.toNumber(),
      volumeKg: val.volume.toNumber(),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalABCRevenue = allProductsRanked.reduce((s, p) => s + p.revenue, 0);
  let runningRev = 0;
  const abcProducts: AbcProduct[] = allProductsRanked.map((p, idx) => {
    const priorPct = totalABCRevenue > 0 ? (runningRev / totalABCRevenue) * 100 : 0;
    runningRev += p.revenue;
    const cumulativePct = totalABCRevenue > 0 ? (runningRev / totalABCRevenue) * 100 : 100;
    let classification: "A" | "B" | "C" = "C";
    if (idx === 0 || priorPct < 80) classification = "A";
    else if (priorPct < 95) classification = "B";
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      revenue: Math.round(p.revenue),
      volumeKg: Math.round(p.volumeKg),
      cumulativePct: Math.round(cumulativePct * 10) / 10,
      classification,
    };
  });

  // 6. GST Liability Summary
  let gstTaxable = new Decimal(0);
  let gstCgst = new Decimal(0);
  let gstSgst = new Decimal(0);
  let gstIgst = new Decimal(0);
  let gstGrand = new Decimal(0);
  let intrastateTaxable = new Decimal(0);
  let interstateTaxable = new Decimal(0);

  for (const inv of currentInvoices) {
    gstTaxable = gstTaxable.plus(inv.taxable_total.toString());
    gstCgst = gstCgst.plus(inv.cgst_total.toString());
    gstSgst = gstSgst.plus(inv.sgst_total.toString());
    gstIgst = gstIgst.plus(inv.igst_total.toString());
    gstGrand = gstGrand.plus(inv.grand_total.toString());

    // West Bengal is state code 19
    const gstin = inv.customer_gstin_snapshot || inv.customer.gstin || "";
    if (gstin.startsWith("19") || !gstin) {
      intrastateTaxable = intrastateTaxable.plus(inv.taxable_total.toString());
    } else {
      interstateTaxable = interstateTaxable.plus(inv.taxable_total.toString());
    }
  }

  const gstSummary: GstSummary = {
    taxableTotal: Math.round(gstTaxable.toNumber() * 100) / 100,
    cgstTotal: Math.round(gstCgst.toNumber() * 100) / 100,
    sgstTotal: Math.round(gstSgst.toNumber() * 100) / 100,
    igstTotal: Math.round(gstIgst.toNumber() * 100) / 100,
    grandTotal: Math.round(gstGrand.toNumber() * 100) / 100,
    intrastateTaxable: Math.round(intrastateTaxable.toNumber() * 100) / 100,
    interstateTaxable: Math.round(interstateTaxable.toNumber() * 100) / 100,
  };

  // 7. Movement Velocity (Fast moving vs slow/dead stock)
  const allActiveProducts = await prisma.product.findMany({
    where: { is_active: true },
    select: { id: true, code: true, name: true },
  });

  // Calculate closing stock for each active product
  const rawMovements = await prisma.stockMovement.groupBy({
    by: ["product_id", "type"],
    _sum: { qty_kg: true },
  });

  const closingStockMap = new Map<string, Decimal>();
  for (const m of rawMovements) {
    if (!closingStockMap.has(m.product_id)) {
      closingStockMap.set(m.product_id, new Decimal(0));
    }
    const current = closingStockMap.get(m.product_id)!;
    const qty = new Decimal(m._sum.qty_kg?.toString() || 0);
    if (m.type === "OPENING" || m.type === "PURCHASE" || m.type === "ADJUSTMENT") {
      closingStockMap.set(m.product_id, current.plus(qty));
    } else if (m.type === "SALE") {
      closingStockMap.set(m.product_id, current.minus(qty));
    }
  }

  // Fast moving: top 5 by volume in period
  const fastMoving = Array.from(productAgg.entries())
    .map(([id, val]) => ({
      id,
      code: val.code,
      name: val.name,
      volumeKg: Math.round(val.volume.toNumber()),
      closingStock: Math.round(closingStockMap.get(id)?.toNumber() || 0),
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg)
    .slice(0, 5);

  // Slow or Dead: Products with positive closing stock but 0 sales in period
  const activeProductSales = new Set(productAgg.keys());
  const slowOrDead = allActiveProducts
    .filter((p) => {
      const stock = closingStockMap.get(p.id)?.toNumber() || 0;
      return stock > 0 && !activeProductSales.has(p.id);
    })
    .map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      closingStock: Math.round(closingStockMap.get(p.id)?.toNumber() || 0),
      daysSinceLastSale: null,
    }))
    .slice(0, 8);

  // 8. Quality / Data Hygiene
  const [unreviewedProducts, invoicesWithWarnings] = await Promise.all([
    prisma.product.count({ where: { needs_review: true } }),
    prisma.invoice.count({
      where: {
        warnings: { not: Prisma.JsonNull },
      },
    }),
  ]);

  return {
    kpis,
    trend,
    topProducts,
    topCustomers,
    abcProducts,
    gstSummary,
    velocity: {
      fastMoving,
      slowOrDead,
    },
    quality: {
      unreviewedProducts,
      invoicesWithWarnings,
    },
  };
}
