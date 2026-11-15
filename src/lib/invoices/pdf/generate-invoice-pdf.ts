import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceDate: string;
  orderNo?: string | null;
  deliveryNote?: string | null;
  destination?: string | null;
  ewayBillNo?: string | null;
  customerName: string;
  customerGstin?: string | null;
  customerAddress?: string | null;
  customerStateCode?: string | null;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff?: number;
  grandTotal: number;
  items: Array<{
    lineNo: number;
    description: string;
    productCode?: string;
    hsn?: string | null;
    qtyKg: number;
    packKg?: number | null;
    rate: number;
    discountPct?: number | null;
    taxableAmount: number;
    gstPct: number;
    lineTotal: number;
  }>;
}

function formatINR(val: number): string {
  const parts = Math.abs(val).toFixed(2).split(".");
  let intPart = parts[0];
  const decPart = parts[1];
  let lastThree = intPart.substring(intPart.length - 3);
  const otherNumbers = intPart.substring(0, intPart.length - 3);
  if (otherNumbers !== "") {
    lastThree = "," + lastThree;
  }
  const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
  return `${val < 0 ? "-" : ""}${formattedInt}.${decPart}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return dateStr;
  }
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4 portrait width
  const pageHeight = 841.89; // A4 portrait height
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;

  const page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const darkInk = rgb(0.08, 0.1, 0.13);
  const mutedInk = rgb(0.35, 0.4, 0.45);
  const lightBg = rgb(0.96, 0.97, 0.98);
  const borderGray = rgb(0.7, 0.75, 0.8);

  // Outer border box around the invoice
  page.drawRectangle({
    x: margin,
    y: margin,
    width: contentWidth,
    height: pageHeight - margin * 2,
    borderWidth: 1,
    borderColor: borderGray,
  });

  // Top header text
  page.drawText("TAX INVOICE", {
    x: margin + 10,
    y: y - 14,
    font: fontBold,
    size: 11,
    color: darkInk,
  });

  page.drawText("ORIGINAL FOR RECIPIENT", {
    x: pageWidth - margin - fontRegular.widthOfTextAtSize("ORIGINAL FOR RECIPIENT", 8.5) - 10,
    y: y - 14,
    font: fontRegular,
    size: 8.5,
    color: mutedInk,
  });

  y -= 22;

  // Horizontal divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: borderGray,
  });

  // Company Information
  page.drawText("INDOBEST", {
    x: margin + 10,
    y: y - 20,
    font: fontBold,
    size: 16,
    color: darkInk,
  });

  page.drawText("19/10/2, GOBINDA KHATICK ROAD, KOLKATA-700046 34-PUDUCHERRY", {
    x: margin + 10,
    y: y - 33,
    font: fontRegular,
    size: 8,
    color: mutedInk,
  });

  page.drawText("Phone : 8240892993   |   E-Mail : indobest@gmail.com", {
    x: margin + 10,
    y: y - 44,
    font: fontRegular,
    size: 8,
    color: mutedInk,
  });

  page.drawText("GSTIN : 19AVZPC2361G1ZA", {
    x: margin + 10,
    y: y - 56,
    font: fontBold,
    size: 8.5,
    color: darkInk,
  });

  y -= 64;

  // Divider between Company and Details
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: borderGray,
  });

  // Details Grid (Two columns: Customer details on Left, Invoice details on Right)
  const colMid = margin + contentWidth / 2;
  const detailsHeight = 85;

  // Vertical line separating Buyer and Invoice Details
  page.drawLine({
    start: { x: colMid, y },
    end: { x: colMid, y: y - detailsHeight },
    thickness: 1,
    color: borderGray,
  });

  // Left: Buyer (Customer) Details
  page.drawText("BUYER / RECIPIENT:", {
    x: margin + 8,
    y: y - 12,
    font: fontBold,
    size: 8,
    color: mutedInk,
  });

  page.drawText(data.customerName.toUpperCase(), {
    x: margin + 8,
    y: y - 24,
    font: fontBold,
    size: 9.5,
    color: darkInk,
  });

  const address = (data.customerAddress || "").replace(/\r?\n/g, ", ");
  const truncatedAddr = address.length > 55 ? address.substring(0, 52) + "..." : address;
  if (truncatedAddr) {
    page.drawText(truncatedAddr, {
      x: margin + 8,
      y: y - 37,
      font: fontRegular,
      size: 8,
      color: mutedInk,
    });
  }

  page.drawText(`GSTIN: ${data.customerGstin || "URP (Unregistered)"}`, {
    x: margin + 8,
    y: y - 50,
    font: fontBold,
    size: 8,
    color: darkInk,
  });

  page.drawText(`State Code: ${data.customerStateCode || "19"}`, {
    x: margin + 8,
    y: y - 62,
    font: fontRegular,
    size: 8,
    color: mutedInk,
  });

  // Right: Invoice Meta
  page.drawText(`Invoice No. :`, {
    x: colMid + 8,
    y: y - 14,
    font: fontRegular,
    size: 8.5,
    color: mutedInk,
  });
  page.drawText(data.invoiceNumber, {
    x: colMid + 70,
    y: y - 14,
    font: fontBold,
    size: 9.5,
    color: darkInk,
  });

  page.drawText(`Dated :`, {
    x: colMid + 8,
    y: y - 28,
    font: fontRegular,
    size: 8.5,
    color: mutedInk,
  });
  page.drawText(formatDate(data.invoiceDate), {
    x: colMid + 70,
    y: y - 28,
    font: fontBold,
    size: 8.5,
    color: darkInk,
  });

  if (data.deliveryNote) {
    page.drawText(`Delivery Note : ${data.deliveryNote}`, {
      x: colMid + 8,
      y: y - 42,
      font: fontRegular,
      size: 8,
      color: darkInk,
    });
  }

  if (data.destination) {
    page.drawText(`Destination : ${data.destination}`, {
      x: colMid + 8,
      y: y - 56,
      font: fontRegular,
      size: 8,
      color: darkInk,
    });
  }

  if (data.ewayBillNo) {
    page.drawText(`E-Way Bill No. : ${data.ewayBillNo}`, {
      x: colMid + 8,
      y: y - 70,
      font: fontRegular,
      size: 8,
      color: darkInk,
    });
  }

  y -= detailsHeight;

  // Divider above table
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: borderGray,
  });

  // Table Columns
  // Total width: contentWidth (approx 539.28)
  const isIgst = Number(data.igstTotal || 0) > 0;
  const colDef = [
    { label: "Sl.", width: 28, align: "center" },
    { label: "Product Description", width: 195, align: "left" },
    { label: "HSN", width: 55, align: "center" },
    { label: "Qty (kg)", width: 50, align: "right" },
    { label: "Rate (Rs.)", width: 50, align: "right" },
    { label: "Taxable (Rs.)", width: 62, align: "right" },
    { label: isIgst ? "IGST" : "GST", width: 40, align: "right" },
    { label: "Total (Rs.)", width: 59.28, align: "right" },
  ];

  // Table Header Background
  const tableHeaderH = 20;
  page.drawRectangle({
    x: margin,
    y: y - tableHeaderH,
    width: contentWidth,
    height: tableHeaderH,
    color: lightBg,
  });

  let curX = margin;
  for (const col of colDef) {
    let textX = curX + 4;
    const textW = fontBold.widthOfTextAtSize(col.label, 8);
    if (col.align === "right") {
      textX = curX + col.width - textW - 4;
    } else if (col.align === "center") {
      textX = curX + (col.width - textW) / 2;
    }

    page.drawText(col.label, {
      x: textX,
      y: y - 14,
      font: fontBold,
      size: 8,
      color: darkInk,
    });
    curX += col.width;
  }

  y -= tableHeaderH;

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: borderGray,
  });

  // Table Rows
  const rowHeight = 20;
  for (const item of data.items) {
    curX = margin;
    for (const col of colDef) {
      let val = "";
      if (col.label === "Sl.") val = `${item.lineNo}.`;
      else if (col.label === "Product Description") val = item.description;
      else if (col.label === "HSN") val = item.hsn || "—";
      else if (col.label === "Qty (kg)") val = `${item.qtyKg}`;
      else if (col.label === "Rate (Rs.)") val = item.rate.toFixed(2);
      else if (col.label === "Taxable (Rs.)") val = formatINR(item.taxableAmount);
      else if (col.label === "IGST" || col.label === "GST") val = `${item.gstPct}%`;
      else if (col.label === "Total (Rs.)") val = formatINR(item.lineTotal);

      let textX = curX + 4;
      const textFont = col.label === "Total (Rs.)" || col.label === "Product Description" ? fontBold : fontRegular;
      const fontSize = 8;
      const textW = textFont.widthOfTextAtSize(val, fontSize);

      if (col.align === "right") {
        textX = curX + col.width - textW - 4;
      } else if (col.align === "center") {
        textX = curX + (col.width - textW) / 2;
      }

      page.drawText(val, {
        x: textX,
        y: y - 14,
        font: textFont,
        size: fontSize,
        color: darkInk,
      });

      curX += col.width;
    }

    y -= rowHeight;

    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.9, 0.92, 0.94),
    });
  }

  // Footer / Totals Section
  const totalsY = margin + 115;
  if (y > totalsY) {
    y = totalsY;
  }

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: borderGray,
  });

  // Totals Box (Right aligned)
  const totalsBoxW = 200;
  const totalsX = pageWidth - margin - totalsBoxW;

  page.drawText(`Taxable Amount :`, {
    x: totalsX,
    y: y - 14,
    font: fontRegular,
    size: 8.5,
    color: mutedInk,
  });
  page.drawText(`Rs. ${formatINR(data.taxableTotal)}`, {
    x: pageWidth - margin - fontBold.widthOfTextAtSize(`Rs. ${formatINR(data.taxableTotal)}`, 8.5) - 6,
    y: y - 14,
    font: fontBold,
    size: 8.5,
    color: darkInk,
  });

  if (isIgst) {
    page.drawText(`IGST :`, {
      x: totalsX,
      y: y - 28,
      font: fontRegular,
      size: 8.5,
      color: mutedInk,
    });
    page.drawText(`Rs. ${formatINR(data.igstTotal)}`, {
      x: pageWidth - margin - fontRegular.widthOfTextAtSize(`Rs. ${formatINR(data.igstTotal)}`, 8.5) - 6,
      y: y - 28,
      font: fontRegular,
      size: 8.5,
      color: darkInk,
    });
  } else {
    page.drawText(`CGST :`, {
      x: totalsX,
      y: y - 28,
      font: fontRegular,
      size: 8.5,
      color: mutedInk,
    });
    page.drawText(`Rs. ${formatINR(data.cgstTotal)}`, {
      x: pageWidth - margin - fontRegular.widthOfTextAtSize(`Rs. ${formatINR(data.cgstTotal)}`, 8.5) - 6,
      y: y - 28,
      font: fontRegular,
      size: 8.5,
      color: darkInk,
    });

    page.drawText(`SGST :`, {
      x: totalsX,
      y: y - 42,
      font: fontRegular,
      size: 8.5,
      color: mutedInk,
    });
    page.drawText(`Rs. ${formatINR(data.sgstTotal)}`, {
      x: pageWidth - margin - fontRegular.widthOfTextAtSize(`Rs. ${formatINR(data.sgstTotal)}`, 8.5) - 6,
      y: y - 42,
      font: fontRegular,
      size: 8.5,
      color: darkInk,
    });
  }

  // Grand Total Highlight
  const gtY = isIgst ? y - 48 : y - 62;
  page.drawRectangle({
    x: totalsX - 8,
    y: gtY - 6,
    width: totalsBoxW + 8,
    height: 22,
    color: lightBg,
  });

  page.drawText(`Grand Total :`, {
    x: totalsX,
    y: gtY + 2,
    font: fontBold,
    size: 10,
    color: darkInk,
  });

  const gtStr = `Rs. ${formatINR(data.grandTotal)}`;
  page.drawText(gtStr, {
    x: pageWidth - margin - fontBold.widthOfTextAtSize(gtStr, 11) - 6,
    y: gtY + 2,
    font: fontBold,
    size: 11,
    color: rgb(0.1, 0.45, 0.25),
  });

  // Left Note & Signatory
  page.drawText("Terms & Conditions:", {
    x: margin + 8,
    y: y - 14,
    font: fontBold,
    size: 8,
    color: mutedInk,
  });
  page.drawText("1. Goods once sold will not be taken back.", {
    x: margin + 8,
    y: y - 26,
    font: fontRegular,
    size: 7.5,
    color: mutedInk,
  });
  page.drawText("2. Interest @ 18% p.a. will be charged after due date.", {
    x: margin + 8,
    y: y - 36,
    font: fontRegular,
    size: 7.5,
    color: mutedInk,
  });

  page.drawText("For INDOBEST", {
    x: margin + 8,
    y: margin + 30,
    font: fontBold,
    size: 9,
    color: darkInk,
  });
  page.drawText("Authorised Signatory", {
    x: margin + 8,
    y: margin + 12,
    font: fontRegular,
    size: 8,
    color: mutedInk,
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
