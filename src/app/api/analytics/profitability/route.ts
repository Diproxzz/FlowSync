import { NextRequest, NextResponse } from "next/server";
import { getProfitabilityAnalytics } from "@/lib/analytics/profitability";
import { AnalyticsFilter } from "@/lib/analytics";

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

    const data = await getProfitabilityAnalytics(filter);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error generating profitability analytics:", error);
    return NextResponse.json(
      {
        error: {
          code: "PROFITABILITY_ANALYTICS_FAILED",
          message: error.message || "Failed to generate profitability analytics",
        },
      },
      { status: 500 }
    );
  }
}
