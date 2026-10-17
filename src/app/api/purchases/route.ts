import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { confirmPurchaseInvoice } from "@/lib/purchases/confirm";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim() || "";
  const supplierId = searchParams.get("supplierId")?.trim();
  const productId = searchParams.get("productId")?.trim();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const financialYear = searchParams.get("financialYear")?.trim();
  const minAmount = searchParams.get("minAmount")?.trim();
  const maxAmount = searchParams.get("maxAmount")?.trim();
  const sortBy = searchParams.get("sortBy")?.trim() || "date";
  const sortOrder = (searchParams.get("sortOrder")?.trim() || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const page = parseInt(searchParams.get("page") || "1", 10);

  const where: Prisma.PurchaseInvoiceWhereInput = {
    AND: [
      supplierId ? { supplier_id: supplierId } : {},
      productId ? { items: { some: { product_id: productId } } } : {},
      financialYear ? { financial_year: financialYear } : {},
      from ? { invoice_date: { gte: new Date(from) } } : {},
      to ? { invoice_date: { lte: new Date(to + "T23:59:59.999Z") } } : {},
      minAmount ? { grand_total: { gte: new Prisma.Decimal(minAmount) } } : {},
      maxAmount ? { grand_total: { lte: new Prisma.Decimal(maxAmount) } } : {},
      search
        ? {
            OR: [
              { supplier_invoice_number: { contains: search, mode: "insensitive" } },
              { supplier_name_snapshot: { contains: search, mode: "insensitive" } },
              { supplier_gstin_snapshot: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  let orderBy: Prisma.PurchaseInvoiceOrderByWithRelationInput = { invoice_date: sortOrder };
  if (sortBy === "number" || sortBy === "invoice_number") {
    orderBy = { supplier_invoice_number: sortOrder };
  } else if (sortBy === "supplier" || sortBy === "supplier_name") {
    orderBy = { supplier_name_snapshot: sortOrder };
  } else if (sortBy === "amount" || sortBy === "grand_total") {
    orderBy = { grand_total: sortOrder };
  } else if (sortBy === "taxable" || sortBy === "taxable_total") {
    orderBy = { taxable_total: sortOrder };
  } else if (sortBy === "date" || sortBy === "invoice_date") {
    orderBy = { invoice_date: sortOrder };
  }

  const [purchases, total] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            gstin: true,
            state_code: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.purchaseInvoice.count({ where }),
  ]);

  return NextResponse.json({
    purchases,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await confirmPurchaseInvoice(body);

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Confirm purchase invoice error:", error);
    if (error.code === "DUPLICATE_INVOICE") {
      return NextResponse.json(
        {
          error: {
            code: "DUPLICATE_INVOICE",
            message: error.message,
            invoiceId: error.invoiceId,
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: error.code || "CONFIRM_FAILED",
          message: error.message || "Failed to confirm purchase invoice",
        },
      },
      { status: 422 }
    );
  }
}
