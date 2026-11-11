export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getNextInformalInvoiceNumber } from "@/lib/informal-invoices/service";
import { getActiveClientContext } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const ctx = await getActiveClientContext();
  if (!ctx.clientId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }
  if (!ctx.isFoundingClient) {
    return NextResponse.json({ nextNumber: "INF-0001" });
  }

  try {
    const nextNumber = await getNextInformalInvoiceNumber();
    return NextResponse.json({ nextNumber });
  } catch (error: any) {
    console.error("GET next-number error:", error);
    return NextResponse.json(
      { error: { code: "ERROR", message: error.message || "Failed to generate next number." } },
      { status: 500 }
    );
  }
}
