import { prisma } from "@/lib/db";
import { findMatchingGuides, TaskGuide } from "./knowledge";
import { formatINR } from "@/lib/format";

export interface PartyDeepSummary {
  id: string;
  name: string;
  type: "CUSTOMER" | "SUPPLIER";
  gstin?: string | null;
  balanceFormatted: string;
  balanceSide: "Dr" | "Cr";
  dueExplanation: string;
  totalBilled: string;
  totalPaidReceived: string;
  recentInvoices: Array<{ number: string; date: string; amount: string; url: string }>;
  recentReceipts: Array<{ date: string; amount: string; mode?: string | null; particulars?: string | null }>;
  url: string;
}

export interface ProductDeepSummary {
  id: string;
  code: string;
  name: string;
  currentStockKg: number;
  saleRate: string;
  packSize: string;
  soldThisMonthKg: number;
  soldThisMonthAmount: string;
  soldThisYearKg: number;
  soldThisYearAmount: string;
  soldTotalKg: number;
  soldTotalAmount: string;
  recentSales: Array<{ invoiceNumber: string; date: string; buyer: string; qtyKg: number; amount: string; url: string }>;
  url: string;
}

export interface OverallSalesSummary {
  thisMonthCount: number;
  thisMonthVolumeKg: number;
  thisMonthRevenue: string;
  thisYearCount: number;
  thisYearVolumeKg: number;
  thisYearRevenue: string;
}

export interface CustomerRevenueRank {
  name: string;
  totalRevenue: string;
  totalRevenueRaw: number;
  totalVolumeKg: number;
  invoiceCount: number;
  shareOfTotalPct: string;
  url: string;
}

export interface ProductRevenueRank {
  name: string;
  code: string;
  totalRevenue: string;
  totalRevenueRaw: number;
  totalVolumeKg: number;
  shareOfTotalPct: string;
  url: string;
}

export interface BusinessAnalyticsSummary {
  totalSalesLifetime: string;
  totalSalesLifetimeRaw: number;
  totalSalesInvoicesCount: number;
  averageInvoiceValue: string;
  highestInvoice: { number: string; date: string; customer: string; amount: string; url: string } | null;
  thisMonthSales: { count: number; volumeKg: number; revenue: string };
  thisYearSales: { count: number; volumeKg: number; revenue: string };
  topCustomersByRevenue: CustomerRevenueRank[];
  topProductsByRevenue: ProductRevenueRank[];
  topProductsByVolume: ProductRevenueRank[];
  totalReceivables: string;
  totalReceivablesRaw: number;
  activeDebtorsCount: number;
  topDebtors: Array<{ name: string; due: string; dueRaw: number; url: string }>;
  totalPurchasesLifetime: string;
  totalPurchasesCount: number;
  totalPayables: string;
  totalPayablesRaw: number;
  topCreditors: Array<{ name: string; payable: string; payableRaw: number; url: string }>;
  totalStockVolumeKg: number;
  totalStockEstimatedValue: string;
  topStockProducts: Array<{ name: string; code: string; stockKg: number; rate: string }>;
}

export interface RetrievedContext {
  guides: TaskGuide[];
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    party: string;
    grandTotal: string;
    itemsSummary: string;
    url: string;
  }>;
  purchaseInvoices: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    supplier: string;
    grandTotal: string;
    url: string;
  }>;
  partySummaries: PartyDeepSummary[];
  productSummaries: ProductDeepSummary[];
  overallSales?: OverallSalesSummary;
  topDebtors?: Array<{ name: string; due: string; url: string }>;
  analytics?: BusinessAnalyticsSummary;
  systemStats?: {
    totalSalesInvoices: number;
    totalPurchases: number;
    totalCustomers: number;
    totalSuppliers: number;
    totalProducts: number;
  };
  sources: Array<{ title: string; url: string }>;
}

const STOPWORDS = new Set([
  "how", "much", "many", "money", "of", "is", "are", "was", "were", "due", "has", "have", "had", "been",
  "sold", "sell", "sale", "sales", "this", "that", "the", "a", "an", "month", "year", "today",
  "yesterday", "what", "balance", "total", "in", "for", "to", "from", "and", "or", "tell",
  "me", "show", "give", "can", "you", "we", "our", "customer", "supplier", "party", "product",
  "chemical", "stock", "outstanding", "overdue", "rate", "price", "rupees", "rs", "inr", "amount",
  "find", "lookup", "check", "view", "get", "details", "info", "record", "list"
]);

