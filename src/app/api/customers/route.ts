import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeCustomerName } from "@/lib/matching/normalize";
import { Prisma } from "@prisma/client";
import { getActiveClientContext } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const ctx = await getActiveClientContext();
  if (!ctx.isFoundingClient) {
    return NextResponse.json({ customers: [] });
  }

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim() || "";

  const where: Prisma.CustomerWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { gstin: { contains: search, mode: "insensitive" } },
          { aliases: { some: { alias: { contains: search, mode: "insensitive" } } } },
        ],
      }
    : {};

  const customers = await prisma.customer.findMany({
    where,
    include: {
      aliases: true,
      ledger_account: { select: { id: true, display_name: true } },
      _count: { select: { invoices: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ customers });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, gstin, address } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Customer name is required" } },
        { status: 400 }
      );
    }

    const cleanName = name.trim();
    const name_norm = normalizeCustomerName(cleanName);
    const cleanGstin = gstin ? gstin.trim().toUpperCase() : null;

    if (cleanGstin) {
      const existingGstin = await prisma.customer.findUnique({
        where: { gstin: cleanGstin },
      });
      if (existingGstin) {
        return NextResponse.json(
          {
            error: {
              code: "DUPLICATE_GSTIN",
              message: `Customer with GSTIN '${cleanGstin}' already exists: ${existingGstin.name}`,
            },
          },
          { status: 409 }
        );
      }
    }

    const state_code = cleanGstin && cleanGstin.length >= 2 ? cleanGstin.substring(0, 2) : null;

    const customer = await prisma.customer.create({
      data: {
        name: cleanName,
        name_norm,
        gstin: cleanGstin,
        address: address ? address.trim() : null,
        state_code,
      },
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    console.error("Error creating customer:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create customer" } },
      { status: 500 }
    );
  }
}
