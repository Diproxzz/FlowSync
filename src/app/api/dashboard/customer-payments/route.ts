export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getActiveClientContext, requireFoundingReadResponse } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const denied = await requireFoundingReadResponse();
    if (denied) return denied;

    const ctx = await getActiveClientContext();
    if (!ctx.isFoundingClient) {
      return NextResponse.json({
        summary: {
          totalPeriodAmount: 0,
          payingCustomersCount: 0,
          paymentsCount: 0,
          averagePaymentAmount: 0,
          mostRecentPayment: null,
        },
        customers: [],
        topChartData: [],
        monthlyTrend: [],
        availableMonths: [],
      });
    }

    const { searchParams } = request.nextUrl;
    const month = searchParams.get("month")?.trim() || ""; // "YYYY-MM" or "all"
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const customerId = searchParams.get("customerId")?.trim() || "";

    // 1. Fetch ALL customer payment entries to calculate lifetime payments and last payment date
    const allCustomerReceipts = await prisma.ledgerEntry.findMany({
      where: {
        account: { account_type: "CUSTOMER", is_active: true },
        credit: { gt: 0 },
        is_void: false,
        entry_type: { notIn: ["CREDIT_NOTE", "OPENING"] },
      },
      include: {
        account: {
          select: {
            id: true,
            display_name: true,
            customer_id: true,
          },
        },
      },
      orderBy: [{ entry_date: "desc" }, { id: "desc" }],
    });

    const now = new Date();

    // Group by customer for overall stats and last payment date
    interface CustomerStats {
      customerId: string;
      accountId: string;
      customerName: string;
      amountPaidInPeriod: number;
      paymentsCountInPeriod: number;
      totalLifetimePaid: number;
      lifetimePaymentsCount: number;
      lastPaymentDate: Date | null;
      lastPaymentAmount: number;
      lastPaymentInstrument: string | null;
      daysSinceLastPayment: number | null;
      lastPurchaseDate: Date | null;
      daysSinceLastPurchase: number | null;
      totalAmountDue: number;
    }

    const customerMap = new Map<string, CustomerStats>();

    // 2. Fetch last purchase dates for all customers (from invoices and ledger entries)
    const [customerInvoicesGroup, saleEntries, customerAccounts] = await Promise.all([
      prisma.invoice.groupBy({
        by: ["customer_id"],
        _max: { invoice_date: true },
      }),
      prisma.ledgerEntry.findMany({
        where: {
          account: { account_type: "CUSTOMER", is_active: true },
          entry_type: "SALE_INVOICE",
          is_void: false,
        },
        select: {
          account_id: true,
          account: { select: { customer_id: true } },
          entry_date: true,
        },
      }),
      prisma.ledgerAccount.findMany({
        where: { account_type: "CUSTOMER", is_active: true },
        include: {
          entries: {
            where: { is_void: false },
            select: { debit: true, credit: true },
          },
        },
      }),
    ]);

    const lastPurchaseMap = new Map<string, Date>();
    for (const inv of customerInvoicesGroup) {
      if (inv.customer_id && inv._max.invoice_date) {
        lastPurchaseMap.set(inv.customer_id, new Date(inv._max.invoice_date));
      }
    }
    for (const se of saleEntries) {
      const cId = se.account?.customer_id || se.account_id;
      const ed = new Date(se.entry_date);
      const existing = lastPurchaseMap.get(cId);
      if (!existing || ed > existing) {
        lastPurchaseMap.set(cId, ed);
      }
    }

    // 3. Compute Total Amount Due (closing Dr balance) for each customer
    const dueMap = new Map<string, number>();
    for (const acc of customerAccounts) {
      const cId = acc.customer_id || acc.id;
      let debTotal = 0;
      let credTotal = 0;
      for (const e of acc.entries) {
        debTotal += Number(e.debit);
        credTotal += Number(e.credit);
      }
      const balance = debTotal - credTotal;
      dueMap.set(cId, balance > 0 ? balance : 0);
    }

    // Determine period boundaries
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;

    if (month && month !== "all") {
      const [yearStr, monthStr] = month.split("-");
      const year = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      if (!isNaN(year) && !isNaN(m)) {
        periodStart = new Date(Date.UTC(year, m - 1, 1));
        periodEnd = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
      }
    } else if (fromParam || toParam) {
      if (fromParam) periodStart = new Date(fromParam);
      if (toParam) periodEnd = new Date(toParam + "T23:59:59.999Z");
    }

    // Monthly trend aggregation
    const monthlyTrendMap = new Map<string, { month: string; label: string; amount: number; count: number }>();
    const monthFormatter = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

    for (const r of allCustomerReceipts) {
      const cId = r.account.customer_id || r.account.id;
      const cName = r.account.display_name;
      const amount = Number(r.credit);
      const entryDate = new Date(r.entry_date);

      // Trend data (all time)
      const monthKey = entryDate.toISOString().slice(0, 7); // "YYYY-MM"
      if (!monthlyTrendMap.has(monthKey)) {
        monthlyTrendMap.set(monthKey, {
          month: monthKey,
          label: monthFormatter.format(entryDate),
          amount: 0,
          count: 0,
        });
      }
      const mStat = monthlyTrendMap.get(monthKey)!;
      mStat.amount += amount;
      mStat.count += 1;

      // Initialize customer stat if first time seeing this customer
      if (!customerMap.has(cId)) {
        const daysAgo = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
        const lastPurch = lastPurchaseMap.get(cId) || lastPurchaseMap.get(r.account.id) || null;
        const daysPurch = lastPurch
          ? Math.floor((now.getTime() - lastPurch.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        customerMap.set(cId, {
          customerId: cId,
          accountId: r.account.id,
          customerName: cName,
          amountPaidInPeriod: 0,
          paymentsCountInPeriod: 0,
          totalLifetimePaid: 0,
          lifetimePaymentsCount: 0,
          lastPaymentDate: entryDate,
          lastPaymentAmount: amount,
          lastPaymentInstrument: r.instrument_no
            ? `Cheque/Ref ${r.instrument_no}`
            : r.particulars_raw || null,
          daysSinceLastPayment: daysAgo >= 0 ? daysAgo : 0,
          lastPurchaseDate: lastPurch,
          daysSinceLastPurchase: daysPurch !== null && daysPurch >= 0 ? daysPurch : null,
          totalAmountDue: dueMap.get(cId) ?? dueMap.get(r.account.id) ?? 0,
        });
      }

      const cust = customerMap.get(cId)!;
      cust.totalLifetimePaid += amount;
      cust.lifetimePaymentsCount += 1;

      // Check if entry falls inside selected period
      const inPeriod =
        (!periodStart || entryDate >= periodStart) &&
        (!periodEnd || entryDate <= periodEnd);

      if (inPeriod) {
        cust.amountPaidInPeriod += amount;
        cust.paymentsCountInPeriod += 1;
      }
    }

    // All available months sorted descending
    const availableMonths = Array.from(monthlyTrendMap.keys()).sort().reverse();

    // Sorted monthly trend ascending for chronological chart
    const monthlyTrend = Array.from(monthlyTrendMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    // Convert customer map to array
    let customersList = Array.from(customerMap.values());

    // Apply customerId filter if specified
    if (customerId) {
      customersList = customersList.filter((c) => c.customerId === customerId || c.accountId === customerId);
    }

    // Apply text search if specified
    if (search) {
      customersList = customersList.filter((c) => c.customerName.toLowerCase().includes(search));
    }

    // Filter to customers who paid in the period if period is selected
    // If "all", show customers who paid anytime
    const activeInPeriod = periodStart || periodEnd
      ? customersList.filter((c) => c.amountPaidInPeriod > 0)
      : customersList;

    // Calculate totals for period
    let totalPeriodAmount = 0;
    let totalPaymentsCount = 0;
    for (const c of activeInPeriod) {
      totalPeriodAmount += (periodStart || periodEnd) ? c.amountPaidInPeriod : c.totalLifetimePaid;
      totalPaymentsCount += (periodStart || periodEnd) ? c.paymentsCountInPeriod : c.lifetimePaymentsCount;
    }

    // Top customers for the graphical chart
    const chartList = [...activeInPeriod]
      .sort((a, b) => {
        const amtA = (periodStart || periodEnd) ? a.amountPaidInPeriod : a.totalLifetimePaid;
        const amtB = (periodStart || periodEnd) ? b.amountPaidInPeriod : b.totalLifetimePaid;
        return amtB - amtA;
      })
      .slice(0, 15)
      .map((c) => {
        const amt = (periodStart || periodEnd) ? c.amountPaidInPeriod : c.totalLifetimePaid;
        const percentage = totalPeriodAmount > 0 ? (amt / totalPeriodAmount) * 100 : 0;
        return {
          customerId: c.customerId,
          name: c.customerName,
          amount: amt,
          percentage: Number(percentage.toFixed(1)),
          paymentsCount: (periodStart || periodEnd) ? c.paymentsCountInPeriod : c.lifetimePaymentsCount,
          lastPaymentDate: c.lastPaymentDate ? c.lastPaymentDate.toISOString() : null,
          daysSinceLastPayment: c.daysSinceLastPayment,
        };
      });

    // Most recent payment overall
    const mostRecentEntry = allCustomerReceipts.length > 0 ? allCustomerReceipts[0] : null;
    const mostRecentPayment = mostRecentEntry
      ? {
          customerName: mostRecentEntry.account.display_name,
          amount: Number(mostRecentEntry.credit),
          date: mostRecentEntry.entry_date.toISOString(),
          instrument: mostRecentEntry.instrument_no
            ? `Cheque/Ref ${mostRecentEntry.instrument_no}`
            : mostRecentEntry.particulars_raw || null,
        }
      : null;

    return NextResponse.json({
      success: true,
      period: {
        month: month || "all",
        start: periodStart ? periodStart.toISOString() : null,
        end: periodEnd ? periodEnd.toISOString() : null,
      },
      summary: {
        totalPeriodAmount,
        payingCustomersCount: activeInPeriod.length,
        paymentsCount: totalPaymentsCount,
        averagePaymentAmount: activeInPeriod.length > 0 ? Math.round(totalPeriodAmount / activeInPeriod.length) : 0,
        mostRecentPayment,
      },
      topChartData: chartList,
      monthlyTrend,
      availableMonths,
      customers: customersList.map((c) => ({
        ...c,
        lastPaymentDate: c.lastPaymentDate ? c.lastPaymentDate.toISOString() : null,
        lastPurchaseDate: c.lastPurchaseDate ? c.lastPurchaseDate.toISOString() : null,
        daysSinceLastPurchase: c.daysSinceLastPurchase,
        totalAmountDue: c.totalAmountDue,
        currentPeriodAmount: (periodStart || periodEnd) ? c.amountPaidInPeriod : c.totalLifetimePaid,
        currentPeriodPaymentsCount: (periodStart || periodEnd) ? c.paymentsCountInPeriod : c.lifetimePaymentsCount,
      })),
    });
  } catch (error: any) {
    console.error("GET /api/dashboard/customer-payments error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch customer payments dashboard data" } },
      { status: 500 }
    );
  }
}
