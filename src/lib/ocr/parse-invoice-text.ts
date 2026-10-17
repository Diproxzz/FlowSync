import { normalizeRawExtractedInvoice } from "../llm/schema";
import { env } from "@/lib/env";

export interface ParsedDraftResult {
  customer: {
    name: string;
    gstin: string | null;
    address: string | null;
  };
  invoice: {
    number: string;
    date: string;
  };
  items: Array<{
    lineNo: number;
    productNameRaw: string;
    hsn: string | null;
    qtyKg: number;
    packSizeKg: number | null;
    rate: number;
    discountPct: number | null;
    discountAmount: number | null;
    taxableAmount: number;
    cgstPct: number;
    sgstPct: number;
    igstPct: number;
    cgstAmount: number | null;
    sgstAmount: number | null;
    lineTotal: number;
  }>;
  totals: {
    taxableSubtotal: number;
    discountPct: number | null;
    discountTotal: number | null;
    cgstTotal: number;
    sgstTotal: number;
    igstTotal: number;
    roundOff: number;
    grandTotal: number;
  };
  uncertainFields: string[];
}

/**
 * Normalizes any date string (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD) to YYYY-MM-DD
 */
export function normalizeDateToIso(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const cleaned = dateStr.trim().replace(/[./]/g, "-");

  // Format: DD-MM-YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Format: YYYY-MM-DD
  const ymdMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return cleaned;
}

/**
 * Converts OCR raw text or markdown table output into structured invoice JSON
 */
