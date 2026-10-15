import { Decimal } from "decimal.js";

export function toDecimal(val: number | string | Decimal | null | undefined): Decimal {
  if (val === null || val === undefined) return new Decimal(0);
  if (val instanceof Decimal) return val;
  try {
    return new Decimal(val);
  } catch {
    return new Decimal(0);
  }
}

export function roundMoney(val: number | string | Decimal): Decimal {
  return toDecimal(val).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function roundQty(val: number | string | Decimal): Decimal {
  return toDecimal(val).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}
