export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalize } from "@/lib/matching/normalize";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const aliases = await prisma.productAlias.findMany({
    where: { product_id: id },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json({ aliases });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const alias = String(body.alias || "").trim();

    if (!alias) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Alias cannot be empty" } },
        { status: 400 }
      );
    }

    const alias_norm = normalize(alias);
    if (!alias_norm) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid alias format" } },
        { status: 400 }
      );
    }

    const existing = await prisma.productAlias.findUnique({
      where: { alias_norm },
      include: { product: true },
    });

    if (existing) {
      if (existing.product_id === id) {
        return NextResponse.json({ alias: existing });
      }
      return NextResponse.json(
        {
          error: {
            code: "ALIAS_EXISTS",
            message: `Alias '${alias}' is already mapped to product '${existing.product.code}'`,
          },
        },
        { status: 409 }
      );
    }

    const created = await prisma.productAlias.create({
      data: {
        product_id: id,
        alias,
        alias_norm,
      },
    });

    return NextResponse.json({ alias: created }, { status: 201 });
  } catch (error) {
    console.error("Error creating alias:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create alias" } },
      { status: 500 }
    );
  }
}
