import { prisma } from "@/lib/db";
import Decimal from "decimal.js";
import { getDateRange, AnalyticsFilter } from "./index";

export interface ProfitabilityKpis {
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  blendedMarginPct: number;
  blendedMarkupPct: number;
  totalVolumeKg: number;
  avgProfitPerKg: number;
  totalInventoryValuation: number;
  topProfitProduct: { code: string; name: string; profit: number } | null;
  topProfitCustomer: { name: string; profit: number } | null;
  productsWithMarginCount: number;
}

export interface ProductMarginRow {
  productId: string;
  code: string;
  name: string;
  category: string | null;
  soldQtyKg: number;
  totalRevenue: number;
  wasp: number; // Weighted Average Selling Price (₹/kg)
  wapc: number; // Weighted Average Purchase Cost (₹/kg)
  landingCost: number | null;
  stdPurchaseRate: number | null;
  effectiveCost: number;
  costBasis: "LANDING_COST" | "WAPC" | "STD_RATE" | "UNSET";
  unitMargin: number; // WASP - effectiveCost
  marginPct: number; // ((WASP - effectiveCost) / WASP) * 100
  markupPct: number; // ((WASP - effectiveCost) / effectiveCost) * 100
  totalProfit: number;
  closingStockKg: number;
  stockValue: number;
  quadrant: "STAR" | "VOLUME_DRIVER" | "NICHE_PROFITABLE" | "LOW_MARGIN";
  status: "HEALTHY" | "MODERATE" | "LOW" | "NEGATIVE";
}

export interface CustomerProfitabilityRow {
  customerId: string;
  name: string;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  marginPct: number;
  volumeKg: number;
  invoiceCount: number;
  pctOfTotalProfit: number;
}

export interface MonthlyProfitTrendPoint {
  period: string;
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  markupPct: number;
  volumeKg: number;
}

export interface ProfitabilityAnalyticsData {
  kpis: ProfitabilityKpis;
  productMargins: ProductMarginRow[];
  customerProfitability: CustomerProfitabilityRow[];
  monthlyTrend: MonthlyProfitTrendPoint[];
  quadrantSummary: {
    starsCount: number;
    volumeDriversCount: number;
    nicheProfitableCount: number;
    lowMarginCount: number;
  };
}

