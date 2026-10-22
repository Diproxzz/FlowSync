import { prisma } from "@/lib/db";
import { Prisma, MovementType, MovementSource, LedgerEntryType, LedgerEntrySource } from "@prisma/client";
import { normalizeCustomerName } from "@/lib/matching/normalize";
import { getOrCreateCustomerInformalLedgerAccount } from "@/lib/ledger/account-utils";

export interface InformalItemInput {
  product_name: string;
  qty_kg: number;
  rate: number;
}

export interface CreateInformalInvoiceInput {
  invoice_date: string; // YYYY-MM-DD
  invoice_number?: string;
  customer_name: string;
  items: InformalItemInput[];
  notes?: string;
}

export function getFinancialYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = (fyStart + 1) % 100;
  return `${fyStart}-${fyEnd < 10 ? "0" + fyEnd : fyEnd}`;
}

export async function getNextInformalInvoiceNumber(): Promise<string> {
  const currentFy = getFinancialYear(new Date());
  const count = await prisma.informalInvoice.count({
    where: { financial_year: currentFy },
  });
  const seq = count + 1;
  return `INF-${String(seq).padStart(4, "0")}`;
}

/**
 * Finds or auto-creates a Product for an informal invoice item.
 */
async function resolveProduct(productNameRaw: string, rate: number, tx: Prisma.TransactionClient) {
  const cleanName = productNameRaw.trim();
  const upper = cleanName.toUpperCase();

  // 1. Direct match by exact name or code
  let product = await tx.product.findFirst({
    where: {
      OR: [
        { name: { equals: cleanName, mode: "insensitive" } },
        { code: { equals: upper, mode: "insensitive" } },
        { aliases: { some: { alias: { equals: cleanName, mode: "insensitive" } } } },
      ],
    },
  });

  if (product) return product;

  // 2. Generate unique code and create product
  const prefix = cleanName
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase() || "INF";
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  let code = `${prefix}-${randomSuffix}`;

  // Ensure code uniqueness
  const existingCode = await tx.product.findUnique({ where: { code } });
  if (existingCode) {
    code = `INF-${Date.now().toString(36).toUpperCase()}`;
  }

  product = await tx.product.create({
    data: {
      code,
      name: cleanName,
      category: "Informal Sales",
      std_sale_rate: new Prisma.Decimal(rate > 0 ? rate : 0),
      source: "MANUAL",
    },
  });

  return product;
}

/**
 * Finds or auto-creates a Customer mapped purely by Name.
 */
async function resolveCustomerByName(customerNameRaw: string, tx: Prisma.TransactionClient) {
  const cleanName = customerNameRaw.trim();
  const normName = normalizeCustomerName(cleanName);

  // 1. Match existing customer by name or normalized name or alias
  let customer = await tx.customer.findFirst({
    where: {
      OR: [
        { name: { equals: cleanName, mode: "insensitive" } },
        { name_norm: normName },
        { aliases: { some: { alias: { equals: cleanName, mode: "insensitive" } } } },
        { aliases: { some: { alias_norm: normName } } },
      ],
    },
  });

  if (!customer) {
    customer = await tx.customer.create({
      data: {
        name: cleanName,
        name_norm: normName,
        gstin: null, // No GST applicable for informal invoices
      },
    });
  }

  return customer;
}

