import { NextResponse } from "next/server";
import { getStockSummary } from "@/lib/stock/summary";

export async function GET() {
  try {
    const summary = await getStockSummary();
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Error fetching stock summary:", error);
    return NextResponse.json(
      { error: { code: "FETCH_FAILED", message: "Failed to fetch stock summary" } },
      { status: 500 }
    );
  }
}
