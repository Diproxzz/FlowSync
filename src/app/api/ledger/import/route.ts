export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeCustomerName, normalizeInvoiceNumber } from "@/lib/matching/normalize";
import { ExtractedStatementSchema } from "@/lib/ledger/parse/schema";
import { validateStatement } from "@/lib/ledger/parse/validate";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { draft, statement, partyMatch, fileHash, fileName } = body;

    // Validate the draft structure
    const rawDraft = draft || statement;
    const parsedDraft = ExtractedStatementSchema.parse(rawDraft);

    // Validate replay & totals
    const validation = validateStatement(parsedDraft);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "Statement failed replay validation: " + validation.errors.join("; "),
            errors: validation.errors,
          },
        },
        { status: 422 }
      );
    }

    // Default account type by closing balance side if not explicitly specified (Cr = Supplier, Dr = Customer)
    const closingBalanceSide =
      parsedDraft.printedTotals?.balanceSide ||
      validation.replayedSide ||
      (parsedDraft.openingSide === "Cr" ? "Cr" : "Dr");
    const inferredType: "CUSTOMER" | "SUPPLIER" = closingBalanceSide === "Cr" ? "SUPPLIER" : "CUSTOMER";
    const accountType: "CUSTOMER" | "SUPPLIER" = body.accountType || inferredType;

    const result = await prisma.$transaction(async (tx) => {
      let customerId: string | null = null;
      let supplierId: string | null = null;
      let partyDisplayName: string = parsedDraft.accountName.trim();

      if (accountType === "CUSTOMER") {
        const autoMatchId =
          partyMatch?.status === "exact" || partyMatch?.status === "alias"
            ? partyMatch?.matchedPartyId || partyMatch?.partyId
            : null;
        const targetCustomerId = body.customerId || body.partyId || autoMatchId;

        if (targetCustomerId) {
          const cId = String(targetCustomerId);
          customerId = cId;
          const cust = await tx.customer.findUnique({ where: { id: cId } });
          if (cust) partyDisplayName = cust.name;

          // Save alias for future imports
          const normName = normalizeCustomerName(parsedDraft.accountName);
          const existingAlias = await tx.customerAlias.findUnique({
            where: { alias_norm: normName },
          });
          if (!existingAlias) {
            await tx.customerAlias.create({
              data: {
                customer_id: cId,
                alias: parsedDraft.accountName.trim(),
                alias_norm: normName,
              },
            }).catch(() => null);
          }
        } else {
          // Party name is not present in database -> create customer and SKIP GSTIN (per user instruction)
          const normName = normalizeCustomerName(parsedDraft.accountName);
          const newCust = await tx.customer.create({
            data: {
              name: parsedDraft.accountName.trim(),
              name_norm: normName,
              gstin: null, // Skipped per instruction
              gstin_source: null,
            },
          });
          customerId = newCust.id;
        }
      } else {
        const autoMatchId =
          partyMatch?.status === "exact" || partyMatch?.status === "alias"
            ? partyMatch?.matchedPartyId || partyMatch?.partyId
            : null;
        const targetSupplierId = body.supplierId || body.partyId || autoMatchId;

        if (targetSupplierId) {
          const sId = String(targetSupplierId);
          supplierId = sId;
          const sup = await tx.supplier.findUnique({ where: { id: sId } });
          if (sup) partyDisplayName = sup.name;

          // Save alias for future imports
          const normName = normalizeCustomerName(parsedDraft.accountName);
          const existingAlias = await tx.supplierAlias.findUnique({
            where: { alias_norm: normName },
          });
          if (!existingAlias) {
            await tx.supplierAlias.create({
              data: {
                supplier_id: sId,
                alias: parsedDraft.accountName.trim(),
                alias_norm: normName,
              },
            }).catch(() => null);
          }
        } else {
          // Supplier
          const normName = normalizeCustomerName(parsedDraft.accountName);
          const newSup = await tx.supplier.create({
            data: {
              name: parsedDraft.accountName.trim(),
              name_norm: normName,
              gstin: null,
            },
          });
          supplierId = newSup.id;
        }
      }

      // Find or create ledger account
      let account = await tx.ledgerAccount.findFirst({
        where: customerId ? { customer_id: customerId } : { supplier_id: supplierId! },
      });

      if (!account) {
        account = await tx.ledgerAccount.create({
          data: {
            account_type: accountType,
            customer_id: customerId,
            supplier_id: supplierId,
            display_name: partyDisplayName,
            statement_through_date: new Date(parsedDraft.periodTo),
            opening_balance_set: true,
            credit_days: 90,
          },
        });
      } else {
        // Update statement_through_date if later
        const newThrough = new Date(parsedDraft.periodTo);
        if (!account.statement_through_date || newThrough > account.statement_through_date) {
          await tx.ledgerAccount.update({
            where: { id: account.id },
            data: {
              statement_through_date: newThrough,
              opening_balance_set: true,
            },
          });
        }
      }

      // Record statement import batch (unique by account_id and file_hash)
      const importBatch = await tx.statementImport.upsert({
        where: {
          account_id_file_hash: {
            account_id: account.id,
            file_hash: fileHash || "adhoc_hash_" + Date.now(),
          },
        },
        update: {
          file_name: fileName || "statement.pdf",
          period_from: new Date(parsedDraft.periodFrom),
          period_to: new Date(parsedDraft.periodTo),
          parser: "TEXT_LAYOUT",
          warnings: parsedDraft.warnings || [],
        },
        create: {
          account_id: account.id,
          file_hash: fileHash || "adhoc_hash_" + Date.now(),
          file_name: fileName || "statement.pdf",
          period_from: new Date(parsedDraft.periodFrom),
          period_to: new Date(parsedDraft.periodTo),
          parser: "TEXT_LAYOUT",
          warnings: parsedDraft.warnings || [],
        },
      });

      // Check if opening balance already exists for this account
      const existingOpening = await tx.ledgerEntry.findFirst({
        where: {
          account_id: account.id,
          entry_type: "OPENING",
          is_void: false,
        },
      });

      if (!existingOpening && parsedDraft.openingBalance > 0) {
        await tx.ledgerEntry.create({
          data: {
            account_id: account.id,
            entry_date: new Date(parsedDraft.periodFrom),
            sort_seq: 0,
            entry_type: "OPENING",
            debit: parsedDraft.openingSide === "Dr" ? parsedDraft.openingBalance : 0,
            credit: parsedDraft.openingSide === "Cr" ? parsedDraft.openingBalance : 0,
            particulars_raw: "Opening Balance",
            source: "STATEMENT_IMPORT",
            import_batch_id: importBatch.id,
          },
        });
      }

      let entriesAdded = 0;
      let entriesLinked = 0;

      // Existing entries to prevent duplicate insertion
      const existingEntries = await tx.ledgerEntry.findMany({
        where: { account_id: account.id, is_void: false },
        select: {
          id: true,
          entry_type: true,
          doc_no_norm: true,
          entry_date: true,
          debit: true,
          credit: true,
          invoice_id: true,
        },
      });

      for (let i = 0; i < parsedDraft.entries.length; i++) {
        const item = parsedDraft.entries[i];
        if (item.entryType === "OPENING") continue;

        const normDoc = item.docNo ? normalizeInvoiceNumber(item.docNo) : null;
        const entryDate = new Date(item.date);

        // Check if matching entry already exists (merge rule §3.3 IMP-6)
        const isDuplicate = existingEntries.some((existing) => {
          const sameType = existing.entry_type === item.entryType;
          const sameDoc = normDoc && existing.doc_no_norm === normDoc;
          const sameDate = existing.entry_date.toISOString().slice(0, 10) === item.date;
          const sameAmt =
            Math.abs(Number(existing.debit) - item.debit) < 0.05 &&
            Math.abs(Number(existing.credit) - item.credit) < 0.05;

          return sameType && (sameDoc || (sameDate && sameAmt));
        });

        if (isDuplicate) {
          continue;
        }

        // Check if invoice exists in DB to link
        let invoiceId: string | null = null;
        if (item.entryType === "SALE_INVOICE" && normDoc) {
          const matchedInv = await tx.invoice.findFirst({
            where: { invoice_number_norm: normDoc },
            select: { id: true, grand_total: true },
          });
          if (matchedInv) {
            invoiceId = matchedInv.id;
            entriesLinked++;
          }
        }

        const VALID_ENTRY_TYPES = new Set([
          "OPENING",
          "SALE_INVOICE",
          "PURCHASE_INVOICE",
          "RECEIPT",
          "PAYMENT",
          "DEBIT_NOTE",
          "CREDIT_NOTE",
          "ADJUSTMENT",
        ]);
        const safeEntryType = VALID_ENTRY_TYPES.has(item.entryType)
          ? item.entryType
          : "ADJUSTMENT";

        const VALID_PAYMENT_MODES = new Set([
          "CHEQUE",
          "NEFT",
          "RTGS",
          "UPI",
          "CASH",
          "OTHER",
        ]);
        const safePaymentMode = item.paymentMode && VALID_PAYMENT_MODES.has(item.paymentMode)
          ? item.paymentMode
          : null;

        await tx.ledgerEntry.create({
          data: {
            account_id: account.id,
            entry_date: entryDate,
            sort_seq: i + 1,
            entry_type: safeEntryType as any,
            debit: item.debit,
            credit: item.credit,
            doc_no: item.docNo || null,
            doc_no_norm: normDoc,
            invoice_id: invoiceId,
            payment_mode: (safePaymentMode as any) || null,
            instrument_no: item.instrumentNo || null,
            instrument_date: item.instrumentDate ? new Date(item.instrumentDate) : null,
            referenced_docs: item.referencedDocs || [],
            prior_year_refs: item.priorYearRefs || [],
            references_truncated: item.referencesTruncated || false,
            particulars_raw: item.particularsRaw,
            source: "STATEMENT_IMPORT",
            import_batch_id: importBatch.id,
          },
        });

        entriesAdded++;
      }

      await tx.statementImport.update({
        where: { id: importBatch.id },
        data: {
          entries_added: entriesAdded,
          entries_linked: entriesLinked,
        },
      });

      return {
        accountId: account.id,
        accountName: account.display_name,
        entriesAdded,
        entriesLinked,
        totalEntries: parsedDraft.entries.length,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Statement saved successfully for ${result.accountName}. ${result.entriesAdded} entries added (${result.entriesLinked} linked to invoices).`,
      data: result,
      ...result,
    });
  } catch (error: any) {
    console.error("Save statement error:", error);
    return NextResponse.json(
      { error: { code: "SAVE_FAILED", message: error.message || "Failed to save statement" } },
      { status: 500 }
    );
  }
}