export async function createInformalInvoice(input: CreateInformalInvoiceInput) {
  const { invoice_date, customer_name, items, notes } = input;

  if (!customer_name || !customer_name.trim()) {
    throw new Error("Customer name is required.");
  }
  if (!items || items.length === 0) {
    throw new Error("At least one product item is required.");
  }

  const invDate = new Date(invoice_date);
  if (isNaN(invDate.getTime())) {
    throw new Error("Invalid invoice date.");
  }

  const financialYear = getFinancialYear(invDate);

  // Determine invoice number
  let invNumber = input.invoice_number?.trim();
  if (!invNumber) {
    invNumber = await getNextInformalInvoiceNumber();
  }
  const invNumberNorm = invNumber.toUpperCase();

  // Check unique invoice number
  const existing = await prisma.informalInvoice.findUnique({
    where: { invoice_number_norm: invNumberNorm },
  });
  if (existing) {
    throw new Error(`Informal invoice number '${invNumber}' already exists.`);
  }

  // Validate items and calculate amounts (strictly non-GST: line total = qty * rate)
  const processedItems = items.map((it, idx) => {
    const q = Number(it.qty_kg);
    const r = Number(it.rate);
    if (isNaN(q) || q <= 0) {
      throw new Error(`Item ${idx + 1}: Quantity must be greater than 0.`);
    }
    if (isNaN(r) || r < 0) {
      throw new Error(`Item ${idx + 1}: Rate must be non-negative.`);
    }
    const amt = Math.round(q * r * 100) / 100;
    return {
      line_no: idx + 1,
      product_name: it.product_name.trim(),
      qty_kg: q,
      rate: r,
      amount: amt,
    };
  });

  const totalAmount = Math.round(
    processedItems.reduce((acc, it) => acc + it.amount, 0) * 100
  ) / 100;

  // Execute atomic creation across Invoice, Items, Stock Movements, Customer, and Ledger
  return await prisma.$transaction(async (tx) => {
    // 1. Resolve Customer by name
    const customer = await resolveCustomerByName(customer_name, tx);

    // 2. Create Informal Invoice
    const invoice = await tx.informalInvoice.create({
      data: {
        invoice_number: invNumber,
        invoice_number_norm: invNumberNorm,
        invoice_date: invDate,
        financial_year: financialYear,
        customer_id: customer.id,
        customer_name_snapshot: customer.name,
        total_amount: new Prisma.Decimal(totalAmount),
        notes: notes?.trim() || null,
      },
    });

    // 3. Create items and stock movements
    const itemsSummaryParts: string[] = [];
    for (const it of processedItems) {
      const product = await resolveProduct(it.product_name, it.rate, tx);
      itemsSummaryParts.push(`${product.name} (${it.qty_kg} kg)`);

      const createdItem = await tx.informalInvoiceItem.create({
        data: {
          informal_invoice_id: invoice.id,
          line_no: it.line_no,
          product_id: product.id,
          product_name_raw: it.product_name,
          qty_kg: new Prisma.Decimal(it.qty_kg),
          rate: new Prisma.Decimal(it.rate),
          amount: new Prisma.Decimal(it.amount),
        },
      });

      // Deduct stock via StockMovement (SALE)
      await tx.stockMovement.create({
        data: {
          product_id: product.id,
          movement_date: invDate,
          type: MovementType.SALE,
          qty_kg: new Prisma.Decimal(it.qty_kg),
          source: MovementSource.INFORMAL_INVOICE,
          party_text: customer.name,
          note: `Informal Invoice #${invNumber}`,
          informal_invoice_item_id: createdItem.id,
        },
      });
    }

    // 4. Resolve or create customer's Informal Ledger Account
    // (Separate from regular ledger account)
    let informalAccount = await tx.ledgerAccount.findUnique({
      where: { informal_customer_id: customer.id },
    });

    if (!informalAccount) {
      const informalDisplayName = `${customer.name} (Informal)`;
      informalAccount = await tx.ledgerAccount.create({
        data: {
          account_type: "CUSTOMER",
          is_informal: true,
          informal_customer_id: customer.id,
          display_name: informalDisplayName,
          credit_days: 90,
        },
      });
    }

    // 5. Post debit entry to the customer's Informal Ledger
    const itemsSummary = itemsSummaryParts.join(", ");
    await tx.ledgerEntry.create({
      data: {
        account_id: informalAccount.id,
        entry_date: invDate,
        entry_type: LedgerEntryType.SALE_INVOICE,
        debit: new Prisma.Decimal(totalAmount),
        credit: new Prisma.Decimal(0),
        doc_no: invNumber,
        doc_no_norm: invNumberNorm,
        informal_invoice_id: invoice.id,
        particulars_raw: `Informal Sale - ${itemsSummary.slice(0, 200)}`,
        narration: notes?.trim() || "Informal Invoice",
        source: LedgerEntrySource.INVOICE_AUTO,
      },
    });

    return invoice;
  });
}

export async function deleteInformalInvoice(id: string) {
  return await prisma.$transaction(async (tx) => {
    // Delete linked ledger entry
    await tx.ledgerEntry.deleteMany({
      where: { informal_invoice_id: id },
    });

    // Delete stock movements linked to items of this invoice
    const items = await tx.informalInvoiceItem.findMany({
      where: { informal_invoice_id: id },
      select: { id: true },
    });
    const itemIds = items.map((i) => i.id);

    if (itemIds.length > 0) {
      await tx.stockMovement.deleteMany({
        where: { informal_invoice_item_id: { in: itemIds } },
      });
    }

    // Delete invoice (items cascade delete)
    return await tx.informalInvoice.delete({
      where: { id },
    });
  });
}
