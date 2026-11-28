import { NextRequest, NextResponse } from "next/server";
import { getActiveClientContext } from "@/lib/auth/session";
import {
  getGstr1Report,
  getCurrentIndianFy,
  type Gstr1Filter,
  type Gstr1FilterMode,
  type Gstr1Quarter,
} from "@/lib/analytics/gstr1";

export const dynamic = "force-dynamic";

function parseFilter(searchParams: URLSearchParams): Gstr1Filter {
  const rawMode = searchParams.get("mode") as Gstr1FilterMode | null;
  const mode: Gstr1FilterMode =
    rawMode === "month" || rawMode === "quarter" || rawMode === "fy" || rawMode === "custom"
      ? rawMode
      : "month";

  return {
    mode,
    month: searchParams.get("month") || undefined,
    fy: searchParams.get("fy") || getCurrentIndianFy(),
    quarter: (searchParams.get("quarter") as Gstr1Quarter) || "Q1",
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getActiveClientContext();
    if (!ctx.clientId) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filter = parseFilter(searchParams);

    if (!ctx.isFoundingClient) {
      return NextResponse.json({
        periodLabel: filter.fy || getCurrentIndianFy(),
        fromDate: "",
        toDate: "",
        summary: {
          totalInvoices: 0,
          b2bCount: 0,
          b2cCount: 0,
          taxableTotal: 0,
          cgstTotal: 0,
          sgstTotal: 0,
          igstTotal: 0,
          totalTax: 0,
          grandTotal: 0,
        },
        b2b: [],
        b2c: [],
        rateSummary: [],
        hsnSummary: [],
      });
    }

    const report = await getGstr1Report(filter);
    return NextResponse.json(report);
  } catch (error) {
    console.error("Error generating GSTR-1 report:", error);
    return NextResponse.json(
      { error: { code: "GSTR1_FAILED", message: "Failed to generate GSTR-1 report" } },
      { status: 500 }
    );
  }
}
