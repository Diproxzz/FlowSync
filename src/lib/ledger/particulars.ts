/**
 * Formatting and parsing of Ledger particulars per §5.5
 */

export interface ParticularsData {
  entryType: string;
  docNo?: string | null;
  paymentMode?: string | null;
  instrumentNo?: string | null;
  instrumentDate?: string | Date | null;
  referencedDocs?: string[];
  narration?: string | null;
  particularsRaw?: string | null;
}

export function formatInstrumentDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Generates formatted particulars text.
 */
export function formatParticularsText(data: ParticularsData): string {
  const { entryType, docNo, paymentMode, instrumentNo, instrumentDate, referencedDocs, narration, particularsRaw } = data;

  if (entryType === "OPENING") {
    return "Opening Balance";
  }

  if (entryType === "SALE_INVOICE" || entryType === "PURCHASE_INVOICE") {
    return `Bill No. ${docNo || ""}`.trim();
  }

  if (entryType === "RECEIPT" || entryType === "PAYMENT") {
    const mode = instrumentNo || paymentMode || "Cheque";
    let text = `Cheque No. : ${mode}`;
    if (instrumentDate) {
      const dt = formatInstrumentDate(instrumentDate);
      if (dt) text += ` DT-${dt}`;
    }
    if (referencedDocs && referencedDocs.length > 0) {
      text += ` Ag. ${referencedDocs.join(",")}`;
    }
    return text;
  }

  if (narration) {
    return `${entryType}: ${narration}`;
  }

  return particularsRaw || entryType;
}

/**
 * Extracts referenced bill numbers from raw particulars string:
 * e.g. "Ag. *IB25-26/0657,*IB25-26/0664,IB26-27/0011"
 */
export function extractReferencedBills(
  text: string,
  statementFY: string = "26-27"
): {
  referencedDocs: string[];
  priorYearRefs: string[];
  truncated: boolean;
} {
  const referencedDocs: string[] = [];
  const priorYearRefs: string[] = [];

  const agIndex = text.indexOf("Ag.");
  if (agIndex === -1) {
    return { referencedDocs, priorYearRefs, truncated: false };
  }

  const afterAg = text.slice(agIndex + 3).trim();

  // Regex to match bill references like *IB25-26/0657 or IB26-27/0011
  const refRegex = /\*?([A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)/g;
  let match;
  while ((match = refRegex.exec(afterAg)) !== null) {
    const rawMatch = match[0];
    const cleanRef = rawMatch.startsWith("*") ? rawMatch.slice(1) : rawMatch;
    referencedDocs.push(cleanRef);

    // Check if prior year
    if (rawMatch.startsWith("*") || !cleanRef.includes(statementFY)) {
      priorYearRefs.push(cleanRef);
    }
  }

  // Check truncation: ends with comma, asterisk, incomplete prefix like "*I" or empty after Ag.
  const trimmed = afterAg.trim();
  const truncated =
    trimmed.endsWith(",") ||
    trimmed.endsWith("*") ||
    trimmed.endsWith("*I") ||
    trimmed.endsWith("*IB") ||
    trimmed.endsWith("/") ||
    (trimmed.length > 0 && referencedDocs.length === 0);

  return {
    referencedDocs,
    priorYearRefs,
    truncated,
  };
}
