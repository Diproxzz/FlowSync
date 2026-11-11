import { NextRequest, NextResponse } from "next/server";
import { getProfitabilityAnalytics } from "@/lib/analytics/profitability";
import { AnalyticsFilter } from "@/lib/analytics";
import { getActiveClientContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getActiveClientContext();
    if (!ctx.clientId) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    if (!ctx.isFoundingClient) {
      return NextResponse.json({
        kpis: {
          totalRevenue: 0,
          totalCogs: 0,
          grossProfit: 0,
          blendedMarginPct: 0,
          blendedMarkupPct: 0,
          totalVolumeKg: 0,
          avgProfitPerKg: 0,
          totalInventoryValuation: 0,
          topProfitProduct: null,
          topProfitCustomer: null,
          productsWithMarginCount: 0,
        },
        productMargins: [],
        customerProfitability: [],
        monthlyTrend: [],
        quadrantSummary: {
          starsCount: 0,
          volumeDriversCount: 0,
          nicheProfitableCount: 0,
          lowMarginCount: 0,
        },
      });
    }
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
