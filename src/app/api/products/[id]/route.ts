import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      aliases: {
        orderBy: { created_at: "desc" },
      },
      stock_movements: {
        orderBy: { movement_date: "desc" },
      },
      purchase_items: {
        include: {
          purchase_invoice: {
            include: {
              supplier: {
                select: {
                  id: true,
                  name: true,
                  gstin: true,
                },
              },
            },
          },
        },
        orderBy: {
          purchase_invoice: {
            invoice_date: "desc",
          },
        },
      },
      invoice_items: {
        include: {
          invoice: {
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  gstin: true,
                },
              },
            },
          },
        },
        orderBy: {
          invoice: {
            invoice_date: "desc",
          },
        },
      },
    },
  });

  if (!product) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Product not found" } },
      { status: 404 }
    );
  }

  // Calculate rich aggregated analytics for this product
  let openingStock = 0;
  let purchasesQty = 0;
  let salesQty = 0;
  let adjustmentsQty = 0;

  for (const sm of product.stock_movements) {
    const q = Number(sm.qty_kg);
    if (sm.type === "OPENING") openingStock += q;
    else if (sm.type === "PURCHASE") purchasesQty += Math.abs(q);
    else if (sm.type === "SALE") salesQty += Math.abs(q);
    else if (sm.type === "ADJUSTMENT") adjustmentsQty += q;
  }

  const currentStock = openingStock + purchasesQty - salesQty - adjustmentsQty;

  // Purchase stats
  let totalPurchaseValue = 0;
  let totalPurchaseQty = 0;
  let latestPurchase: any = null;

  for (const pi of product.purchase_items) {
    const qty = Number(pi.qty_kg) || 0;
    const rate = Number(pi.rate_per_kg) || Number(pi.rate) || 0;
    const taxable = Number(pi.taxable_amount) || qty * rate;
    totalPurchaseQty += qty;
    totalPurchaseValue += taxable;
    if (!latestPurchase && pi.purchase_invoice) {
      latestPurchase = {
        invoiceDate: pi.purchase_invoice.invoice_date,
        invoiceNumber: pi.purchase_invoice.supplier_invoice_number,
        invoiceId: pi.purchase_invoice.id,
        supplierName: pi.purchase_invoice.supplier?.name || pi.purchase_invoice.supplier_name_snapshot,
        rate: rate,
        qty: qty,
        unit: pi.unit_printed,
      };
    }
  }
  const avgPurchaseRate = totalPurchaseQty > 0 ? totalPurchaseValue / totalPurchaseQty : (Number(product.std_purchase_rate) || 0);

  // Sales stats
  let totalSalesValue = 0;
  let totalSalesQty = 0;
  let latestSale: any = null;

  for (const si of product.invoice_items) {
    const qty = Number(si.qty_kg) || 0;
    const rate = Number(si.rate) || 0;
    const taxable = Number(si.taxable_amount) || qty * rate;
    totalSalesQty += qty;
    totalSalesValue += taxable;
    if (!latestSale && si.invoice) {
      latestSale = {
        invoiceDate: si.invoice.invoice_date,
        invoiceNumber: si.invoice.invoice_number,
        invoiceId: si.invoice.id,
        customerName: si.invoice.customer?.name || si.invoice.customer_name_snapshot,
        rate: rate,
        qty: qty,
      };
    }
  }
  const avgSaleRate = totalSalesQty > 0 ? totalSalesValue / totalSalesQty : (Number(product.std_sale_rate) || 0);

  const packSize = Number(product.pack_size_kg) || null;
  const currentDrums = packSize && packSize > 0 ? currentStock / packSize : 0;

  const stats = {
    currentStock,
    currentDrums,
    openingStock,
    totalPurchaseQty,
    totalPurchaseValue,
    avgPurchaseRate,
    latestPurchase,
    totalSalesQty,
    totalSalesValue,
    avgSaleRate,
    latestSale,
    marginAmount: avgSaleRate - avgPurchaseRate,
    marginPct: avgPurchaseRate > 0 ? ((avgSaleRate - avgPurchaseRate) / avgPurchaseRate) * 100 : 0,
  };

  return NextResponse.json({
    product,
    stats,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const updateData: Prisma.ProductUpdateInput = {};

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.category !== undefined) updateData.category = body.category ? body.category.trim() : null;
    if (body.default_hsn !== undefined) updateData.default_hsn = body.default_hsn ? body.default_hsn.trim() : null;
    if (body.pack_size_kg !== undefined) {
      updateData.pack_size_kg = body.pack_size_kg !== null ? new Prisma.Decimal(body.pack_size_kg) : null;
    }
    if (body.std_purchase_rate !== undefined) {
      updateData.std_purchase_rate = body.std_purchase_rate !== null && body.std_purchase_rate !== "" ? new Prisma.Decimal(body.std_purchase_rate) : null;
    }
    if (body.landing_cost !== undefined) {
      updateData.landing_cost = body.landing_cost !== null && body.landing_cost !== "" ? new Prisma.Decimal(body.landing_cost) : null;
    }
    if (body.std_sale_rate !== undefined) {
      updateData.std_sale_rate = body.std_sale_rate !== null && body.std_sale_rate !== "" ? new Prisma.Decimal(body.std_sale_rate) : null;
    }
    if (body.reorder_level_kg !== undefined) {
      updateData.reorder_level_kg = body.reorder_level_kg !== null && body.reorder_level_kg !== "" ? new Prisma.Decimal(body.reorder_level_kg) : null;
    }
    if (body.is_active !== undefined) updateData.is_active = Boolean(body.is_active);
    if (body.needs_review !== undefined) updateData.needs_review = Boolean(body.needs_review);

    // Update Opening stock movement if provided
    if (body.opening !== undefined || body.opening_kg !== undefined) {
      const rawVal = body.opening !== undefined ? body.opening : body.opening_kg;
      const numVal = rawVal !== null && rawVal !== "" ? Number(rawVal) : 0;
      const existingOpening = await prisma.stockMovement.findFirst({
        where: { product_id: id, type: "OPENING" },
      });
      if (existingOpening) {
        await prisma.stockMovement.update({
          where: { id: existingOpening.id },
          data: { qty_kg: new Prisma.Decimal(numVal) },
        });
      } else if (numVal !== 0) {
        await prisma.stockMovement.create({
          data: {
            product_id: id,
            type: "OPENING",
            source: "MANUAL",
            qty_kg: new Prisma.Decimal(numVal),
            movement_date: new Date("2026-04-01"),
            note: "Opening stock balance",
          },
        });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: "Failed to update product" } },
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
    // Check if product is referenced in invoice items
    const invoiceItemCount = await prisma.invoiceItem.count({ where: { product_id: id } });
    if (invoiceItemCount > 0) {
      // Deactivate instead of hard delete to preserve historical integrity
      await prisma.product.update({
        where: { id },
        data: { is_active: false },
      });
      return NextResponse.json({ message: "Product deactivated (has invoice history)" });
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ message: "Product deleted" });
  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: { code: "DELETE_FAILED", message: "Failed to delete product" } },
      { status: 500 }
    );
  }
}
