import { describe, it, expect } from "vitest";
import {
  computeRunningBalances,
  calculateMargTotals,
} from "@/lib/ledger/balances";

describe("Ledger Balances & Marg Totals (§5.2)", () => {
  it("satisfies Marg convention: Debit total includes Dr opening balance", () => {
    // A H ENTERPRISE: Opening 6,63,181.00 Dr, 0 bills, 3 receipts total 2,62,561.00
    const opening = 663181.0;
    const entries = [
      {
        entry_date: "2026-04-10",
        entry_type: "RECEIPT",
        debit: 0,
        credit: 100000.0,
      },
      {
        entry_date: "2026-06-15",
        entry_type: "RECEIPT",
        debit: 0,
        credit: 100000.0,
      },
      {
        entry_date: "2026-08-20",
        entry_type: "RECEIPT",
        debit: 0,
        credit: 62561.0,
      },
    ];

    const totals = calculateMargTotals(entries, opening);
    expect(totals.openingBalance).toBe(663181.0);
    expect(totals.openingSide).toBe("Dr");
    expect(totals.periodDebit).toBe(0);
    expect(totals.periodCredit).toBe(262561.0);
    expect(totals.totalDebitWithOpening).toBe(663181.0);
    expect(totals.totalCreditWithOpening).toBe(262561.0);
    expect(totals.closingBalance).toBe(400620.0);
    expect(totals.closingSide).toBe("Dr");

    // Invariant: totalDebitWithOpening - totalCreditWithOpening == closing
    expect(totals.totalDebitWithOpening - totals.totalCreditWithOpening).toBe(
      totals.closingBalance
    );
  });

  it("calculates running balances on every row", () => {
    const entries = [
      {
        entry_date: "2026-04-01",
        entry_type: "OPENING",
        debit: 10000,
        credit: 0,
      },
      {
        entry_date: "2026-04-05",
        entry_type: "SALE_INVOICE",
        debit: 5000,
        credit: 0,
      },
      {
        entry_date: "2026-04-10",
        entry_type: "RECEIPT",
        debit: 0,
        credit: 8000,
      },
    ];

    const rows = computeRunningBalances(entries, 0);
    expect(rows).toHaveLength(3);
    expect(rows[0].runningBalance).toBe(10000);
    expect(rows[0].balanceSide).toBe("Dr");
    expect(rows[1].runningBalance).toBe(15000);
    expect(rows[1].balanceSide).toBe("Dr");
    expect(rows[2].runningBalance).toBe(7000);
    expect(rows[2].balanceSide).toBe("Dr");
  });
});
