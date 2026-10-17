import Decimal from "decimal.js";
import { ExtractedStatement } from "./schema";

export interface StatementValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  replayedClosing: number;
  replayedSide: "Dr" | "Cr";
  replayedDebitTotal: number;
  replayedCreditTotal: number;
}

export function validateStatement(stmt: ExtractedStatement): StatementValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [...(stmt.warnings || [])];

  const periodFrom = new Date(stmt.periodFrom);
  const periodTo = new Date(stmt.periodTo);

  let currentBal = new Decimal(stmt.openingSide === "Dr" ? stmt.openingBalance : -stmt.openingBalance);
  let sumPeriodDebit = new Decimal(0);
  let sumPeriodCredit = new Decimal(0);

  for (let idx = 0; idx < stmt.entries.length; idx++) {
    const e = stmt.entries[idx];
    const rowNum = idx + 1;

    // Check dates in period
    const d = new Date(e.date);
    if (d < periodFrom || d > periodTo) {
      errors.push(`Row ${rowNum}: Entry date ${e.date} is outside statement period [${stmt.periodFrom} to ${stmt.periodTo}]`);
    }

    const deb = new Decimal(e.debit || 0);
    const cred = new Decimal(e.credit || 0);

    // Opening entry handling
    if (e.entryType === "OPENING") {
      // Handled via openingBalance
      continue;
    }

    // Exactly one of debit/credit > 0
    if (deb.lte(0) && cred.lte(0)) {
      errors.push(`Row ${rowNum}: Entry must have either debit > 0 or credit > 0`);
    }
    if (deb.gt(0) && cred.gt(0)) {
      errors.push(`Row ${rowNum}: Entry cannot have both debit > 0 and credit > 0`);
    }

    // Precision check: <= 2 decimal places
    if (deb.decimalPlaces() > 2) {
      errors.push(`Row ${rowNum}: Debit amount ${e.debit} has more than 2 decimal places`);
    }
    if (cred.decimalPlaces() > 2) {
      errors.push(`Row ${rowNum}: Credit amount ${e.credit} has more than 2 decimal places`);
    }

    sumPeriodDebit = sumPeriodDebit.plus(deb);
    sumPeriodCredit = sumPeriodCredit.plus(cred);
    currentBal = currentBal.plus(deb).minus(cred);

    // Replay check against printed balance if present
    if (e.printedBalance !== null && e.printedBalance !== undefined) {
      const expectedPrintedAbs = currentBal.abs().toNumber();
      const expectedSide: "Dr" | "Cr" = currentBal.isNegative() ? "Cr" : "Dr";

      const diff = Math.abs(expectedPrintedAbs - Number(e.printedBalance));
      if (diff > 0.05) {
        errors.push(
          `Row ${rowNum} (${e.date}): Running balance mismatch. Printed: ₹${e.printedBalance} ${e.printedBalanceSide || ""}, Replayed: ₹${expectedPrintedAbs.toFixed(2)} ${expectedSide}`
        );
      } else if (e.printedBalanceSide && e.printedBalanceSide !== expectedSide && expectedPrintedAbs > 0.05) {
        errors.push(
          `Row ${rowNum} (${e.date}): Balance side mismatch. Printed ${e.printedBalanceSide}, Replayed ${expectedSide}`
        );
      }
    }

    // Warnings
    if (e.referencesTruncated) {
      warnings.push(`Row ${rowNum} (${e.date}): Reference bill list was truncated in statement`);
    }
    if (e.entryType === "OTHER") {
      warnings.push(`Row ${rowNum} (${e.date}): Unknown entry label in particulars`);
    }
  }

  // Marg Totals check
  const openingDr = stmt.openingSide === "Dr" ? new Decimal(stmt.openingBalance) : new Decimal(0);
  const openingCr = stmt.openingSide === "Cr" ? new Decimal(stmt.openingBalance) : new Decimal(0);

  const replayedDebitTotal = sumPeriodDebit.plus(openingDr).toNumber();
  const replayedCreditTotal = sumPeriodCredit.plus(openingCr).toNumber();

  const printedDebit = Number(stmt.printedTotals.debit);
  const printedCredit = Number(stmt.printedTotals.credit);

  if (Math.abs(replayedDebitTotal - printedDebit) > 0.05) {
    errors.push(
      `Debit Total mismatch: Printed ₹${printedDebit.toFixed(2)}, Recomputed ₹${replayedDebitTotal.toFixed(2)}`
    );
  }

  if (Math.abs(replayedCreditTotal - printedCredit) > 0.05) {
    errors.push(
      `Credit Total mismatch: Printed ₹${printedCredit.toFixed(2)}, Recomputed ₹${replayedCreditTotal.toFixed(2)}`
    );
  }

  const replayedClosingAbs = currentBal.abs().toNumber();
  const replayedSide: "Dr" | "Cr" = currentBal.isNegative() ? "Cr" : "Dr";

  if (Math.abs(replayedClosingAbs - Number(stmt.printedTotals.balance)) > 0.05) {
    errors.push(
      `Closing Balance mismatch: Printed ₹${stmt.printedTotals.balance.toFixed(2)}, Recomputed ₹${replayedClosingAbs.toFixed(2)}`
    );
  }

  if (stmt.printedTotals.balanceSide && stmt.printedTotals.balanceSide !== replayedSide && replayedClosingAbs > 0.05) {
    errors.push(
      `Closing Balance Side mismatch: Printed ${stmt.printedTotals.balanceSide}, Recomputed ${replayedSide}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    replayedClosing: replayedClosingAbs,
    replayedSide,
    replayedDebitTotal,
    replayedCreditTotal,
  };
}
