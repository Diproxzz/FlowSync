import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  HeadingLevel,
  AlignmentType,
} from "docx";
import type { Gstr1Report, Gstr1InvoiceRow } from "@/lib/analytics/gstr1";

function fmtMoneyAscii(val: number): string {
  return `Rs. ${val.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtMoneyInr(val: number): string {
  return `₹${val.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function buildGstr1Xlsx(report: Gstr1Report, clientName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "InVoiceR";
  wb.created = new Date();

  const summarySheet = wb.addWorksheet("GSTR-1 Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 32 },
    { header: "Value", key: "value", width: 24 },
  ];
  summarySheet.addRows([
    { metric: "Business / Workspace", value: clientName },
    { metric: "Period", value: report.periodLabel },
    { metric: "From Date", value: report.fromDate },
    { metric: "To Date", value: report.toDate },
    { metric: "Total Invoices", value: report.summary.totalInvoices },
    { metric: "B2B Invoices (Registered)", value: report.summary.b2bCount },
    { metric: "B2C Invoices (Unregistered)", value: report.summary.b2cCount },
    { metric: "Total Taxable Value", value: report.summary.taxableTotal },
    { metric: "CGST Total", value: report.summary.cgstTotal },
    { metric: "SGST Total", value: report.summary.sgstTotal },
    { metric: "IGST Total", value: report.summary.igstTotal },
    { metric: "Total GST", value: report.summary.totalTax },
    { metric: "Grand Total (Invoice Value)", value: report.summary.grandTotal },
  ]);
  summarySheet.getRow(1).font = { bold: true };
  for (let r = 9; r <= 14; r++) {
    summarySheet.getCell(`B${r}`).numFmt = "₹#,##0.00";
  }

  const addInvoiceSheet = (title: string, rows: Gstr1InvoiceRow[]) => {
    const ws = wb.addWorksheet(title);
    ws.columns = [
      { header: "Invoice No", key: "invoiceNumber", width: 18 },
      { header: "Date", key: "invoiceDate", width: 14 },
      { header: "Customer Name", key: "customerName", width: 30 },
      { header: "GSTIN", key: "customerGstin", width: 18 },
      { header: "State", key: "stateCode", width: 8 },
      { header: "Supply Type", key: "supplyType", width: 14 },
      { header: "Taxable Value", key: "taxableValue", width: 16 },
      { header: "CGST", key: "cgst", width: 14 },
      { header: "SGST", key: "sgst", width: 14 },
      { header: "IGST", key: "igst", width: 14 },
      { header: "Total Tax", key: "totalTax", width: 14 },
      { header: "Grand Total", key: "grandTotal", width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) => {
      ws.addRow({
        ...r,
        customerGstin: r.customerGstin || "N/A",
        stateCode: r.stateCode || "-",
      });
    });
    const numCols = ["G", "H", "I", "J", "K", "L"];
    for (let i = 2; i <= rows.length + 1; i++) {
      numCols.forEach((col) => {
        ws.getCell(`${col}${i}`).numFmt = "₹#,##0.00";
      });
    }
  };

  addInvoiceSheet("B2B Invoices", report.b2b);
  addInvoiceSheet("B2C Invoices", report.b2c);

  const rateSheet = wb.addWorksheet("Rate Summary");
  rateSheet.columns = [
    { header: "GST Rate", key: "rateLabel", width: 16 },
    { header: "Taxable Value", key: "taxableValue", width: 18 },
    { header: "CGST", key: "cgst", width: 15 },
    { header: "SGST", key: "sgst", width: 15 },
    { header: "IGST", key: "igst", width: 15 },
    { header: "Total Tax", key: "totalTax", width: 15 },
  ];
  rateSheet.getRow(1).font = { bold: true };
  report.rateSummary.forEach((r) => rateSheet.addRow(r));
  for (let i = 2; i <= report.rateSummary.length + 1; i++) {
    ["B", "C", "D", "E", "F"].forEach((c) => {
      rateSheet.getCell(`${c}${i}`).numFmt = "₹#,##0.00";
    });
  }

  const hsnSheet = wb.addWorksheet("HSN Summary");
  hsnSheet.columns = [
    { header: "HSN Code", key: "hsn", width: 16 },
    { header: "Line Items", key: "itemCount", width: 12 },
    { header: "Total Qty (kg)", key: "totalQtyKg", width: 15 },
    { header: "Taxable Value", key: "taxableValue", width: 18 },
    { header: "CGST", key: "cgst", width: 15 },
    { header: "SGST", key: "sgst", width: 15 },
    { header: "IGST", key: "igst", width: 15 },
    { header: "Total Tax", key: "totalTax", width: 15 },
  ];
  hsnSheet.getRow(1).font = { bold: true };
  report.hsnSummary.forEach((r) => hsnSheet.addRow(r));
  for (let i = 2; i <= report.hsnSummary.length + 1; i++) {
    ["D", "E", "F", "G", "H"].forEach((c) => {
      hsnSheet.getCell(`${c}${i}`).numFmt = "₹#,##0.00";
    });
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function buildGstr1Pdf(report: Gstr1Report, clientName: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 841.89; // A4 Landscape
  const pageHeight = 595.28;
  const margin = 36;
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  // Header
  page.drawText(`GSTR-1 Outward Supplies Report — ${clientName}`, {
    x: margin,
    y,
    size: 15,
    font: bold,
    color: rgb(0.07, 0.08, 0.14),
  });
  y -= 18;
  page.drawText(`Period: ${report.periodLabel} (${report.fromDate} to ${report.toDate})`, {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.35, 0.38, 0.48),
  });
  y -= 24;

  // Summary Box
  const summaryItems = [
    ["Total Invoices", String(report.summary.totalInvoices)],
    ["Taxable Value", fmtMoneyAscii(report.summary.taxableTotal)],
    ["CGST", fmtMoneyAscii(report.summary.cgstTotal)],
    ["SGST", fmtMoneyAscii(report.summary.sgstTotal)],
    ["IGST", fmtMoneyAscii(report.summary.igstTotal)],
    ["Grand Total", fmtMoneyAscii(report.summary.grandTotal)],
  ];

  const boxW = (pageWidth - margin * 2 - 25) / 6;
  summaryItems.forEach(([label, val], idx) => {
    const bx = margin + idx * (boxW + 5);
    page.drawRectangle({
      x: bx,
      y: y - 42,
      width: boxW,
      height: 42,
      borderColor: rgb(0.82, 0.85, 0.92),
      borderWidth: 1,
      color: rgb(0.96, 0.97, 0.99),
    });
    page.drawText(label, { x: bx + 6, y: y - 14, size: 8, font, color: rgb(0.4, 0.42, 0.5) });
    page.drawText(val, { x: bx + 6, y: y - 30, size: 9.5, font: bold, color: rgb(0.07, 0.08, 0.14) });
  });
  y -= 62;

  const drawSectionTable = (
    title: string,
    headers: string[],
    colWidths: number[],
    rows: string[][]
  ) => {
    ensureSpace(40);
    page.drawText(title, { x: margin, y, size: 11, font: bold, color: rgb(0.07, 0.08, 0.14) });
    y -= 16;

    const drawRow = (cells: string[], isHeader: boolean) => {
      ensureSpace(18);
      if (isHeader) {
        page.drawRectangle({
          x: margin,
          y: y - 14,
          width: colWidths.reduce((a, b) => a + b, 0),
          height: 16,
          color: rgb(0.92, 0.93, 0.97),
        });
      }
      let cx = margin + 4;
      cells.forEach((cell, i) => {
        const maxChars = Math.max(6, Math.floor(colWidths[i] / 5));
        const text = cell.length > maxChars ? `${cell.slice(0, maxChars - 1)}…` : cell;
        page.drawText(text, {
          x: cx,
          y: y - 10,
          size: isHeader ? 8 : 7.5,
          font: isHeader ? bold : font,
          color: rgb(0.1, 0.11, 0.18),
        });
        cx += colWidths[i];
      });
      y -= 16;
    };

    drawRow(headers, true);
    if (rows.length === 0) {
      drawRow(["No records in this period"], false);
    } else {
      rows.forEach((r) => drawRow(r, false));
    }
    y -= 14;
  };

  drawSectionTable(
    "Tax Rate-wise Summary",
    ["Rate", "Taxable", "CGST", "SGST", "IGST", "Total Tax"],
    [110, 140, 125, 125, 125, 140],
    report.rateSummary.map((r) => [
      r.rateLabel,
      fmtMoneyAscii(r.taxableValue),
      fmtMoneyAscii(r.cgst),
      fmtMoneyAscii(r.sgst),
      fmtMoneyAscii(r.igst),
      fmtMoneyAscii(r.totalTax),
    ])
  );

  drawSectionTable(
    "HSN-wise Summary",
    ["HSN", "Qty (kg)", "Taxable", "CGST", "SGST", "IGST", "Total Tax"],
    [95, 85, 125, 115, 115, 115, 115],
    report.hsnSummary.map((h) => [
      h.hsn,
      h.totalQtyKg.toFixed(2),
      fmtMoneyAscii(h.taxableValue),
      fmtMoneyAscii(h.cgst),
      fmtMoneyAscii(h.sgst),
      fmtMoneyAscii(h.igst),
      fmtMoneyAscii(h.totalTax),
    ])
  );

  const allInvoices = [...report.b2b, ...report.b2c];
  drawSectionTable(
    `Invoice Register (${allInvoices.length} invoices)`,
    ["Invoice No", "Date", "Customer", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Grand Total"],
    [80, 62, 150, 95, 82, 72, 72, 72, 84],
    allInvoices.map((inv) => [
      inv.invoiceNumber,
      inv.invoiceDate,
      inv.customerName,
      inv.customerGstin || "B2C",
      fmtMoneyAscii(inv.taxableValue),
      fmtMoneyAscii(inv.cgst),
      fmtMoneyAscii(inv.sgst),
      fmtMoneyAscii(inv.igst),
      fmtMoneyAscii(inv.grandTotal),
    ])
  );

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export async function buildGstr1Docx(report: Gstr1Report, clientName: string): Promise<Buffer> {
  const makeTable = (headers: string[], rows: string[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: headers.map(
            (h) =>
              new TableCell({
                shading: { fill: "EDE9FE" },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: h, bold: true, size: 18 })],
                  }),
                ],
              })
          ),
        }),
        ...(rows.length > 0
          ? rows
          : [[headers.map((_, i) => (i === 0 ? "No records" : "-"))].flat()]
        ).map(
          (row) =>
            new TableRow({
              children: row.map(
                (cell) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: cell, size: 17 })],
                      }),
                    ],
                  })
              ),
            })
        ),
      ],
    });

  const allInvoices = [...report.b2b, ...report.b2c];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: `GSTR-1 Outward Supplies — ${clientName}`, bold: true })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Period: ${report.periodLabel} (${report.fromDate} to ${report.toDate})`,
                color: "555555",
              }),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "GST Liability Summary", bold: true })],
          }),
          makeTable(
            ["Total Invoices", "Taxable Value", "CGST", "SGST", "IGST", "Grand Total"],
            [
              [
                String(report.summary.totalInvoices),
                fmtMoneyInr(report.summary.taxableTotal),
                fmtMoneyInr(report.summary.cgstTotal),
                fmtMoneyInr(report.summary.sgstTotal),
                fmtMoneyInr(report.summary.igstTotal),
                fmtMoneyInr(report.summary.grandTotal),
              ],
            ]
          ),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240 },
            children: [new TextRun({ text: "Tax Rate-wise Summary", bold: true })],
          }),
          makeTable(
            ["GST Rate", "Taxable Value", "CGST", "SGST", "IGST", "Total Tax"],
            report.rateSummary.map((r) => [
              r.rateLabel,
              fmtMoneyInr(r.taxableValue),
              fmtMoneyInr(r.cgst),
              fmtMoneyInr(r.sgst),
              fmtMoneyInr(r.igst),
              fmtMoneyInr(r.totalTax),
            ])
          ),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240 },
            children: [new TextRun({ text: "HSN-wise Summary", bold: true })],
          }),
          makeTable(
            ["HSN Code", "Qty (kg)", "Taxable Value", "CGST", "SGST", "IGST", "Total Tax"],
            report.hsnSummary.map((h) => [
              h.hsn,
              h.totalQtyKg.toFixed(2),
              fmtMoneyInr(h.taxableValue),
              fmtMoneyInr(h.cgst),
              fmtMoneyInr(h.sgst),
              fmtMoneyInr(h.igst),
              fmtMoneyInr(h.totalTax),
            ])
          ),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240 },
            children: [new TextRun({ text: `Invoice Register (${allInvoices.length})`, bold: true })],
          }),
          makeTable(
            ["Invoice No", "Date", "Customer", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Total"],
            allInvoices.map((inv) => [
              inv.invoiceNumber,
              inv.invoiceDate,
              inv.customerName,
              inv.customerGstin || "B2C",
              fmtMoneyInr(inv.taxableValue),
              fmtMoneyInr(inv.cgst),
              fmtMoneyInr(inv.sgst),
              fmtMoneyInr(inv.igst),
              fmtMoneyInr(inv.grandTotal),
            ])
          ),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
