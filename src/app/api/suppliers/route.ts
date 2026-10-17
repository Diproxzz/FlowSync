import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeSupplierName } from "@/lib/matching/normalize";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim() || "";

  const where: Prisma.SupplierWhereInput = {
    is_active: true,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { gstin: { contains: search, mode: "insensitive" } },
            { aliases: { some: { alias: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const suppliers = await prisma.supplier.findMany({
    where,
    include: {
      aliases: true,
      _count: { select: { purchase_invoices: true } },
    },
    orderBy: { name: "asc" },
  });

  // Calculate total spend for each supplier
  const supplierSpendMap = new Map<string, number>();
  if (suppliers.length > 0) {
    const spends = await prisma.purchaseInvoice.groupBy({
      by: ["supplier_id"],
      _sum: { grand_total: true },
      where: { supplier_id: { in: suppliers.map((s) => s.id) } },
    });
    for (const sp of spends) {
      supplierSpendMap.set(sp.supplier_id, Number(sp._sum.grand_total || 0));
    }
  }

  const result = suppliers.map((s) => ({
    ...s,
    total_spend: supplierSpendMap.get(s.id) || 0,
    invoices_count: s._count.purchase_invoices,
  }));

  return NextResponse.json({ suppliers: result });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, gstin, address } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Supplier name is required" } },
        { status: 400 }
      );
    }

    const cleanName = name.trim();
    const name_norm = normalizeSupplierName(cleanName);
    const cleanGstin = gstin ? gstin.trim().toUpperCase() : null;
    const stateCode = cleanGstin && /^\d{2}/.test(cleanGstin) ? cleanGstin.substring(0, 2) : null;

    if (cleanGstin) {
      const existingGstin = await prisma.supplier.findUnique({
        where: { gstin: cleanGstin },
      });
      if (existingGstin) {
        return NextResponse.json(
          {
            error: {
              code: "DUPLICATE_GSTIN",
              message: `Supplier with GSTIN '${cleanGstin}' already exists: ${existingGstin.name}`,
            },
          },
          { status: 409 }
        );
      }
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: cleanName,
        name_norm,
        gstin: cleanGstin,
        address: address?.trim() || null,
        state_code: stateCode,
      },
    });

    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating supplier:", error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: error.message || "Failed to create supplier" } },
      { status: 500 }
    );
  }
}
