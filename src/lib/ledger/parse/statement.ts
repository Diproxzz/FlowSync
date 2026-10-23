import path from "path";
import { pathToFileURL } from "url";
import { ExtractedStatement, StatementEntry } from "./schema";
import { extractReferencedBills } from "../particulars";

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Converts "Apr 2" to "2026-04-02" based on statement start and end years.
 */
function resolveFullDate(monthStr: string, dayStr: string, startYear: number, endYear: number): string {
  const m = MONTH_MAP[monthStr.toLowerCase().slice(0, 3)] || 4;
  const year = m >= 4 ? startYear : endYear;
  const d = parseInt(dayStr, 10);
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseStatementText(rawText: string): ExtractedStatement {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let accountName = "Unknown Account";
  let periodFrom = "2026-04-01";
  let periodTo = "2026-10-16";
  let startYear = 2026;
  let endYear = 2026;

  // 1. Extract Account Name & Period from Header
  for (const line of lines) {
    const accMatch = line.match(/Ledger\s*Account\s*:\s*(.+)$/i);
    if (accMatch) {
      accountName = accMatch[1].trim();
    }

    const periodMatch = line.match(/(\d{2})[-/](\d{2})[-/](\d{4})\s*-\s*(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (periodMatch) {
      const [, d1, m1, y1, d2, m2, y2] = periodMatch;
      periodFrom = `${y1}-${m1}-${d1}`;
      periodTo = `${y2}-${m2}-${d2}`;
      startYear = parseInt(y1, 10);
      endYear = parseInt(y2, 10);
    }
  }

  const statementFY = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;

  // 2. Identify Total Row
  let printedDebitTotal = 0;
  let printedCreditTotal = 0;
  let printedClosingBalance = 0;
  let printedClosingSide: "Dr" | "Cr" = "Dr";

  const totalLineIndex = lines.findIndex((l) => /^Total\b/i.test(l));
  if (totalLineIndex !== -1) {
    const totalLine = lines[totalLineIndex];
    const totalAmounts = totalLine.match(/[\d,]+\.\d{2}(?:\s*(?:Dr|Cr))?/gi) || [];

    if (totalAmounts.length >= 3 && totalAmounts[0] && totalAmounts[1] && totalAmounts[2]) {
      // 3 amounts: Debit Total, Credit Total, Closing Balance
      printedDebitTotal = parseFloat(totalAmounts[0].replace(/,/g, ""));
      printedCreditTotal = parseFloat(totalAmounts[1].replace(/,/g, ""));
      const balStr = totalAmounts[2];
      printedClosingBalance = parseFloat(balStr.replace(/,/g, ""));
      if (/Cr/i.test(balStr)) printedClosingSide = "Cr";
    } else if (totalAmounts.length === 2 && totalAmounts[0] && totalAmounts[1]) {
      const firstStr = totalAmounts[0];
      const secondStr = totalAmounts[1];
      const firstVal = parseFloat(firstStr.replace(/,/g, ""));
      const secondVal = parseFloat(secondStr.replace(/,/g, ""));

      // In accounting ledgers, Debit/Credit column totals do not have Dr/Cr suffix; only the Balance column does.
      if (/Dr/i.test(secondStr)) {
        // Second amount is Closing Balance (Dr). The single column total is Debit Total; Credit Total is 0.
        printedDebitTotal = firstVal;
        printedCreditTotal = 0;
        printedClosingBalance = secondVal;
        printedClosingSide = "Dr";
      } else if (/Cr/i.test(secondStr)) {
        // Second amount is Closing Balance (Cr). The single column total is Credit Total; Debit Total is 0.
        printedDebitTotal = 0;
        printedCreditTotal = firstVal;
        printedClosingBalance = secondVal;
        printedClosingSide = "Cr";
      } else {
        // Neither has Dr/Cr - standard Debit Total and Credit Total where closing balance was zero
        printedDebitTotal = firstVal;
        printedCreditTotal = secondVal;
        const diff = printedDebitTotal - printedCreditTotal;
        printedClosingBalance = Math.abs(diff);
        printedClosingSide = diff >= 0 ? "Dr" : "Cr";
      }
    } else if (totalAmounts.length === 1) {
      const balStr = totalAmounts[0];
      const val = parseFloat(balStr.replace(/,/g, ""));
      if (/Cr/i.test(balStr)) {
        printedDebitTotal = 0;
        printedCreditTotal = val;
        printedClosingBalance = val;
        printedClosingSide = "Cr";
      } else {
        printedDebitTotal = val;
        printedCreditTotal = 0;
        printedClosingBalance = val;
        printedClosingSide = "Dr";
      }
    }
  }

  // 3. Process Table Rows
  const tableLines = totalLineIndex !== -1 ? lines.slice(0, totalLineIndex) : lines;

  // Filter out header lines
  const dataLines: string[] = [];
  let pastHeader = false;

  for (const line of tableLines) {
    if (/Date\s+Particulars\s+Debit/i.test(line)) {
      pastHeader = true;
      continue;
    }
    if (pastHeader) {
      dataLines.push(line);
    } else if (/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+/i.test(line)) {
      // Fallback if header line was missed
      pastHeader = true;
      dataLines.push(line);
    }
  }

  let openingBalance = 0;
  let openingSide: "Dr" | "Cr" = "Dr";
  const rawEntries: Array<{
    date: string;
    text: string;
    debit?: number;
    credit?: number;
    balance?: number;
    balanceSide?: "Dr" | "Cr";
  }> = [];

  let currentDate = `${startYear}-04-01`;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];

    // Check if line starts with a Date like "Apr 2" or "May 18"
    const dateMatch = line.match(/^([A-Za-z]{3})\s+(\d{1,2})\b/);
    let restOfLine = line;

    if (dateMatch) {
      currentDate = resolveFullDate(dateMatch[1], dateMatch[2], startYear, endYear);
      restOfLine = line.slice(dateMatch[0].length).trim();
    }

    // Check Opening Balance row
    if (/^Opening\s*Balance\b/i.test(restOfLine)) {
      const match = restOfLine.match(/([\d,]+\.\d{2})\s*(Dr|Cr)?/i);
      if (match) {
        openingBalance = parseFloat(match[1].replace(/,/g, ""));
        openingSide = match[2]?.toUpperCase() === "CR" ? "Cr" : "Dr";
      }
      continue;
    }

    // Check if line is an entry start:
    // 1) Explicit date at start (dateMatch !== null)
    // 2) Recognized transaction keyword (Bill, Cheque, RTGS, NEFT, UPI, IMPS, C/N, D/N, Ag., Agst, Against, Cash, Bank, By, To, Discount, Rebate, Entry No, Receipt, Payment, Journal)
    // 3) Or line ends with transaction amounts AND previous entry already has amounts (meaning this line cannot be a continuation of particulars)
    const matchesKeyword =
      /^(?:Bill\s*No\.?|Bill\b|Inv\s*No\.?|Invoice\s*No\.?|Cheque\s*No\.?|Chq\s*No\.?|RTGS|NEFT|UPI|IMPS|C\/N(?:\s*No\.?)?|D\/N(?:\s*No\.?)?|Credit\s*Note|Debit\s*Note|Ag\.?|Agst\b|Against\b|Cash\b|Bank\b|By\b|To\b|Discount\b|Rebate\b|Entry\s*No\.?|Receipt\b|Payment\b|Journal\b)(?:\s|$|:)/i.test(restOfLine);

    const lineHasAmounts = /[\d,]+\.\d{2}(?:\s*(?:Dr|Cr))?$/i.test(restOfLine);
    const prevHasAmounts =
      rawEntries.length > 0 &&
      /[\d,]+\.\d{2}(?:\s*(?:Dr|Cr))?$/i.test(rawEntries[rawEntries.length - 1].text);

    const isEntryStart = dateMatch !== null || matchesKeyword || (lineHasAmounts && prevHasAmounts);

    if (isEntryStart) {
      rawEntries.push({
        date: currentDate,
        text: restOfLine,
      });
    } else if (rawEntries.length > 0) {
      // Continuation of previous entry particulars (§5.1 rule 5)
      // When particulars wrap across lines, row 1 often contains:
      // "[PARTICULARS PART 1] [AMOUNTS]", and row 2 contains "[PARTICULARS PART 2]".
      // Re-stitch particulars directly without amounts in the middle.
      const prev = rawEntries[rawEntries.length - 1];
      const amountSuffixMatch = prev.text.match(/\s+([\d,]+\.\d{2}(?:\s+[\d,]+\.\d{2})?(?:\s*(?:Dr|Cr))?)$/i);
      if (amountSuffixMatch && amountSuffixMatch.index !== undefined) {
        const prevPart = prev.text.slice(0, amountSuffixMatch.index);
        const amounts = amountSuffixMatch[1];
        // If prev ends with cut token (e.g. *I, *IB, ,, -, /) or continuation starts with continuation chars, join seamlessly
        const needsSpace =
          /[a-z0-9]$/i.test(prevPart) &&
          /^[a-z]/i.test(restOfLine) &&
          !/\*I$/i.test(prevPart) &&
          !/\*IB$/i.test(prevPart);
        const joinedPart = needsSpace ? `${prevPart} ${restOfLine}` : `${prevPart}${restOfLine}`;
        prev.text = `${joinedPart} ${amounts}`;
      } else {
        prev.text += restOfLine;
      }
    }
  }

  // 4. Parse Each Raw Entry into a Structured StatementEntry
  const entries: StatementEntry[] = [];
  let runningBalSigned = openingSide === "Dr" ? openingBalance : -openingBalance;

  for (const raw of rawEntries) {
    const text = raw.text;

    // Extract all numbers matching amount format
    // Notice balance suffix Dr / Cr might be attached or separated
    const amountMatches = Array.from(text.matchAll(/([\d,]+\.\d{2})(?:\s*(Dr|Cr))?/gi));

    let debit = 0;
    let credit = 0;
    let printedBalance: number | null = null;
    let printedBalanceSide: "Dr" | "Cr" | null = null;

    if (amountMatches.length > 0) {
      // Last amount might be the balance if it has Dr/Cr suffix
      const lastMatch = amountMatches[amountMatches.length - 1];
      if (lastMatch[2]) {
        printedBalance = parseFloat(lastMatch[1].replace(/,/g, ""));
        printedBalanceSide = lastMatch[2].toUpperCase() === "CR" ? "Cr" : "Dr";
      }

      // Find debit or credit amount:
      // The transaction amount is the number appearing right before the balance (or the sole number)
      const txnMatchIndex = printedBalance !== null ? amountMatches.length - 2 : amountMatches.length - 1;
      if (txnMatchIndex >= 0) {
        const txnAmount = parseFloat(amountMatches[txnMatchIndex][1].replace(/,/g, ""));

        // 1. First test if running balance target uniquely matches debit or credit
        if (printedBalance !== null && printedBalanceSide !== null) {
          const targetBal = printedBalanceSide === "Dr" ? printedBalance : -printedBalance;
          const diffIfDebit = Math.abs(runningBalSigned + txnAmount - targetBal);
          const diffIfCredit = Math.abs(runningBalSigned - txnAmount - targetBal);

          if (diffIfCredit < 0.05 && diffIfDebit >= 0.05) {
            credit = txnAmount;
          } else if (diffIfDebit < 0.05 && diffIfCredit >= 0.05) {
            debit = txnAmount;
          }
        }

        // 2. Fallback heuristic if running balance comparison wasn't conclusive
        if (debit === 0 && credit === 0) {
          const isExplicitPurchase = /(?:Entry\s*No\.?\s*P|Purchase)/i.test(text);
          const isExplicitSale = /(?:Entry\s*No\.?\s*S|Sale)/i.test(text);
          const isCreditNote = /(?:C\/N|Credit\s*Note)\b/i.test(text);
          const isDebitNote = /(?:D\/N|Debit\s*Note)\b/i.test(text);
          const isBill = /Bill\s*No\./i.test(text);

          if (isExplicitPurchase || isCreditNote) {
            credit = txnAmount;
          } else if (isExplicitSale || isDebitNote) {
            debit = txnAmount;
          } else if (isBill) {
            if (printedDebitTotal === 0 && printedCreditTotal > 0) {
              credit = txnAmount;
            } else if (printedClosingSide === "Cr" && printedCreditTotal > printedDebitTotal) {
              credit = txnAmount;
            } else {
              debit = txnAmount;
            }
          } else {
            // Receipt / Payment / Cheque / RTGS
            if (printedCreditTotal === 0 && printedDebitTotal > 0) {
              debit = txnAmount;
            } else {
              credit = txnAmount;
            }
          }
        }

        // Advance running balance
        runningBalSigned += (debit - credit);
      }
    }

    // Remove numbers and balance from text to clean up particulars
    let cleanParticulars = text
      .replace(/([\d,]+\.\d{2})(?:\s*(?:Dr|Cr))?/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    // Fix broken invoice references caused by line wrapping or spacing (e.g. *I B25-26/0756 -> *IB25-26/0756)
    cleanParticulars = cleanParticulars
      .replace(/(\*I)\s+(B\d{2}-\d{2}\/\d+)/gi, "$1$2")
      .replace(/(\*?IB)\s+(\d{2}-\d{2}\/\d+)/gi, "$1$2")
      .replace(/(\*?[A-Za-z0-9_-]+)\s+(\/[A-Za-z0-9_-]+)/g, "$1$2")
      .replace(/(\*?[A-Za-z0-9_-]+\/)\s+([A-Za-z0-9_-]+)/g, "$1$2");

    // Clean dangling trailing cut-offs caused by PDF/print margin truncation (e.g. ,*I, ,*IB, ,IB, ,*, ,)
    cleanParticulars = cleanParticulars
      .replace(/,\s*\*?[A-Za-z0-9_-]{1,2}$/, "")
      .replace(/[,\s*]+$/, "")
      .trim();

    // Format references with space after commas for readable wrapping without hyphen splits
    cleanParticulars = cleanParticulars.replace(/,\s*(\*?[A-Za-z0-9])/g, ", $1");

    // Determine entry type and details
    let entryType: StatementEntry["entryType"] = "ADJUSTMENT";
    let docNo: string | null = null;
    let paymentMode: string | null = null;
    let instrumentNo: string | null = null;
    let instrumentDate: string | null = null;

    const billMatch = text.match(/Bill\s*No\.?\s*([A-Za-z0-9/_-]+)/i);
    const cnMatch = text.match(/(?:C\/N|Cr(?:\.|\s*)Note)\s*No\.?\s*([A-Za-z0-9/_-]+)/i);
    const dnMatch = text.match(/(?:D\/N|Dr(?:\.|\s*)Note)\s*No\.?\s*([A-Za-z0-9/_-]+)/i);
    const chequeMatch = text.match(/Cheque\s*No\.?\s*:\s*([A-Za-z0-9_-]+)/i);

    if (billMatch) {
      const isPurchase = credit > 0 || /(?:Entry\s*No\.?\s*P|Purchase)/i.test(text);
      entryType = isPurchase ? "PURCHASE_INVOICE" : "SALE_INVOICE";
      docNo = billMatch[1].trim();
      cleanParticulars = `Bill No. ${docNo}`;
    } else if (cnMatch) {
      entryType = "CREDIT_NOTE";
      docNo = cnMatch[1].trim();
    } else if (dnMatch) {
      entryType = "DEBIT_NOTE";
      docNo = dnMatch[1].trim();
    } else if (/\bC\/N\b|\bCredit\s*Note\b/i.test(text)) {
      entryType = "CREDIT_NOTE";
      const cnAny = text.match(/(?:C\/N|Credit\s*Note)[^\d]*([A-Za-z0-9/_-]+)/i);
      if (cnAny) docNo = cnAny[1].trim();
    } else if (/\bD\/N\b|\bDebit\s*Note\b/i.test(text)) {
      entryType = "DEBIT_NOTE";
      const dnAny = text.match(/(?:D\/N|Debit\s*Note)[^\d]*([A-Za-z0-9/_-]+)/i);
      if (dnAny) docNo = dnAny[1].trim();
    } else if (chequeMatch) {
      entryType = "RECEIPT";
      instrumentNo = chequeMatch[1].trim();
      if (/RTGS/i.test(instrumentNo)) paymentMode = "RTGS";
      else if (/NEFT/i.test(instrumentNo)) paymentMode = "NEFT";
      else paymentMode = "CHEQUE";
    } else if (/^RTGS\b/i.test(text)) {
      entryType = "RECEIPT";
      paymentMode = "RTGS";
      instrumentNo = "RTGS";
    } else if (/^NEFT\b/i.test(text)) {
      entryType = "RECEIPT";
      paymentMode = "NEFT";
      instrumentNo = "NEFT";
    } else if (/^(?:Ag\.?|Agst\b|Against\b)\b/i.test(text)) {
      entryType = credit > 0 ? "RECEIPT" : "PAYMENT";
      paymentMode = "BANK";
    } else if (credit > 0 && debit === 0) {
      entryType = "RECEIPT";
    }

    const dtMatch = text.match(/DT[-.\s]*(\d{2})[-.](\d{2})[-.](\d{4})/i);
    if (dtMatch) {
      const [, d, m, y] = dtMatch;
      instrumentDate = `${y}-${m}-${d}`;
    }

    const { referencedDocs, priorYearRefs } = extractReferencedBills(cleanParticulars, statementFY);

    entries.push({
      date: raw.date,
      entryType,
      docNo,
      paymentMode,
      instrumentNo,
      instrumentDate,
      referencedDocs,
      priorYearRefs,
      referencesTruncated: false,
      particularsRaw: cleanParticulars || text,
      debit,
      credit,
      printedBalance,
      printedBalanceSide,
    });
  }

  return {
    accountName,
    periodFrom,
    periodTo,
    openingBalance,
    openingSide,
    entries,
    printedTotals: {
      debit: printedDebitTotal,
      credit: printedCreditTotal,
      balance: printedClosingBalance,
      balanceSide: printedClosingSide,
    },
    warnings: [],
  };
}

/**
 * Parses statement from a PDF Buffer using pdfjs-dist text layer
 */
export async function parseStatementPdf(pdfBuffer: Buffer): Promise<ExtractedStatement> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const workerFile = path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerFile).href;
  } catch (err) {
    // ignore
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });

  const doc = await loadingTask.promise;
  const numPages = doc.numPages;
  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    // Group items by vertical position y (within ±2 pt)
    const items = content.items as any[];
    const rowsMap = new Map<number, any[]>();

    for (const item of items) {
      const y = Math.round(item.transform[5]);
      // Find matching row within 2pt tolerance
      let matchedY: number | null = null;
      for (const existingY of Array.from(rowsMap.keys())) {
        if (Math.abs(existingY - y) <= 2) {
          matchedY = existingY;
          break;
        }
      }

      if (matchedY !== null) {
        rowsMap.get(matchedY)!.push(item);
      } else {
        rowsMap.set(y, [item]);
      }
    }

    // Sort rows from top of page to bottom (descending y in PDF coordinates)
    const sortedY = Array.from(rowsMap.keys()).sort((a, b) => b - a);

    for (const y of sortedY) {
      const rowItems = rowsMap.get(y)!;
      // Sort left to right (ascending x)
      rowItems.sort((a, b) => a.transform[4] - b.transform[4]);
      const rowText = rowItems.map((it) => it.str).join(" ").trim();
      if (rowText) {
        allLines.push(rowText);
      }
    }
  }

  const fullText = allLines.join("\n");
  return parseStatementText(fullText);
}
