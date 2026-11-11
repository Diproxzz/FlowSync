import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateInvoice } from "@/lib/invoices/calculations";
import {
  peekNextInvoiceNumber,
  commitNextInvoiceNumber,
  advanceInvoiceSequence,
  formatInvoiceNumber,
  getFinancialYearCode,
} from "@/lib/invoices/generator-sequence";
import { normalizeInvoiceNumber, normalizeCustomerName } from "@/lib/matching/normalize";
import { postSalesInvoiceToLedger } from "@/lib/ledger/posting";
import { MovementType, MovementSource } from "@prisma/client";
import Decimal from "decimal.js";
import { ensureProductMasterSynced } from "@/lib/products/sync-master";
import { env } from "@/lib/env";
import { getActiveClientContext, requireFoundingWrite } from "@/lib/auth/session";

// Helper to determine the commercial name of a product
function getProductCommercialName(p: { code: string; name: string; aliases: { alias: string }[] }): string {
  if (p.name && p.name.trim().toUpperCase() !== p.code.trim().toUpperCase()) {
    return p.name.trim();
  }
  if (p.aliases && p.aliases.length > 0) {
    // Prefer alias matching known commercial names or non-short code
    const goodAlias = p.aliases.find(
      (a) => a.alias.trim().toUpperCase() !== p.code.trim().toUpperCase()
    );
    if (goodAlias) return goodAlias.alias;
    return p.aliases[0].alias;
  }
  return p.name;
}

