export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeCustomerName } from "@/lib/matching/normalize";
import { Prisma } from "@prisma/client";
import { getActiveClientContext, requireFoundingWrite } from "@/lib/auth/session";
import { logBusinessActivity } from "@/lib/logs/business-logger";

export async function GET(request: NextRequest) {
  const ctx = await getActiveClientContext();
  if (!ctx.clientId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }
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
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { aliases: { some: { alias: { contains: search, mode: "insensitive" } } } },
        ],
      }
    : {};

  const [customers, metaSettings] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        aliases: true,
        ledger_account: { select: { id: true, display_name: true } },
        _count: { select: { invoices: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.setting.findMany({
      where: { key: { startsWith: "customer_meta_" } },
    }),
  ]);

  const metaMap: Record<string, any> = {};
  metaSettings.forEach((s) => {
    const custId = s.key.replace("customer_meta_", "");
    metaMap[custId] = s.value;
  });

  const enrichedCustomers = customers.map((c) => ({
    ...c,
    destination: metaMap[c.id]?.destination || "",
    deliveryNote: metaMap[c.id]?.deliveryNote || "",
    phone: c.phone || metaMap[c.id]?.phone || "",
    secondary_phone: c.secondary_phone || "",
    email: c.email || "",
  }));

  return NextResponse.json({ customers: enrichedCustomers });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireFoundingWrite();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, gstin, address, email, phone, secondary_phone } = body;

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
        email: email && typeof email === "string" ? email.trim() : null,
        phone: phone && typeof phone === "string" ? phone.trim() : null,
        secondary_phone: secondary_phone && typeof secondary_phone === "string" ? secondary_phone.trim() : null,
      },
    });

    await logBusinessActivity({
      action: "CUSTOMER_CREATED",
      description: `Customer "${cleanName}" created`,
      entityType: "CUSTOMER",
      entityId: customer.id,
      metadata: { name: cleanName, gstin: cleanGstin, email: customer.email, phone: customer.phone },
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
