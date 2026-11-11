import Decimal from "decimal.js";
import { numberToWordsINR } from "../format/number-to-words";

export interface InvoiceLineItemInput {
  sl?: number;
  qty: number | string;
  pack: string;
  product: string;
  batch?: string;
  hsn: string;
  rate: number | string;
  discountPct?: number | string;
  gstPct: number | string;
}

export interface CalculateInvoiceOptions {
  isInterState?: boolean;
}

export interface ProcessedLineItem {
  sl: number;
  qty: string;
  pack: string;
  product: string;
  batch: string;
  hsn: string;
  rate: string;
  discountPct: string;
  taxable: string;
  sgstPct: string;
  cgstPct: string;
  igstPct: string;
  sgstAmount: string;
  cgstAmount: string;
  igstAmount: string;
  amount: string;
}

export interface InvoiceCalculationResult {
  isInterState: boolean;
  totalQty: string;
  subTotal: string;
  discountPct: number;
  discountAmount: string;
  hasDiscount: boolean;
  taxableTotal: string;
  sgstTotal: string;
  cgstTotal: string;
  igstTotal: string;
  sgstRatePct: string;
  cgstRatePct: string;
  igstRatePct: string;
  unroundedTotal: string;
  roundOff: string;
  roundOffRaw: number;
  grandTotal: string;
  gstSummaryLine: string;
  amountInWords: string;
  items: ProcessedLineItem[];
}

