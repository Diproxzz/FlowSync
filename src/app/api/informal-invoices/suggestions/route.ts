import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type"); // "customer" | "product"
    const query = searchParams.get("q")?.trim() || "";

    if (type === "customer") {
      const customers = await prisma.customer.findMany({
        where: query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { aliases: { some: { alias: { contains: query, mode: "insensitive" } } } },
              ],
            }
          : {},
        include: {
          ledger_account: { select: { id: true } },
          informal_ledger_account: { select: { id: true } },
        },
        orderBy: { name: "asc" },
        take: 20,
      });

      return NextResponse.json({
        suggestions: customers.map((c) => ({
          id: c.id,
          name: c.name,
          hasRegularLedger: Boolean(c.ledger_account),
          hasInformalLedger: Boolean(c.informal_ledger_account),
        })),
      });
    }

    if (type === "product") {
      const products = await prisma.product.findMany({
        where: {
          AND: [
            { is_active: true },
            query
              ? {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { code: { contains: query, mode: "insensitive" } },
                    { aliases: { some: { alias: { contains: query, mode: "insensitive" } } } },
                  ],
                }
              : {},
          ],
        },
        select: {
          id: true,
          code: true,
          name: true,
          category: true,
          std_sale_rate: true,
          pack_size_kg: true,
        },
        orderBy: { name: "asc" },
        take: 25,
      });

      return NextResponse.json({
        suggestions: products.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
          stdSaleRate: p.std_sale_rate ? Number(p.std_sale_rate) : null,
          packSizeKg: p.pack_size_kg ? Number(p.pack_size_kg) : null,
        })),
      });
    }

    return NextResponse.json(
      { error: { code: "INVALID_TYPE", message: "Parameter 'type' must be 'customer' or 'product'." } },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("GET /api/informal-invoices/suggestions error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: error.message || "Failed to fetch suggestions." } },
      { status: 500 }
    );
  }
}
