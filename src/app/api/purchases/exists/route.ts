import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeInvoiceNumber, normalizeSupplierName } from "@/lib/matching/normalize";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const number = searchParams.get("number")?.trim() || "";
  const supplierId = searchParams.get("supplierId")?.trim() || "";
  const gstin = searchParams.get("gstin")?.trim().toUpperCase() || "";
  const name = searchParams.get("name")?.trim() || "";

  if (!number) {
    return NextResponse.json({ exists: false });
  }

  const numberNorm = normalizeInvoiceNumber(number);

  let existing: any = null;

  if (supplierId) {
    existing = await prisma.purchaseInvoice.findUnique({
      where: {
        supplier_id_invoice_number_norm: {
          supplier_id: supplierId,
          invoice_number_norm: numberNorm,
        },
      },
      include: { supplier: true, items: true },
    });
  } else if (gstin) {
    existing = await prisma.purchaseInvoice.findFirst({
      where: {
        invoice_number_norm: numberNorm,
        supplier: { gstin },
      },
      include: { supplier: true, items: true },
    });
  } else if (name) {
    const nameNorm = normalizeSupplierName(name);
    existing = await prisma.purchaseInvoice.findFirst({
      where: {
        invoice_number_norm: numberNorm,
        supplier: { name_norm: nameNorm },
      },
      include: { supplier: true, items: true },
    });
  }

  if (existing) {
    return NextResponse.json({
      exists: true,
      invoice: {
        id: existing.id,
        invoiceNumber: existing.supplier_invoice_number,
        invoiceDate: existing.invoice_date,
        supplierId: existing.supplier_id,
        supplierName: existing.supplier.name,
        taxableTotal: existing.taxable_total,
        grandTotal: existing.grand_total,
        itemsCount: existing.items.length,
      },
    });
  }

  return NextResponse.json({ exists: false });
}
