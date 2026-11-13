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
      return NextResponse.json({ logs: [], total: 0 });
    }

    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search")?.trim() || "";
    const action = searchParams.get("action")?.trim() || "";
    const dateParam = searchParams.get("date")?.trim();
    const fromParam = dateParam || searchParams.get("from")?.trim();
    const toParam = dateParam || searchParams.get("to")?.trim();
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50", 10)), 200);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const skip = (page - 1) * limit;

    const where: Prisma.BusinessLogWhereInput = {
      NOT: [
        { description: { contains: "TEST-", mode: "insensitive" } },
        { description: { contains: "TEST ", mode: "insensitive" } },
      ],
    };

    if (action) {
      where.action = action;
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { action: { contains: search, mode: "insensitive" } },
        { entity_type: { contains: search, mode: "insensitive" } },
      ];
    }

    if (fromParam || toParam) {
      where.created_at = {};
      if (fromParam) {
        const fromStr = fromParam.includes("T") ? fromParam : `${fromParam}T00:00:00+05:30`;
        const fromDate = new Date(fromStr);
        if (!isNaN(fromDate.getTime())) {
          where.created_at.gte = fromDate;
        }
      }
      if (toParam) {
        const toStr = toParam.includes("T") ? toParam : `${toParam}T23:59:59.999+05:30`;
        const toDate = new Date(toStr);
        if (!isNaN(toDate.getTime())) {
          where.created_at.lte = toDate;
        }
      }
    }

    const [logs, total] = await Promise.all([
      prisma.businessLog.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.businessLog.count({ where }),
    ]);

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        description: l.description,
        entityType: l.entity_type,
        entityId: l.entity_id,
        amount: l.amount ? Number(l.amount) : null,
        metadata: l.metadata,
        createdAt: l.created_at.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error: any) {
    console.error("GET /api/logs error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch business activity logs" } },
      { status: 500 }
    );
  }
}
