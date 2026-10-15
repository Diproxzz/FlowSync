// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getStockSummary } from "@/lib/stock/summary";

describe("Phase 1: Database Seed and Stock Summary Verification", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should have exactly 55 products", async () => {
    const count = await prisma.product.count({ where: { is_active: true } });
    expect(count).toBe(55);
  });

  it("should have total opening stock matching workbook total (66590.3 kg)", async () => {
    const openingMovements = await prisma.stockMovement.findMany({
      where: { type: "OPENING" },
    });
    const totalOpening = openingMovements.reduce(
      (sum, m) => sum + Number(m.qty_kg),
      0
    );
    expect(Math.round(totalOpening * 10) / 10).toBe(66590.3);
  });

  it("should reconcile opening stock with workbook Stock_Summary for benchmark products", async () => {
    const summary = await getStockSummary();
    const map = new Map(summary.map((r) => [r.code, r]));

    // Check KG
    const kg = map.get("KG");
    expect(kg).toBeDefined();
    expect(kg?.opening).toBe(1980);
    expect(kg?.closing).toBe(1980);

    // Check AA
    const aa = map.get("AA");
    expect(aa).toBeDefined();
    expect(aa?.opening).toBe(973);
    expect(aa?.closing).toBe(973);

    // Check WAK
    const wak = map.get("WAK");
    expect(wak).toBeDefined();
    expect(wak?.opening).toBe(4713);
    expect(wak?.closing).toBe(4713);

    // Check SNA
    const sna = map.get("SNA");
    expect(sna).toBeDefined();
    expect(sna?.opening).toBe(6707);
    expect(sna?.closing).toBe(6707);

    // Check SBL
    const sbl = map.get("SBL");
    expect(sbl).toBeDefined();
    expect(sbl?.opening).toBe(4800);
    expect(sbl?.closing).toBe(4800);

    // Check TiO2
    const tio2 = map.get("TiO2");
    expect(tio2).toBeDefined();
    expect(tio2?.opening).toBe(4861);
    expect(tio2?.closing).toBe(4861);

    // Total closing stock across all 55 products matches opening stock (66590.3 kg)
    const totalClosing = summary.reduce((sum, r) => sum + r.closing, 0);
    expect(Math.round(totalClosing * 10) / 10).toBe(66590.3);
  });

  it("should query the v_stock_summary SQL view and return consistent values", async () => {
    const rows = await prisma.$queryRaw<Array<{
      code: string;
      opening: number;
      purchases: number;
      sales: number;
      adjustments: number;
      closing: number;
    }>>`SELECT code, opening, purchases, sales, adjustments, closing FROM v_stock_summary WHERE code IN ('KG', 'SNA', 'SBL')`;

    const map = new Map(rows.map((r) => [r.code, r]));
    expect(Number(map.get("KG")?.opening)).toBe(1980);
    expect(Number(map.get("SNA")?.opening)).toBe(6707);
    expect(Number(map.get("SBL")?.opening)).toBe(4800);
  });
});
