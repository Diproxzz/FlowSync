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
      aliases: true,
      stock_movements: {
        orderBy: { movement_date: "desc" },
        take: 50,
      },
      invoice_items: {
        include: { invoice: { include: { customer: true } } },
        orderBy: { invoice: { invoice_date: "desc" } },
        take: 50,
      },
    },
  });

  if (!product) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Product not found" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ product });
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
      updateData.std_purchase_rate = body.std_purchase_rate !== null ? new Prisma.Decimal(body.std_purchase_rate) : null;
    }
    if (body.std_sale_rate !== undefined) {
      updateData.std_sale_rate = body.std_sale_rate !== null ? new Prisma.Decimal(body.std_sale_rate) : null;
    }
    if (body.reorder_level_kg !== undefined) {
      updateData.reorder_level_kg = body.reorder_level_kg !== null ? new Prisma.Decimal(body.reorder_level_kg) : null;
    }
    if (body.is_active !== undefined) updateData.is_active = Boolean(body.is_active);
    if (body.needs_review !== undefined) updateData.needs_review = Boolean(body.needs_review);

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
