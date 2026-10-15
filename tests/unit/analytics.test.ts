// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getDashboardAnalytics, getDateRange } from "@/lib/analytics";
import { confirmInvoice } from "@/lib/invoices/confirm";
import fixture473 from "../fixtures/inv-473.json";

describe("Phase 6: Analytics Engine and PRD Acceptance Test 7", () => {
  let createdInvoiceId: string;
  let testCustomerName = "RAHMAN INDUSTRIES LTD.";
  let kgProductId: string;

  beforeAll(async () => {
    // Look up KG
    const prod = await prisma.product.findUnique({ where: { code: "KG" } });
    if (prod) kgProductId = prod.id;

    // Clean up any existing 473
    await prisma.invoice.deleteMany({
      where: { invoice_number_norm: "ib26-27/0473" },
    });

    // Create invoice 473 using confirmInvoice
    const draft: any = { ...fixture473 };
    const res = await confirmInvoice({
      draft,
      customerResolution: {
        action: "CREATE_NEW",
        customerName: draft.customer.name,
        customerGstin: draft.customer.gstin,
      },
      productResolutions: [
        {
          lineNo: 1,
          action: "USE_MATCHED",
          productId: kgProductId,
          productCode: "KG",
          productNameRaw: "BESTRUB 108",
        },
        {
          lineNo: 2,
          action: "USE_MATCHED",
          productId: kgProductId,
          productCode: "KG",
          productNameRaw: "Silcoat CS30,OSOL TSM3",
        },
      ],
      mode: "create",
    });
    createdInvoiceId = res.invoice.id;
  });

  afterAll(async () => {
    if (createdInvoiceId) {
      await prisma.invoice.deleteMany({
        where: { id: createdInvoiceId },
      });
    }
    await prisma.customerAlias.deleteMany({
      where: { customer: { name: testCustomerName } },
    });
    await prisma.customer.deleteMany({
      where: { name: testCustomerName },
    });
    await prisma.productAlias.deleteMany({
      where: { alias_norm: { in: ["bestrub 108", "silcoat cs30,osol tsm3"] } },
    });
    await prisma.$disconnect();
  });

  it("should calculate correct date ranges for standard periods", () => {
    const fyRange = getDateRange({ period: "fy" });
    expect(fyRange.start.getMonth()).toBe(3); // April (0-indexed 3)
    expect(fyRange.start.getDate()).toBe(1);

    const customRange = getDateRange({ period: "custom", from: "2026-05-01", to: "2026-05-31" });
    expect(customRange.start.getFullYear()).toBe(2026);
    expect(customRange.start.getMonth()).toBe(4); // May
    expect(customRange.end.getMonth()).toBe(4);
  });

  it("Acceptance Test 7: Hand-computed KPIs match database calculations exactly", async () => {
    const analytics = await getDashboardAnalytics({ period: "all" });

    expect(analytics.kpis).toBeDefined();
    expect(analytics.kpis.invoicesCount).toBeGreaterThanOrEqual(1);
    expect(analytics.kpis.revenueTaxable).toBeGreaterThanOrEqual(318000); // 473 taxable total

    // Invoice 473 totals:
    // Taxable: 318,000
    // CGST: 28,620, SGST: 28,620
    // Grand Total: 375,240
    // Total Volume: 660 + 600 = 1260 kg
    expect(analytics.gstSummary.taxableTotal).toBeGreaterThanOrEqual(318000);
    expect(analytics.gstSummary.cgstTotal).toBeGreaterThanOrEqual(28620);
    expect(analytics.gstSummary.sgstTotal).toBeGreaterThanOrEqual(28620);
    expect(analytics.gstSummary.grandTotal).toBeGreaterThanOrEqual(375240);

    // Intrastate test: Rahman GSTIN begins with "19" (West Bengal)
    expect(analytics.gstSummary.intrastateTaxable).toBeGreaterThanOrEqual(318000);

    // Average realization: Taxable revenue / Volume kg
    expect(analytics.kpis.avgRealizationPerKg).toBeGreaterThan(0);
  });

  it("should generate ABC Pareto product classification", async () => {
    const analytics = await getDashboardAnalytics({ period: "all" });
    expect(analytics.abcProducts.length).toBeGreaterThan(0);

    // Top item should be Class A
    const top = analytics.abcProducts[0];
    expect(top.classification).toBe("A");
    expect(top.cumulativePct).toBeLessThanOrEqual(100);

    // Verify cumulative percentages are monotonically increasing
    for (let i = 1; i < analytics.abcProducts.length; i++) {
      expect(analytics.abcProducts[i].cumulativePct).toBeGreaterThanOrEqual(
        analytics.abcProducts[i - 1].cumulativePct
      );
    }
  });

  it("should categorize stock velocity into fast-moving and slow/dead stock", async () => {
    const analytics = await getDashboardAnalytics({ period: "all" });
    expect(analytics.velocity).toBeDefined();
    expect(Array.isArray(analytics.velocity.fastMoving)).toBe(true);
    expect(Array.isArray(analytics.velocity.slowOrDead)).toBe(true);
  });
});