export async function getProfitabilityAnalytics(
  filter: AnalyticsFilter
): Promise<ProfitabilityAnalyticsData> {
  const { start, end } = getDateRange(filter);

  // 1. Fetch active products with stock movements and all purchases
  const products = await prisma.product.findMany({
    where: { is_active: true },
    include: {
      stock_movements: true,
      purchase_items: {
        include: {
          purchase_invoice: {
            select: { invoice_date: true },
          },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  // Calculate closing stock and all-time WAPC for each product
  const productMetaMap = new Map<
    string,
    {
      closingKg: number;
      wapcAllTime: number;
      effectiveCost: number;
      costBasis: "LANDING_COST" | "WAPC" | "STD_RATE" | "UNSET";
    }
  >();

  for (const p of products) {
    let closing = new Decimal(0);
    for (const sm of p.stock_movements) {
      const q = new Decimal(sm.qty_kg.toString());
      if (sm.type === "OPENING" || sm.type === "PURCHASE" || sm.type === "ADJUSTMENT") {
        closing = closing.plus(q);
      } else if (sm.type === "SALE") {
        closing = closing.minus(q);
      }
    }

    // Calculate WAPC from purchase items
    let totalPurchasedQty = new Decimal(0);
    let totalPurchasedVal = new Decimal(0);
    for (const pi of p.purchase_items) {
      const q = new Decimal(pi.qty_kg.toString());
      const rate = new Decimal(pi.rate_per_kg ? pi.rate_per_kg.toString() : pi.rate.toString());
      totalPurchasedQty = totalPurchasedQty.plus(q);
      totalPurchasedVal = totalPurchasedVal.plus(q.times(rate));
    }

    const wapc = totalPurchasedQty.greaterThan(0)
      ? totalPurchasedVal.dividedBy(totalPurchasedQty).toNumber()
      : p.std_purchase_rate
      ? Number(p.std_purchase_rate)
      : 0;

    // Effective Cost Priority: landing_cost > WAPC > std_purchase_rate
    let effectiveCost = 0;
    let costBasis: "LANDING_COST" | "WAPC" | "STD_RATE" | "UNSET" = "UNSET";

    if (p.landing_cost && Number(p.landing_cost) > 0) {
      effectiveCost = Number(p.landing_cost);
      costBasis = "LANDING_COST";
    } else if (wapc > 0) {
      effectiveCost = wapc;
      costBasis = "WAPC";
    } else if (p.std_purchase_rate && Number(p.std_purchase_rate) > 0) {
      effectiveCost = Number(p.std_purchase_rate);
      costBasis = "STD_RATE";
    }

    productMetaMap.set(p.id, {
      closingKg: closing.toNumber(),
      wapcAllTime: Math.round(wapc * 100) / 100,
      effectiveCost: Math.round(effectiveCost * 100) / 100,
      costBasis,
    });
  }

  // 2. Fetch sales invoice items in the selected period
  const invoiceWhere: any = {
    invoice_date: { gte: start, lte: end },
  };
  if (filter.customerId) {
    invoiceWhere.customer_id = filter.customerId;
  }

  const invoiceItems = await prisma.invoiceItem.findMany({
    where: {
      invoice: invoiceWhere,
      ...(filter.productId ? { product_id: filter.productId } : {}),
    },
    include: {
      invoice: {
        select: {
          id: true,
          invoice_date: true,
          customer_id: true,
          customer: {
            select: { id: true, name: true },
          },
        },
      },
      product: true,
    },
  });

  // Aggregate sales by product
  const productSalesMap = new Map<
    string,
    {
      soldQty: Decimal;
      revenue: Decimal;
    }
  >();

  // Aggregate sales by customer
  const customerSalesMap = new Map<
    string,
    {
      name: string;
      soldQty: Decimal;
      revenue: Decimal;
      cogs: Decimal;
      invoiceIds: Set<string>;
    }
  >();

  // Aggregate monthly trend
  const monthlyTrendMap = new Map<
    string,
    {
      revenue: Decimal;
      cogs: Decimal;
      volumeKg: Decimal;
    }
  >();

  for (const item of invoiceItems) {
    const pId = item.product_id;
    const qty = new Decimal(item.qty_kg.toString());
    const rev = new Decimal(item.taxable_amount.toString());

    const meta = productMetaMap.get(pId) || {
      closingKg: 0,
      wapcAllTime: 0,
      effectiveCost: item.product.landing_cost
        ? Number(item.product.landing_cost)
        : Number(item.product.std_purchase_rate || 0),
      costBasis: "UNSET" as const,
    };

    const itemCogs = qty.times(meta.effectiveCost);

    // Product aggregate
    if (!productSalesMap.has(pId)) {
      productSalesMap.set(pId, { soldQty: new Decimal(0), revenue: new Decimal(0) });
    }
    const pAgg = productSalesMap.get(pId)!;
    pAgg.soldQty = pAgg.soldQty.plus(qty);
    pAgg.revenue = pAgg.revenue.plus(rev);

    // Customer aggregate
    const cId = item.invoice.customer_id;
    const cName = item.invoice.customer.name;
    if (!customerSalesMap.has(cId)) {
      customerSalesMap.set(cId, {
        name: cName,
        soldQty: new Decimal(0),
        revenue: new Decimal(0),
        cogs: new Decimal(0),
        invoiceIds: new Set<string>(),
      });
    }
    const cAgg = customerSalesMap.get(cId)!;
    cAgg.soldQty = cAgg.soldQty.plus(qty);
    cAgg.revenue = cAgg.revenue.plus(rev);
    cAgg.cogs = cAgg.cogs.plus(itemCogs);
    cAgg.invoiceIds.add(item.invoice.id);

    // Monthly trend
    const invDate = new Date(item.invoice.invoice_date);
    const monthKey = invDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    if (!monthlyTrendMap.has(monthKey)) {
      monthlyTrendMap.set(monthKey, {
        revenue: new Decimal(0),
        cogs: new Decimal(0),
        volumeKg: new Decimal(0),
      });
    }
    const mAgg = monthlyTrendMap.get(monthKey)!;
    mAgg.revenue = mAgg.revenue.plus(rev);
    mAgg.cogs = mAgg.cogs.plus(itemCogs);
    mAgg.volumeKg = mAgg.volumeKg.plus(qty);
  }

  // 3. Build Product Margin Rows
  const productRows: ProductMarginRow[] = [];
  let totalSoldVolume = new Decimal(0);
  let totalCompanyRevenue = new Decimal(0);
  let totalCompanyCogs = new Decimal(0);
  let totalInventoryVal = new Decimal(0);

  // Compute total inventory valuation across all products
  for (const p of products) {
    const meta = productMetaMap.get(p.id)!;
    if (meta.closingKg > 0 && meta.effectiveCost > 0) {
      totalInventoryVal = totalInventoryVal.plus(meta.closingKg * meta.effectiveCost);
    }
  }

  // Calculate median volume for quadrant classification
  const volumesList: number[] = [];
  for (const pSales of Array.from(productSalesMap.values())) {
    if (pSales.soldQty.greaterThan(0)) {
      volumesList.push(pSales.soldQty.toNumber());
    }
  }
  volumesList.sort((a, b) => a - b);
  const medianVolume =
    volumesList.length > 0 ? volumesList[Math.floor(volumesList.length / 2)] : 500;

  for (const p of products) {
    const sales = productSalesMap.get(p.id);
    const soldQty = sales ? sales.soldQty.toNumber() : 0;
    const rev = sales ? sales.revenue.toNumber() : 0;

    const meta = productMetaMap.get(p.id)!;
    const wasp = soldQty > 0 ? rev / soldQty : p.std_sale_rate ? Number(p.std_sale_rate) : 0;
    const effectiveCost = meta.effectiveCost;

    const unitMargin = wasp - effectiveCost;
    const marginPct = wasp > 0 ? (unitMargin / wasp) * 100 : 0;
    const markupPct = effectiveCost > 0 ? (unitMargin / effectiveCost) * 100 : 0;
    const totalProfit = soldQty > 0 ? rev - soldQty * effectiveCost : 0;
    const stockVal =
      meta.closingKg > 0 && effectiveCost > 0 ? meta.closingKg * effectiveCost : 0;

    if (soldQty > 0) {
      totalSoldVolume = totalSoldVolume.plus(soldQty);
      totalCompanyRevenue = totalCompanyRevenue.plus(rev);
      totalCompanyCogs = totalCompanyCogs.plus(soldQty * effectiveCost);
    }

    // Quadrant logic
    let quadrant: ProductMarginRow["quadrant"] = "LOW_MARGIN";
    const isHighVolume = soldQty >= medianVolume;
    const isHighMargin = marginPct >= 10;

    if (isHighVolume && isHighMargin) quadrant = "STAR";
    else if (isHighVolume && !isHighMargin) quadrant = "VOLUME_DRIVER";
    else if (!isHighVolume && isHighMargin) quadrant = "NICHE_PROFITABLE";
    else quadrant = "LOW_MARGIN";

    // Health status
    let status: ProductMarginRow["status"] = "MODERATE";
    if (marginPct >= 15) status = "HEALTHY";
    else if (marginPct >= 7) status = "MODERATE";
    else if (marginPct > 0) status = "LOW";
    else status = "NEGATIVE";

    productRows.push({
      productId: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
      soldQtyKg: Math.round(soldQty * 10) / 10,
      totalRevenue: Math.round(rev * 100) / 100,
      wasp: Math.round(wasp * 100) / 100,
      wapc: meta.wapcAllTime,
      landingCost: p.landing_cost ? Number(p.landing_cost) : null,
      stdPurchaseRate: p.std_purchase_rate ? Number(p.std_purchase_rate) : null,
      effectiveCost: meta.effectiveCost,
      costBasis: meta.costBasis,
      unitMargin: Math.round(unitMargin * 100) / 100,
      marginPct: Math.round(marginPct * 10) / 10,
      markupPct: Math.round(markupPct * 10) / 10,
      totalProfit: Math.round(totalProfit * 100) / 100,
      closingStockKg: Math.round(meta.closingKg * 10) / 10,
      stockValue: Math.round(stockVal * 100) / 100,
      quadrant,
      status,
    });
  }

  // Sort by total profit descending
  productRows.sort((a, b) => b.totalProfit - a.totalProfit);

  // 4. Build Customer Profitability Rows
  const customerRows: CustomerProfitabilityRow[] = [];
  const companyProfit = totalCompanyRevenue.minus(totalCompanyCogs).toNumber();

  for (const [cId, cAgg] of Array.from(customerSalesMap.entries())) {
    const rev = cAgg.revenue.toNumber();
    const cogs = cAgg.cogs.toNumber();
    const profit = rev - cogs;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;
    const shareOfProfit = companyProfit > 0 ? (profit / companyProfit) * 100 : 0;

    customerRows.push({
      customerId: cId,
      name: cAgg.name,
      totalRevenue: Math.round(rev * 100) / 100,
      totalCogs: Math.round(cogs * 100) / 100,
      grossProfit: Math.round(profit * 100) / 100,
      marginPct: Math.round(margin * 10) / 10,
      volumeKg: Math.round(cAgg.soldQty.toNumber() * 10) / 10,
      invoiceCount: cAgg.invoiceIds.size,
      pctOfTotalProfit: Math.round(shareOfProfit * 10) / 10,
    });
  }

  customerRows.sort((a, b) => b.grossProfit - a.grossProfit);

  // 5. Build Monthly Trend
  const monthlyTrend: MonthlyProfitTrendPoint[] = Array.from(monthlyTrendMap.entries()).map(
    ([period, val]) => {
      const r = val.revenue.toNumber();
      const c = val.cogs.toNumber();
      const p = r - c;
      const m = r > 0 ? (p / r) * 100 : 0;
      const markup = c > 0 ? (p / c) * 100 : 0;
      return {
        period,
        revenue: Math.round(r * 100) / 100,
        cogs: Math.round(c * 100) / 100,
        profit: Math.round(p * 100) / 100,
        marginPct: Math.round(m * 10) / 10,
        markupPct: Math.round(markup * 10) / 10,
        volumeKg: Math.round(val.volumeKg.toNumber() * 10) / 10,
      };
    }
  );

  // Sort chronological
  monthlyTrend.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());

  // 6. KPIs
  const totalRev = totalCompanyRevenue.toNumber();
  const totalCogs = totalCompanyCogs.toNumber();
  const grossProfit = totalRev - totalCogs;
  const blendedMarginPct = totalRev > 0 ? (grossProfit / totalRev) * 100 : 0;
  const blendedMarkupPct = totalCogs > 0 ? (grossProfit / totalCogs) * 100 : 0;
  const totalVol = totalSoldVolume.toNumber();
  const avgProfitPerKg = totalVol > 0 ? grossProfit / totalVol : 0;

  const topProduct = productRows.length > 0 && productRows[0].totalProfit > 0
    ? { code: productRows[0].code, name: productRows[0].name, profit: productRows[0].totalProfit }
    : null;

  const topCustomer = customerRows.length > 0 && customerRows[0].grossProfit > 0
    ? { name: customerRows[0].name, profit: customerRows[0].grossProfit }
    : null;

  const quadrantSummary = {
    starsCount: productRows.filter((p) => p.quadrant === "STAR").length,
    volumeDriversCount: productRows.filter((p) => p.quadrant === "VOLUME_DRIVER").length,
    nicheProfitableCount: productRows.filter((p) => p.quadrant === "NICHE_PROFITABLE").length,
    lowMarginCount: productRows.filter((p) => p.quadrant === "LOW_MARGIN").length,
  };

  return {
    kpis: {
      totalRevenue: Math.round(totalRev * 100) / 100,
      totalCogs: Math.round(totalCogs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      blendedMarginPct: Math.round(blendedMarginPct * 10) / 10,
      blendedMarkupPct: Math.round(blendedMarkupPct * 10) / 10,
      totalVolumeKg: Math.round(totalVol * 10) / 10,
      avgProfitPerKg: Math.round(avgProfitPerKg * 100) / 100,
      totalInventoryValuation: Math.round(totalInventoryVal.toNumber() * 100) / 100,
      topProfitProduct: topProduct,
      topProfitCustomer: topCustomer,
      productsWithMarginCount: productRows.filter((p) => p.soldQtyKg > 0).length,
    },
    productMargins: productRows,
    customerProfitability: customerRows,
    monthlyTrend,
    quadrantSummary,
  };
}
