export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFoundingWrite } from "@/lib/auth/session";
import { getOrCreateCustomerLedgerAccount } from "@/lib/ledger/account-utils";
import { calculatePeriodOpening, computeRunningBalances, calculateStatementTotals } from "@/lib/ledger/balances";
import { formatParticularsText } from "@/lib/ledger/particulars";
import { generateStatementPdf } from "@/lib/ledger/pdf/generate-statement-pdf";
import { sendCustomerStatementEmail } from "@/lib/email/mailer";
import { sendWhatsAppStatementMessage } from "@/lib/whatsapp/client";
import { logBusinessActivity } from "@/lib/logs/business-logger";
import { formatINR } from "@/lib/format";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireFoundingWrite();
    if (!auth.ok) return auth.response;

    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const channel: "email" | "primary" | "secondary" | "all" = body.channel || "email";

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        ledger_account: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Customer not found" } },
        { status: 404 }
      );
    }

    const recipientEmail = customer.email?.trim() || "";
    const primaryPhone = customer.phone?.trim() || "";
    const secondaryPhone = customer.secondary_phone?.trim() || "";

    // Channel validation
    if (channel === "email" && !recipientEmail) {
      return NextResponse.json(
        {
          error: {
            code: "NO_EMAIL",
            message: `No email address registered for customer "${customer.name}". Please edit contact info to add their email.`,
          },
        },
        { status: 400 }
      );
    }

    if (channel === "primary" && !primaryPhone) {
      return NextResponse.json(
        {
          error: {
            code: "NO_PRIMARY_PHONE",
            message: `No primary phone number registered for customer "${customer.name}". Please edit contact info to add their primary number.`,
          },
        },
        { status: 400 }
      );
    }

    if (channel === "secondary" && !secondaryPhone) {
      return NextResponse.json(
        {
          error: {
            code: "NO_SECONDARY_PHONE",
            message: `No secondary phone number registered for customer "${customer.name}". Please edit contact info to add their secondary number.`,
          },
        },
        { status: 400 }
      );
    }

    if (channel === "all" && !recipientEmail && !primaryPhone && !secondaryPhone) {
      return NextResponse.json(
        {
          error: {
            code: "NO_CONTACT_INFO",
            message: `Customer "${customer.name}" does not have an email or phone number registered.`,
          },
        },
        { status: 400 }
      );
    }

    // 1. Resolve Ledger Account & compute statements
    const ledgerAccount = await getOrCreateCustomerLedgerAccount(customer.id);
    if (!ledgerAccount) {
      return NextResponse.json(
        { error: { code: "LEDGER_ERROR", message: "Failed to resolve ledger account for customer" } },
        { status: 500 }
      );
    }

    const allEntries = await prisma.ledgerEntry.findMany({
      where: {
        account_id: ledgerAccount.id,
        is_void: false,
      },
      orderBy: [
        { entry_date: "asc" },
        { sort_seq: "asc" },
        { id: "asc" },
      ],
    });

    const now = new Date();
    const firstDate = allEntries.length > 0 ? allEntries[0].entry_date : new Date(now.getFullYear(), 3, 1);
    const fromDate = firstDate;
    const toDate = now;

    const periodOpening = calculatePeriodOpening(allEntries as any, fromDate);
    const periodEntries = allEntries.filter((e) => {
      const d = new Date(e.entry_date);
      return d >= fromDate && d <= toDate;
    });

    const rows = computeRunningBalances(periodEntries as any, periodOpening);
    const statementTotals = calculateStatementTotals(periodEntries as any, periodOpening);

    // Format closing balance and Total Due (without Dr. in message)
    const closingBalanceNum = statementTotals.closingBalance;
    const closingSide = statementTotals.closingSide;
    const totalDueFormatted = formatINR(closingBalanceNum);

    // 2. Prepare entries for PDF
    const pdfEntries = rows.map((r) => {
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

      return {
        date: r.entry.entry_date.toISOString().slice(0, 10),
        particulars: part,
        debit: Number(r.entry.debit) || 0,
        credit: Number(r.entry.credit) || 0,
        runningBalance: Math.abs(r.runningBalance),
        balanceSide: r.balanceSide,
      };
    });

    // 3. Generate Statement PDF
    const pdfBuffer = await generateStatementPdf({
      accountName: customer.name,
      gstin: customer.gstin,
      stateCode: customer.state_code || "19",
      address: customer.address,
      periodFrom: fromDate.toISOString().slice(0, 10),
      periodTo: toDate.toISOString().slice(0, 10),
      openingBalance: statementTotals.openingBalance,
      openingSide: statementTotals.openingSide,
      periodDebit: statementTotals.periodDebit,
      periodCredit: statementTotals.periodCredit,
      totalDebitWithOpening: statementTotals.totalDebitWithOpening,
      totalCreditWithOpening: statementTotals.totalCreditWithOpening,
      closingBalance: closingBalanceNum,
      closingSide: closingSide,
      entries: pdfEntries,
    });

    const pdfFilename = `${customer.name} Statement.pdf`;
    const messageText = [
      `Dear ${customer.name},`,
      ``,
      `Please find attached your updated Statement of Account from Indobest. The current Total Due is ${totalDueFormatted}.`,
      ``,
      `Kindly review and arrange for clearance at your earliest convenience.`,
      ``,
      `For any queries, please contact us at 8240892993.`,
      ``,
      `Regards,`,
      `Indobest`,
    ].join("\n");

    const dispatchedChannels: string[] = [];
    let emailDispatched = false;
    let whatsAppDispatched = false;
    let whatsAppRecipientNumber = "";

    // 4a. Email dispatch (if channel is "email" or "all")
    if ((channel === "email" || channel === "all") && recipientEmail) {
      await sendCustomerStatementEmail({
        to: recipientEmail,
        customerName: customer.name,
        totalDueFormatted,
        closingBalanceNumber: closingBalanceNum,
        pdfBuffer,
        pdfFilename,
      });
      emailDispatched = true;
      dispatchedChannels.push(`Email (${recipientEmail})`);
    }

    // 4b. WhatsApp dispatch (if channel is "primary", "secondary", or "all")
    const targetWhatsAppPhone =
      channel === "primary"
        ? primaryPhone
        : channel === "secondary"
        ? secondaryPhone
        : primaryPhone || secondaryPhone;

    if ((channel === "primary" || channel === "secondary" || channel === "all") && targetWhatsAppPhone) {
      const waResult = await sendWhatsAppStatementMessage({
        recipientPhone: targetWhatsAppPhone,
        messageText,
        pdfAttachment: {
          buffer: pdfBuffer,
          fileName: pdfFilename,
        },
      });
      whatsAppDispatched = true;
      whatsAppRecipientNumber = waResult.cleanNumber;
      dispatchedChannels.push(`WhatsApp (${waResult.cleanNumber})`);
    }

    // 5. Business Activity Audit Log (Pure business record, no developer logs)
    const dispatchSummary = dispatchedChannels.join(" & ") || channel;
    await logBusinessActivity({
      action: "STATEMENT_SENT",
      description: `Account statement sent to ${customer.name} via ${dispatchSummary} with Total Due: ${totalDueFormatted}`,
      entityType: "STATEMENT",
      entityId: customer.id,
      amount: closingBalanceNum,
      metadata: {
        customerName: customer.name,
        recipientEmail: emailDispatched ? recipientEmail : null,
        whatsAppPhone: whatsAppDispatched ? whatsAppRecipientNumber : null,
        totalDue: totalDueFormatted,
        filename: pdfFilename,
        channel,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Account statement successfully sent to ${customer.name} via ${dispatchSummary}`,
      customerName: customer.name,
      recipientEmail: emailDispatched ? recipientEmail : null,
      whatsAppPhone: whatsAppDispatched ? whatsAppRecipientNumber : null,
      totalDue: totalDueFormatted,
      pdfFilename,
      channel,
    });
  } catch (error: any) {
    console.error("[send-statement] Error generating or sending statement:", error);
    return NextResponse.json(
      {
        error: {
          code: "SEND_FAILED",
          message: error?.message || "Failed to send statement email",
        },
      },
      { status: 500 }
    );
  }
}
