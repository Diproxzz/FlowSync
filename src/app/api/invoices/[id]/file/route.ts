export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage/adapter";
import { calculateInvoice, InvoiceLineItemInput } from "@/lib/invoices/calculations";
import { renderInvoiceToHtml } from "@/lib/invoices/renderHtml";
import { CustomerInvoiceMeta, InvoiceHeaderMeta } from "@/components/invoices/PrintableInvoice";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: { product: true },
        orderBy: { line_no: "asc" },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Invoice not found" } },
      { status: 404 }
    );
  }

  // 1. If physical source file exists in storage, stream the PDF
  if (invoice.source_file_key) {
    try {
      const fileBuffer = await storage.getFile(invoice.source_file_key);
      return new NextResponse(new Uint8Array(fileBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${invoice.invoice_number.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf"`,
        },
      });
    } catch (error) {
      console.warn("Storage file not found, falling back to database render:", error);
    }
  }

  // 2. Otherwise (e.g. generated invoices saved in database), render the exact tax invoice HTML document
  try {
    const metaObj =
      invoice.warnings &&
      typeof invoice.warnings === "object" &&
      !Array.isArray(invoice.warnings)
        ? (invoice.warnings as Record<string, any>)
        : {};

    const lines: InvoiceLineItemInput[] = invoice.items.map((it, idx) => ({
      sl: it.line_no || idx + 1,
      qty: Number(it.qty_kg),
      pack: it.pack_size_kg ? String(Number(it.pack_size_kg)) : "",
      product: it.product_name_raw || it.product.name,
      batch: "",
      hsn: it.hsn || it.product.default_hsn || "",
      rate: Number(it.rate),
      discountPct: Number(it.discount_pct || 0),
      gstPct: Number(it.cgst_pct || 0) + Number(it.sgst_pct || 0),
    }));

    const calculation = calculateInvoice(
      lines,
      invoice.discount_pct ? Number(invoice.discount_pct) : 0
    );

    const invDateObj = new Date(invoice.invoice_date);
    const day = String(invDateObj.getDate()).padStart(2, "0");
    const month = String(invDateObj.getMonth() + 1).padStart(2, "0");
    const year = invDateObj.getFullYear();
    const displayDate = `${day}-${month}-${year}`;

    const headerMeta: InvoiceHeaderMeta = {
      invoiceNumber: invoice.invoice_number,
      invoiceDate: displayDate,
      orderNo: metaObj.orderNo || "",
      deliveryNote: metaObj.deliveryNote || "",
      destination: metaObj.destination || "",
      ewayBillNo: metaObj.ewayBillNo || "",
      copyType: metaObj.copyType || "ORIGINAL",
      hasWatermark: metaObj.hasWatermark ?? true,
    };

    const customerMeta: CustomerInvoiceMeta = {
      name: invoice.customer_name_snapshot || invoice.customer?.name || "",
      address: invoice.customer?.address || "",
      phone: metaObj.phone || "",
      gstin: invoice.customer_gstin_snapshot || invoice.customer?.gstin || "",
      stateCode: invoice.customer?.state_code || "19",
    };

    const invoiceMarkup = renderInvoiceToHtml({
      customer: customerMeta,
      meta: headerMeta,
      calculation,
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tax Invoice - ${invoice.invoice_number}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .no-print {
        display: none !important;
      }
      .invoice-wrapper {
        padding: 0 !important;
        margin: 0 !important;
      }
    }
    body {
      margin: 0;
      padding: 0;
      background-color: #525659;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body>
  <div class="no-print bg-[#323639] text-white px-4 py-2 flex items-center justify-between border-b border-[#212529] shadow-md sticky top-0 z-50">
    <div class="flex items-center gap-3">
      <span class="font-mono text-xs font-semibold tracking-wide">${invoice.invoice_number}</span>
      <span class="text-xs text-gray-300">|</span>
      <span class="text-xs text-gray-300 font-medium">${customerMeta.name}</span>
    </div>
    <div class="flex items-center gap-2">
      <button onclick="window.print()" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition flex items-center gap-1.5 shadow-sm cursor-pointer">
        Print / Save PDF
      </button>
    </div>
  </div>
  <div class="invoice-wrapper flex justify-center py-6 px-2 min-h-screen">
    <div class="shadow-2xl bg-white">
      ${invoiceMarkup}
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (renderError: any) {
    console.error("Error rendering invoice HTML document:", renderError);
    return NextResponse.json(
      { error: { code: "RENDER_ERROR", message: "Failed to render invoice document" } },
      { status: 500 }
    );
  }
}
