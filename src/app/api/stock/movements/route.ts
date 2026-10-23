export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MovementType, Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const productId = searchParams.get("productId");
  const type = searchParams.get("type") as MovementType | null;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = parseInt(searchParams.get("limit") || "100", 10);

  const where: Prisma.StockMovementWhereInput = {
    AND: [
      productId ? { product_id: productId } : {},
      type ? { type } : {},
      from ? { movement_date: { gte: new Date(from) } } : {},
      to ? { movement_date: { lte: new Date(to) } } : {},
    ],
  };

  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      product: { select: { id: true, code: true, name: true, pack_size_kg: true } },
      invoice_item: {
        include: {
          invoice: { select: { id: true, invoice_number: true, invoice_date: true, customer_name_snapshot: true } },
        },
      },
    },
    orderBy: [{ movement_date: "desc" }, { created_at: "desc" }],
    take: Math.min(limit, 500),
  });

  return NextResponse.json({ movements });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, type, qtyKg, movementDate, note, partyText } = body;

    if (!productId || !type || qtyKg === undefined || qtyKg === null) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "productId, type, and qtyKg are required" } },
        { status: 400 }
      );
    }

    if (!["PURCHASE", "ADJUSTMENT"].includes(type)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Manual type must be PURCHASE or ADJUSTMENT" } },
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Product not found" } },
        { status: 404 }
      );
    }

    const qty = new Prisma.Decimal(qtyKg);
    const date = movementDate ? new Date(movementDate) : new Date();

    const movement = await prisma.stockMovement.create({
      data: {
        product_id: productId,
        type: type as MovementType,
        source: "MANUAL",
        qty_kg: qty,
        movement_date: date,
        note: note ? String(note).trim() : null,
        party_text: partyText ? String(partyText).trim() : null,
      },
      include: { product: true },
    });

    return NextResponse.json({ movement }, { status: 201 });
  } catch (error) {
    console.error("Error creating stock movement:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create stock movement" } },
      { status: 500 }
    );
  }
}