export function calculateInvoice(
  lines: InvoiceLineItemInput[],
  globalDiscountPct: number | string = 0,
  options?: CalculateInvoiceOptions
): InvoiceCalculationResult {
  const isInterState = Boolean(options?.isInterState);
  const dGlobalDiscount = new Decimal(globalDiscountPct || 0);
  let subTotal = new Decimal(0);
  let totalDiscountAmount = new Decimal(0);
  let totalQty = new Decimal(0);

  const gstBreakdown = new Map<
    string,
    { gstRate: Decimal; halfRate: Decimal; taxable: Decimal; sgst: Decimal; cgst: Decimal; igst: Decimal }
  >();

  let totalSgst = new Decimal(0);
  let totalCgst = new Decimal(0);
  let totalIgst = new Decimal(0);

  const processedItems: ProcessedLineItem[] = lines.map((line, index) => {
    const qty = new Decimal(line.qty || 0);
    const rate = new Decimal(line.rate || 0);
    const lineVal = qty.times(rate);
    subTotal = subTotal.plus(lineVal);
    totalQty = totalQty.plus(qty);

    // If line has its own discountPct, use it; otherwise fallback to global discount
    const lineDiscPct =
      line.discountPct !== undefined && line.discountPct !== ""
        ? new Decimal(line.discountPct || 0)
        : dGlobalDiscount;

    const lineDiscount = lineVal
      .times(lineDiscPct)
      .dividedBy(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    totalDiscountAmount = totalDiscountAmount.plus(lineDiscount);

    const lineTaxable = lineVal.minus(lineDiscount);

    const gstRate = new Decimal(
      line.gstPct !== undefined && line.gstPct !== "" ? line.gstPct : 18
    );
    const halfRate = gstRate.dividedBy(2);

    let sgst = new Decimal(0);
    let cgst = new Decimal(0);
    let igst = new Decimal(0);

    if (isInterState) {
      igst = lineTaxable
        .times(gstRate)
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } else {
      sgst = lineTaxable
        .times(halfRate)
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      cgst = lineTaxable
        .times(halfRate)
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    const lineAmount = lineTaxable.plus(sgst).plus(cgst).plus(igst);

    totalSgst = totalSgst.plus(sgst);
    totalCgst = totalCgst.plus(cgst);
    totalIgst = totalIgst.plus(igst);

    const key = isInterState ? gstRate.toFixed(2) : halfRate.toFixed(2);
    const existing = gstBreakdown.get(key) || {
      gstRate,
      halfRate,
      taxable: new Decimal(0),
      sgst: new Decimal(0),
      cgst: new Decimal(0),
      igst: new Decimal(0),
    };
    existing.taxable = existing.taxable.plus(lineTaxable);
    existing.sgst = existing.sgst.plus(sgst);
    existing.cgst = existing.cgst.plus(cgst);
    existing.igst = existing.igst.plus(igst);
    gstBreakdown.set(key, existing);

    return {
      sl: line.sl ?? index + 1,
      qty: qty.toString(),
      pack: (line.pack || "").trim(),
      product: (line.product || "").trim(),
      batch: (line.batch || "").trim(),
      hsn: (line.hsn || "").trim(),
      rate: rate.toFixed(2),
      discountPct: lineDiscPct.toString(),
      taxable: lineTaxable.toFixed(2),
      sgstPct: isInterState ? "0.00" : halfRate.toFixed(2),
      cgstPct: isInterState ? "0.00" : halfRate.toFixed(2),
      igstPct: isInterState ? gstRate.toFixed(2) : "0.00",
      sgstAmount: sgst.toFixed(2),
      cgstAmount: cgst.toFixed(2),
      igstAmount: igst.toFixed(2),
      amount: lineAmount.toFixed(2),
    };
  });

  const taxableTotal = subTotal.minus(totalDiscountAmount);
  const unroundedTotal = taxableTotal.plus(totalSgst).plus(totalCgst).plus(totalIgst);
  const grandTotal = unroundedTotal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const roundOffRaw = grandTotal.minus(unroundedTotal).toNumber();
  const roundOffAbs = Math.abs(roundOffRaw);

  const gstParts: string[] = [];
  Array.from(gstBreakdown.values()).forEach((b) => {
    const taxNumStr = parseFloat(b.taxable.toFixed(2)).toString();
    if (isInterState) {
      const fullRateStr = parseFloat(b.gstRate.toFixed(2)).toString();
      gstParts.push(`${taxNumStr}*${fullRateStr}%=${b.igst.toFixed(2)}IGST`);
    } else {
      const rateStr = parseFloat(b.halfRate.toFixed(2)).toString();
      gstParts.push(
        `${taxNumStr}*${rateStr}+${rateStr}%=${b.sgst.toFixed(2)}SGST+${b.cgst.toFixed(2)}CGST`
      );
    }
  });

  const gstSummaryLine = `GST ${gstParts.join(", ")}, CESS:0%=0`;

  const rateKeys = Array.from(gstBreakdown.values());
  const sgstRatePct =
    !isInterState && rateKeys.length === 1
      ? `${parseFloat(rateKeys[0].halfRate.toFixed(2))} %`
      : "";
  const cgstRatePct =
    !isInterState && rateKeys.length === 1
      ? `${parseFloat(rateKeys[0].halfRate.toFixed(2))} %`
      : "";
  const igstRatePct =
    isInterState && rateKeys.length === 1
      ? `${parseFloat(rateKeys[0].gstRate.toFixed(2))} %`
      : "";

  // Effective discount % label if uniform
  let effectiveDiscountPct = dGlobalDiscount.toNumber();
  if (lines.length > 0 && lines[0].discountPct !== undefined && lines[0].discountPct !== "") {
    effectiveDiscountPct = new Decimal(lines[0].discountPct || 0).toNumber();
  }

  // If discount of all products is set to 0, then the Discount column does not appear
  const hasAnyDiscount =
    totalDiscountAmount.greaterThan(0) ||
    lines.some((l) => Number(l.discountPct || 0) > 0) ||
    dGlobalDiscount.greaterThan(0);

  return {
    isInterState,
    totalQty: totalQty.toFixed(3),
    subTotal: subTotal.toFixed(2),
    discountPct: effectiveDiscountPct,
    discountAmount: totalDiscountAmount.toFixed(2),
    hasDiscount: hasAnyDiscount,
    taxableTotal: taxableTotal.toFixed(2),
    sgstTotal: totalSgst.toFixed(2),
    cgstTotal: totalCgst.toFixed(2),
    igstTotal: totalIgst.toFixed(2),
    sgstRatePct,
    cgstRatePct,
    igstRatePct,
    unroundedTotal: unroundedTotal.toFixed(2),
    roundOff: roundOffAbs.toFixed(2),
    roundOffRaw,
    grandTotal: grandTotal.toFixed(2),
    gstSummaryLine,
    amountInWords: numberToWordsINR(grandTotal.toNumber()),
    items: processedItems,
  };
}
