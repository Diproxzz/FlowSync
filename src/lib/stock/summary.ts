import { prisma } from "@/lib/db";
import { Decimal } from "decimal.js";

export interface StockSummaryRow {
  productId: string;
  code: string;
  name: string;
  category: string | null;
  opening: number;
  purchases: number;
  purchasesFromInvoices: number;
  purchasesFromLegacy: number;
  sales: number;
  adjustments: number;
  closing: number;
  packSizeKg: number | null;
  drums: number;
  purchaseRate: number | null;
  landingCost: number | null;
  saleRate: number | null;
  lastPurchaseRate: number | null;
  lastPurchaseDate: string | null;
  lastPurchaseSupplier: string | null;
  reorderSuggestionKg: number;
  reorderSuggestionDrums: number;
  stockValue: number;
  salesValue: number;
  reorderLevelKg: number | null;
  status: "LOW STOCK" | "OK";
}

export async function getStockSummary(): Promise<StockSummaryRow[]> {
  const products = await prisma.product.findMany({
    where: { is_active: true },
    include: {
      stock_movements: true,
      purchase_items: {
        include: {
          purchase_invoice: {
            select: {
              invoice_date: true,
              supplier_invoice_number: true,
              supplier: { select: { name: true } },
            },
          },
        },
        orderBy: { purchase_invoice: { invoice_date: "desc" } },
        take: 1,
      },
    },
    orderBy: { code: "asc" },
  });

  return products.map((p) => {
    let opening = new Decimal(0);
    let purchases = new Decimal(0);
    let purchasesFromInvoices = new Decimal(0);
    let purchasesFromLegacy = new Decimal(0);
    let sales = new Decimal(0);
    let adjustments = new Decimal(0);

    for (const sm of p.stock_movements) {
      const q = new Decimal(sm.qty_kg.toString());
      if (sm.type === "OPENING") opening = opening.plus(q);
      else if (sm.type === "PURCHASE") {
        purchases = purchases.plus(q.abs());
        if (sm.source === "PURCHASE_INVOICE") {
          purchasesFromInvoices = purchasesFromInvoices.plus(q.abs());
        } else {
          purchasesFromLegacy = purchasesFromLegacy.plus(q.abs());
        }
      } else if (sm.type === "SALE") sales = sales.plus(q.abs());
      else if (sm.type === "ADJUSTMENT") adjustments = adjustments.plus(q);
    }

    const closing = opening.plus(purchases).minus(sales).minus(adjustments);

    const packSize = p.pack_size_kg ? new Decimal(p.pack_size_kg.toString()) : null;
    const drums = packSize && !packSize.isZero() ? closing.dividedBy(packSize).toNumber() : 0;

    const purchaseRate = p.std_purchase_rate ? new Decimal(p.std_purchase_rate.toString()) : null;
    const landingCost = p.landing_cost ? new Decimal(p.landing_cost.toString()) : null;
    const saleRate = p.std_sale_rate ? new Decimal(p.std_sale_rate.toString()) : null;

    const effectiveRate = landingCost || purchaseRate;
    const stockValue = effectiveRate ? closing.times(effectiveRate).toNumber() : 0;
    const salesValue = saleRate ? sales.times(saleRate).toNumber() : 0;

    const reorderLevel = p.reorder_level_kg ? new Decimal(p.reorder_level_kg.toString()) : null;
    const isLowStock = reorderLevel && !reorderLevel.isZero() && closing.lessThanOrEqualTo(reorderLevel);

    // Last purchase details
    const lastPurchase = p.purchase_items?.[0] || null;
    const lastPurchaseRate = lastPurchase ? new Decimal(lastPurchase.rate_per_kg.toString()).toNumber() : null;
    const lastPurchaseDate = lastPurchase?.purchase_invoice?.invoice_date
      ? lastPurchase.purchase_invoice.invoice_date.toISOString().split("T")[0]
      : null;
    const lastPurchaseSupplier = lastPurchase?.purchase_invoice?.supplier?.name || null;

    // Reorder Suggestion: max(0, reorder_level * 2 - closing) rounded up to pack size
    let reorderSuggestionKg = 0;
    let reorderSuggestionDrums = 0;
    if (reorderLevel && !reorderLevel.isZero()) {
      const targetKg = reorderLevel.times(2).minus(closing);
      if (targetKg.greaterThan(0)) {
        if (packSize && !packSize.isZero()) {
          reorderSuggestionDrums = Math.ceil(targetKg.dividedBy(packSize).toNumber());
          reorderSuggestionKg = new Decimal(reorderSuggestionDrums).times(packSize).toNumber();
        } else {
          reorderSuggestionKg = Math.ceil(targetKg.toNumber());
        }
      }
    }

    return {
      productId: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
      opening: opening.toNumber(),
      purchases: purchases.toNumber(),
      purchasesFromInvoices: purchasesFromInvoices.toNumber(),
      purchasesFromLegacy: purchasesFromLegacy.toNumber(),
      sales: sales.toNumber(),
      adjustments: adjustments.toNumber(),
      closing: closing.toNumber(),
      packSizeKg: packSize ? packSize.toNumber() : null,
      drums: Math.round(drums * 100) / 100,
      purchaseRate: purchaseRate ? purchaseRate.toNumber() : null,
      landingCost: landingCost ? landingCost.toNumber() : null,
      saleRate: saleRate ? saleRate.toNumber() : null,
      lastPurchaseRate,
      lastPurchaseDate,
      lastPurchaseSupplier,
      reorderSuggestionKg,
      reorderSuggestionDrums,
      stockValue: Math.round(stockValue * 100) / 100,
      salesValue: Math.round(salesValue * 100) / 100,
      reorderLevelKg: reorderLevel ? reorderLevel.toNumber() : null,
      status: isLowStock ? "LOW STOCK" : "OK",
    };
  });
}
