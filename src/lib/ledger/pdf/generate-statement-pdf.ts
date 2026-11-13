import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as fs from "fs";

export interface StatementPdfData {
  accountName: string;
  gstin?: string | null;
  stateCode?: string | null;
  address?: string | null;
  periodFrom: string;
  periodTo: string;
  openingBalance: number;
  openingSide: "Dr" | "Cr";
  periodDebit: number;
  periodCredit: number;
  totalDebitWithOpening: number;
  totalCreditWithOpening: number;
  closingBalance: number;
  closingSide: "Dr" | "Cr";
  entries: Array<{
    date: string;
    particulars: string;
    debit: number;
    credit: number;
    runningBalance: number;
    balanceSide: "Dr" | "Cr";
  }>;
}

function formatCurrency(val: number): string {
  if (val === 0) return "—";
  // Format as Indian Rupee style: 1,83,393.00
  const parts = val.toFixed(2).split(".");
  let intPart = parts[0];
  const decPart = parts[1];
  let lastThree = intPart.substring(intPart.length - 3);
  const otherNumbers = intPart.substring(0, intPart.length - 3);
  if (otherNumbers !== "") {
    lastThree = "," + lastThree;
  }
  const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
  return `Rs. ${formattedInt}.${decPart}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = String(d.getDate()).padStart(2, "0");
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

export async function generateStatementPdf(data: StatementPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4 width
  const pageHeight = 841.89; // A4 height
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // Colors
  const darkInk = rgb(0.08, 0.1, 0.13); // #141a21
  const mutedInk = rgb(0.35, 0.4, 0.45); // #596673
  const lightBg = rgb(0.96, 0.97, 0.98); // #f5f7fa
  const borderGray = rgb(0.85, 0.88, 0.91); // #d9e0e8
  const headerCardBg = rgb(0.94, 0.96, 0.98);
  const amberBorder = rgb(0.85, 0.45, 0.1);

  // 1. Company Letterhead
  page.drawText("INDOBEST", {
    x: margin,
    y: y - 18,
    font: fontBold,
    size: 18,
    color: darkInk,
  });

  page.drawText("19/10/2, GOBINDA KHATICK ROAD, KOLKATA-700046", {
    x: margin,
    y: y - 32,
    font: fontRegular,
    size: 8.5,
    color: mutedInk,
  });

  page.drawText("Phone: 8240892993   |   E-Mail: indobest@gmail.com", {
    x: margin,
    y: y - 44,
    font: fontRegular,
    size: 8.5,
    color: mutedInk,
  });

  y -= 54;

  // Divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: borderGray,
  });

  y -= 14;

  // 2. Customer & Period Info Header
  const accLabel = "LEDGER ACCOUNT : ";
  page.drawText(accLabel, {
    x: margin,
    y: y - 10,
    font: fontBold,
    size: 10,
    color: mutedInk,
  });

  page.drawText(`${data.accountName.toUpperCase()} (Customer)`, {
    x: margin + fontBold.widthOfTextAtSize(accLabel, 10),
    y: y - 10,
    font: fontBold,
    size: 10,
    color: darkInk,
  });

  // Right side: Statement Period
  const periodText = `${formatDate(data.periodFrom)} - ${formatDate(data.periodTo)}`;
  const periodLabel = "STATEMENT PERIOD";
  const periodLabelW = fontBold.widthOfTextAtSize(periodLabel, 8);
  const periodValW = fontBold.widthOfTextAtSize(periodText, 9.5);

  page.drawText(periodLabel, {
    x: pageWidth - margin - Math.max(periodLabelW, periodValW),
    y: y - 4,
    font: fontBold,
    size: 8,
    color: mutedInk,
  });

  page.drawText(periodText, {
    x: pageWidth - margin - Math.max(periodLabelW, periodValW),
    y: y - 17,
    font: fontBold,
    size: 9.5,
    color: darkInk,
  });

  y -= 24;

  if (data.gstin) {
    page.drawText(`GSTIN: ${data.gstin}    State: ${data.stateCode || "19"}`, {
      x: margin,
      y: y - 2,
      font: fontRegular,
      size: 8.5,
      color: mutedInk,
    });
    y -= 12;
  }

  if (data.address) {
    const cleanAddr = data.address.replace(/\r?\n/g, ", ");
    const truncatedAddr = cleanAddr.length > 70 ? cleanAddr.substring(0, 67) + "..." : cleanAddr;
    page.drawText(truncatedAddr, {
      x: margin,
      y: y - 2,
      font: fontRegular,
      size: 8.5,
      color: mutedInk,
    });
    y -= 14;
  }

  y -= 8;

  // 3. Summary Cards (4 Columns)
  const cardW = (contentWidth - 12) / 4;
  const cardH = 50;

  const cards = [
    {
      title: "Opening Balance",
      val: `${formatCurrency(data.openingBalance)} ${data.openingSide}`,
      sub: "Prior period carry-forward",
    },
    {
      title: "Period Debit",
      val: formatCurrency(data.periodDebit),
      sub: "Invoices & debit adjustments",
    },
    {
      title: "Period Credit",
      val: formatCurrency(data.periodCredit),
      sub: "Receipts & credit adjustments",
    },
    {
      title: "TOTAL DUE (CLOSING)",
      val: `${formatCurrency(data.closingBalance)} ${data.closingSide}`,
      sub: data.closingSide === "Dr" ? "Party owes you (Receivable)" : "Advance received",
      highlight: true,
    },
  ];

  cards.forEach((card, idx) => {
    const cardX = margin + idx * (cardW + 4);
    // Draw box
    page.drawRectangle({
      x: cardX,
      y: y - cardH,
      width: cardW,
      height: cardH,
      color: card.highlight ? rgb(0.99, 0.97, 0.92) : headerCardBg,
      borderColor: card.highlight ? amberBorder : borderGray,
      borderWidth: 1,
    });

    page.drawText(card.title.toUpperCase(), {
      x: cardX + 8,
      y: y - 14,
      font: fontBold,
      size: 7,
      color: card.highlight ? rgb(0.7, 0.35, 0.05) : mutedInk,
    });

    page.drawText(card.val, {
      x: cardX + 8,
      y: y - 28,
      font: fontBold,
      size: 9.5,
      color: card.highlight ? rgb(0.75, 0.2, 0.1) : darkInk,
    });

    page.drawText(card.sub, {
      x: cardX + 8,
      y: y - 41,
      font: fontRegular,
      size: 6.8,
      color: mutedInk,
    });
  });

  y -= cardH + 16;

  // 4. Table Header Function
  const colW = {
    date: 65,
    particulars: 215,
    debit: 80,
    credit: 80,
    balance: 83.28,
  };

  const drawTableHeader = (curPage: typeof page, curY: number) => {
    curPage.drawRectangle({
      x: margin,
      y: curY - 20,
      width: contentWidth,
      height: 20,
      color: rgb(0.93, 0.95, 0.97),
      borderColor: borderGray,
      borderWidth: 1,
    });

    let colX = margin + 8;
    curPage.drawText("DATE", { x: colX, y: curY - 14, font: fontBold, size: 8, color: darkInk });

    colX += colW.date;
    curPage.drawText("PARTICULARS", { x: colX, y: curY - 14, font: fontBold, size: 8, color: darkInk });

    colX += colW.particulars;
    const debTxt = "DEBIT";
    const debW = fontBold.widthOfTextAtSize(debTxt, 8);
    curPage.drawText(debTxt, { x: colX + colW.debit - debW - 8, y: curY - 14, font: fontBold, size: 8, color: darkInk });

    colX += colW.debit;
    const credTxt = "CREDIT";
    const credW = fontBold.widthOfTextAtSize(credTxt, 8);
    curPage.drawText(credTxt, { x: colX + colW.credit - credW - 8, y: curY - 14, font: fontBold, size: 8, color: darkInk });

    colX += colW.credit;
    const balTxt = "BALANCE";
    const balW = fontBold.widthOfTextAtSize(balTxt, 8);
    curPage.drawText(balTxt, { x: colX + colW.balance - balW - 8, y: curY - 14, font: fontBold, size: 8, color: darkInk });

    return curY - 20;
  };

  y = drawTableHeader(page, y);

  // 5. Table Rows
  for (let i = 0; i < data.entries.length; i++) {
    const entry = data.entries[i];

    // Check if particulars wrap to 2 lines
    const maxPartW = colW.particulars - 12;
    const partLines: string[] = [];
    if (fontRegular.widthOfTextAtSize(entry.particulars, 8) <= maxPartW) {
      partLines.push(entry.particulars);
    } else {
      // Split into words
      const words = entry.particulars.split(" ");
      let curLine = "";
      for (const w of words) {
        const testLine = curLine ? `${curLine} ${w}` : w;
        if (fontRegular.widthOfTextAtSize(testLine, 8) <= maxPartW) {
          curLine = testLine;
        } else {
          if (curLine) partLines.push(curLine);
          curLine = w;
        }
      }
      if (curLine) partLines.push(curLine);
    }

    const rowHeight = Math.max(20, partLines.length * 11 + 9);

    // Page break check
    if (y - rowHeight < margin + 40) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      y = drawTableHeader(page, y);
    }

    // Row zebra / border
    if (i % 2 === 1) {
      page.drawRectangle({
        x: margin,
        y: y - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.985, 0.99, 0.995),
      });
    }

    page.drawLine({
      start: { x: margin, y: y - rowHeight },
      end: { x: pageWidth - margin, y: y - rowHeight },
      thickness: 0.5,
      color: borderGray,
    });

    // Date
    let colX = margin + 8;
    page.drawText(formatDate(entry.date), {
      x: colX,
      y: y - 13,
      font: fontRegular,
      size: 8,
      color: darkInk,
    });

    // Particulars
    colX += colW.date;
    partLines.forEach((pLine, lineIdx) => {
      page.drawText(pLine, {
        x: colX,
        y: y - 13 - lineIdx * 11,
        font: fontRegular,
        size: 8,
        color: darkInk,
      });
    });

    // Debit
    colX += colW.particulars;
    const debStr = entry.debit > 0 ? formatCurrency(entry.debit) : "—";
    const debW = fontRegular.widthOfTextAtSize(debStr, 8);
    page.drawText(debStr, {
      x: colX + colW.debit - debW - 8,
      y: y - 13,
      font: fontRegular,
      size: 8,
      color: darkInk,
    });

    // Credit
    colX += colW.debit;
    const credStr = entry.credit > 0 ? formatCurrency(entry.credit) : "—";
    const credW = fontRegular.widthOfTextAtSize(credStr, 8);
    page.drawText(credStr, {
      x: colX + colW.credit - credW - 8,
      y: y - 13,
      font: fontRegular,
      size: 8,
      color: darkInk,
    });

    // Balance
    colX += colW.credit;
    const balStr = `${formatCurrency(entry.runningBalance)} ${entry.balanceSide}`;
    const balW = fontBold.widthOfTextAtSize(balStr, 8);
    page.drawText(balStr, {
      x: colX + colW.balance - balW - 8,
      y: y - 13,
      font: fontBold,
      size: 8,
      color: darkInk,
    });

    y -= rowHeight;
  }

  // 6. Summary Footer Row
  const footerRowH = 26;
  if (y - footerRowH < margin + 40) {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    y = drawTableHeader(page, y);
  }

  page.drawRectangle({
    x: margin,
    y: y - footerRowH,
    width: contentWidth,
    height: footerRowH,
    color: rgb(0.93, 0.95, 0.97),
    borderColor: borderGray,
    borderWidth: 1,
  });

  let footX = margin + 8;
  page.drawText("TOTAL", {
    x: footX,
    y: y - 16,
    font: fontBold,
    size: 8.5,
    color: darkInk,
  });

  footX += colW.date;
  page.drawText("Total (incl. opening) • Debit - Credit = Closing", {
    x: footX,
    y: y - 16,
    font: fontRegular,
    size: 7.5,
    color: mutedInk,
  });

  footX += colW.particulars;
  const totDebStr = formatCurrency(data.totalDebitWithOpening);
  const totDebW = fontBold.widthOfTextAtSize(totDebStr, 8.5);
  page.drawText(totDebStr, {
    x: footX + colW.debit - totDebW - 8,
    y: y - 16,
    font: fontBold,
    size: 8.5,
    color: darkInk,
  });

  footX += colW.debit;
  const totCredStr = formatCurrency(data.totalCreditWithOpening);
  const totCredW = fontBold.widthOfTextAtSize(totCredStr, 8.5);
  page.drawText(totCredStr, {
    x: footX + colW.credit - totCredW - 8,
    y: y - 16,
    font: fontBold,
    size: 8.5,
    color: darkInk,
  });

  footX += colW.credit;
  const totCloseStr = `${formatCurrency(data.closingBalance)} ${data.closingSide.toUpperCase()}`;
  const totCloseW = fontBold.widthOfTextAtSize(totCloseStr, 8.5);
  page.drawText(totCloseStr, {
    x: footX + colW.balance - totCloseW - 8,
    y: y - 16,
    font: fontBold,
    size: 8.5,
    color: rgb(0.75, 0.2, 0.1),
  });

  y -= footerRowH + 16;

  // 7. Page numbering on all pages
  const totalPages = doc.getPageCount();
  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const p = doc.getPage(pIdx);
    const pageNumText = `Page ${pIdx + 1} of ${totalPages}`;
    const pW = fontRegular.widthOfTextAtSize(pageNumText, 7.5);
    p.drawText(pageNumText, {
      x: (pageWidth - pW) / 2,
      y: margin - 14,
      font: fontRegular,
      size: 7.5,
      color: mutedInk,
    });
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
