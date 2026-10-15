import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { confirmInvoice } from "@/lib/invoices/confirm";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim() || "";
  const customerId = searchParams.get("customerId")?.trim();
  const productId = searchParams.get("productId")?.trim();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const page = parseInt(searchParams.get("page") || "1", 10);

  const where: Prisma.InvoiceWhereInput = {
    AND: [
      customerId ? { customer_id: customerId } : {},
      productId ? { items: { some: { product_id: productId } } } : {},
      from ? { invoice_date: { gte: new Date(from) } } : {},
      to ? { invoice_date: { lte: new Date(to) } } : {},
      search
        ? {
            OR: [
              { invoice_number: { contains: search, mode: "insensitive" } },
              { customer_name_snapshot: { contains: search, mode: "insensitive" } },
              { customer_gstin_snapshot: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, gstin: true } },
        items: {
          include: { product: { select: { id: true, code: true, name: true } } },
        },
      },
      orderBy: { invoice_date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);

  return NextResponse.json({
    invoices,
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
    const result = await confirmInvoice(body);

    if (body.uploadJobId) {
      await prisma.uploadJob.update({
        where: { id: body.uploadJobId },
        data: {
          status: "SAVED",
          saved_invoice_id: result.invoice.id,
          saved_invoice_num: result.invoice.invoice_number,
        },
      }).catch(() => {});
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Confirm invoice error:", error);
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
          message: error.message || "Failed to confirm invoice",
        },
      },
      { status: 422 }
    );
  }
}
