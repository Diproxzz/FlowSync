import { NextRequest, NextResponse } from "next/server";
import { getActiveClientContext } from "@/lib/auth/session";
import {
  getGstr1Report,
  getCurrentIndianFy,
  type Gstr1Filter,
  type Gstr1FilterMode,
  type Gstr1Quarter,
} from "@/lib/analytics/gstr1";
import { buildGstr1Docx, buildGstr1Pdf, buildGstr1Xlsx } from "@/lib/gstr1/export";

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

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "xlsx").toLowerCase();
    const rawMode = searchParams.get("mode") as Gstr1FilterMode | null;
    const mode: Gstr1FilterMode =
      rawMode === "month" || rawMode === "quarter" || rawMode === "fy" || rawMode === "custom"
        ? rawMode
        : "month";

    const filter: Gstr1Filter = {
      mode,
      month: searchParams.get("month") || undefined,
      fy: searchParams.get("fy") || getCurrentIndianFy(),
      quarter: (searchParams.get("quarter") as Gstr1Quarter) || "Q1",
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    };

    const report = ctx.isFoundingClient
      ? await getGstr1Report(filter)
      : {
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
        };

    const clientName = "Indobest";
    const safeSlug = report.periodLabel.replace(/[^a-zA-Z0-9_-]+/g, "_");

    if (format === "pdf") {
      const buf = await buildGstr1Pdf(report, clientName);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="GSTR1_${safeSlug}.pdf"`,
        },
      });
    }

    if (format === "docx") {
      const buf = await buildGstr1Docx(report, clientName);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="GSTR1_${safeSlug}.docx"`,
        },
      });
    }

    const buf = await buildGstr1Xlsx(report, clientName);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="GSTR1_${safeSlug}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error exporting GSTR-1:", error);
    return NextResponse.json(
      { error: { code: "GSTR1_EXPORT_FAILED", message: "Failed to export GSTR-1 report" } },
      { status: 500 }
    );
  }
}
