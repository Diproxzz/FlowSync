import { NextRequest, NextResponse } from "next/server";
import { getNextInformalInvoiceNumber } from "@/lib/informal-invoices/service";

export async function GET(request: NextRequest) {
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
