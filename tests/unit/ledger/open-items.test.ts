import { describe, it, expect } from "vitest";
import { calculateOpenItems } from "@/lib/ledger/openItems";

describe("Open Items FIFO Algorithm (§5.4 & Acceptance Test 4)", () => {
  it("reproduces AAQIB TANNERY open items under FIFO to the rupee", () => {
    const entries = [
      { id: "op", entry_date: "2026-04-01", entry_type: "OPENING", debit: 183393, credit: 0 },
      { id: "b11", doc_no: "IB26-27/0011", entry_date: "2026-04-02", entry_type: "SALE_INVOICE", debit: 32285, credit: 0 },
      { id: "b32", doc_no: "IB26-27/0032", entry_date: "2026-04-06", entry_type: "SALE_INVOICE", debit: 64570, credit: 0 },
      { id: "b40", doc_no: "IB26-27/0040", entry_date: "2026-04-10", entry_type: "SALE_INVOICE", debit: 12036, credit: 0 },
      { id: "r1", entry_date: "2026-04-11", entry_type: "RECEIPT", debit: 0, credit: 74599 },
      { id: "b80", doc_no: "IB26-27/0080", entry_date: "2026-04-27", entry_type: "SALE_INVOICE", debit: 25075, credit: 0 },
      { id: "r2", entry_date: "2026-05-05", entry_type: "RECEIPT", debit: 0, credit: 28178 },
      { id: "b123", doc_no: "IB26-27/0123", entry_date: "2026-05-18", entry_type: "SALE_INVOICE", debit: 15045, credit: 0 },
      { id: "b151", doc_no: "IB26-27/0151", entry_date: "2026-05-30", entry_type: "SALE_INVOICE", debit: 10030, credit: 0 },
      { id: "r3", entry_date: "2026-06-09", entry_type: "RECEIPT", debit: 0, credit: 64474 },
      { id: "b193", doc_no: "IB26-27/0193", entry_date: "2026-06-13", entry_type: "SALE_INVOICE", debit: 35683, credit: 0 },
      { id: "b212", doc_no: "IB26-27/0212", entry_date: "2026-06-22", entry_type: "SALE_INVOICE", debit: 15045, credit: 0 },
      { id: "b247", doc_no: "IB26-27/0247", entry_date: "2026-07-02", entry_type: "SALE_INVOICE", debit: 35683, credit: 0 },
      { id: "b289", doc_no: "IB26-27/0289", entry_date: "2026-07-22", entry_type: "SALE_INVOICE", debit: 55743, credit: 0 },
      { id: "r4", entry_date: "2026-08-04", entry_type: "RECEIPT", debit: 0, credit: 16142 },
      { id: "b324", doc_no: "IB26-27/0324", entry_date: "2026-08-11", entry_type: "SALE_INVOICE", debit: 15045, credit: 0 },
      { id: "b392", doc_no: "IB26-27/0392", entry_date: "2026-09-07", entry_type: "SALE_INVOICE", debit: 35683, credit: 0 },
      { id: "r5", entry_date: "2026-09-09", entry_type: "RECEIPT", debit: 0, credit: 133966 },
      { id: "b435", doc_no: "IB26-27/0435", entry_date: "2026-09-25", entry_type: "SALE_INVOICE", debit: 20060, credit: 0 },
      { id: "r6", entry_date: "2026-09-30", entry_type: "RECEIPT", debit: 0, credit: 75803 },
      { id: "b454", doc_no: "IB26-27/0454", entry_date: "2026-10-03", entry_type: "SALE_INVOICE", debit: 17842, credit: 0 },
      { id: "b478", doc_no: "IB26-27/0478", entry_date: "2026-10-12", entry_type: "SALE_INVOICE", debit: 17842, credit: 0 },
    ];

    const res = calculateOpenItems(entries, [], 30, "2026-10-16", true);

    expect(res.closingBalance).toBe(197898);
    expect(res.closingSide).toBe("Dr");
    expect(res.totalOutstanding).toBe(197898);
    expect(res.advance).toBe(0);

    // Filter to items that are still OPEN
    const openBills = res.items.filter((it) => it.status === "OPEN" || it.status === "PART");
    expect(openBills).toHaveLength(7);

    const docNos = openBills.map((it) => it.docNo);
    expect(docNos).toEqual([
      "IB26-27/0247",
      "IB26-27/0289",
      "IB26-27/0324",
      "IB26-27/0392",
      "IB26-27/0435",
      "IB26-27/0454",
      "IB26-27/0478",
    ]);

    const sumOpen = openBills.reduce((acc, it) => acc + it.outstanding, 0);
    expect(sumOpen).toBe(197898);

    // Invariant check: sum(outstanding) - advance == closing balance
    expect(res.totalOutstanding - res.advance).toBe(res.closingBalance);
  });
});
