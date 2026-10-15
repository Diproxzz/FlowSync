import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeCustomerName } from "@/lib/matching/normalize";
import { Prisma } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      aliases: true,
      invoices: {
        orderBy: { invoice_date: "desc" },
        take: 50,
      },
    },
  });

  if (!customer) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Customer not found" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ customer });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const updateData: Prisma.CustomerUpdateInput = {};

    if (body.name !== undefined) {
      updateData.name = body.name.trim();
      updateData.name_norm = normalizeCustomerName(body.name);
    }
    if (body.gstin !== undefined) {
      const g = body.gstin ? body.gstin.trim().toUpperCase() : null;
      updateData.gstin = g;
      updateData.state_code = g && g.length >= 2 ? g.substring(0, 2) : null;
    }
    if (body.address !== undefined) {
      updateData.address = body.address ? body.address.trim() : null;
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ customer });
  } catch (error) {
    console.error("Error updating customer:", error);
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: "Failed to update customer" } },
      { status: 500 }
    );
  }
}
