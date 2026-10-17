import { describe, it, expect } from "vitest";
import { parseMargStatementText } from "@/lib/ledger/parse/marg";
import { validateStatement } from "@/lib/ledger/parse/validate";
import {
  AAQIB_TANNERY_OCR,
  ABDIN_LEATHER_OCR,
  DILSHAD_AHMED_OCR,
  TIGER_INTERNATIONAL_OCR,
} from "../../fixtures/ledger/sample-statements";

describe("Marg Statement Parser & Replay Validation (§2.1 & §3.3)", () => {
  it("parses and validates AAQIB TANNERY statement exactly", () => {
    const stmt = parseMargStatementText(AAQIB_TANNERY_OCR);
    expect(stmt.accountName).toBe("AAQIB TANNERY");
    expect(stmt.openingBalance).toBe(183393);
    expect(stmt.openingSide).toBe("Dr");
    expect(stmt.printedTotals.debit).toBe(591060);
    expect(stmt.printedTotals.credit).toBe(393162);
    expect(stmt.printedTotals.balance).toBe(197898);
    expect(stmt.printedTotals.balanceSide).toBe("Dr");

    // Check count of bills and receipts: 15 bills, 6 receipts
    const bills = stmt.entries.filter((e) => e.entryType === "SALE_INVOICE");
    const receipts = stmt.entries.filter((e) => e.entryType === "RECEIPT");
    expect(bills).toHaveLength(15);
    expect(receipts).toHaveLength(6);

    // Validate running balance replay & totals
    const validation = validateStatement(stmt);
    expect(validation.errors).toEqual([]);
    expect(validation.isValid).toBe(true);
    expect(validation.replayedClosing).toBe(197898);
    expect(validation.replayedSide).toBe("Dr");
    expect(validation.replayedDebitTotal).toBe(591060);
    expect(validation.replayedCreditTotal).toBe(393162);
  });

  it("parses and validates Abdin Leather Conceria statement exactly", () => {
    const stmt = parseMargStatementText(ABDIN_LEATHER_OCR);
    expect(stmt.accountName).toBe("Abdin Leather Conceria Pvt. Ltd");
    expect(stmt.openingBalance).toBe(2160098);
    expect(stmt.openingSide).toBe("Dr");
    expect(stmt.printedTotals.debit).toBe(3065622);
    expect(stmt.printedTotals.credit).toBe(1201592);
    expect(stmt.printedTotals.balance).toBe(1864030);

    const bills = stmt.entries.filter((e) => e.entryType === "SALE_INVOICE");
    const receipts = stmt.entries.filter((e) => e.entryType === "RECEIPT");
    expect(bills).toHaveLength(17);
    expect(receipts).toHaveLength(4);

    const validation = validateStatement(stmt);
    expect(validation.errors).toEqual([]);
    expect(validation.isValid).toBe(true);
    expect(validation.replayedClosing).toBe(1864030);
  });

  it("parses and validates Dilshad Ahmed & Co statement exactly", () => {
    const stmt = parseMargStatementText(DILSHAD_AHMED_OCR);
    expect(stmt.accountName).toBe("Dilshad Ahmed & Co");
    expect(stmt.openingBalance).toBe(800419);
    expect(stmt.printedTotals.debit).toBe(3487773);
    expect(stmt.printedTotals.credit).toBe(2273855);
    expect(stmt.printedTotals.balance).toBe(1213918);

    const bills = stmt.entries.filter((e) => e.entryType === "SALE_INVOICE");
    const receipts = stmt.entries.filter((e) => e.entryType === "RECEIPT");
    expect(bills).toHaveLength(18);
    expect(receipts).toHaveLength(14);

    const validation = validateStatement(stmt);
    expect(validation.errors).toEqual([]);
    expect(validation.isValid).toBe(true);
    expect(validation.replayedClosing).toBe(1213918);
  });

  it("parses and validates TIGER INTERNATIONAL statement exactly", () => {
    const stmt = parseMargStatementText(TIGER_INTERNATIONAL_OCR);
    expect(stmt.accountName).toBe("TIGER INTERNATIONAL");
    expect(stmt.openingBalance).toBe(3018917);
    expect(stmt.printedTotals.debit).toBe(6694485);
    expect(stmt.printedTotals.credit).toBe(2058032);
    expect(stmt.printedTotals.balance).toBe(4636453);

    const bills = stmt.entries.filter((e) => e.entryType === "SALE_INVOICE");
    const receipts = stmt.entries.filter((e) => e.entryType === "RECEIPT");
    expect(bills).toHaveLength(34);
    expect(receipts).toHaveLength(5);

    // Verify continuation stitching, space adjustment, and clean reference list without truncation
    expect(receipts[0].particularsRaw).toBe(
      "Cheque No. : RTGS Ag. *IB25-26/0699, *IB25-26/0700, *IB25-26/0716, *IB25-26/0723, *IB25-26/0756"
    );
    expect(receipts[0].referencedDocs).toEqual([
      "IB25-26/0699",
      "IB25-26/0700",
      "IB25-26/0716",
      "IB25-26/0723",
      "IB25-26/0756",
    ]);
    expect(receipts[0].referencesTruncated).toBe(false);

    const validation = validateStatement(stmt);
    expect(validation.errors).toEqual([]);
    expect(validation.isValid).toBe(true);
    expect(validation.replayedClosing).toBe(4636453);
  });

  it("parses single-sided statement (only debit entries, blank credit total) accurately", () => {
    const aamisText = `
INDOBEST
19/10/2,GOBINDA KHATICK ROAD
KOLKATA-700046
Phone : 8240892993 E-Mail : indobest@gmail.com
Ledger Account : AAMIS IMPEX
01-04-2026 - 16-10-2026 Page No..1
Date Particulars Debit Credit Balance
Aug 18 Bill No. IB26-27/0343 3688.00 3688.00 Dr
Sep 3 Bill No. IB26-27/0386 7375.00 11063.00 Dr
Sep 14 Bill No. IB26-27/0414 18438.00 29501.00 Dr
Total 29501.00 29501.00 Dr
`;
    const stmt = parseMargStatementText(aamisText);
    expect(stmt.accountName).toBe("AAMIS IMPEX");
    expect(stmt.openingBalance).toBe(0);
    expect(stmt.printedTotals.debit).toBe(29501);
    expect(stmt.printedTotals.credit).toBe(0);
    expect(stmt.printedTotals.balance).toBe(29501);
    expect(stmt.printedTotals.balanceSide).toBe("Dr");

    const validation = validateStatement(stmt);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.replayedClosing).toBe(29501);
    expect(validation.replayedSide).toBe("Dr");
  });

  it("fails validation when a tampered amount disturbs running balance or totals", () => {
    const stmt = parseMargStatementText(AAQIB_TANNERY_OCR);
    // Tamper one bill amount
    stmt.entries[0].debit += 1000;

    const validation = validateStatement(stmt);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.errors.some((e) => e.includes("mismatch"))).toBe(true);
  });
});
