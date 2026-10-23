import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateInvoice } from "@/lib/invoices/calculations";
import {
  peekNextInvoiceNumber,
  commitNextInvoiceNumber,
  getFinancialYearCode,
} from "@/lib/invoices/generator-sequence";
import { normalizeInvoiceNumber, normalizeCustomerName } from "@/lib/matching/normalize";
import { postSalesInvoiceToLedger } from "@/lib/ledger/posting";
import { MovementType, MovementSource } from "@prisma/client";
import Decimal from "decimal.js";

// Helper to determine the commercial name of a product
function getProductCommercialName(p: { code: string; name: string; aliases: { alias: string }[] }): string {
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
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const invoiceId = searchParams.get("id");
    const dateParam = searchParams.get("date");
    const numberParam = searchParams.get("number");

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

// POST: Save and commit generated invoice
export async function POST(request: NextRequest) {
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

    // Determine final invoice number
    let invoiceNumberToUse = (requestedInvoiceNumber || "").trim();
    if (!invoiceNumberToUse) {
      const peeked = await peekNextInvoiceNumber(invoiceDate);
      invoiceNumberToUse = peeked.invoiceNumber;
    }

    const numberNorm = normalizeInvoiceNumber(invoiceNumberToUse);

    // CRITICAL VALIDATION: It should not allow to save if invoice number matches with an existing invoice
    const existing = await prisma.invoice.findUnique({
      where: { invoice_number_norm: numberNorm },
      select: { id: true, invoice_number: true },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: `Invoice number '${invoiceNumberToUse}' already exists in database. Please enter a unique invoice number.`,
        },
        { status: 400 }
      );
    }

    // Run decimal calculation with per-line discount support
    const calc = calculateInvoice(lines, discountPct);

    // Save inside transaction
    const result = await prisma.$transaction(async (tx) => {
      const fy = getFinancialYearCode(invoiceDate);

      // Advance sequence setting if user consumed or incremented the standard sequence
      const seqMatch = invoiceNumberToUse.match(new RegExp(`^IB${fy}/(\\d+)`));
      if (seqMatch) {
        const seqVal = parseInt(seqMatch[1], 10);
        if (!isNaN(seqVal)) {
          const settingKey = `invoice_generator_seq_${fy}`;
          const currentSetting = await tx.setting.findUnique({ where: { key: settingKey } });
          const currentLast = (currentSetting?.value as any)?.last_sequence || 0;
          if (seqVal >= currentLast) {
            await tx.setting.upsert({
              where: { key: settingKey },
              create: {
                key: settingKey,
                value: { last_sequence: seqVal, updated_at: new Date().toISOString() },
              },
              update: {
                value: { last_sequence: seqVal, updated_at: new Date().toISOString() },
              },
            });
          }
        }
      }

      // 2. Resolve Customer
      let resolvedCustomerId = customerId;
      const cleanGstin = (customerGstin || "").trim().toUpperCase() || null;
      const cleanName = customerName.trim();
      const cleanAddress = (customerAddress || "").trim() || null;
      const cleanDestination = (destination || "").trim();

      if (resolvedCustomerId) {
        await tx.customer.update({
          where: { id: resolvedCustomerId },
          data: {
            address: cleanAddress,
            gstin: cleanGstin,
            state_code: cleanGstin ? cleanGstin.substring(0, 2) : "19",
          },
        });
      } else {
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
          await tx.customer.update({
            where: { id: cust.id },
            data: {
              address: cleanAddress || cust.address,
              gstin: cleanGstin || cust.gstin,
              state_code: cleanGstin ? cleanGstin.substring(0, 2) : cust.state_code || "19",
            },
          });
        } else {
          const newCust = await tx.customer.create({
            data: {
              name: cleanName,
              name_norm: normalizeCustomerName(cleanName),
              address: cleanAddress,
              gstin: cleanGstin,
              state_code: cleanGstin ? cleanGstin.substring(0, 2) : "19",
            },
          });
          resolvedCustomerId = newCust.id;
        }
      }

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
          customer_gstin_snapshot: cleanGstin,
          taxable_total: new Decimal(calc.taxableTotal),
          discount_total: new Decimal(calc.discountAmount),
          discount_pct: new Decimal(calc.discountPct),
          cgst_total: new Decimal(calc.cgstTotal),
          sgst_total: new Decimal(calc.sgstTotal),
          igst_total: new Decimal(0),
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
            cgst_amount: new Decimal(item.cgstAmount),
            sgst_amount: new Decimal(item.sgstAmount),
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
      await postSalesInvoiceToLedger(tx, {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        invoice_date: invoiceDate,
        customer_id: resolvedCustomerId,
        grand_total: calc.grandTotal,
      });

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
    console.error("Error in POST /api/invoices/generate:", error);
    return NextResponse.json({ error: error.message || "Failed to generate invoice" }, { status: 500 });
  }
}
