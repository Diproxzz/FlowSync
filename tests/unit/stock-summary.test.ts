import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
      where: { type: "OPENING", source: "SEED_OPENING" },
    });
    const totalOpening = openingMovements.reduce(
      (sum, m) => sum + Number(m.qty_kg),
      0
    );
    expect(Math.round(totalOpening * 10) / 10).toBe(66590.3);
  });

  it("should reconcile closing stock with workbook Stock_Summary for benchmark products", async () => {
    const summary = await getStockSummary();
    const map = new Map(summary.map((r) => [r.code, r]));

    // Check KG
    const kg = map.get("KG");
    expect(kg).toBeDefined();
    expect(kg?.opening).toBe(1980);
    expect(kg?.purchases).toBe(5280);
    expect(kg?.sales).toBe(4130);
    expect(kg?.adjustments).toBe(110);
    expect(kg?.closing).toBe(3020);

    // Check AA
    const aa = map.get("AA");
    expect(aa).toBeDefined();
    expect(aa?.opening).toBe(973);
    expect(aa?.purchases).toBe(4800);
    expect(aa?.sales).toBe(2420);
    expect(aa?.adjustments).toBe(120);
    expect(aa?.closing).toBe(3233);

    // Check WAK
    const wak = map.get("WAK");
    expect(wak).toBeDefined();
    expect(wak?.opening).toBe(4713);
    expect(wak?.purchases).toBe(10200);
    expect(wak?.sales).toBe(9452);
    expect(wak?.adjustments).toBe(0);
    expect(wak?.closing).toBe(5461);

    // Check SNA (has negative adjustment -240)
    const sna = map.get("SNA");
    expect(sna).toBeDefined();
    expect(sna?.opening).toBe(6707);
    expect(sna?.purchases).toBe(21000);
    expect(sna?.sales).toBe(19736);
    expect(sna?.adjustments).toBe(-240);
    expect(sna?.closing).toBe(8211);

    // Check SBL (has negative adjustment -384)
    const sbl = map.get("SBL");
    expect(sbl).toBeDefined();
    expect(sbl?.opening).toBe(4800);
    expect(sbl?.purchases).toBe(28200);
    expect(sbl?.sales).toBe(24384);
    expect(sbl?.adjustments).toBe(-384);
    expect(sbl?.closing).toBe(9000);

    // Check TiO2
    const tio2 = map.get("TiO2");
    expect(tio2).toBeDefined();
    expect(tio2?.opening).toBe(4861);
    expect(tio2?.purchases).toBe(4000);
    expect(tio2?.sales).toBe(3325);
    expect(tio2?.adjustments).toBe(0);
    expect(tio2?.closing).toBe(5536);

    // Total closing stock across all 55 products matches workbook Stock_Summary TOTAL (72743 kg)
    const totalClosing = summary.reduce((sum, r) => sum + r.closing, 0);
    expect(Math.round(totalClosing)).toBe(72743);
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
    expect(Number(map.get("KG")?.closing)).toBe(3020);
    expect(Number(map.get("SNA")?.closing)).toBe(8211);
    expect(Number(map.get("SBL")?.closing)).toBe(9000);
  });
});
