import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeInvoiceNumber } from "@/lib/matching/normalize";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const number = searchParams.get("number")?.trim();

  if (!number) {
    return NextResponse.json({ exists: false });
  }

  const numberNorm = normalizeInvoiceNumber(number);
  const existing = await prisma.invoice.findUnique({
    where: { invoice_number_norm: numberNorm },
    include: {
      customer: { select: { id: true, name: true, gstin: true } },
      items: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({
    exists: true,
    invoice: {
      id: existing.id,
      invoiceNumber: existing.invoice_number,
      customerName: existing.customer_name_snapshot,
      customerGstin: existing.customer_gstin_snapshot,
      invoiceDate: existing.invoice_date,
      grandTotal: existing.grand_total,
      taxableTotal: existing.taxable_total,
      itemsCount: existing.items.length,
      version: existing.version,
      createdAt: existing.created_at,
    },
    fullExisting: existing,
  });
}
