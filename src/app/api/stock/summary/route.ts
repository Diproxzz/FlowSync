export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getStockSummary } from "@/lib/stock/summary";
import { ensureProductMasterSynced } from "@/lib/products/sync-master";
import { getActiveClientContext } from "@/lib/auth/session";

export async function GET() {
  try {
    const ctx = await getActiveClientContext();
    if (!ctx.clientId) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    if (!ctx.isFoundingClient) {
      return NextResponse.json({ summary: [] });
    }

    await ensureProductMasterSynced();
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
