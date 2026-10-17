import { NextRequest, NextResponse } from "next/server";
import { getPurchaseAnalytics, PurchaseAnalyticsFilter } from "@/lib/analytics/purchases";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") as any) || "fy";
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const supplierId = searchParams.get("supplierId") || undefined;
    const productId = searchParams.get("productId") || undefined;

    const filter: PurchaseAnalyticsFilter = {
      period,
      from,
      to,
      supplierId,
      productId,
    };

    const data = await getPurchaseAnalytics(filter);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error generating purchase analytics:", error);
    return NextResponse.json(
      { error: { code: "PURCHASE_ANALYTICS_FAILED", message: error.message || "Failed to generate purchase analytics" } },
      { status: 500 }
    );
  }
}
