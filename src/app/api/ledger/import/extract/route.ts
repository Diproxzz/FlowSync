import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { parseMargStatementPdf, parseMargStatementText } from "@/lib/ledger/parse/marg";
import { validateStatement } from "@/lib/ledger/parse/validate";
import { matchParty } from "@/lib/matching/party";
import { prisma } from "@/lib/db";
import { normalizeInvoiceNumber } from "@/lib/matching/normalize";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let buffer: Buffer | null = null;
    let fileName = "statement.pdf";
    let rawText: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: { code: "NO_FILE", message: "No file provided in form data" } },
          { status: 400 }
        );
      }
      fileName = file.name;
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      const body = await request.json();
      if (body.text) {
        rawText = body.text;
      } else if (body.fileBase64) {
        buffer = Buffer.from(body.fileBase64, "base64");
      }
      if (body.fileName) fileName = body.fileName;
    }

    if (!buffer && !rawText) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Provide either a PDF file or statement text" } },
        { status: 400 }
      );
    }

    const fileHash = buffer
      ? crypto.createHash("sha256").update(buffer).digest("hex")
      : crypto.createHash("sha256").update(rawText!).digest("hex");

    // 1. Parse Statement
    const draft = buffer ? await parseMargStatementPdf(buffer) : parseMargStatementText(rawText!);

    // 2. Validate Statement by Replay & Marg Totals
    const validation = validateStatement(draft);

    // 3. Resolve Party Match
    const partyMatch = await matchParty(draft.accountName, "CUSTOMER");

    // 4. Check for Existing Invoices in the system
    const enrichedEntries = await Promise.all(
      draft.entries.map(async (entry) => {
        if (entry.entryType === "SALE_INVOICE" && entry.docNo) {
          const normDoc = normalizeInvoiceNumber(entry.docNo);
          const inv = await prisma.invoice.findFirst({
            where: { invoice_number_norm: normDoc },
            select: { id: true, invoice_number: true, grand_total: true },
          });

          if (inv) {
            const grandTotal = Number(inv.grand_total);
            const mismatch = Math.abs(grandTotal - entry.debit) > 0.5;
            return {
              ...entry,
              linkedInvoice: {
                id: inv.id,
                invoiceNumber: inv.invoice_number,
                grandTotal,
                amountMismatch: mismatch,
              },
            };
          }
        }
        return entry;
      })
    );

    // 5. Check duplicate file re-import
    let isDuplicateFile = false;
    const existingImport = await prisma.statementImport.findFirst({
      where: { file_hash: fileHash },
      select: { id: true, created_at: true },
    });
    if (existingImport) {
      isDuplicateFile = true;
    }

    return NextResponse.json({
      success: true,
      data: {
        extracted: {
          ...draft,
          totals: {
            debitTotal: draft.printedTotals?.debit ?? 0,
            creditTotal: draft.printedTotals?.credit ?? 0,
            closing: draft.printedTotals?.balance ?? 0,
            closingSide: draft.printedTotals?.balanceSide ?? "Dr",
          },
          entries: enrichedEntries,
        },
        validation,
        partyMatch,
        existingInvoicesFound: enrichedEntries
          .filter((e: any) => e.linkedInvoice)
          .map((e: any) => e.linkedInvoice),
        fileHash,
        fileName,
        isDuplicateFile,
      },
    });
  } catch (error: any) {
    console.error("Statement extract error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "PARSE_FAILED",
          message: error.message || "Failed to extract statement",
        },
      },
      { status: 500 }
    );
  }
}
