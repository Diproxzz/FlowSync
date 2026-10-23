import Decimal from "decimal.js";

export interface BalanceEntryInput {
  id?: string;
  entry_date: string | Date;
  sort_seq?: number;
  entry_type: string;
  debit: number | string | Decimal;
  credit: number | string | Decimal;
  is_void?: boolean;
}

export interface ComputedBalanceRow {
  entry: any;
  debit: number;
  credit: number;
  runningBalance: number;
  balanceSide: "Dr" | "Cr";
  formattedBalance: string;
}

export interface StatementTotalsResult {
  openingBalance: number;
  openingSide: "Dr" | "Cr";
  periodDebit: number;
  periodCredit: number;
  totalDebitWithOpening: number;
  totalCreditWithOpening: number;
  closingBalance: number;
  closingSide: "Dr" | "Cr";
  isReconciled: boolean;
}

/**
 * Computes running balance for a series of entries.
 * Balance = sum(debit - credit). Positive = Dr, Negative = Cr.
 */
export function computeRunningBalances(
  entries: BalanceEntryInput[],
  initialBalance: number = 0
): ComputedBalanceRow[] {
  let current = new Decimal(initialBalance);
  const rows: ComputedBalanceRow[] = [];

  for (const entry of entries) {
    if (entry.is_void) continue;

    const deb = new Decimal(entry.debit?.toString() || 0);
    const cred = new Decimal(entry.credit?.toString() || 0);

    if (entry.entry_type === "OPENING") {
      // The opening balance entry defines the baseline balance; do not add on top of initialBalance
      current = deb.minus(cred);
    } else {
      current = current.plus(deb).minus(cred);
    }

    const numBal = current.toNumber();
    const side: "Dr" | "Cr" = current.isNegative() ? "Cr" : "Dr";
    const absBal = current.abs().toNumber();

    rows.push({
      entry,
      debit: deb.toNumber(),
      credit: cred.toNumber(),
      runningBalance: numBal,
      balanceSide: side,
      formattedBalance: `${absBal.toFixed(2)} ${side}`,
    });
  }

  return rows;
}

/**
 * Calculates opening balance prior to fromDate.
 */
export function calculatePeriodOpening(
  entries: BalanceEntryInput[],
  fromDate: Date | string
): number {
  const from = new Date(fromDate);
  let bal = new Decimal(0);

  for (const entry of entries) {
    if (entry.is_void) continue;
    const d = new Date(entry.entry_date);
    if (entry.entry_type === "OPENING") {
      // An opening balance entry dated on or before fromDate establishes the period baseline
      if (d <= from) {
        bal = bal.plus(new Decimal(entry.debit?.toString() || 0)).minus(
          new Decimal(entry.credit?.toString() || 0)
        );
      }
    } else if (d < from) {
      bal = bal.plus(new Decimal(entry.debit?.toString() || 0)).minus(
        new Decimal(entry.credit?.toString() || 0)
      );
    }
  }

  return bal.toNumber();
}

/**
 * Computes the statement Totals row:
 * Debit total includes opening when opening is Dr.
 * Credit total includes opening when opening is Cr.
 * Closing = Debit total - Credit total.
 */
export function calculateStatementTotals(
  periodEntries: BalanceEntryInput[],
  openingBalance: number = 0
): StatementTotalsResult {
  let periodDebit = new Decimal(0);
  let periodCredit = new Decimal(0);

  for (const e of periodEntries) {
    if (e.is_void) continue;
    if (e.entry_type === "OPENING") {
      // Opening is passed in openingBalance; ignore OPENING row in period sums to prevent double count
      continue;
    }
    periodDebit = periodDebit.plus(new Decimal(e.debit?.toString() || 0));
    periodCredit = periodCredit.plus(new Decimal(e.credit?.toString() || 0));
  }

  const openingDec = new Decimal(openingBalance);
  const openingDr = openingDec.isPositive() ? openingDec : new Decimal(0);
  const openingCr = openingDec.isNegative() ? openingDec.abs() : new Decimal(0);

  const totalDebitWithOpening = periodDebit.plus(openingDr);
  const totalCreditWithOpening = periodCredit.plus(openingCr);

  const closingDec = totalDebitWithOpening.minus(totalCreditWithOpening);
  const closingNum = closingDec.toNumber();
  const closingSide: "Dr" | "Cr" = closingDec.isNegative() ? "Cr" : "Dr";

  return {
    openingBalance: Math.abs(openingDec.toNumber()),
    openingSide: openingDec.isNegative() ? "Cr" : "Dr",
    periodDebit: periodDebit.toNumber(),
    periodCredit: periodCredit.toNumber(),
    totalDebitWithOpening: totalDebitWithOpening.toNumber(),
    totalCreditWithOpening: totalCreditWithOpening.toNumber(),
    closingBalance: Math.abs(closingNum),
    closingSide,
    isReconciled: true,
  };
}
