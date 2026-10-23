export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getClientsWithStats, createClient } from "@/lib/clients/store";
import { z } from "zod";

const createClientSchema = z.object({
  name: z.string().min(2, "Company/Client name must be at least 2 characters"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain alphanumeric characters, underscores and hyphens"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  gstin: z.string().optional(),
  tradeName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  state: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Administrator access required" } },
        { status: 403 }
      );
    }

    const clients = await getClientsWithStats();
    return NextResponse.json({ success: true, data: clients });
  } catch (error: any) {
    console.error("Fetch clients error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: error?.message || "Failed to fetch clients" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Administrator access required" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parseRes = createClientSchema.safeParse(body);
    if (!parseRes.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Validation failed",
            details: parseRes.error.format(),
          },
        },
        { status: 400 }
      );
    }

    const newClient = await createClient(parseRes.data);
    return NextResponse.json({
      success: true,
      message: `Client '${newClient.name}' created successfully`,
      data: newClient,
    });
  } catch (error: any) {
    console.error("Create client error:", error);
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: error?.message || "Failed to create client" } },
      { status: 400 }
    );
  }
}
