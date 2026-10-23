export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getActiveClientContext } from "@/lib/auth/session";
import { ensureProductMasterSynced } from "@/lib/products/sync-master";

export async function GET(request: NextRequest) {
  await ensureProductMasterSynced();

  const ctx = await getActiveClientContext();
  if (!ctx.isFoundingClient) {
    return NextResponse.json({ products: [] });
  }

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim() || "";
  const category = searchParams.get("category")?.trim();
  const activeOnly = searchParams.get("activeOnly") !== "false";

  const where: Prisma.ProductWhereInput = {
    AND: [
      activeOnly ? { is_active: true } : {},
      category ? { category } : {},
      search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
              { aliases: { some: { alias: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {},
    ],
  };

  const products = await prisma.product.findMany({
    where,
    include: {
      aliases: true,
      _count: { select: { invoice_items: true, stock_movements: true } },
    },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({ products });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      code,
      name,
      category,
      default_hsn,
      pack_size_kg,
      std_purchase_rate,
      std_sale_rate,
      reorder_level_kg,
      opening_stock_kg,
    } = body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Product code is required" } },
        { status: 400 }
      );
    }

    const cleanCode = code.trim().toUpperCase();

    const existing = await prisma.product.findUnique({ where: { code: cleanCode } });
    if (existing) {
      return NextResponse.json(
        { error: { code: "DUPLICATE", message: `Product with code '${cleanCode}' already exists` } },
        { status: 409 }
      );
    }

    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          code: cleanCode,
          name: (name && name.trim()) || cleanCode,
          category: category ? category.trim() : null,
          default_hsn: default_hsn ? default_hsn.trim() : null,
          pack_size_kg: pack_size_kg ? new Prisma.Decimal(pack_size_kg) : null,
          std_purchase_rate: std_purchase_rate ? new Prisma.Decimal(std_purchase_rate) : null,
          std_sale_rate: std_sale_rate ? new Prisma.Decimal(std_sale_rate) : null,
          reorder_level_kg: reorder_level_kg ? new Prisma.Decimal(reorder_level_kg) : null,
          source: "MANUAL",
          is_active: true,
        },
      });

      if (opening_stock_kg && Number(opening_stock_kg) > 0) {
        await tx.stockMovement.create({
          data: {
            product_id: p.id,
            type: "OPENING",
            source: "MANUAL",
            qty_kg: new Prisma.Decimal(opening_stock_kg),
            movement_date: new Date("2026-04-01"),
            note: "Manual opening stock entry",
          },
        });
      }

      return p;
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create product" } },
      { status: 500 }
    );
  }
}