function extractCandidateSearchTerms(query: string): string[] {
  const cleaned = query
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned
    .split(" ")
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  const candidates: string[] = [];

  // Individual tokens (e.g. "abdin", "sna", "tiger")
  for (const w of words) {
    candidates.push(w);
  }

  // 2-word combinations (e.g. "tiger international", "abdin leather")
  for (let i = 0; i < words.length - 1; i++) {
    candidates.push(`${words[i]} ${words[i + 1]}`);
  }

  // 3-word combinations
  for (let i = 0; i < words.length - 2; i++) {
    candidates.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }

  return Array.from(new Set(candidates));
}

export async function retrieveContextForQuery(query: string): Promise<RetrievedContext> {
  const cleanQuery = query.trim();
  const qLower = cleanQuery.toLowerCase();
  const searchCandidates = extractCandidateSearchTerms(cleanQuery);

  const sources: Array<{ title: string; url: string }> = [];

  // 1. Task Guides from Knowledge Base
  const matchedGuides = findMatchingGuides(cleanQuery);
  for (const g of matchedGuides.slice(0, 2)) {
    sources.push({ title: g.title, url: g.route });
  }

  // Time boundaries
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const startOfFY = new Date("2026-04-01T00:00:00.000Z");

  // 2. Deep Customer & Supplier Match (e.g. "how much money of Abdin is due")
  const partySummaries: PartyDeepSummary[] = [];
  const partyFilters = [
    cleanQuery,
    ...searchCandidates,
  ].filter((t) => t.length >= 2);

  if (partyFilters.length > 0) {
    const matchedAccounts = await prisma.ledgerAccount.findMany({
      where: {
        OR: [
          ...partyFilters.map((term) => ({
            display_name: { contains: term, mode: "insensitive" as const },
          })),
          ...partyFilters.map((term) => ({
            customer: { name: { contains: term, mode: "insensitive" as const } },
          })),
          ...partyFilters.map((term) => ({
            customer: { aliases: { some: { alias: { contains: term, mode: "insensitive" as const } } } },
          })),
          ...partyFilters.map((term) => ({
            supplier: { name: { contains: term, mode: "insensitive" as const } },
          })),
        ],
      },
      include: {
        customer: true,
        supplier: true,
        entries: {
          where: { is_void: false },
          orderBy: { entry_date: "asc" },
        },
      },
      take: 4,
    });

    for (const acc of matchedAccounts) {
      let balance = 0;
      let totalBilled = 0;
      let totalPaidReceived = 0;

      for (const e of acc.entries) {
        const d = Number(e.debit);
        const c = Number(e.credit);
        balance += d - c;

        if (e.entry_type === "SALE_INVOICE" || e.entry_type === "PURCHASE_INVOICE") {
          totalBilled += acc.account_type === "CUSTOMER" ? d : c;
        } else if (e.entry_type === "RECEIPT" || e.entry_type === "PAYMENT") {
          totalPaidReceived += acc.account_type === "CUSTOMER" ? c : d;
        }
      }

      const isCustomer = acc.account_type === "CUSTOMER";
      const absBal = Math.abs(balance);
      const balanceSide: "Dr" | "Cr" = balance >= 0 ? "Dr" : "Cr";

      let dueExplanation = "";
      if (Math.abs(balance) < 0.01) {
        dueExplanation = `${acc.display_name} has zero outstanding balance (Account is fully settled).`;
      } else if (isCustomer) {
        if (balance > 0) {
          dueExplanation = `${acc.display_name} owes Indobest ₹${absBal.toLocaleString("en-IN", { minimumFractionDigits: 2 })} (Receivable / Dr balance).`;
        } else {
          dueExplanation = `${acc.display_name} has an advance credit of ₹${absBal.toLocaleString("en-IN", { minimumFractionDigits: 2 })} held with Indobest (Cr).`;
        }
      } else {
        // Supplier
        if (balance < 0) {
          dueExplanation = `Indobest owes ${acc.display_name} ₹${absBal.toLocaleString("en-IN", { minimumFractionDigits: 2 })} (Payable / Cr balance).`;
        } else {
          dueExplanation = `Indobest has an advance paid to ${acc.display_name} of ₹${absBal.toLocaleString("en-IN", { minimumFractionDigits: 2 })} (Dr).`;
        }
      }

      // Fetch recent invoices
      let recentInvoices: Array<{ number: string; date: string; amount: string; url: string }> = [];
      if (acc.customer_id) {
        const invs = await prisma.invoice.findMany({
          where: { customer_id: acc.customer_id },
          orderBy: { invoice_date: "desc" },
          take: 4,
        });
        recentInvoices = invs.map((i) => ({
          number: i.invoice_number,
          date: i.invoice_date.toISOString().split("T")[0],
          amount: formatINR(Number(i.grand_total)),
          url: `/invoices/${i.id}`,
        }));
      } else if (acc.supplier_id) {
        const pinvs = await prisma.purchaseInvoice.findMany({
          where: { supplier_id: acc.supplier_id },
          orderBy: { invoice_date: "desc" },
          take: 4,
        });
        recentInvoices = pinvs.map((pi) => ({
          number: pi.supplier_invoice_number,
          date: pi.invoice_date.toISOString().split("T")[0],
          amount: formatINR(Number(pi.grand_total)),
          url: `/purchases`,
        }));
      }

      const recentReceipts = acc.entries
        .filter((e) => e.entry_type === "RECEIPT" || e.entry_type === "PAYMENT")
        .slice(-3)
        .map((e) => ({
          date: e.entry_date.toISOString().split("T")[0],
          amount: formatINR(Number(acc.account_type === "CUSTOMER" ? e.credit : e.debit)),
          mode: e.payment_mode,
          particulars: e.particulars_raw || undefined,
        }));

      const url = `/accounts/${acc.id}`;
      partySummaries.push({
        id: acc.id,
        name: acc.display_name,
        type: acc.account_type,
        gstin: acc.customer?.gstin || acc.supplier?.gstin || null,
        balanceFormatted: formatINR(absBal),
        balanceSide,
        dueExplanation,
        totalBilled: formatINR(totalBilled),
        totalPaidReceived: formatINR(totalPaidReceived),
        recentInvoices,
        recentReceipts,
        url,
      });

      if (!sources.some((s) => s.url === url)) {
        sources.push({ title: `${acc.display_name} Ledger`, url });
      }
    }
  }

  // 3. Deep Product Sales & Inventory Match (e.g. "how much sna has been sold this month")
  const productSummaries: ProductDeepSummary[] = [];
  const productTerms = [cleanQuery, ...searchCandidates].filter((t) => t.length >= 2);

  if (productTerms.length > 0) {
    const matchedProducts = await prisma.product.findMany({
      where: {
        OR: [
          ...productTerms.map((term) => ({
            code: { equals: term, mode: "insensitive" as const },
          })),
          ...productTerms.map((term) => ({
            code: { contains: term, mode: "insensitive" as const },
          })),
          ...productTerms.map((term) => ({
            name: { contains: term, mode: "insensitive" as const },
          })),
          ...productTerms.map((term) => ({
            aliases: { some: { alias: { contains: term, mode: "insensitive" as const } } },
          })),
        ],
      },
      include: {
        stock_movements: {
          select: { type: true, qty_kg: true },
        },
      },
      take: 4,
    });

    for (const prod of matchedProducts) {
      // Calculate live stock from movements
      let totalStock = 0;
      for (const m of prod.stock_movements) {
        const qty = Number(m.qty_kg);
        if (m.type === "OPENING" || m.type === "PURCHASE") {
          totalStock += qty;
        } else if (m.type === "SALE") {
          totalStock -= qty;
        } else if (m.type === "ADJUSTMENT") {
          totalStock += qty;
        }
      }

      // Query all sales items for this product
      const salesItems = await prisma.invoiceItem.findMany({
        where: { product_id: prod.id },
        include: {
          invoice: {
            select: {
              id: true,
              invoice_number: true,
              invoice_date: true,
              customer_name_snapshot: true,
            },
          },
        },
        orderBy: {
          invoice: { invoice_date: "desc" },
        },
      });

      let soldThisMonthKg = 0;
      let soldThisMonthAmount = 0;
      let soldThisYearKg = 0;
      let soldThisYearAmount = 0;
      let soldTotalKg = 0;
      let soldTotalAmount = 0;

      const recentSales: ProductDeepSummary["recentSales"] = [];

      for (const item of salesItems) {
        const qty = Number(item.qty_kg);
        const amount = Number(item.line_total || item.taxable_amount || 0);
        const invDate = new Date(item.invoice.invoice_date);

        soldTotalKg += qty;
        soldTotalAmount += amount;

        if (invDate >= startOfThisMonth && invDate <= endOfThisMonth) {
          soldThisMonthKg += qty;
          soldThisMonthAmount += amount;
        }

        if (invDate >= startOfFY) {
          soldThisYearKg += qty;
          soldThisYearAmount += amount;
        }

        if (recentSales.length < 5) {
          recentSales.push({
            invoiceNumber: item.invoice.invoice_number,
            date: invDate.toISOString().split("T")[0],
            buyer: item.invoice.customer_name_snapshot,
            qtyKg: qty,
            amount: formatINR(amount),
            url: `/invoices/${item.invoice.id}`,
          });
        }
      }

      const url = `/products`;
      productSummaries.push({
        id: prod.id,
        code: prod.code,
        name: prod.name,
        currentStockKg: Math.round(totalStock * 1000) / 1000,
        saleRate: prod.std_sale_rate ? `₹${Number(prod.std_sale_rate).toFixed(2)}` : "—",
        packSize: prod.pack_size_kg ? `${Number(prod.pack_size_kg)} kg` : "—",
        soldThisMonthKg: Math.round(soldThisMonthKg * 1000) / 1000,
        soldThisMonthAmount: formatINR(soldThisMonthAmount),
        soldThisYearKg: Math.round(soldThisYearKg * 1000) / 1000,
        soldThisYearAmount: formatINR(soldThisYearAmount),
        soldTotalKg: Math.round(soldTotalKg * 1000) / 1000,
        soldTotalAmount: formatINR(soldTotalAmount),
        recentSales,
        url,
      });

      if (!sources.some((s) => s.url === url)) {
        sources.push({ title: `${prod.name} Stock & Sales`, url });
      }
    }
  }

  // 4. Overall Sales (if user asks about total sales this month / this year)
  let overallSales: OverallSalesSummary | undefined = undefined;
  if (
    qLower.includes("sold this month") ||
    qLower.includes("sales this month") ||
    qLower.includes("total sales") ||
    qLower.includes("revenue this month")
  ) {
    const allInvoices = await prisma.invoice.findMany({
      select: {
        invoice_date: true,
        grand_total: true,
        items: { select: { qty_kg: true } },
      },
    });

    let mCount = 0, mKg = 0, mRev = 0;
    let yCount = 0, yKg = 0, yRev = 0;

    for (const inv of allInvoices) {
      const d = new Date(inv.invoice_date);
      const rev = Number(inv.grand_total);
      const kg = inv.items.reduce((acc, it) => acc + Number(it.qty_kg), 0);

      if (d >= startOfThisMonth && d <= endOfThisMonth) {
        mCount++;
        mKg += kg;
        mRev += rev;
      }
      if (d >= startOfFY) {
        yCount++;
        yKg += kg;
        yRev += rev;
      }
    }

    overallSales = {
      thisMonthCount: mCount,
      thisMonthVolumeKg: Math.round(mKg),
      thisMonthRevenue: formatINR(mRev),
      thisYearCount: yCount,
      thisYearVolumeKg: Math.round(yKg),
      thisYearRevenue: formatINR(yRev),
    };
  }

  // 5. Top Debtors (if asking about who owes the most, debtors, total overdue)
  let topDebtors: Array<{ name: string; due: string; url: string }> | undefined = undefined;
  if (qLower.includes("debtor") || qLower.includes("overdue") || qLower.includes("receivable") || qLower.includes("who owes")) {
    const customerAccounts = await prisma.ledgerAccount.findMany({
      where: { account_type: "CUSTOMER" },
      include: {
        entries: { where: { is_void: false }, select: { debit: true, credit: true } },
      },
    });

    const debtorsList = customerAccounts
      .map((acc) => {
        let bal = 0;
        for (const e of acc.entries) bal += Number(e.debit) - Number(e.credit);
        return { name: acc.display_name, dueAmount: bal, url: `/accounts/${acc.id}` };
      })
      .filter((d) => d.dueAmount > 0)
      .sort((a, b) => b.dueAmount - a.dueAmount)
      .slice(0, 5)
      .map((d) => ({ name: d.name, due: formatINR(d.dueAmount), url: d.url }));

    if (debtorsList.length > 0) {
      topDebtors = debtorsList;
    }
  }

  // 6. Direct Invoice Number Search
  const invoiceNumMatches = cleanQuery.match(/([a-zA-Z]{1,4}[\w\-\/]*\d+|\b\d{3,5}\b)/gi) || [];
  const invoicesFound: RetrievedContext["invoices"] = [];
  const purchaseInvoicesFound: RetrievedContext["purchaseInvoices"] = [];

  if (invoiceNumMatches.length > 0) {
    const salesInvoices = await prisma.invoice.findMany({
      where: {
        OR: invoiceNumMatches.map((term) => ({
          invoice_number: { contains: term, mode: "insensitive" as const },
        })),
      },
      include: {
        items: { include: { product: true }, take: 4 },
      },
      take: 3,
    });

    for (const inv of salesInvoices) {
      const itemsList = inv.items
        .map((it) => `${it.product?.name || it.product_name_raw} (${Number(it.qty_kg)} kg)`)
        .join(", ");
      const url = `/invoices/${inv.id}`;
      invoicesFound.push({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        date: inv.invoice_date.toISOString().split("T")[0],
        party: inv.customer_name_snapshot,
        grandTotal: formatINR(Number(inv.grand_total)),
        itemsSummary: itemsList || "No item lines",
        url,
      });
      if (!sources.some((s) => s.url === url)) {
        sources.push({ title: `Invoice ${inv.invoice_number}`, url });
      }
    }
  }

  // 7. Calculative, Comparative, Ranking, and Aggregation Analytics
  const isCalculativeOrAggregateQuery =
    /\b(most|highest|top|best|biggest|largest|lowest|least|rank|ranking|revenue|sales|turnover|total|sum|average|avg|debtor|debtors|receivable|receivables|payable|payables|creditor|creditors|stock|inventory|valuation|worth|percentage|share|how much|compare|overall|summary|many|all|calculate|calc|more)\b/i.test(cleanQuery) ||
    /give(s)?\s+(me\s+)?(the\s+)?most/i.test(cleanQuery);

  let analytics: BusinessAnalyticsSummary | undefined = undefined;
  if (
    isCalculativeOrAggregateQuery ||
    (partySummaries.length === 0 && productSummaries.length === 0 && invoicesFound.length === 0)
  ) {
    analytics = await computeBusinessAnalytics();

    if (/customer|sales|revenue|invoice/i.test(cleanQuery)) {
      if (!sources.some((s) => s.url === "/customers")) {
        sources.push({ title: "Customer Directory", url: "/customers" });
      }
      if (!sources.some((s) => s.url === "/invoices")) {
        sources.push({ title: "Sales Invoices", url: "/invoices" });
      }
    }
    if (/product|chemical|stock/i.test(cleanQuery)) {
      if (!sources.some((s) => s.url === "/stock")) {
        sources.push({ title: "Stock Summary", url: "/stock" });
      }
    }
    if (/debtor|due|receivable|owe/i.test(cleanQuery)) {
      if (!sources.some((s) => s.url === "/accounts")) {
        sources.push({ title: "Debtor List", url: "/accounts" });
      }
    }
  }

  return {
    guides: matchedGuides,
    invoices: invoicesFound,
    purchaseInvoices: purchaseInvoicesFound,
    partySummaries,
    productSummaries,
    overallSales,
    topDebtors,
    analytics,
    sources: sources.slice(0, 5),
  };
}

