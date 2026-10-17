import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateMargTotals, calculatePeriodOpening, computeRunningBalances } from "@/lib/ledger/balances";
import { calculateOpenItems } from "@/lib/ledger/openItems";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = request.nextUrl;
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const account = await prisma.ledgerAccount.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, name: true, gstin: true, gstin_source: true, address: true, state_code: true },
        },
        supplier: {
          select: { id: true, name: true, gstin: true, gstin_source: true, address: true, state_code: true },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Ledger account not found" } },
        { status: 404 }
      );
    }

    // Fetch all non-void entries in chronological order
    const allEntries = await prisma.ledgerEntry.findMany({
      where: {
        account_id: id,
        is_void: false,
      },
      include: {
        invoice: { select: { id: true, invoice_number: true, grand_total: true } },
        purchase_invoice: { select: { id: true, supplier_invoice_number: true, grand_total: true } },
      },
      orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
    });

    const isCustomer = account.account_type === "CUSTOMER";

    // Determine period boundaries
    const firstDate = allEntries.length > 0 ? allEntries[0].entry_date : new Date();
    const lastDate = allEntries.length > 0 ? allEntries[allEntries.length - 1].entry_date : new Date();

    const fromDate = fromParam ? new Date(fromParam) : firstDate;
    const toDate = toParam ? new Date(toParam + "T23:59:59.999Z") : lastDate;

    // Opening balance before fromDate
    const periodOpening = calculatePeriodOpening(allEntries as any, fromDate);

    // Entries inside period
    const periodEntries = allEntries.filter((e) => {
      const d = new Date(e.entry_date);
      return d >= fromDate && d <= toDate;
    });

    // Compute running balance for period
    const runningRows = computeRunningBalances(periodEntries as any, periodOpening);

    // Marg Totals
    const margTotals = calculateMargTotals(periodEntries as any, periodOpening);

    // Open Items & Due
    const openItems = calculateOpenItems(
      allEntries as any,
      [],
      account.credit_days || 30,
      new Date(),
      isCustomer
    );

    const openBills = openItems.items.filter((it) => it.status === "OPEN" || it.status === "PART");
    const oldestBill = openBills.length > 0 ? openBills[0].docNo : null;

    return NextResponse.json({
      account: {
        id: account.id,
        displayName: account.display_name,
        accountType: account.account_type,
        gstin: account.customer?.gstin || account.supplier?.gstin || null,
        gstinSource: account.customer?.gstin_source || account.supplier?.gstin_source || null,
        address: account.customer?.address || account.supplier?.address || null,
        stateCode: account.customer?.state_code || account.supplier?.state_code || null,
        creditDays: account.credit_days || 30,
        statementThroughDate: account.statement_through_date,
      },
      period: {
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
      },
      periodOpening: {
        balance: Math.abs(periodOpening),
        side: periodOpening >= 0 ? "Dr" : "Cr",
      },
      entries: runningRows.map((r) => ({
        id: r.entry.id,
        date: r.entry.entry_date.toISOString().slice(0, 10),
        entryType: r.entry.entry_type,
        docNo: r.entry.doc_no,
        paymentMode: r.entry.payment_mode,
        instrumentNo: r.entry.instrument_no,
        instrumentDate: r.entry.instrument_date ? r.entry.instrument_date.toISOString().slice(0, 10) : null,
        referencedDocs: r.entry.referenced_docs,
        priorYearRefs: r.entry.prior_year_refs,
        referencesTruncated: r.entry.references_truncated,
        particularsRaw: r.entry.particulars_raw,
        debit: r.debit,
        credit: r.credit,
        runningBalance: r.runningBalance,
        balanceSide: r.balanceSide,
        formattedBalance: r.formattedBalance,
        invoiceId: r.entry.invoice?.id || null,
        purchaseInvoiceId: r.entry.purchase_invoice?.id || null,
      })),
      margTotals,
      totalDue: {
        balance: margTotals.closingBalance,
        side: margTotals.closingSide,
        meaning:
          isCustomer
            ? margTotals.closingSide === "Dr"
              ? "party owes you"
              : "advance / credit held (you owe party)"
            : margTotals.closingSide === "Cr"
            ? "you owe party"
            : "advance paid (party owes you)",
        overdueAmount: openItems.totalOverdue,
        oldestBill,
      },
    });
  } catch (error: any) {
    console.error("Statement route error:", error);
    return NextResponse.json(
      { error: { code: "FETCH_FAILED", message: error.message || "Failed to generate statement" } },
      { status: 500 }
    );
  }
}