// GET: Bootstrap data & checks
export async function GET(request: NextRequest) {
  const ctx = await getActiveClientContext();
  if (!ctx.clientId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const invoiceId = searchParams.get("id");
    const dateParam = searchParams.get("date");
    const numberParam = searchParams.get("number");

    if (!ctx.isFoundingClient) {
      const fy = getFinancialYearCode(dateParam);
      if (action === "check_number") {
        return NextResponse.json({ exists: false, invoiceNumber: null });
      }
      if (invoiceId) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN_TENANT_ISOLATION", message: "Workspace isolation: access denied." } },
          { status: 403 }
        );
      }
      if (action === "peek_number") {
        return NextResponse.json({
          invoiceNumber: formatInvoiceNumber(fy, 1),
          financialYear: fy,
          sequence: 1,
        });
      }
      return NextResponse.json({
        nextInvoiceNumber: formatInvoiceNumber(fy, 1),
        financialYear: fy,
        customers: [],
        products: [],
        recentInvoices: [],
      });
    }

    await ensureProductMasterSynced();

    // Check if an invoice number exists
    if (action === "check_number" && numberParam) {
      const norm = normalizeInvoiceNumber(numberParam.trim());
      const existing = await prisma.invoice.findUnique({
        where: { invoice_number_norm: norm },
        select: { id: true, invoice_number: true },
      });
      return NextResponse.json({ exists: !!existing, invoiceNumber: existing?.invoice_number || null });
    }

    // Load single invoice for re-printing/viewing
    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: true,
          items: {
            include: { product: true },
            orderBy: { line_no: "asc" },
          },
        },
      });

      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }

      return NextResponse.json({ invoice });
    }

    // Peek next invoice number for a given date
    if (action === "peek_number") {
      const date = dateParam ? new Date(dateParam) : new Date();
      const numInfo = await peekNextInvoiceNumber(date);
      return NextResponse.json(numInfo);
    }

    // Bootstrap data for invoice generator page
    const [customers, products, nextNumInfo, settings] = await Promise.all([
      prisma.customer.findMany({
        select: {
          id: true,
          name: true,
          address: true,
          gstin: true,
          state_code: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.product.findMany({
        where: { is_active: true },
        select: {
          id: true,
          code: true,
          name: true,
          default_hsn: true,
          pack_size_kg: true,
          std_sale_rate: true,
          aliases: {
            select: { alias: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      peekNextInvoiceNumber(new Date()),
      prisma.setting.findMany({
        where: { key: { startsWith: "customer_meta_" } },
      }),
    ]);

    // Build customer meta map (phone, deliveryNote, destination)
    const customerMetaMap: Record<string, any> = {};
    settings.forEach((s) => {
      const custId = s.key.replace("customer_meta_", "");
      customerMetaMap[custId] = s.value;
    });

    // Recent generated invoices
    const recentInvoices = await prisma.invoice.findMany({
      where: {
        source_file_hash: "generator",
      },
      select: {
        id: true,
        invoice_number: true,
        invoice_date: true,
        customer_name_snapshot: true,
        grand_total: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
      take: 20,
    });

    return NextResponse.json({
      nextInvoiceNumber: nextNumInfo.invoiceNumber,
      financialYear: nextNumInfo.financialYear,
      customers: customers.map((c) => ({
        ...c,
        phone: customerMetaMap[c.id]?.phone || "",
        deliveryNote: customerMetaMap[c.id]?.deliveryNote || "",
        destination: customerMetaMap[c.id]?.destination || "",
      })),
      products: products.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        commercialName: getProductCommercialName(p),
        default_hsn: p.default_hsn,
        pack_size_kg: p.pack_size_kg,
        std_sale_rate: p.std_sale_rate,
        aliases: p.aliases.map((a) => a.alias),
      })),
      recentInvoices,
    });
  } catch (error: any) {
    console.error("Error in GET /api/invoices/generate:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

class DuplicateInvoiceNumberError extends Error {}

// POST: Save and commit generated invoice
export async function POST(request: NextRequest) {
  const auth = await requireFoundingWrite();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      invoiceNumber: requestedInvoiceNumber,
      date,
      customerId,
      customerName,
      customerAddress,
      customerGstin,
      customerPhone,
      deliveryNote,
      destination,
      orderNo,
      ewayBillNo,
      copyType = "ORIGINAL",
      hasWatermark = true,
      discountPct = 0,
      isInterState: requestedInterState,
      lines,
    } = body;

    if (!customerName || !customerName.trim()) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: "At least one product line is required" }, { status: 400 });
    }

    // Parse invoice date
    let invoiceDate: Date;
    if (typeof date === "string" && date.includes("-")) {
      const parts = date.split("-");
      if (parts[0].length === 4) {
        invoiceDate = new Date(date);
      } else if (parts[2].length === 4) {
        invoiceDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else {
        invoiceDate = new Date(date);
      }
    } else {
      invoiceDate = new Date();
    }

    if (isNaN(invoiceDate.getTime())) {
      invoiceDate = new Date();
    }

    const homeStateCode = (env.COMPANY_GSTIN || "19AVZPC2361G1ZA").trim().substring(0, 2) || "19";

    // Save inside atomic transaction with row-level FOR UPDATE lock on sequence
    const result = await prisma.$transaction(async (tx) => {
      const fy = getFinancialYearCode(invoiceDate);

      let invoiceNumberToUse = (requestedInvoiceNumber || "").trim();
      if (!invoiceNumberToUse) {
        const committed = await commitNextInvoiceNumber(invoiceDate, tx);
        invoiceNumberToUse = committed.invoiceNumber;
      } else {
        const numberNorm = normalizeInvoiceNumber(invoiceNumberToUse);
        const existing = await tx.invoice.findUnique({
          where: { invoice_number_norm: numberNorm },
          select: { id: true, invoice_number: true },
        });
        if (existing) {
          throw new DuplicateInvoiceNumberError(
            `Invoice number '${invoiceNumberToUse}' already exists in database. Please enter a unique invoice number.`
          );
        }

        const seqMatch = invoiceNumberToUse.match(new RegExp(`^IB${fy}/(\\d+)`));
        if (seqMatch) {
          const seqVal = parseInt(seqMatch[1], 10);
          if (!isNaN(seqVal)) {
            await advanceInvoiceSequence(tx, fy, seqVal);
          }
        }
      }

      const numberNorm = normalizeInvoiceNumber(invoiceNumberToUse);

      // 2. Resolve Customer while preserving existing address/gstin/state_code if blank
      let resolvedCustomerId = customerId;
      const cleanGstin = (customerGstin || "").trim().toUpperCase() || null;
      const cleanName = customerName.trim();
      const cleanAddress = (customerAddress || "").trim() || null;
      const cleanDestination = (destination || "").trim();

      let effectiveGstin = cleanGstin;
      let effectiveStateCode =
        cleanGstin && /^\d{2}/.test(cleanGstin) ? cleanGstin.substring(0, 2) : null;

      if (resolvedCustomerId) {
        const existingCust = await tx.customer.findUnique({
          where: { id: resolvedCustomerId },
        });
        if (existingCust) {
          effectiveGstin = cleanGstin || existingCust.gstin;
          effectiveStateCode =
            (cleanGstin && /^\d{2}/.test(cleanGstin) ? cleanGstin.substring(0, 2) : null) ||
            existingCust.state_code ||
            (effectiveGstin && /^\d{2}/.test(effectiveGstin) ? effectiveGstin.substring(0, 2) : homeStateCode);

          await tx.customer.update({
            where: { id: resolvedCustomerId },
            data: {
              address: cleanAddress || existingCust.address,
              gstin: effectiveGstin,
              state_code: effectiveStateCode,
            },
          });
        } else {
          resolvedCustomerId = undefined;
        }
      }

      if (!resolvedCustomerId) {
        let cust = cleanGstin
          ? await tx.customer.findUnique({ where: { gstin: cleanGstin } })
          : null;

        if (!cust) {
          const normName = normalizeCustomerName(cleanName);
          cust = await tx.customer.findFirst({
            where: { name_norm: normName },
          });
        }

        if (cust) {
          resolvedCustomerId = cust.id;
          effectiveGstin = cleanGstin || cust.gstin;
          effectiveStateCode =
            (cleanGstin && /^\d{2}/.test(cleanGstin) ? cleanGstin.substring(0, 2) : null) ||
            cust.state_code ||
            (effectiveGstin && /^\d{2}/.test(effectiveGstin) ? effectiveGstin.substring(0, 2) : homeStateCode);

          await tx.customer.update({
            where: { id: cust.id },
            data: {
              address: cleanAddress || cust.address,
              gstin: effectiveGstin,
              state_code: effectiveStateCode,
            },
          });
        } else {
          effectiveStateCode =
            cleanGstin && /^\d{2}/.test(cleanGstin) ? cleanGstin.substring(0, 2) : homeStateCode;
          const newCust = await tx.customer.create({
            data: {
              name: cleanName,
              name_norm: normalizeCustomerName(cleanName),
              address: cleanAddress,
              gstin: cleanGstin,
              state_code: effectiveStateCode,
            },
          });
          resolvedCustomerId = newCust.id;
        }
      }

      const isInterState =
        typeof requestedInterState === "boolean"
          ? requestedInterState
          : Boolean(effectiveStateCode && effectiveStateCode !== homeStateCode);

      // Run decimal calculation with per-line discount & IGST support
      const calc = calculateInvoice(lines, discountPct, { isInterState });

      // 3. Persist customer destination & metadata for next time (always updated on save)
      if (resolvedCustomerId) {
        await tx.setting.upsert({
          where: { key: `customer_meta_${resolvedCustomerId}` },
          create: {
            key: `customer_meta_${resolvedCustomerId}`,
            value: {
              phone: customerPhone || "",
              deliveryNote: deliveryNote || "",
              destination: cleanDestination,
              updated_at: new Date().toISOString(),
            },
          },
          update: {
            value: {
              phone: customerPhone || "",
              deliveryNote: deliveryNote || "",
              destination: cleanDestination,
              updated_at: new Date().toISOString(),
            },
          },
        });
      }

      // Metadata stored in invoice JSON
      const invoiceMetadata = {
        deliveryNote: deliveryNote || "",
        destination: cleanDestination,
        orderNo: orderNo || "",
        ewayBillNo: ewayBillNo || "",
        phone: customerPhone || "",
        copyType,
        hasWatermark,
        isInterState: calc.isInterState,
        discountPct: Number(discountPct || 0),
        gstSummaryLine: calc.gstSummaryLine,
        amountInWords: calc.amountInWords,
      };

      // 4. Create Invoice Header
      const invoice = await tx.invoice.create({
        data: {
          invoice_number: invoiceNumberToUse,
          invoice_number_norm: numberNorm,
          invoice_date: invoiceDate,
          financial_year: fy,
          customer_id: resolvedCustomerId,
          customer_name_snapshot: cleanName,
          customer_gstin_snapshot: effectiveGstin,
          taxable_total: new Decimal(calc.taxableTotal),
          discount_total: new Decimal(calc.discountAmount),
          discount_pct: new Decimal(calc.discountPct),
          cgst_total: new Decimal(calc.cgstTotal),
          sgst_total: new Decimal(calc.sgstTotal),
          igst_total: new Decimal(calc.igstTotal),
          round_off: new Decimal(calc.roundOffRaw),
          grand_total: new Decimal(calc.grandTotal),
          source_file_hash: "generator",
          source_file_key: null,
          warnings: invoiceMetadata as any,
        },
      });

      // 5. Create Invoice Items and Stock Movements (mapping to real underlying product for stock summary)
      for (let i = 0; i < calc.items.length; i++) {
        const item = calc.items[i];
        const rawLine = lines[i];

        let productId = rawLine.productId;

        // If productId was not explicitly sent or needs resolution:
        if (!productId) {
          const prodNameSearch = item.product.trim();
          // First check ProductAlias
          const aliasMatch = await tx.productAlias.findFirst({
            where: {
              alias: { equals: prodNameSearch, mode: "insensitive" },
            },
            include: { product: true },
          });

          if (aliasMatch) {
            productId = aliasMatch.product_id;
          } else {
            // Check Product code or name
            const prodMatch = await tx.product.findFirst({
              where: {
                OR: [
                  { code: { equals: prodNameSearch, mode: "insensitive" } },
                  { name: { equals: prodNameSearch, mode: "insensitive" } },
                ],
              },
            });

            if (prodMatch) {
              productId = prodMatch.id;
            } else {
              // Create as auto product
              const newProd = await tx.product.create({
                data: {
                  code: prodNameSearch.toUpperCase(),
                  name: prodNameSearch,
                  default_hsn: item.hsn || null,
                  pack_size_kg: item.pack ? new Decimal(item.pack) : null,
                  std_sale_rate: item.rate ? new Decimal(item.rate) : null,
                  source: "INVOICE_AUTO",
                  needs_review: true,
                },
              });
              productId = newProd.id;
            }
          }
        }

        const qtyVal = new Decimal(item.qty);

        // Create InvoiceItem
        const invoiceItem = await tx.invoiceItem.create({
          data: {
            invoice_id: invoice.id,
            line_no: item.sl,
            product_id: productId,
            product_name_raw: item.product,
            hsn: item.hsn || null,
            qty_kg: qtyVal,
            pack_size_kg: item.pack ? new Decimal(item.pack) : null,
            rate: new Decimal(item.rate),
            discount_pct: new Decimal(item.discountPct || 0),
            discount_amount: new Decimal(rawLine.qty || 0)
              .times(rawLine.rate || 0)
              .times(item.discountPct || 0)
              .dividedBy(100)
              .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
            taxable_amount: new Decimal(item.taxable),
            cgst_pct: new Decimal(item.cgstPct),
            sgst_pct: new Decimal(item.sgstPct),
            igst_pct: new Decimal(item.igstPct),
            cgst_amount: new Decimal(item.cgstAmount),
            sgst_amount: new Decimal(item.sgstAmount),
            igst_amount: new Decimal(item.igstAmount),
            line_total: new Decimal(item.amount),
          },
        });

        // Record StockMovement (SALE) to reflect in stock summary
        await tx.stockMovement.create({
          data: {
            product_id: productId,
            movement_date: invoiceDate,
            type: MovementType.SALE,
            qty_kg: qtyVal,
            source: MovementSource.INVOICE,
            invoice_item_id: invoiceItem.id,
            party_text: cleanName,
          },
        });
      }

      // 6. Post Sales Invoice to Customer Ledger Account
      if (process.env.FEATURE_LEDGER !== "false" && process.env.FEATURE_LEDGER !== "0") {
        await postSalesInvoiceToLedger(tx, {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoiceDate,
          customer_id: resolvedCustomerId,
          grand_total: calc.grandTotal,
        });
      }

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerName: cleanName,
        grandTotal: calc.grandTotal,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    if (error instanceof DuplicateInvoiceNumberError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error in POST /api/invoices/generate:", error);
    return NextResponse.json({ error: error.message || "Failed to generate invoice" }, { status: 500 });
  }
}