export function parseInvoiceTextToDraft(rawText: string): ParsedDraftResult {
  if (!rawText) {
    throw new Error("OCR returned empty text");
  }

  // 1. Check if the model returned a JSON block
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.customer || parsed.invoice || parsed.items) {
        return normalizeRawExtractedInvoice(parsed);
      }
    } catch {
      // Continue to heuristic text parser
    }
  }

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const companyGstin = (env.COMPANY_GSTIN || "19AVZPC2361G1ZA").toUpperCase();

  // 2. Extract Invoice Number
  let invoiceNumber = "";
  // Look for standard Indobest patterns: IB26-27/0473 or IB/26-27/0473 or Invoice No. ...
  const invNumPatterns = [
    /\b(IB[\s\/-]?\d{2}[-\/]?\d{2}\s*[\/-]\s*\d{3,5})\b/i,
    /(?:Invoice|Inv|Bill)\s*(?:No|Number|#)[.:\s]*([A-Z0-9\/-]+)/i,
    /\b([A-Z]{2,4}[-\/]\d{2}-\d{2}[-\/]\d{3,5})\b/i,
  ];

  for (const pat of invNumPatterns) {
    const match = rawText.match(pat);
    if (match && match[1]) {
      invoiceNumber = match[1].replace(/\s+/g, "").toUpperCase();
      break;
    }
  }

  // 3. Extract Invoice Date
  let invoiceDate = "";
  const datePatterns = [
    /(?:Dated?|Date|Inv\s*Date)[.:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
    /\b(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/,
  ];

  for (const pat of datePatterns) {
    const match = rawText.match(pat);
    if (match && match[1]) {
      invoiceDate = normalizeDateToIso(match[1]);
      break;
    }
  }
  if (!invoiceDate) {
    invoiceDate = new Date().toISOString().split("T")[0];
  }

  // 4. Extract Customer GSTIN
  let customerGstin: string | null = null;
  const gstinRegex = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/g;
  const allGstins = Array.from(rawText.matchAll(gstinRegex)).map((m) => m[1].toUpperCase());
  const nonCompanyGstins = allGstins.filter((g) => g !== companyGstin);
  if (nonCompanyGstins.length > 0) {
    customerGstin = nonCompanyGstins[0];
  }

  // 5. Extract Customer Name & Address
  let customerName = "";
  let customerAddress = "";

  const buyerMarkerPatterns = [
    /(?:Billed\s*To|Buyer|Party|Customer|M\/s|Messrs)[.:\s]+([^\n\r,]+)/i,
    /(?:Consignee|Name\s*of\s*Buyer)[.:\s]+([^\n\r,]+)/i,
  ];

  for (const pat of buyerMarkerPatterns) {
    const match = rawText.match(pat);
    if (match && match[1] && !match[1].toUpperCase().includes(env.COMPANY_NAME)) {
      customerName = match[1].trim();
      break;
    }
  }

  // If still empty, inspect lines around the customer GSTIN or above the invoice number
  if (!customerName || customerName.length < 3) {
    for (const line of lines) {
      const cleanLine = line.replace(/^[|*#\-:]+\s*/, "").trim();
      if (
        cleanLine.length >= 4 &&
        !/^\d+$/.test(cleanLine) &&
        !cleanLine.toUpperCase().includes(env.COMPANY_NAME) &&
        !cleanLine.toUpperCase().includes("INVOICE") &&
        !cleanLine.toUpperCase().includes("GSTIN") &&
        !cleanLine.toUpperCase().includes("PHONE") &&
        !cleanLine.toUpperCase().includes("E-MAIL") &&
        !cleanLine.toUpperCase().includes("ROAD") &&
        !cleanLine.toUpperCase().includes("KOLKATA") &&
        !cleanLine.toUpperCase().includes("DELIVERY") &&
        !cleanLine.toUpperCase().includes("DESTINATION") &&
        !cleanLine.toUpperCase().includes("ORDER") &&
        (cleanLine.includes("LIMITED") ||
          cleanLine.includes("LTD") ||
          cleanLine.includes("PVT") ||
          cleanLine.includes("ENTERPRISE") ||
          cleanLine.includes("INDUSTRIES") ||
          cleanLine.includes("COMPANY") ||
          cleanLine.includes("LEATHER") ||
          cleanLine.includes("TANNERY") ||
          cleanLine.includes("HORIZONS") ||
          cleanLine.includes("OVERSEAS"))
      ) {
        customerName = cleanLine;
        break;
      }
    }
  }

  // Fallback: search backwards from customer GSTIN
  if (!customerName && customerGstin) {
    const gstinLineIdx = lines.findIndex((l) => l.toUpperCase().includes(customerGstin!));
    if (gstinLineIdx > 0) {
      for (let i = Math.max(0, gstinLineIdx - 8); i < gstinLineIdx; i++) {
        const candidate = lines[i].replace(/^[|*#\-:]+\s*/, "").trim();
        if (
          candidate.length > 3 &&
          !/^\d+$/.test(candidate) &&
          !candidate.toUpperCase().includes(env.COMPANY_NAME) &&
          !candidate.toUpperCase().includes("INVOICE") &&
          !candidate.toUpperCase().includes("GSTIN") &&
          !candidate.toUpperCase().includes("ROAD") &&
          !candidate.toUpperCase().includes("WEST BENGAL")
        ) {
          customerName = candidate;
          break;
        }
      }
    }
  }

  if (!customerName) {
    customerName = "CUSTOMER / BUYER (UNRESOLVED)";
  }

  // 6. Extract Items
  const items: ParsedDraftResult["items"] = [];
  let isInterstate = customerGstin ? !customerGstin.startsWith("19") : false;

  // Pattern A: GLM OCR Indobest format: "1. 1800 120 SBL ACTOIL 34039100 127.00 228600.00 9.00 9.00 269748.00"
  const glmItemRegex = /^(\d+)\.?\s+([\d.]+)\s+([\d.]+)\s+(.+?)\s+(\d{4,8})\s+([\d.]+)\s+([\d.]+)(?:\s+([\d.]+))?(?:\s+([\d.]+))?\s+([\d.]+)$/;

  for (const line of lines) {
    const m = line.match(glmItemRegex);
    if (m && !line.toLowerCase().includes("total") && !line.toLowerCase().includes("subtotal")) {
      const lineNo = items.length + 1;
      const qtyKg = parseFloat(m[2]) || 1;
      const packSizeKg = parseFloat(m[3]) || null;
      const productNameRaw = m[4].trim();
      const hsn = m[5];
      const rate = parseFloat(m[6]) || 0;
      const taxableAmount = parseFloat(m[7]) || qtyKg * rate;
      const cgstPct = isInterstate ? 0 : parseFloat(m[8] || "9");
      const sgstPct = isInterstate ? 0 : parseFloat(m[9] || "9");
      const igstPct = isInterstate ? 18 : 0;
      const lineTotal = parseFloat(m[10]) || taxableAmount * 1.18;
      const cgstAmount = isInterstate ? 0 : Math.round(((taxableAmount * cgstPct) / 100) * 100) / 100;
      const sgstAmount = isInterstate ? 0 : Math.round(((taxableAmount * sgstPct) / 100) * 100) / 100;

      items.push({
        lineNo,
        productNameRaw,
        hsn,
        qtyKg,
        packSizeKg,
        rate,
        discountPct: null,
        discountAmount: null,
        taxableAmount,
        cgstPct,
        sgstPct,
        igstPct,
        cgstAmount,
        sgstAmount,
        lineTotal,
      });
    }
  }

  // Pattern B: Markdown table rows: "| 1 | BINDER P-200 | 3204 | 500.00 | 120.00 | 60000.00 |"
  if (items.length === 0) {
    const lineItemRegex = /(\d+)?\s*\|\s*([^|]+)\|\s*(\d{4,8})?\s*\|\s*([\d.]+)\s*(?:kgs?|kg)?\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i;
    for (const line of lines) {
      const rowMatch = line.match(lineItemRegex);
      if (rowMatch) {
        const lineNo = items.length + 1;
        const productNameRaw = rowMatch[2].trim();
        const hsn = rowMatch[3] ? rowMatch[3].trim() : null;
        const qtyKg = parseFloat(rowMatch[4]) || 1;
        const rate = parseFloat(rowMatch[5]) || 0;
        const taxableAmount = parseFloat(rowMatch[6]) || qtyKg * rate;
        const cgstPct = isInterstate ? 0 : 9;
        const sgstPct = isInterstate ? 0 : 9;
        const igstPct = isInterstate ? 18 : 0;
        const cgstAmount = isInterstate ? 0 : Math.round(((taxableAmount * 9) / 100) * 100) / 100;
        const sgstAmount = isInterstate ? 0 : Math.round(((taxableAmount * 9) / 100) * 100) / 100;
        const lineTotal = taxableAmount + (cgstAmount || 0) + (sgstAmount || 0);

        items.push({
          lineNo,
          productNameRaw,
          hsn,
          qtyKg,
          packSizeKg: null,
          rate,
          discountPct: null,
          discountAmount: null,
          taxableAmount,
          cgstPct,
          sgstPct,
          igstPct,
          cgstAmount,
          sgstAmount,
          lineTotal,
        });
      }
    }
  }

  // Fallback: General line items
  if (items.length === 0) {
    const itemFallbackRegex = /([A-Za-z0-9\s\-_/().]{4,40})\s+(\d{4,8})\s+([\d.]+)\s+(?:KGS?|KG)?\s*([\d.]+)\s+([\d.]+)/i;
    for (const line of lines) {
      const m = line.match(itemFallbackRegex);
      if (m && !line.toLowerCase().includes("total") && !line.toLowerCase().includes("subtotal")) {
        const lineNo = items.length + 1;
        const productNameRaw = m[1].trim();
        const hsn = m[2];
        const qtyKg = parseFloat(m[3]) || 1;
        const rate = parseFloat(m[4]) || 0;
        const taxableAmount = parseFloat(m[5]) || qtyKg * rate;
        const cgstPct = isInterstate ? 0 : 9;
        const sgstPct = isInterstate ? 0 : 9;
        const igstPct = isInterstate ? 18 : 0;
        const cgstAmount = isInterstate ? 0 : Math.round(((taxableAmount * 9) / 100) * 100) / 100;
        const sgstAmount = isInterstate ? 0 : Math.round(((taxableAmount * 9) / 100) * 100) / 100;

        items.push({
          lineNo,
          productNameRaw,
          hsn,
          qtyKg,
          packSizeKg: null,
          rate,
          discountPct: null,
          discountAmount: null,
          taxableAmount,
          cgstPct,
          sgstPct,
          igstPct,
          cgstAmount,
          sgstAmount,
          lineTotal: taxableAmount + (cgstAmount || 0) + (sgstAmount || 0),
        });
      }
    }
  }

  // Fallback default item if table wasn't matched
  if (items.length === 0) {
    items.push({
      lineNo: 1,
      productNameRaw: "INVOICE ITEMS (OCR DETECTED)",
      hsn: null,
      qtyKg: 1,
      packSizeKg: null,
      rate: 0,
      discountPct: null,
      discountAmount: null,
      taxableAmount: 0,
      cgstPct: isInterstate ? 0 : 9,
      sgstPct: isInterstate ? 0 : 9,
      igstPct: isInterstate ? 18 : 0,
      cgstAmount: 0,
      sgstAmount: 0,
      lineTotal: 0,
    });
  }

  // 7. Extract Totals
  let taxableSubtotal = items.reduce((acc, it) => acc + it.taxableAmount, 0);
  let cgstTotal = items.reduce((acc, it) => acc + (it.cgstAmount || 0), 0);
  let sgstTotal = items.reduce((acc, it) => acc + (it.sgstAmount || 0), 0);
  let igstTotal = isInterstate ? Math.round(((taxableSubtotal * 18) / 100) * 100) / 100 : 0;
  let roundOff = 0;
  let grandTotal = taxableSubtotal + cgstTotal + sgstTotal + igstTotal;

  // Search for explicit totals in text
  const taxableSubtotalMatch = rawText.match(/(?:Taxable\s*Amount|Sub\s*Total|Taxable\s*Value)[.:\s]*([\d,]+\.?\d*)/i);
  if (taxableSubtotalMatch) {
    taxableSubtotal = parseFloat(taxableSubtotalMatch[1].replace(/,/g, "")) || taxableSubtotal;
  }

  const grandTotalMatch = rawText.match(/(?:Grand\s*Total|Total\s*Amount|Invoice\s*Total|Total\s*Rs)[.:\s]*([\d,]+\.?\d*)/i);
  if (grandTotalMatch) {
    grandTotal = parseFloat(grandTotalMatch[1].replace(/,/g, "")) || grandTotal;
  }

  const sgstTotalMatch = rawText.match(/SGST(?:\s*\d+%)?[.:\s]*([\d,]+\.?\d*)/i);
  if (sgstTotalMatch) {
    sgstTotal = parseFloat(sgstTotalMatch[1].replace(/,/g, "")) || sgstTotal;
  }

  const cgstTotalMatch = rawText.match(/CGST(?:\s*\d+%)?[.:\s]*([\d,]+\.?\d*)/i);
  if (cgstTotalMatch) {
    cgstTotal = parseFloat(cgstTotalMatch[1].replace(/,/g, "")) || cgstTotal;
  }

  const igstTotalMatch = rawText.match(/IGST(?:\s*\d+%)?[.:\s]*([\d,]+\.?\d*)/i);
  if (igstTotalMatch) {
    igstTotal = parseFloat(igstTotalMatch[1].replace(/,/g, "")) || igstTotal;
  }

  const roundOffMatch = rawText.match(/(?:Round\s*Off|R\/O)[.:\s]*([-+]?[\d.]+)/i);
  if (roundOffMatch) {
    roundOff = parseFloat(roundOffMatch[1]) || 0;
  }

  const draft: ParsedDraftResult = {
    customer: {
      name: customerName,
      gstin: customerGstin,
      address: customerAddress || null,
    },
    invoice: {
      number: invoiceNumber || "IB-UNKNOWN",
      date: invoiceDate,
    },
    items,
    totals: {
      taxableSubtotal: Math.round(taxableSubtotal * 100) / 100,
      discountPct: null,
      discountTotal: null,
      cgstTotal: Math.round(cgstTotal * 100) / 100,
      sgstTotal: Math.round(sgstTotal * 100) / 100,
      igstTotal: Math.round(igstTotal * 100) / 100,
      roundOff: Math.round(roundOff * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
    },
    uncertainFields: [],
  };

  return normalizeRawExtractedInvoice(draft);
}
