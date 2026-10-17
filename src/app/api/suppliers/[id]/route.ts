import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeSupplierName } from "@/lib/matching/normalize";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      aliases: true,
      purchase_invoices: {
        orderBy: { invoice_date: "desc" },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  pack_size_kg: true,
                  default_hsn: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!supplier) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Supplier not found" } },
      { status: 404 }
    );
  }

  // Check if also a customer
  let alsoCustomer = null;
  if (supplier.gstin) {
    const cust = await prisma.customer.findUnique({
      where: { gstin: supplier.gstin },
      select: { id: true, name: true },
    });
    if (cust) {
      alsoCustomer = cust;
    }
  }

  // Aggregate products bought and rate trends
  const productStatsMap = new Map<string, {
    productId: string;
    productCode: string;
    productName: string;
    totalQtyKg: number;
    totalSpend: number;
    rates: Array<{ date: string; ratePerKg: number; invoiceNumber: string }>;
  }>();

  let totalSpend = 0;
  for (const inv of supplier.purchase_invoices) {
    totalSpend += Number(inv.grand_total || 0);
    const dateStr = inv.invoice_date.toISOString().split("T")[0];

    for (const item of inv.items) {
      if (!productStatsMap.has(item.product_id)) {
        productStatsMap.set(item.product_id, {
          productId: item.product_id,
          productCode: item.product.code,
          productName: item.product.name,
          totalQtyKg: 0,
          totalSpend: 0,
          rates: [],
        });
      }
      const pStat = productStatsMap.get(item.product_id)!;
      pStat.totalQtyKg += Number(item.qty_kg || 0);
      pStat.totalSpend += Number(item.line_total || item.taxable_amount || 0);
      pStat.rates.push({
        date: dateStr,
        ratePerKg: Number(item.rate_per_kg || 0),
        invoiceNumber: inv.supplier_invoice_number,
      });
    }
  }

  const productsBought = Array.from(productStatsMap.values()).map((p) => ({
    ...p,
    latestRatePerKg: p.rates.length > 0 ? p.rates[0].ratePerKg : 0,
    avgRatePerKg: p.totalQtyKg > 0 ? Math.round((p.totalSpend / p.totalQtyKg) * 100) / 100 : 0,
  }));

  return NextResponse.json({
    supplier: {
      ...supplier,
      total_spend: totalSpend,
      alsoCustomer,
      productsBought,
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, gstin, address, is_active } = body;

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Supplier not found" } },
        { status: 404 }
      );
    }

    const cleanName = name ? name.trim() : existing.name;
    const name_norm = normalizeSupplierName(cleanName);
    const cleanGstin = gstin !== undefined ? (gstin ? gstin.trim().toUpperCase() : null) : existing.gstin;
    const stateCode = cleanGstin && /^\d{2}/.test(cleanGstin) ? cleanGstin.substring(0, 2) : existing.state_code;

    if (cleanGstin && cleanGstin !== existing.gstin) {
      const gstinConflict = await prisma.supplier.findUnique({
        where: { gstin: cleanGstin },
      });
      if (gstinConflict && gstinConflict.id !== id) {
        return NextResponse.json(
          {
            error: {
              code: "DUPLICATE_GSTIN",
              message: `Another supplier already has GSTIN '${cleanGstin}': ${gstinConflict.name}`,
            },
          },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name: cleanName,
        name_norm,
        gstin: cleanGstin,
        address: address !== undefined ? (address?.trim() || null) : existing.address,
        state_code: stateCode,
        is_active: is_active !== undefined ? Boolean(is_active) : existing.is_active,
      },
    });

    return NextResponse.json({ supplier: updated });
  } catch (error: any) {
    console.error("Error updating supplier:", error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: error.message || "Failed to update supplier" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const count = await prisma.purchaseInvoice.count({ where: { supplier_id: id } });

    if (count > 0) {
      // Soft-delete by marking inactive
      await prisma.supplier.update({
        where: { id },
        data: { is_active: false },
      });
      return NextResponse.json({ success: true, message: "Supplier marked inactive" });
    }

    // Hard delete if no invoices exist
    await prisma.supplier.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Supplier deleted" });
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: error.message || "Failed to delete supplier" } },
      { status: 500 }
    );
  }
}
