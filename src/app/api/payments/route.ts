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
        payments: [],
        total: 0,
        page: 1,
        totalPages: 0,
        summary: { totalAmount: 0, totalCount: 0, uniquePartiesCount: 0, thisMonthAmount: 0 },
        availableMonths: [],
        parties: [],
      });
    }

    const { searchParams } = request.nextUrl;
    const typeParam = searchParams.get("type")?.toLowerCase() || "credit"; // "credit" | "debit" | "all"
    const search = searchParams.get("search")?.trim() || "";
    const partyId = searchParams.get("partyId")?.trim() || "";
    const accountId = searchParams.get("accountId")?.trim() || "";
    const month = searchParams.get("month")?.trim() || ""; // "YYYY-MM"
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50", 10)), 200);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const skip = (page - 1) * limit;

    const isCredit = typeParam === "credit";
    const isDebit = typeParam === "debit";

    const where: Prisma.LedgerEntryWhereInput = {
      is_void: false,
    };

    const accountWhere: Prisma.LedgerAccountWhereInput = {
      is_active: true,
    };

    if (isCredit) {
      accountWhere.account_type = "CUSTOMER";
      if (partyId) accountWhere.customer_id = partyId;
      where.account = accountWhere;
      where.credit = { gt: 0 };
      where.entry_type = { notIn: ["CREDIT_NOTE", "OPENING"] };
    } else if (isDebit) {
      accountWhere.account_type = "SUPPLIER";
      if (partyId) accountWhere.supplier_id = partyId;
      where.account = accountWhere;
      where.debit = { gt: 0 };
      where.entry_type = { notIn: ["DEBIT_NOTE", "OPENING"] };
    } else {
      where.OR = [
        {
          account: { account_type: "CUSTOMER", is_active: true },
          credit: { gt: 0 },
          entry_type: { notIn: ["CREDIT_NOTE", "OPENING"] },
        },
        {
          account: { account_type: "SUPPLIER", is_active: true },
          debit: { gt: 0 },
          entry_type: { notIn: ["DEBIT_NOTE", "OPENING"] },
        },
      ];
    }

    if (accountId) {
      where.account_id = accountId;
    }

    if (month) {
      const [yearStr, monthStr] = month.split("-");
      const year = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      if (!isNaN(year) && !isNaN(m)) {
        const startOfMonth = new Date(Date.UTC(year, m - 1, 1));
        const endOfMonth = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
        where.entry_date = {
          gte: startOfMonth,
          lte: endOfMonth,
        };
      }
    } else if (fromParam || toParam) {
      where.entry_date = {};
      if (fromParam) {
        const fromDate = new Date(fromParam);
        if (!isNaN(fromDate.getTime())) {
          where.entry_date.gte = fromDate;
        }
      }
      if (toParam) {
        const toDate = new Date(toParam + "T23:59:59.999Z");
        if (!isNaN(toDate.getTime())) {
          where.entry_date.lte = toDate;
        }
      }
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { account: { display_name: { contains: search, mode: "insensitive" } } },
            { particulars_raw: { contains: search, mode: "insensitive" } },
            { instrument_no: { contains: search, mode: "insensitive" } },
            { doc_no: { contains: search, mode: "insensitive" } },
            { narration: { contains: search, mode: "insensitive" } },
          ],
        },
      ];
    }

    // Query entries sorted latest to oldest
    const [entries, totalCount] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        include: {
          account: {
            select: {
              id: true,
              account_type: true,
              display_name: true,
              customer_id: true,
              supplier_id: true,
            },
          },
        },
        orderBy: [{ entry_date: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.ledgerEntry.count({ where }),
    ]);

    // Aggregate total amount
    const sumResult = await prisma.ledgerEntry.aggregate({
      where,
      _sum: {
        credit: true,
        debit: true,
      },
    });

    const totalAmount = isCredit
      ? Number(sumResult._sum?.credit || 0)
      : isDebit
      ? Number(sumResult._sum?.debit || 0)
      : Number(sumResult._sum?.credit || 0) + Number(sumResult._sum?.debit || 0);

    // Calculate this month total
    const now = new Date();
    const firstOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const thisMonthWhere: Prisma.LedgerEntryWhereInput = {
      ...where,
      entry_date: { gte: firstOfCurrentMonth },
    };
    const thisMonthSum = await prisma.ledgerEntry.aggregate({
      where: thisMonthWhere,
      _sum: {
        credit: true,
        debit: true,
      },
    });
    const thisMonthAmount = isCredit
      ? Number(thisMonthSum._sum?.credit || 0)
      : Number(thisMonthSum._sum?.debit || 0);

    // Fetch distinct parties for filter dropdown
    const parties = await prisma.ledgerAccount.findMany({
      where: {
        account_type: isCredit ? "CUSTOMER" : isDebit ? "SUPPLIER" : undefined,
        is_active: true,
      },
      select: {
        id: true,
        display_name: true,
        customer_id: true,
        supplier_id: true,
      },
      orderBy: { display_name: "asc" },
    });

    // Extract all distinct months available in non-void ledger entries
    const distinctDates = await prisma.ledgerEntry.findMany({
      where: {
        account: {
          account_type: isCredit ? "CUSTOMER" : "SUPPLIER",
          is_active: true,
        },
        credit: isCredit ? { gt: 0 } : undefined,
        debit: isDebit ? { gt: 0 } : undefined,
        is_void: false,
        entry_type: { notIn: ["CREDIT_NOTE", "DEBIT_NOTE", "OPENING"] },
      },
      select: { entry_date: true },
      distinct: ["entry_date"],
      orderBy: { entry_date: "desc" },
    });

    const monthSet = new Set<string>();
    for (const d of distinctDates) {
      const iso = d.entry_date.toISOString().slice(0, 7); // YYYY-MM
      monthSet.add(iso);
    }
    const availableMonths = Array.from(monthSet).sort().reverse();

    return NextResponse.json({
      success: true,
      type: typeParam,
      payments: entries.map((e) => {
        const amount = isCredit ? Number(e.credit) : Number(e.debit);
        return {
          id: e.id,
          date: e.entry_date.toISOString(),
          partyName: e.account.display_name,
          partyType: e.account.account_type,
          partyId: e.account.customer_id || e.account.supplier_id || null,
          accountId: e.account.id,
          amount,
          entryType: e.entry_type,
          paymentMode: e.payment_mode,
          instrumentNo: e.instrument_no,
          particulars: e.particulars_raw,
          narration: e.narration,
          docNo: e.doc_no,
        };
      }),
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1,
      summary: {
        totalAmount,
        totalCount,
        thisMonthAmount,
        latestDate: entries.length > 0 ? entries[0].entry_date.toISOString() : null,
      },
      availableMonths,
      parties: parties.map((p) => ({
        id: (isCredit ? p.customer_id : p.supplier_id) || p.id,
        accountId: p.id,
        name: p.display_name,
      })),
    });
  } catch (error: any) {
    console.error("GET /api/payments error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch payments data" } },
      { status: 500 }
    );
  }
}
