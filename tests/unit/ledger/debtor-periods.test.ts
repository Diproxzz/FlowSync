import { describe, it, expect } from "vitest";
import { build12MonthSchedule, rollInto12Months } from "@/lib/ledger/debtor-periods";

describe("Debtor List 12-Month Format & Rolling Accumulation", () => {
  it("generates 12 months from November 2025 to October 2026 for asOfMonth = '2026-10'", () => {
    const schedule = build12MonthSchedule("rolling", "2026-10");
    expect(schedule.monthColumns).toHaveLength(12);

    expect(schedule.startKey).toBe("2025-11");
    expect(schedule.endKey).toBe("2026-10");

    const keys = schedule.monthColumns.map((c) => c.key);
    expect(keys).toEqual([
      "2025-11", // Nov 2025 (first month)
      "2025-12", // Dec 2025
      "2026-01", // Jan 2026
      "2026-02", // Feb 2026
      "2026-03", // Mar 2026
      "2026-04", // Apr 2026
      "2026-05", // May 2026
      "2026-06", // Jun 2026
      "2026-07", // Jul 2026
      "2026-08", // Aug 2026
      "2026-09", // Sep 2026
      "2026-10", // Oct 2026 (last month)
    ]);

    expect(schedule.monthColumns[0].isRollupStart).toBe(true);
    expect(schedule.monthColumns[1].isRollupStart).toBe(false);
  });

  it("shifts 12 months from December 2025 to November 2026 for asOfMonth = '2026-11'", () => {
    const schedule = build12MonthSchedule("rolling", "2026-11");
    expect(schedule.monthColumns).toHaveLength(12);

    expect(schedule.startKey).toBe("2025-12");
    expect(schedule.endKey).toBe("2026-11");

    const keys = schedule.monthColumns.map((c) => c.key);
    expect(keys).toEqual([
      "2025-12", // Dec 2025 (first month)
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11", // Nov 2026 (last month)
    ]);
  });

  it("satisfies user requirement: If in Nov 2025 Rs. 100 was due and in Dec 2025 Rs. 200 was due, then in Nov 2026 debtor list shows Rs. 300 due in Dec 2025", () => {
    // 1. In October 2026 (window: Nov 2025 - Oct 2026)
    const octSchedule = build12MonthSchedule("rolling", "2026-10");
    const rawMonthly = {
      "2025-11": 100, // Nov 2025
      "2025-12": 200, // Dec 2025
    };

    const octAmounts = rollInto12Months(rawMonthly, octSchedule.monthColumns);
    expect(octAmounts["2025-11"]).toBe(100);
    expect(octAmounts["2025-12"]).toBe(200);

    // 2. In November 2026 (window: Dec 2025 - Nov 2026)
    // Nov 2025 falls before the window, so its Rs. 100 rolls into Dec 2025 (first month)
    const novSchedule = build12MonthSchedule("rolling", "2026-11");
    const novAmounts = rollInto12Months(rawMonthly, novSchedule.monthColumns);

    // Dec 2025 must show 200 + 100 = 300!
    expect(novAmounts["2025-12"]).toBe(300);

    // Total outstanding remains strictly preserved at 300
    const totalOct = Object.values(octAmounts).reduce((a, b) => a + b, 0);
    const totalNov = Object.values(novAmounts).reduce((a, b) => a + b, 0);
    expect(totalOct).toBe(300);
    expect(totalNov).toBe(300);
  });

  it("handles Financial Year mode for FY 2026-27 (Apr 2026 to Mar 2027) with prior dues rolled into April", () => {
    const fySchedule = build12MonthSchedule("fy", null, "2026-27");
    expect(fySchedule.monthColumns).toHaveLength(12);
    expect(fySchedule.startKey).toBe("2026-04");
    expect(fySchedule.endKey).toBe("2027-03");

    const keys = fySchedule.monthColumns.map((c) => c.key);
    expect(keys).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ]);

    // Raw dues: Opening/prior = 500, Nov 2025 = 100, Dec 2025 = 200, Apr 2026 = 350, Jun 2026 = 400
    const rawMonthly = {
      prior: 500,
      "2025-11": 100,
      "2025-12": 200,
      "2026-04": 350,
      "2026-06": 400,
    };

    const fyAmounts = rollInto12Months(rawMonthly, fySchedule.monthColumns);
    // Apr 2026 gets: 500 + 100 + 200 + 350 = 1150
    expect(fyAmounts["2026-04"]).toBe(1150);
    expect(fyAmounts["2026-06"]).toBe(400);

    const totalRaw = Object.values(rawMonthly).reduce((a, b) => a + b, 0);
    const totalFY = Object.values(fyAmounts).reduce((a, b) => a + b, 0);
    expect(totalFY).toBe(totalRaw);
    expect(totalFY).toBe(1550);
  });
});
