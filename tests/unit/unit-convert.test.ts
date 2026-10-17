import { describe, it, expect } from "vitest";
import { convertUnitToKg, normalizeUnit } from "@/lib/units/convert";
import { Prisma } from "@prisma/client";

describe("Unit Conversion (FR-PUR-UP-4)", () => {
  it("normalizes common unit variations", () => {
    expect(normalizeUnit("kgs")).toBe("KG");
    expect(normalizeUnit("Kilograms")).toBe("KG");
    expect(normalizeUnit("MT")).toBe("MT");
    expect(normalizeUnit("Metric Ton")).toBe("MT");
    expect(normalizeUnit("Drums")).toBe("DRUM");
    expect(normalizeUnit("bag")).toBe("BAG");
    expect(normalizeUnit("ltrs")).toBe("LTR");
    expect(normalizeUnit("pcs")).toBe("PCS");
  });

  it("converts direct KG quantities without changes", () => {
    const res = convertUnitToKg({
      qtyPrinted: 50,
      unitPrinted: "KG",
      rate: 120,
    });
    expect(res.isConvertible).toBe(true);
    expect(res.needsManualKg).toBe(false);
    expect(res.qtyKg.toNumber()).toBe(50);
    expect(res.ratePerKg.toNumber()).toBe(120);
  });

  it("converts MT to KG by multiplying by 1,000", () => {
    const res = convertUnitToKg({
      qtyPrinted: 2.5,
      unitPrinted: "MT",
      rate: 80000,
    });
    expect(res.isConvertible).toBe(true);
    expect(res.needsManualKg).toBe(false);
    expect(res.qtyKg.toNumber()).toBe(2500);
    expect(res.ratePerKg.toNumber()).toBe(80); // 80,000 / 1,000 = 80 per kg
  });

  it("converts drums to KG using pack size", () => {
    const res = convertUnitToKg({
      qtyPrinted: 3,
      unitPrinted: "DRUM",
      packSizeKg: 220,
      rate: 15400, // rate per drum
    });
    expect(res.isConvertible).toBe(true);
    expect(res.needsManualKg).toBe(false);
    expect(res.qtyKg.toNumber()).toBe(660); // 3 * 220
    expect(res.ratePerKg.toNumber()).toBe(70); // 15400 / 220
  });

  it("allows drum without pack size without blocking saving", () => {
    const res = convertUnitToKg({
      qtyPrinted: 5,
      unitPrinted: "DRUM",
      packSizeKg: null,
      rate: 1000,
    });
    expect(res.isConvertible).toBe(true);
    expect(res.needsManualKg).toBe(false);
    expect(res.qtyKg.toNumber()).toBe(5);
  });

  it("handles non-kg units (pcs, litres, nos) cleanly without blocking", () => {
    const res = convertUnitToKg({
      qtyPrinted: 100,
      unitPrinted: "PCS",
      rate: 50,
    });
    expect(res.isConvertible).toBe(true);
    expect(res.needsManualKg).toBe(false);
    expect(res.qtyKg.toNumber()).toBe(100);
    expect(res.ratePerKg.toNumber()).toBe(50);
  });

  it("accepts manual kg entry for unconvertible units", () => {
    const res = convertUnitToKg({
      qtyPrinted: 100,
      unitPrinted: "LITRES",
      manualQtyKg: 92.5,
      rate: 50,
    });
    expect(res.isConvertible).toBe(true);
    expect(res.needsManualKg).toBe(false);
    expect(res.qtyKg.toNumber()).toBe(92.5);
    // 100 * 50 = 5000 total / 92.5 kg = 54.05 per kg
    expect(res.ratePerKg.toNumber()).toBe(54.05);
  });
});
