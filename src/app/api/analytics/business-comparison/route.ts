export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveClientContext, requireFoundingReadResponse } from "@/lib/auth/session";

interface DateRangeResult {
  start: Date;
  end: Date;
  label: string;
}

function resolveDateRange(
  filterType: "month" | "quarter" | "cy" | "fy",
  value: string
): DateRangeResult {
  const now = new Date();
  const currentYear = now.getFullYear();

  if (filterType === "month") {
    // value expected: "YYYY-MM", e.g. "2026-11"
    const parts = value.split("-");
    const y = parseInt(parts[0], 10) || currentYear;
    const m = parseInt(parts[1], 10) || (now.getMonth() + 1);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const monthName = start.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    return { start, end, label: monthName };
  }

  if (filterType === "quarter") {
    // Supports values like "2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4" (Indian FY quarters)
    // FY Q1: Apr 1 - Jun 30
    // FY Q2: Jul 1 - Sep 30
    // FY Q3: Oct 1 - Dec 31
    // FY Q4: Jan 1 - Mar 31 of next calendar year
    const match = value.match(/(\d{4})-Q([1-4])/i);
    const y = match ? parseInt(match[1], 10) : currentYear;
    const q = match ? parseInt(match[2], 10) : 1;

    let start: Date;
    let end: Date;
    let label = "";

    if (q === 1) {
      start = new Date(Date.UTC(y, 3, 1, 0, 0, 0, 0)); // Apr 1
      end = new Date(Date.UTC(y, 5, 30, 23, 59, 59, 999)); // Jun 30
      label = `Q1 (Apr - Jun ${y})`;
    } else if (q === 2) {
      start = new Date(Date.UTC(y, 6, 1, 0, 0, 0, 0)); // Jul 1
      end = new Date(Date.UTC(y, 8, 30, 23, 59, 59, 999)); // Sep 30
      label = `Q2 (Jul - Sep ${y})`;
    } else if (q === 3) {
      start = new Date(Date.UTC(y, 9, 1, 0, 0, 0, 0)); // Oct 1
      end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)); // Dec 31
      label = `Q3 (Oct - Dec ${y})`;
    } else {
      // Q4: Jan 1 to Mar 31 of y + 1
      start = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0)); // Jan 1
      end = new Date(Date.UTC(y + 1, 2, 31, 23, 59, 59, 999)); // Mar 31
      label = `Q4 (Jan - Mar ${y + 1})`;
    }

    return { start, end, label };
  }

  if (filterType === "cy") {
    // Calendar Year: value expected "YYYY", e.g. "2026"
    const y = parseInt(value, 10) || currentYear;
    const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    return { start, end, label: `CY ${y} (Jan - Dec ${y})` };
  }

  // filterType === "fy" (Indian Financial Year: Apr 1 of start year to Mar 31 of next year)
  // value expected: "2026-27" or "2026"
  let fyStartYear = currentYear;
  if (value) {
    const parts = value.split("-");
    const parsed = parseInt(parts[0], 10);
    if (!isNaN(parsed)) {
      fyStartYear = parsed < 100 ? 2000 + parsed : parsed;
    }
  } else {
    // Default current FY
    const curMonth = now.getMonth() + 1;
    fyStartYear = curMonth >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  }

  const nextYearShort = String((fyStartYear + 1) % 100).padStart(2, "0");
  const start = new Date(Date.UTC(fyStartYear, 3, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(fyStartYear + 1, 2, 31, 23, 59, 59, 999));
  const label = `FY ${fyStartYear}-${nextYearShort} (Apr ${fyStartYear} - Mar ${fyStartYear + 1})`;

  return { start, end, label };
}

