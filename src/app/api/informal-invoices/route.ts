import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createInformalInvoice } from "@/lib/informal-invoices/service";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const search = searchParams.get("search")?.trim() || "";
    const financialYear = searchParams.get("financialYear")?.trim();
    const customerId = searchParams.get("customerId")?.trim();

    const where: Prisma.InformalInvoiceWhereInput = {
      AND: [
        financialYear ? { financial_year: financialYear } : {},
        customerId ? { customer_id: customerId } : {},
        search
          ? {
              OR: [
                { invoice_number: { contains: search, mode: "insensitive" } },
                { customer_name_snapshot: { contains: search, mode: "insensitive" } },
                {
                  items: {
                    some: {
                      product_name_raw: { contains: search, mode: "insensitive" },
                    },
                  },
                },
              ],
            }
          : {},
      ],
    };

    const [total, invoices, aggregate] = await Promise.all([
      prisma.informalInvoice.count({ where }),
      prisma.informalInvoice.findMany({
        where,
        include: {
          customer: {
            select: { id: true, name: true },
          },
          items: {
            include: {
              product: {
                select: { id: true, code: true, name: true },
              },
            },
            orderBy: { line_no: "asc" },
          },
          ledger_entry: {
            select: { id: true, account_id: true },
          },
        },
        orderBy: [{ invoice_date: "desc" }, { created_at: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.informalInvoice.aggregate({
        where,
        _sum: { total_amount: true },
      }),
    ]);

    const totalValue = aggregate._sum.total_amount ? Number(aggregate._sum.total_amount) : 0;

    return NextResponse.json({
      invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary: {
        totalInvoices: total,
        totalValue,
      },
    });
  } catch (error: any) {
    console.error("GET /api/informal-invoices error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: error.message || "Failed to fetch informal invoices." } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const invoice = await createInformalInvoice(body);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/informal-invoices error:", error);
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: error.message || "Failed to create informal invoice." } },
      { status: 400 }
    );
  }
}
