// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import * as authSession from "@/lib/auth/session";
import { formatParticularsText } from "@/lib/ledger/particulars";
import { generateInvoicePdf } from "@/lib/invoices/pdf/generate-invoice-pdf";
import { POST as sendInvoice } from "@/app/api/invoices/[id]/send/route";
import { PATCH as updateEntry } from "@/app/api/ledger/entries/[id]/route";
import { NextRequest } from "next/server";
import * as mailer from "@/lib/email/mailer";
import * as waClient from "@/lib/whatsapp/client";

describe("Invoice Dispatch & Statement Edit Tests", () => {
  beforeAll(() => {
    vi.spyOn(authSession, "requireFoundingWrite").mockResolvedValue({
      ok: true,
      ctx: { clientId: "test", isFoundingClient: true, isReadOnly: false, isAdmin: true },
    });
  });

  describe("Task 1: Invoice PDF & Dispatch (Email & WhatsApp)", () => {
    it("generates a valid A4 Tax Invoice PDF using generateInvoicePdf", async () => {
      const pdfBuffer = await generateInvoicePdf({
        invoiceNumber: "IB26-27/0545",
        invoiceDate: "2026-11-14",
        customerName: "TIGER OVERSEAS",
        customerGstin: "19ACGPJ4896D1ZB",
        customerAddress: "KLC ZONE-1 PLOT-72, Kolkata, West Bengal",
        customerStateCode: "19",
        taxableTotal: 21600,
        cgstTotal: 1944,
        sgstTotal: 1944,
        igstTotal: 0,
        roundOff: 0,
        grandTotal: 25488,
        items: [
          {
            lineNo: 1,
            description: "KI ACTOL",
            productCode: "KI",
            hsn: "34021190",
            qtyKg: 60,
            packKg: 60,
            rate: 104,
            taxableAmount: 6240,
            gstPct: 18,
            lineTotal: 7363.2,
          },
          {
            lineNo: 2,
            description: "SNA ACTOIL",
            productCode: "SNA",
            hsn: "34039100",
            qtyKg: 120,
            packKg: 120,
            rate: 120,
            taxableAmount: 15360,
            gstPct: 18,
            lineTotal: 18124.8,
          },
        ],
      });

      expect(pdfBuffer).toBeDefined();
      expect(pdfBuffer.length).toBeGreaterThan(1000);
      // PDF magic bytes %PDF
      expect(pdfBuffer.subarray(0, 4).toString()).toBe("%PDF");
    });

    it("dispatches invoice via email with attachment named strictly to Invoice No.", async () => {
      const emailSpy = vi.spyOn(mailer, "sendCustomerInvoiceEmail").mockResolvedValue(undefined as any);

      // Find an invoice in the DB
      const invoice = await prisma.invoice.findFirst({
        include: { customer: true },
      });
      if (!invoice) return;

      // Ensure customer has email for test
      await prisma.customer.update({
        where: { id: invoice.customer_id },
        data: { email: "test-buyer@example.com" },
      });

      const req = new NextRequest(`http://localhost:3000/api/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "email" }),
      });

      const res = await sendInvoice(req, { params: { id: invoice.id } });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(emailSpy).toHaveBeenCalled();
      const callArgs = emailSpy.mock.calls[0][0];
      expect(callArgs.to).toBe("test-buyer@example.com");
      expect(callArgs.invoiceNumber).toBe(invoice.invoice_number);
      const expectedFilename = `${invoice.invoice_number.replace(/[/\\?%*:|"<>]/g, "-")}.pdf`;
      expect(callArgs.pdfFilename).toBe(expectedFilename);
    });

    it("dispatches invoice via WhatsApp with attachment named strictly to Invoice No.", async () => {
      const waSpy = vi.spyOn(waClient, "sendWhatsAppStatementMessage").mockResolvedValue({
        messageId: "test-msg-id",
        jid: "918240892993@s.whatsapp.net",
        cleanNumber: "+918240892993",
      });

      const invoice = await prisma.invoice.findFirst({
        include: { customer: true },
      });
      if (!invoice) return;

      // Ensure customer has phone for test
      await prisma.customer.update({
        where: { id: invoice.customer_id },
        data: { phone: "8240892993" },
      });

      const req = new NextRequest(`http://localhost:3000/api/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "whatsapp" }),
      });

      const res = await sendInvoice(req, { params: { id: invoice.id } });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(waSpy).toHaveBeenCalled();
      const callArgs = waSpy.mock.calls[0][0];
      const expectedFilename = `${invoice.invoice_number.replace(/[/\\?%*:|"<>]/g, "-")}.pdf`;
      expect(callArgs.pdfAttachment?.fileName).toBe(expectedFilename);
      expect(callArgs.messageText).toContain("For any queries, please contact us at 8240892993.");
    });
  });

  describe("Task 2: Edit Statement Line Save Fix", () => {
    it("preserves user edited particulars in formatParticularsText", () => {
      const edited = formatParticularsText({
        entryType: "RECEIPT",
        paymentMode: "CHEQUE",
        instrumentNo: "964038/AXI",
        particularsRaw: "Cheque No. : 964038/AXI",
      });
      expect(edited).toBe("Cheque No. : 964038/AXI");
    });

    it("successfully saves statement entry changes via PATCH /api/ledger/entries/[id]", async () => {
      const entry = await prisma.ledgerEntry.findFirst({
        where: { is_void: false },
      });
      if (!entry) return;

      const req = new NextRequest(`http://localhost:3000/api/ledger/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: entry.account_id,
          entryDate: "2026-11-07",
          entryType: "RECEIPT",
          debit: 0,
          credit: 583980,
          particulars: "Cheque No. : 964038/AXI",
          docNo: null,
          paymentMode: "CHEQUE",
          instrumentNo: "964038/AXI",
          instrumentDate: null,
          narration: null,
        }),
      });

      const res = await updateEntry(req, { params: { id: entry.id } });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.entry.particulars_raw).toBe("Cheque No. : 964038/AXI");
      expect(json.entry.credit).toBe("583980");
    });
  });
});
