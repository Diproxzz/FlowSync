import { NextRequest, NextResponse } from "next/server";
import { getPurchaseAnalytics, PurchaseAnalyticsFilter } from "@/lib/analytics/purchases";
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
          purchasesTaxable: 0,
          inputGst: 0,
          invoicesCount: 0,
          volumeKg: 0,
          activeSuppliersCount: 0,
          netStockMovementKg: 0,
        },
        trend: [],
        topSuppliers: [],
        top3ConcentrationPct: 0,
        topProducts: [],
        priceTrends: [],
        supplierComparison: [],
        gstInput: {
          cgstTotal: 0,
          sgstTotal: 0,
          igstTotal: 0,
          totalInputGst: 0,
          byMonth: [],
          byHsn: [],
        },
        quality: {
          invoicesWithWarningsCount: 0,
          suppliersWithoutGstinCount: 0,
          rateVarianceCount: 0,
          lapsedSuppliers: [],
        },
      });
    }
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
