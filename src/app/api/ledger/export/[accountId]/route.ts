export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeRunningBalances, calculatePeriodOpening } from "@/lib/ledger/balances";
import { formatParticularsText } from "@/lib/ledger/particulars";

export async function GET(
  req: NextRequest,
  { params }: { params: { accountId: string } }
) {
  try {
    const { accountId } = params;
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const account = await prisma.ledgerAccount.findUnique({
      where: { id: accountId },
      include: {
        customer: true,
        supplier: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    const allEntries = await prisma.ledgerEntry.findMany({
      where: {
        account_id: accountId,
        is_void: false,
      },
      orderBy: [
        { entry_date: "asc" },
        { sort_seq: "asc" },
        { id: "asc" },
      ],
    });

    const firstDate = allEntries.length > 0 ? allEntries[0].entry_date : new Date();
    const lastDate = allEntries.length > 0 ? allEntries[allEntries.length - 1].entry_date : new Date();

    const fromDate = fromParam ? new Date(fromParam) : firstDate;
    const toDate = toParam ? new Date(toParam + "T23:59:59.999Z") : lastDate;

    const periodOpening = calculatePeriodOpening(allEntries as any, fromDate);
    const periodEntries = allEntries.filter((e) => {
      const d = new Date(e.entry_date);
      return d >= fromDate && d <= toDate;
    });

    const rows = computeRunningBalances(periodEntries as any, periodOpening);

    const headers = [
      "Date",
      "Particulars",
      "Debit",
      "Credit",
      "Balance",
      "Side",
    ];

    const csvRows = rows.map((r) => {
      const part = formatParticularsText({
        entryType: r.entry.entry_type as any,
        docNo: r.entry.doc_no,
        paymentMode: r.entry.payment_mode as any,
        instrumentNo: r.entry.instrument_no,
        instrumentDate: r.entry.instrument_date
          ? r.entry.instrument_date.toISOString().slice(0, 10)
          : null,
        referencedDocs: r.entry.referenced_docs,
        particularsRaw: r.entry.particulars_raw,
        narration: r.entry.narration,
      });

      return [
        r.entry.entry_date.toISOString().slice(0, 10),
        `"${part.replace(/"/g, '""')}"`,
        Number(r.entry.debit) > 0 ? Number(r.entry.debit).toFixed(2) : "",
        Number(r.entry.credit) > 0 ? Number(r.entry.credit).toFixed(2) : "",
        Math.abs(r.runningBalance).toFixed(2),
        r.balanceSide,
      ].join(",");
    });

    const csvString = [headers.join(","), ...csvRows].join("\n");

    const safeName = account.display_name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `Statement_${safeName}_${fromParam || "all"}_to_${toParam || "all"}.csv`;

    return new NextResponse(csvString, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Export error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to export statement" },
      { status: 500 }
    );
  }
}
