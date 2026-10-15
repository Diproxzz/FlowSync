import { NextRequest, NextResponse } from "next/server";
import { getDashboardAnalytics, AnalyticsFilter } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") as any) || "fy";
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const customerId = searchParams.get("customerId") || undefined;
    const productId = searchParams.get("productId") || undefined;

    const filter: AnalyticsFilter = {
      period,
      from,
      to,
      customerId,
      productId,
    };

    const data = await getDashboardAnalytics(filter);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error generating analytics:", error);
    return NextResponse.json(
      { error: { code: "ANALYTICS_FAILED", message: "Failed to generate analytics data" } },
      { status: 500 }
    );
  }
}