export async function GET(request: NextRequest) {
  try {
    const denied = await requireFoundingReadResponse();
    if (denied) return denied;

    const ctx = await getActiveClientContext();
    if (!ctx.isFoundingClient) {
      return NextResponse.json({
        comparison: {
          sold: { amount: 0, taxable: 0, count: 0 },
          spentOnPurchase: { amount: 0, taxable: 0, count: 0 },
          received: { amount: 0, count: 0 },
          netTradingDifference: 0,
          netCashFlow: 0,
          collectionRate: 0,
          grossMarginPct: 0,
          markupPct: 0,
        },
        filter: {
          type: "fy",
          value: "2026-27",
          label: "FY 2026-27",
          start: null,
          end: null,
        },
        options: {
          months: [],
          quarters: [],
          calendarYears: [],
          financialYears: [],
        },
      });
    }

    const { searchParams } = request.nextUrl;
    const filterType = (searchParams.get("filterType") || "fy").toLowerCase() as
      | "month"
      | "quarter"
      | "cy"
      | "fy";
    const valueParam = searchParams.get("value")?.trim() || "";

    // Fallback default values
    let filterValue = valueParam;
    if (!filterValue) {
      if (filterType === "month") filterValue = "2026-11";
      else if (filterType === "quarter") filterValue = "2026-Q3";
      else if (filterType === "cy") filterValue = "2026";
      else filterValue = "2026-27";
    }

    const { start, end, label } = resolveDateRange(filterType, filterValue);

    // 1. Invoiced Sales (Amount Sold)
    const salesAgg = await prisma.invoice.aggregate({
      where: {
        invoice_date: {
          gte: start,
          lte: end,
        },
      },
      _sum: {
        grand_total: true,
        taxable_total: true,
      },
      _count: {
        id: true,
      },
    });

    // 2. Purchases (Amount Spent on Purchase)
    const purchaseAgg = await prisma.purchaseInvoice.aggregate({
      where: {
        invoice_date: {
          gte: start,
          lte: end,
        },
      },
      _sum: {
        grand_total: true,
        taxable_total: true,
      },
      _count: {
        id: true,
      },
    });

    // 3. Customer Payments Received (Amount Received)
    const receivedAgg = await prisma.ledgerEntry.aggregate({
      where: {
        account: {
          account_type: "CUSTOMER",
          is_active: true,
        },
        credit: { gt: 0 },
        is_void: false,
        entry_type: { notIn: ["CREDIT_NOTE", "OPENING"] },
        entry_date: {
          gte: start,
          lte: end,
        },
      },
      _sum: {
        credit: true,
      },
      _count: {
        id: true,
      },
    });

    const soldAmount = Number(salesAgg._sum.grand_total || 0);
    const soldTaxable = Number(salesAgg._sum.taxable_total || 0);
    const soldCount = salesAgg._count.id;

    const purchaseAmount = Number(purchaseAgg._sum.grand_total || 0);
    const purchaseTaxable = Number(purchaseAgg._sum.taxable_total || 0);
    const purchaseCount = purchaseAgg._count.id;

    const receivedAmount = Number(receivedAgg._sum.credit || 0);
    const receivedCount = receivedAgg._count.id;

    const netTradingDifference = soldAmount - purchaseAmount;
    const netCashFlow = receivedAmount - purchaseAmount;
    const collectionRate = soldAmount > 0 ? (receivedAmount / soldAmount) * 100 : 0;
    const grossMarginPct = soldAmount > 0 ? ((soldAmount - purchaseAmount) / soldAmount) * 100 : 0;
    const markupPct = purchaseAmount > 0 ? ((soldAmount - purchaseAmount) / purchaseAmount) * 100 : 0;

    // Available options list
    const monthFormatter = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
    const months = [
      { key: "2026-11", label: monthFormatter.format(new Date(Date.UTC(2026, 10, 1))) },
      { key: "2026-10", label: monthFormatter.format(new Date(Date.UTC(2026, 9, 1))) },
      { key: "2026-09", label: monthFormatter.format(new Date(Date.UTC(2026, 8, 1))) },
      { key: "2026-08", label: monthFormatter.format(new Date(Date.UTC(2026, 7, 1))) },
      { key: "2026-07", label: monthFormatter.format(new Date(Date.UTC(2026, 6, 1))) },
      { key: "2026-06", label: monthFormatter.format(new Date(Date.UTC(2026, 5, 1))) },
      { key: "2026-05", label: monthFormatter.format(new Date(Date.UTC(2026, 4, 1))) },
      { key: "2026-04", label: monthFormatter.format(new Date(Date.UTC(2026, 3, 1))) },
    ];

    const quarters = [
      { key: "2026-Q1", label: "Q1 FY26-27 (Apr - Jun 2026)" },
      { key: "2026-Q2", label: "Q2 FY26-27 (Jul - Sep 2026)" },
      { key: "2026-Q3", label: "Q3 FY26-27 (Oct - Dec 2026)" },
      { key: "2026-Q4", label: "Q4 FY26-27 (Jan - Mar 2027)" },
    ];

    const calendarYears = [
      { key: "2026", label: "CY 2026 (Jan - Dec 2026)" },
      { key: "2025", label: "CY 2025 (Jan - Dec 2025)" },
      { key: "2024", label: "CY 2024 (Jan - Dec 2024)" },
    ];

    const financialYears = [
      { key: "2026-27", label: "FY 2026-27 (Apr 2026 - Mar 2027)" },
      { key: "2025-26", label: "FY 2025-26 (Apr 2025 - Mar 2026)" },
      { key: "2024-25", label: "FY 2024-25 (Apr 2024 - Mar 2025)" },
    ];

    return NextResponse.json({
      success: true,
      filter: {
        type: filterType,
        value: filterValue,
        label,
        start: start.toISOString(),
        end: end.toISOString(),
      },
      comparison: {
        sold: {
          amount: soldAmount,
          taxable: soldTaxable,
          count: soldCount,
        },
        spentOnPurchase: {
          amount: purchaseAmount,
          taxable: purchaseTaxable,
          count: purchaseCount,
        },
        received: {
          amount: receivedAmount,
          count: receivedCount,
        },
        netTradingDifference,
        netCashFlow,
        collectionRate: Math.round(collectionRate * 10) / 10,
        grossMarginPct: Math.round(grossMarginPct * 10) / 10,
        markupPct: Math.round(markupPct * 10) / 10,
      },
      options: {
        months,
        quarters,
        calendarYears,
        financialYears,
      },
    });
  } catch (error: any) {
    console.error("GET /api/analytics/business-comparison error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to generate business comparison" } },
      { status: 500 }
    );
  }
}
