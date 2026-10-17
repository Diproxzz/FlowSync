import { Prisma } from "@prisma/client";

export interface UnitConversionParams {
  qtyPrinted: number | string | Prisma.Decimal;
  unitPrinted: string;
  packSizeKg?: number | string | Prisma.Decimal | null;
  manualQtyKg?: number | string | Prisma.Decimal | null;
  rate?: number | string | Prisma.Decimal;
}

export interface UnitConversionResult {
  qtyKg: Prisma.Decimal;
  ratePerKg: Prisma.Decimal;
  isConvertible: boolean;
  needsManualKg: boolean;
  convertedToKg: boolean;
  formulaDescription: string;
  unitNormalized: string;
  error?: string;
}

export function normalizeUnit(rawUnit: string): string {
  const u = (rawUnit || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (["KG", "KGS", "KILOGRAM", "KILOGRAMS", "KILOGRAMME", "KILOGRAMMES", "KGM"].includes(u)) return "KG";
  if (["MT", "TON", "TONS", "TONNE", "TONNES", "METRICTON", "METRICTONS", "METRICTONNE", "METRICTONNES", "MTS"].includes(u)) return "MT";
  if (["DRUM", "DRUMS", "DRM", "DRMS"].includes(u)) return "DRUM";
  if (["BAG", "BAGS", "BGS", "BG"].includes(u)) return "BAG";
  if (["CAN", "CANS", "CARBOY", "CARBOYS"].includes(u)) return "CAN";
  if (["PACK", "PACKS", "PKT", "PKTS", "PCK", "PACKAGE", "PACKAGES"].includes(u)) return "PACK";
  if (["L", "LTR", "LTRS", "LITRE", "LITRES", "LT"].includes(u)) return "LTR";
  if (["PCS", "PIECES", "PIECE", "PC"].includes(u)) return "PCS";
  if (["NOS", "NO"].includes(u)) return "NOS";
  if (["BOX", "BOXES", "CTN", "CARTON", "CARTONS"].includes(u)) return "BOX";
  return u || "KG";
}

/**
 * Converts printed unit/qty to kg and computes rate_per_kg.
 */
export function convertUnitToKg(params: UnitConversionParams): UnitConversionResult {
  const qtyPrintedDec = new Prisma.Decimal(params.qtyPrinted || 0);
  const rateDec = new Prisma.Decimal(params.rate || 0);
  const unitNorm = normalizeUnit(params.unitPrinted);

  // If user has provided a manual kg value
  if (params.manualQtyKg !== undefined && params.manualQtyKg !== null && params.manualQtyKg !== "") {
    const manualKgDec = new Prisma.Decimal(params.manualQtyKg);
    if (manualKgDec.greaterThan(0)) {
      const ratePerKg = manualKgDec.isZero()
        ? new Prisma.Decimal(0)
        : qtyPrintedDec.mul(rateDec).div(manualKgDec);

      return {
        qtyKg: manualKgDec,
        ratePerKg: ratePerKg.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        isConvertible: true,
        needsManualKg: false,
        convertedToKg: true,
        formulaDescription: `Manual entry: ${manualKgDec} kg`,
        unitNormalized: unitNorm,
      };
    }
  }

  // 1. Direct KG (already in kg, no conversion needed)
  if (unitNorm === "KG") {
    return {
      qtyKg: qtyPrintedDec,
      ratePerKg: rateDec,
      isConvertible: true,
      needsManualKg: false,
      convertedToKg: false,
      formulaDescription: `${qtyPrintedDec} kg`,
      unitNormalized: unitNorm,
    };
  }

  // 2. Metric Ton (1 MT = 1000 kg)
  if (unitNorm === "MT") {
    const qtyKg = qtyPrintedDec.mul(1000);
    const ratePerKg = rateDec.div(1000);
    return {
      qtyKg,
      ratePerKg: ratePerKg.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      isConvertible: true,
      needsManualKg: false,
      convertedToKg: true,
      formulaDescription: `${qtyPrintedDec} MT × 1,000 kg/MT = ${qtyKg} kg`,
      unitNormalized: unitNorm,
    };
  }

  // 3. Pack-based units with packSizeKg (DRUM, BAG, CAN, PACK)
  if (["DRUM", "BAG", "CAN", "PACK"].includes(unitNorm)) {
    const packSizeDec = params.packSizeKg ? new Prisma.Decimal(params.packSizeKg) : null;
    if (packSizeDec && packSizeDec.greaterThan(0)) {
      const qtyKg = qtyPrintedDec.mul(packSizeDec);
      const ratePerKg = qtyKg.isZero()
        ? new Prisma.Decimal(0)
        : qtyPrintedDec.mul(rateDec).div(qtyKg);

      return {
        qtyKg,
        ratePerKg: ratePerKg.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        isConvertible: true,
        needsManualKg: false,
        convertedToKg: true,
        formulaDescription: `${qtyPrintedDec} ${unitNorm.toLowerCase()}s × ${packSizeDec} kg = ${qtyKg} kg`,
        unitNormalized: unitNorm,
      };
    }
  }

  // 4. Units not converted to KG (PCS, NOS, BOX, LTR, or units without pack size)
  // Do not force conversion or show fake kg values for pieces or non-weight units.
  return {
    qtyKg: qtyPrintedDec,
    ratePerKg: rateDec,
    isConvertible: true,
    needsManualKg: false,
    convertedToKg: false,
    formulaDescription: `${qtyPrintedDec} ${unitNorm}`,
    unitNormalized: unitNorm,
  };
}
