import Decimal from "decimal.js";

export interface BillForAllocation {
  id: string;
  invoiceNumber?: string;
  invoiceDate: string | Date;
  grandTotal: number;
  [key: string]: any;
}

export interface AllocatedBill<T = any> {
  bill: T;
  grandTotal: number;
  outstandingAmount: number;
  settledAmount: number;
  status: "OPEN" | "PARTIAL" | "SETTLED";
}

/**
 * Reverse-chronological billwise outstanding allocation.
 * Checks party's latest bill first till the oldest bill:
 * - If remainingDue >= billAmount, the entire bill is pending (status: OPEN).
 * - If 0 < remainingDue < billAmount, bill is partially pending (status: PARTIAL).
 *   outstanding = remainingDue, settled = billAmount - remainingDue.
 * - If remainingDue <= 0, bill is fully settled (status: SETTLED).
 */
export function allocateBillwiseOutstanding<T extends { grandTotal: number; invoiceDate: string | Date }>(
  bills: T[],
  totalDue: number
): (T & { outstandingAmount: number; settledAmount: number; status: "OPEN" | "PARTIAL" | "SETTLED" })[] {
  // Sort reverse-chronologically (newest first)
  const sorted = [...bills].sort((a, b) => {
    const da = new Date(a.invoiceDate).getTime();
    const db = new Date(b.invoiceDate).getTime();
    return db - da;
  });

  let remaining = new Decimal(Math.max(0, totalDue || 0));

  const result = sorted.map((b) => {
    const billAmt = new Decimal(b.grandTotal || 0);

    if (billAmt.lte(0)) {
      return {
        ...b,
        outstandingAmount: 0,
        settledAmount: 0,
        status: "SETTLED" as const,
      };
    }

    if (remaining.gte(billAmt)) {
      remaining = remaining.minus(billAmt);
      return {
        ...b,
        outstandingAmount: billAmt.toNumber(),
        settledAmount: 0,
        status: "OPEN" as const,
      };
    } else if (remaining.gt(0)) {
      const outstanding = remaining.toNumber();
      const settled = billAmt.minus(remaining).toNumber();
      remaining = new Decimal(0);
      return {
        ...b,
        outstandingAmount: Math.round(outstanding * 100) / 100,
        settledAmount: Math.round(settled * 100) / 100,
        status: "PARTIAL" as const,
      };
    } else {
      return {
        ...b,
        outstandingAmount: 0,
        settledAmount: billAmt.toNumber(),
        status: "SETTLED" as const,
      };
    }
  });

  return result;
}
