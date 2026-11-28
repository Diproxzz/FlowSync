import { prisma } from "@/lib/db";
import Decimal from "decimal.js";

export type Gstr1FilterMode = "month" | "quarter" | "fy" | "custom";
export type Gstr1Quarter = "Q1" | "Q2" | "Q3" | "Q4";

export interface Gstr1Filter {
  mode: Gstr1FilterMode;
  month?: string; // YYYY-MM
  fy?: string; // e.g. "2026-27"
  quarter?: Gstr1Quarter;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

export interface Gstr1InvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  customerName: string;
  customerGstin: string | null;
  stateCode: string | null;
  supplyType: "Intra-State" | "Inter-State";
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
}

export interface Gstr1RateRow {
  rateLabel: string;
  taxRatePct: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

export interface Gstr1HsnRow {
  hsn: string;
  itemCount: number;
  totalQtyKg: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

export interface Gstr1Summary {
  totalInvoices: number;
  b2bCount: number;
  b2cCount: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  totalTax: number;
  grandTotal: number;
}

export interface Gstr1Report {
  periodLabel: string;
  fromDate: string;
  toDate: string;
  summary: Gstr1Summary;
  b2b: Gstr1InvoiceRow[];
  b2c: Gstr1InvoiceRow[];
  rateSummary: Gstr1RateRow[];
  hsnSummary: Gstr1HsnRow[];
}

export function getCurrentIndianFy(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const startYear = month >= 4 ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endShort}`;
}

export function resolveGstr1DateRange(filter: Gstr1Filter): {
  start: Date;
  end: Date;
  fromDate: string;
  toDate: string;
  periodLabel: string;
} {
  const now = new Date();

  if (filter.mode === "month") {
    const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ym = filter.month && /^\d{4}-\d{2}$/.test(filter.month) ? filter.month : fallback;
    const [y, m] = ym.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const labelDate = new Date(Date.UTC(y, m - 1, 1));
    const periodLabel = labelDate.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return {
      start,
      end,
      fromDate: start.toISOString().slice(0, 10),
      toDate: end.toISOString().slice(0, 10),
      periodLabel,
    };
  }

  if (filter.mode === "quarter") {
    const fy = filter.fy && /^\d{4}-\d{2}$/.test(filter.fy) ? filter.fy : getCurrentIndianFy(now);
    const startYear = Number(fy.split("-")[0]);
    const q: Gstr1Quarter = filter.quarter || "Q1";
    let start: Date;
    let end: Date;
    let qDesc: string;

    switch (q) {
      case "Q1":
        start = new Date(Date.UTC(startYear, 3, 1)); // Apr 1
        end = new Date(Date.UTC(startYear, 5, 30, 23, 59, 59, 999)); // Jun 30
        qDesc = "Apr–Jun";
        break;
      case "Q2":
        start = new Date(Date.UTC(startYear, 6, 1)); // Jul 1
        end = new Date(Date.UTC(startYear, 8, 30, 23, 59, 59, 999)); // Sep 30
        qDesc = "Jul–Sep";
        break;
      case "Q3":
        start = new Date(Date.UTC(startYear, 9, 1)); // Oct 1
        end = new Date(Date.UTC(startYear, 11, 31, 23, 59, 59, 999)); // Dec 31
        qDesc = "Oct–Dec";
        break;
      case "Q4":
      default:
        start = new Date(Date.UTC(startYear + 1, 0, 1)); // Jan 1
        end = new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999)); // Mar 31
        qDesc = "Jan–Mar";
        break;
    }

    return {
      start,
      end,
      fromDate: start.toISOString().slice(0, 10),
      toDate: end.toISOString().slice(0, 10),
      periodLabel: `FY ${fy} · ${q} (${qDesc})`,
    };
  }

  if (filter.mode === "custom" && filter.from && filter.to) {
    const start = new Date(`${filter.from}T00:00:00.000Z`);
    const end = new Date(`${filter.to}T23:59:59.999Z`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const [s, e] = start <= end ? [start, end] : [end, start];
      const fStr = s.toISOString().slice(0, 10);
      const tStr = e.toISOString().slice(0, 10);
      return {
        start: s,
        end: e,
        fromDate: fStr,
        toDate: tStr,
        periodLabel: `Custom (${fStr} to ${tStr})`,
      };
    }
  }

  // Default: Financial Year
  const fy = filter.fy && /^\d{4}-\d{2}$/.test(filter.fy) ? filter.fy : getCurrentIndianFy(now);
  const startYear = Number(fy.split("-")[0]);
  const start = new Date(Date.UTC(startYear, 3, 1)); // Apr 1
  const end = new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999)); // Mar 31
  return {
    start,
    end,
    fromDate: start.toISOString().slice(0, 10),
    toDate: end.toISOString().slice(0, 10),
    periodLabel: `FY ${fy}`,
  };
}

export async function getGstr1Report(filter: Gstr1Filter): Promise<Gstr1Report> {
  const { start, end, fromDate, toDate, periodLabel } = resolveGstr1DateRange(filter);

  const invoices = await prisma.invoice.findMany({
    where: {
      invoice_date: {
        gte: start,
        lte: end,
      },
    },
    include: {
      customer: {
        select: {
          gstin: true,
          state_code: true,
          name: true,
        },
      },
      items: true,
    },
    orderBy: [{ invoice_date: "asc" }, { invoice_number: "asc" }],
  });

  const b2b: Gstr1InvoiceRow[] = [];
  const b2c: Gstr1InvoiceRow[] = [];

  let taxableTotal = new Decimal(0);
  let cgstTotal = new Decimal(0);
  let sgstTotal = new Decimal(0);
  let igstTotal = new Decimal(0);
  let grandTotal = new Decimal(0);

  const rateMap = new Map<
    string,
    {
      taxRatePct: number;
      taxableValue: Decimal;
      cgst: Decimal;
      sgst: Decimal;
      igst: Decimal;
    }
  >();

  const hsnMap = new Map<
    string,
    {
      itemCount: number;
      totalQtyKg: Decimal;
      taxableValue: Decimal;
      cgst: Decimal;
      sgst: Decimal;
      igst: Decimal;
    }
  >();

  for (const inv of invoices) {
    const gstin = (inv.customer_gstin_snapshot || inv.customer?.gstin || "").trim() || null;
    const taxable = new Decimal(inv.taxable_total.toString());
    const cgst = new Decimal(inv.cgst_total.toString());
    const sgst = new Decimal(inv.sgst_total.toString());
    const igst = new Decimal(inv.igst_total.toString());
    const roundOff = new Decimal(inv.round_off.toString());
    const grand = new Decimal(inv.grand_total.toString());
    const totalTax = cgst.plus(sgst).plus(igst);

    taxableTotal = taxableTotal.plus(taxable);
    cgstTotal = cgstTotal.plus(cgst);
    sgstTotal = sgstTotal.plus(sgst);
    igstTotal = igstTotal.plus(igst);
    grandTotal = grandTotal.plus(grand);

    const row: Gstr1InvoiceRow = {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date.toISOString().slice(0, 10),
      customerName: inv.customer_name_snapshot || inv.customer?.name || "Unknown",
      customerGstin: gstin,
      stateCode: inv.customer?.state_code || (gstin && gstin.length >= 2 ? gstin.slice(0, 2) : null),
      supplyType: igst.gt(0) ? "Inter-State" : "Intra-State",
      taxableValue: taxable.toNumber(),
      cgst: cgst.toNumber(),
      sgst: sgst.toNumber(),
      igst: igst.toNumber(),
      totalTax: totalTax.toNumber(),
      roundOff: roundOff.toNumber(),
      grandTotal: grand.toNumber(),
    };

    if (gstin) {
      b2b.push(row);
    } else {
      b2c.push(row);
    }

    for (const item of inv.items) {
      const itemTaxable = new Decimal(item.taxable_amount.toString());
      const itemCgst = new Decimal(item.cgst_amount.toString());
      const itemSgst = new Decimal(item.sgst_amount.toString());
      const itemIgst = new Decimal(item.igst_amount.toString());
      const itemQty = new Decimal(item.qty_kg.toString());

      const cgstPct = Number(item.cgst_pct.toString());
      const sgstPct = Number(item.sgst_pct.toString());
      const igstPct = Number(item.igst_pct.toString());
      const effectiveRate = igstPct > 0 ? igstPct : cgstPct + sgstPct;
      const rateKey = effectiveRate.toFixed(2);

      const existingRate = rateMap.get(rateKey) || {
        taxRatePct: effectiveRate,
        taxableValue: new Decimal(0),
        cgst: new Decimal(0),
        sgst: new Decimal(0),
        igst: new Decimal(0),
      };
      existingRate.taxableValue = existingRate.taxableValue.plus(itemTaxable);
      existingRate.cgst = existingRate.cgst.plus(itemCgst);
      existingRate.sgst = existingRate.sgst.plus(itemSgst);
      existingRate.igst = existingRate.igst.plus(itemIgst);
      rateMap.set(rateKey, existingRate);

      const hsnKey = (item.hsn || "UNSPECIFIED").trim() || "UNSPECIFIED";
      const existingHsn = hsnMap.get(hsnKey) || {
        itemCount: 0,
        totalQtyKg: new Decimal(0),
        taxableValue: new Decimal(0),
        cgst: new Decimal(0),
        sgst: new Decimal(0),
        igst: new Decimal(0),
      };
      existingHsn.itemCount += 1;
      existingHsn.totalQtyKg = existingHsn.totalQtyKg.plus(itemQty);
      existingHsn.taxableValue = existingHsn.taxableValue.plus(itemTaxable);
      existingHsn.cgst = existingHsn.cgst.plus(itemCgst);
      existingHsn.sgst = existingHsn.sgst.plus(itemSgst);
      existingHsn.igst = existingHsn.igst.plus(itemIgst);
      hsnMap.set(hsnKey, existingHsn);
    }
  }

  const rateSummary: Gstr1RateRow[] = Array.from(rateMap.entries())
    .sort((a, b) => a[1].taxRatePct - b[1].taxRatePct)
    .map(([, val]) => ({
      rateLabel: `${val.taxRatePct}% GST`,
      taxRatePct: val.taxRatePct,
      taxableValue: val.taxableValue.toNumber(),
      cgst: val.cgst.toNumber(),
      sgst: val.sgst.toNumber(),
      igst: val.igst.toNumber(),
      totalTax: val.cgst.plus(val.sgst).plus(val.igst).toNumber(),
    }));

  const hsnSummary: Gstr1HsnRow[] = Array.from(hsnMap.entries())
    .sort((a, b) => b[1].taxableValue.comparedTo(a[1].taxableValue))
    .map(([hsn, val]) => ({
      hsn,
      itemCount: val.itemCount,
      totalQtyKg: val.totalQtyKg.toNumber(),
      taxableValue: val.taxableValue.toNumber(),
      cgst: val.cgst.toNumber(),
      sgst: val.sgst.toNumber(),
      igst: val.igst.toNumber(),
      totalTax: val.cgst.plus(val.sgst).plus(val.igst).toNumber(),
    }));

  return {
    periodLabel,
    fromDate,
    toDate,
    summary: {
      totalInvoices: invoices.length,
      b2bCount: b2b.length,
      b2cCount: b2c.length,
      taxableTotal: taxableTotal.toNumber(),
      cgstTotal: cgstTotal.toNumber(),
      sgstTotal: sgstTotal.toNumber(),
      igstTotal: igstTotal.toNumber(),
      totalTax: cgstTotal.plus(sgstTotal).plus(igstTotal).toNumber(),
      grandTotal: grandTotal.toNumber(),
    },
    b2b,
    b2c,
    rateSummary,
    hsnSummary,
  };
}
