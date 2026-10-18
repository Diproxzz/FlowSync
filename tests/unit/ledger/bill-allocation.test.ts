import { describe, it, expect } from "vitest";
import { allocateBillwiseOutstanding } from "@/lib/ledger/billAllocation";

describe("allocateBillwiseOutstanding", () => {
  it("allocates outstanding reverse-chronologically (latest bills first)", () => {
    const bills = [
      { id: "1", invoiceDate: "2026-04-10", grandTotal: 10000 },
      { id: "2", invoiceDate: "2026-05-15", grandTotal: 20000 },
      { id: "3", invoiceDate: "2026-06-20", grandTotal: 15000 },
    ];

    // Total due is 25,000
    // Latest bill (id: 3, 15,000): fully pending -> outstanding 15,000, settled 0, status: OPEN
    // 2nd latest bill (id: 2, 20,000): remaining is 10,000 -> outstanding 10,000, settled 10,000, status: PARTIAL
    // Oldest bill (id: 1, 10,000): remaining is 0 -> outstanding 0, settled 10,000, status: SETTLED
    const allocated = allocateBillwiseOutstanding(bills, 25000);

    expect(allocated).toHaveLength(3);
    // Newest first
    expect(allocated[0].id).toBe("3");
    expect(allocated[0].outstandingAmount).toBe(15000);
    expect(allocated[0].settledAmount).toBe(0);
    expect(allocated[0].status).toBe("OPEN");

    expect(allocated[1].id).toBe("2");
    expect(allocated[1].outstandingAmount).toBe(10000);
    expect(allocated[1].settledAmount).toBe(10000);
    expect(allocated[1].status).toBe("PARTIAL");

    expect(allocated[2].id).toBe("1");
    expect(allocated[2].outstandingAmount).toBe(0);
    expect(allocated[2].settledAmount).toBe(10000);
    expect(allocated[2].status).toBe("SETTLED");

    // Total of outstanding amounts matches totalDue
    const sumOutstanding = allocated.reduce((s, b) => s + b.outstandingAmount, 0);
    expect(sumOutstanding).toBe(25000);
  });

  it("handles user scenario: remaining amount due is 1000 and invoice value is 1500", () => {
    const bills = [
      { id: "1", invoiceDate: "2026-01-01", grandTotal: 1500 },
    ];
    const allocated = allocateBillwiseOutstanding(bills, 1000);
    expect(allocated[0].outstandingAmount).toBe(1000);
    expect(allocated[0].settledAmount).toBe(500);
    expect(allocated[0].status).toBe("PARTIAL");
  });

  it("handles zero total due (all settled)", () => {
    const bills = [
      { id: "1", invoiceDate: "2026-01-01", grandTotal: 5000 },
      { id: "2", invoiceDate: "2026-02-01", grandTotal: 3000 },
    ];
    const allocated = allocateBillwiseOutstanding(bills, 0);
    expect(allocated.every((b) => b.outstandingAmount === 0 && b.status === "SETTLED")).toBe(true);
  });
});
