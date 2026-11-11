// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getPurchaseAnalytics } from "@/lib/analytics/purchases";
import { getStockSummary } from "@/lib/stock/summary";

describe("Phase 5: Purchase Analytics Engine & Stock Summary Metrics", () => {
  let supplierId: string;
  let productId: string;
  let purchaseInvoiceId: string;
  const testGstin = "19AAACR6862N1ZP";
  const testInvNum = "PUR-TEST-ANALYTICS-01";
  const testProdCode = "TEST_PUR_ANA_01";

  beforeAll(async () => {
    // 1. Ensure supplier
    let supplier = await prisma.supplier.findFirst({
      where: { gstin: testGstin },
    });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: "ANALYTICS RAHMAN VENDOR",
          name_norm: "analytics rahman vendor",
          gstin: testGstin,
          state_code: "19",
        },
      });
    }
    supplierId = supplier.id;

    // 2. Create/ensure isolated synthetic product so live KG invoices do not distort test assertions
    let prod = await prisma.product.findUnique({ where: { code: testProdCode } });
    if (!prod) {
      prod = await prisma.product.create({
        data: {
          code: testProdCode,
          name: "Synthetic Purchase Analytics Chemical",
          reorder_level_kg: 500,
          pack_size_kg: 200,
          std_purchase_rate: 60,
          source: "MANUAL",
          is_active: true,
        },
      });
    }
    productId = prod.id;

    // Clean up test invoice if present
    await prisma.purchaseInvoice.deleteMany({
      where: {
        supplier_id: supplierId,
        invoice_number_norm: testInvNum.toLowerCase(),
      },
    });

    // 3. Create test purchase invoice
    const inv = await prisma.purchaseInvoice.create({
      data: {
        supplier_id: supplierId,
        supplier_name_snapshot: supplier.name,
        supplier_gstin_snapshot: testGstin,
        buyer_gstin_snapshot: "19AAACI1234A1Z5",
        supplier_invoice_number: testInvNum,
        invoice_number_norm: testInvNum.toLowerCase(),
        invoice_date: new Date("2026-10-10"),
        received_date: new Date("2026-10-11"),
        financial_year: "2026-27",
        taxable_total: 100000,
        cgst_total: 9000,
        sgst_total: 9000,
        igst_total: 0,
        other_charges: 0,
        tcs: 0,
        round_off: 0,
        grand_total: 118000,
        source_file_hash: "hash-test-analytics",
        items: {
          create: [
            {
              line_no: 1,
              product_id: productId,
              product_name_raw: "RAW SILICONE EMULSION TEST",
              qty_printed: 1000,
              unit_printed: "KG",
              qty_kg: 1000,
              rate: 100,
              rate_per_kg: 100,
              discount: 0,
              taxable_amount: 100000,
              cgst_pct: 9,
              sgst_pct: 9,
              igst_pct: 0,
              cgst_amount: 9000,
              sgst_amount: 9000,
              igst_amount: 0,
              line_total: 118000,
              movement: {
                create: {
                  product_id: productId,
                  movement_date: new Date("2026-10-10"),
                  type: "PURCHASE",
                  qty_kg: 1000,
                  source: "PURCHASE_INVOICE",
                },
              },
            },
          ],
        },
      },
    });
    purchaseInvoiceId = inv.id;
  });

  afterAll(async () => {
    if (purchaseInvoiceId) {
      await prisma.purchaseInvoice.deleteMany({
        where: { id: purchaseInvoiceId },
      });
    }
    if (productId) {
      await prisma.product.deleteMany({
        where: { id: productId },
      });
    }
    if (supplierId) {
      await prisma.supplier.deleteMany({
        where: { id: supplierId },
      });
    }
    await prisma.$disconnect();
  });

  it("calculates procurement KPIs correctly", async () => {
    const analytics = await getPurchaseAnalytics({ period: "all" });

    expect(analytics.kpis).toBeDefined();
    expect(analytics.kpis.invoicesCount).toBeGreaterThanOrEqual(1);
    expect(analytics.kpis.purchasesTaxable).toBeGreaterThanOrEqual(100000);
    expect(analytics.kpis.volumeKg).toBeGreaterThanOrEqual(1000);
    expect(analytics.topSuppliers.length).toBeGreaterThanOrEqual(1);
  });

  it("populates top products and price trends in purchase analytics", async () => {
    const analytics = await getPurchaseAnalytics({ period: "all", productId });

    const testProduct = analytics.topProducts.find((p) => p.code === testProdCode);
    expect(testProduct).toBeDefined();
    expect(testProduct?.volumeKg).toBe(1000);
    expect(testProduct?.avgRatePerKg).toBe(100);

    expect(analytics.gstInput.cgstTotal).toBe(9000);
    expect(analytics.gstInput.sgstTotal).toBe(9000);
  });

  it("calculates last purchase details and reorder suggestions in stock summary", async () => {
    const summary = await getStockSummary();
    const row = summary.find((r) => r.code === testProdCode);

    expect(row).toBeDefined();
    expect(row?.lastPurchaseRate).toBe(100);
    expect(row?.lastPurchaseDate).toBe("2026-10-10");
    expect(row?.purchasesFromInvoices).toBe(1000);
    expect(row?.closing).toBe(1000);
  });
});
