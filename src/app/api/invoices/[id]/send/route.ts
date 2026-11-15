export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFoundingWrite } from "@/lib/auth/session";
import { storage } from "@/lib/storage/adapter";
import { generateInvoicePdf } from "@/lib/invoices/pdf/generate-invoice-pdf";
import { sendCustomerInvoiceEmail } from "@/lib/email/mailer";
import { sendWhatsAppStatementMessage } from "@/lib/whatsapp/client";
import { logBusinessActivity } from "@/lib/logs/business-logger";
import { formatINR, formatDate } from "@/lib/format";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireFoundingWrite();
    if (!auth.ok) return auth.response;

    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const channel: "email" | "whatsapp" | "both" = body.channel || "both";

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

    // Resolve customer details
    let customer: any = invoice.customer;
    if (!customer && invoice.customer_id) {
      customer = await prisma.customer.findUnique({
        where: { id: invoice.customer_id },
      });
    }

    const customerName = invoice.customer_name_snapshot || customer?.name || "Customer";
    const recipientEmail = customer?.email?.trim() || "";
    const primaryPhone = customer?.phone?.trim() || "";
    const secondaryPhone = customer?.secondary_phone?.trim() || "";
    const targetWhatsAppPhone = primaryPhone || secondaryPhone;

    // Contact info validation based on requested channel
    if (channel === "email" && !recipientEmail) {
      return NextResponse.json(
        {
          error: {
            code: "NO_EMAIL",
            message: `No email address registered for customer "${customerName}". Please update contact info in Customers section.`,
          },
        },
        { status: 400 }
      );
    }

    if (channel === "whatsapp" && !targetWhatsAppPhone) {
      return NextResponse.json(
        {
          error: {
            code: "NO_PHONE",
            message: `No phone number registered for customer "${customerName}". Please update contact info in Customers section.`,
          },
        },
        { status: 400 }
      );
    }

    if (channel === "both" && !recipientEmail && !targetWhatsAppPhone) {
      return NextResponse.json(
        {
          error: {
            code: "NO_CONTACT_INFO",
            message: `Customer "${customerName}" has neither email nor phone registered. Please add contact info in Customers section.`,
          },
        },
        { status: 400 }
      );
    }

    // Retrieve or generate the invoice PDF buffer
    let pdfBuffer: Buffer | null = null;
    if (invoice.source_file_key) {
      try {
        pdfBuffer = await storage.getFile(invoice.source_file_key);
      } catch (fileErr) {
        console.warn("Storage PDF not found on disk, generating on the fly:", fileErr);
      }
    }

    if (!pdfBuffer) {
      const metaObj =
        invoice.warnings &&
        typeof invoice.warnings === "object" &&
        !Array.isArray(invoice.warnings)
          ? (invoice.warnings as Record<string, any>)
          : {};

      const fallbackIgstPct =
        Number(invoice.igst_total || 0) > 0 && Number(invoice.taxable_total || 0) > 0
          ? Math.round((Number(invoice.igst_total) / Number(invoice.taxable_total)) * 100)
          : 0;

      pdfBuffer = await generateInvoicePdf({
        invoiceNumber: invoice.invoice_number,
        invoiceDate: invoice.invoice_date.toISOString ? invoice.invoice_date.toISOString() : String(invoice.invoice_date),
        orderNo: metaObj.orderNo || null,
        deliveryNote: metaObj.deliveryNote || null,
        destination: metaObj.destination || null,
        ewayBillNo: metaObj.ewayBillNo || null,
        customerName: invoice.customer_name_snapshot || customer?.name || "Customer",
        customerGstin: invoice.customer_gstin_snapshot || customer?.gstin || null,
        customerAddress: customer?.address || null,
        customerStateCode: customer?.state_code || "19",
        taxableTotal: Number(invoice.taxable_total),
        cgstTotal: Number(invoice.cgst_total),
        sgstTotal: Number(invoice.sgst_total),
        igstTotal: Number(invoice.igst_total),
        roundOff: Number(invoice.round_off || 0),
        grandTotal: Number(invoice.grand_total),
        items: invoice.items.map((it, idx) => ({
          lineNo: it.line_no || idx + 1,
          description: it.product_name_raw || it.product.name,
          productCode: it.product.code,
          hsn: it.hsn || it.product.default_hsn || null,
          qtyKg: Number(it.qty_kg),
          packKg: it.pack_size_kg ? Number(it.pack_size_kg) : null,
          rate: Number(it.rate),
          discountPct: it.discount_pct ? Number(it.discount_pct) : null,
          taxableAmount: Number(it.taxable_amount),
          gstPct:
            Number(it.igst_pct || 0) > 0
              ? Number(it.igst_pct)
              : Number(it.cgst_pct || 0) + Number(it.sgst_pct || 0) > 0
              ? Number(it.cgst_pct || 0) + Number(it.sgst_pct || 0)
              : fallbackIgstPct,
          lineTotal: Number(it.line_total),
        })),
      });
    }

    // Attachment file name set strictly to Invoice No. (sanitized for safe filenames: replace '/' with '-')
    const safeInvoiceName = invoice.invoice_number.replace(/[/\\?%*:|"<>]/g, "-").trim();
    const pdfFilename = `${safeInvoiceName}.pdf`;

    const grandTotalFormatted = formatINR(Number(invoice.grand_total));
    const invDateFormatted = formatDate(invoice.invoice_date);

    const messageText = [
      `Dear ${customerName},`,
      ``,
      `Please find attached Invoice ${invoice.invoice_number} dated ${invDateFormatted} for ₹ ${grandTotalFormatted} from Indobest.`,
      ``,
      `For any queries, please contact us at 8240892993.`,
      ``,
      `Regards,`,
      `Indobest`,
    ].join("\n");

    const dispatchedChannels: string[] = [];
    let emailDispatched = false;
    let whatsAppDispatched = false;
    let whatsAppRecipientNumber = "";

    // 1. Email dispatch
    if ((channel === "email" || channel === "both") && recipientEmail) {
      await sendCustomerInvoiceEmail({
        to: recipientEmail,
        customerName,
        invoiceNumber: invoice.invoice_number,
        invoiceDate: invDateFormatted,
        grandTotalFormatted,
        pdfBuffer,
        pdfFilename,
      });
      emailDispatched = true;
      dispatchedChannels.push(`Email (${recipientEmail})`);
    }

    // 2. WhatsApp dispatch
    if ((channel === "whatsapp" || channel === "both") && targetWhatsAppPhone) {
      const waResult = await sendWhatsAppStatementMessage({
        recipientPhone: targetWhatsAppPhone,
        messageText,
        pdfAttachment: {
          buffer: pdfBuffer,
          fileName: pdfFilename,
        },
      });
      whatsAppDispatched = true;
      whatsAppRecipientNumber = waResult.cleanNumber;
      dispatchedChannels.push(`WhatsApp (${waResult.cleanNumber})`);
    }

    const dispatchSummary = dispatchedChannels.join(" & ") || channel;

    // 3. Log business activity
    await logBusinessActivity({
      action: "INVOICE_SENT",
      description: `Invoice ${invoice.invoice_number} sent to ${customerName} via ${dispatchSummary} (₹ ${grandTotalFormatted})`,
      entityType: "INVOICE",
      entityId: invoice.id,
      amount: Number(invoice.grand_total),
      metadata: {
        invoiceNumber: invoice.invoice_number,
        customerName,
        recipientEmail: emailDispatched ? recipientEmail : null,
        whatsAppPhone: whatsAppDispatched ? whatsAppRecipientNumber : null,
        pdfFilename,
        channel,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Invoice ${invoice.invoice_number} successfully sent to ${customerName} via ${dispatchSummary}`,
      customerName,
      recipientEmail: emailDispatched ? recipientEmail : null,
      whatsAppPhone: whatsAppDispatched ? whatsAppRecipientNumber : null,
      pdfFilename,
      channel,
    });
  } catch (error: any) {
    console.error("[send-invoice] Error dispatching invoice:", error);
    return NextResponse.json(
      {
        error: {
          code: "SEND_FAILED",
          message: error?.message || "Failed to send invoice",
        },
      },
      { status: 500 }
    );
  }
}