/**
 * Computes live, accurate, aggregate business analytics across InVoiceR's database:
 * Customer sales rankings, product revenues & volumes, lifetime & FY sales totals,
 * debtor & creditor balances, and stock valuations.
 */
export async function computeBusinessAnalytics(): Promise<BusinessAnalyticsSummary> {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const startOfFY = new Date("2026-04-01T00:00:00.000Z");

  const [invoices, purchases, accounts, products] = await Promise.all([
    prisma.invoice.findMany({
      select: {
        id: true,
        invoice_number: true,
        invoice_date: true,
        customer_id: true,
        customer_name_snapshot: true,
        grand_total: true,
        items: {
          select: {
            product_id: true,
            product_name_raw: true,
            qty_kg: true,
            taxable_amount: true,
            product: { select: { name: true, code: true, std_sale_rate: true } },
          },
        },
      },
    }),
    prisma.purchaseInvoice.findMany({
      select: {
        id: true,
        supplier_invoice_number: true,
        invoice_date: true,
        supplier_name_snapshot: true,
        grand_total: true,
      },
    }),
    prisma.ledgerAccount.findMany({
      include: {
        entries: {
          where: { is_void: false },
          select: { debit: true, credit: true },
        },
      },
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        std_sale_rate: true,
        stock_movements: { select: { type: true, qty_kg: true } },
      },
    }),
  ]);

  // 1. Invoices & Customer Rankings
  let totalSalesLifetimeRaw = 0;
  let highestInvoice: { number: string; date: string; customer: string; amount: string; url: string } | null = null;
  let highestInvAmount = 0;

  let mCount = 0, mKg = 0, mRev = 0;
  let yCount = 0, yKg = 0, yRev = 0;

  const customerMap: Record<string, { name: string; revenue: number; kg: number; count: number; url: string }> = {};
  const productRevenueMap: Record<string, { name: string; code: string; revenue: number; kg: number }> = {};

  for (const inv of invoices) {
    const invAmt = Number(inv.grand_total);
    totalSalesLifetimeRaw += invAmt;
    const invDate = new Date(inv.invoice_date);

    if (invAmt > highestInvAmount) {
      highestInvAmount = invAmt;
      highestInvoice = {
        number: inv.invoice_number,
        date: invDate.toISOString().split("T")[0],
        customer: inv.customer_name_snapshot,
        amount: formatINR(invAmt),
        url: `/invoices/${inv.id}`,
      };
    }

    let invKg = 0;
    for (const it of inv.items) {
      const kg = Number(it.qty_kg);
      const taxAmt = Number(it.taxable_amount);
      invKg += kg;

      const pKey = it.product?.code || it.product_name_raw;
      const pName = it.product?.name || it.product_name_raw;
      if (!productRevenueMap[pKey]) {
        productRevenueMap[pKey] = { name: pName, code: pKey, revenue: 0, kg: 0 };
      }
      productRevenueMap[pKey].revenue += taxAmt;
      productRevenueMap[pKey].kg += kg;
    }

    if (invDate >= startOfThisMonth && invDate <= endOfThisMonth) {
      mCount++;
      mKg += invKg;
      mRev += invAmt;
    }
    if (invDate >= startOfFY) {
      yCount++;
      yKg += invKg;
      yRev += invAmt;
    }

    const cKey = inv.customer_id || inv.customer_name_snapshot;
    if (!customerMap[cKey]) {
      customerMap[cKey] = {
        name: inv.customer_name_snapshot,
        revenue: 0,
        kg: 0,
        count: 0,
        url: inv.customer_id ? `/customers/${inv.customer_id}` : `/invoices`,
      };
    }
    customerMap[cKey].revenue += invAmt;
    customerMap[cKey].kg += invKg;
    customerMap[cKey].count += 1;
  }

  const avgInvValue = invoices.length > 0 ? totalSalesLifetimeRaw / invoices.length : 0;

  const topCustomersByRevenue = Object.values(customerMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((c) => ({
      name: c.name,
      totalRevenue: formatINR(c.revenue),
      totalRevenueRaw: c.revenue,
      totalVolumeKg: Math.round(c.kg),
      invoiceCount: c.count,
      shareOfTotalPct: totalSalesLifetimeRaw > 0 ? ((c.revenue / totalSalesLifetimeRaw) * 100).toFixed(1) + "%" : "0%",
      url: c.url,
    }));

  const topProductsByRevenue = Object.values(productRevenueMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      code: p.code,
      totalRevenue: formatINR(p.revenue),
      totalRevenueRaw: p.revenue,
      totalVolumeKg: Math.round(p.kg),
      shareOfTotalPct: totalSalesLifetimeRaw > 0 ? ((p.revenue / totalSalesLifetimeRaw) * 100).toFixed(1) + "%" : "0%",
      url: `/products`,
    }));

  const topProductsByVolume = Object.values(productRevenueMap)
    .sort((a, b) => b.kg - a.kg)
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      code: p.code,
      totalRevenue: formatINR(p.revenue),
      totalRevenueRaw: p.revenue,
      totalVolumeKg: Math.round(p.kg),
      shareOfTotalPct: totalSalesLifetimeRaw > 0 ? ((p.revenue / totalSalesLifetimeRaw) * 100).toFixed(1) + "%" : "0%",
      url: `/products`,
    }));

  // 2. Debtors & Creditors
  let totalReceivablesRaw = 0;
  let totalPayablesRaw = 0;
  const debtorsList: Array<{ name: string; dueRaw: number; due: string; url: string }> = [];
  const creditorsList: Array<{ name: string; payableRaw: number; payable: string; url: string }> = [];

  for (const acc of accounts) {
    let bal = 0;
    for (const e of acc.entries) bal += Number(e.debit) - Number(e.credit);

    if (acc.account_type === "CUSTOMER") {
      if (bal > 0) {
        totalReceivablesRaw += bal;
        debtorsList.push({ name: acc.display_name, dueRaw: bal, due: formatINR(bal), url: `/accounts/${acc.id}` });
      }
    } else if (acc.account_type === "SUPPLIER") {
      if (bal < 0) {
        const p = Math.abs(bal);
        totalPayablesRaw += p;
        creditorsList.push({ name: acc.display_name, payableRaw: p, payable: formatINR(p), url: `/accounts/${acc.id}` });
      }
    }
  }

  debtorsList.sort((a, b) => b.dueRaw - a.dueRaw);
  creditorsList.sort((a, b) => b.payableRaw - a.payableRaw);

  // 3. Purchases
  let totalPurchasesLifetimeRaw = 0;
  for (const p of purchases) {
    totalPurchasesLifetimeRaw += Number(p.grand_total);
  }

  // 4. Stock
  let totalStockVolumeKg = 0;
  let totalStockValuationRaw = 0;
  const stockItems: Array<{ name: string; code: string; stockKg: number; rate: string }> = [];

  for (const p of products) {
    let sKg = 0;
    for (const m of p.stock_movements) {
      const q = Number(m.qty_kg);
      if (m.type === "SALE") {
        sKg -= q;
      } else {
        sKg += q;
      }
    }
    totalStockVolumeKg += sKg;
    const rate = Number(p.std_sale_rate || 0);
    totalStockValuationRaw += sKg * rate;
    if (sKg > 0) {
      stockItems.push({ name: p.name, code: p.code, stockKg: Math.round(sKg), rate: rate > 0 ? `₹${rate.toFixed(2)}` : "—" });
    }
  }
  stockItems.sort((a, b) => b.stockKg - a.stockKg);

  return {
    totalSalesLifetime: formatINR(totalSalesLifetimeRaw),
    totalSalesLifetimeRaw,
    totalSalesInvoicesCount: invoices.length,
    averageInvoiceValue: formatINR(avgInvValue),
    highestInvoice,
    thisMonthSales: {
      count: mCount,
      volumeKg: Math.round(mKg),
      revenue: formatINR(mRev),
    },
    thisYearSales: {
      count: yCount,
      volumeKg: Math.round(yKg),
      revenue: formatINR(yRev),
    },
    topCustomersByRevenue,
    topProductsByRevenue,
    topProductsByVolume,
    totalReceivables: formatINR(totalReceivablesRaw),
    totalReceivablesRaw,
    activeDebtorsCount: debtorsList.length,
    topDebtors: debtorsList.slice(0, 10),
    totalPurchasesLifetime: formatINR(totalPurchasesLifetimeRaw),
    totalPurchasesCount: purchases.length,
    totalPayables: formatINR(totalPayablesRaw),
    totalPayablesRaw,
    topCreditors: creditorsList.slice(0, 10),
    totalStockVolumeKg: Math.round(totalStockVolumeKg),
    totalStockEstimatedValue: formatINR(totalStockValuationRaw),
    topStockProducts: stockItems.slice(0, 10),
  };
}
