export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/db";
import { inspectAndRasterizePdf } from "@/lib/pdf/detectText";
import { extractInvoiceData, ExtractionError } from "@/lib/llm/extract";
import { validateInvoice } from "@/lib/validation/invoice";
import { resolveCustomer } from "@/lib/matching/customer";
import { resolveProduct } from "@/lib/matching/product";
import { normalizeInvoiceNumber } from "@/lib/matching/normalize";
import { storage } from "@/lib/storage/adapter";

export const maxDuration = 180; // 180s max execution for extraction (supports local OCR fallback)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: { code: "NO_FILE", message: "No invoice file uploaded" } },
        { status: 400 }
      );
    }

    // 10 MB limit check
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: { code: "FILE_TOO_LARGE", message: "File exceeds 10 MB limit" } },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Save temporary copy for confirmation step
    const fileToken = await storage.saveTemp(buffer, file.name);

    // Rasterize pages and inspect text layer
    let pages: Array<{ pageNumber: number; pngBase64: string; text?: string }> = [];
    const ext = path.extname(file.name).toLowerCase();

    if (ext === ".pdf") {
      // Write temp file for python rasterizer
      const tempPdfPath = path.resolve(process.cwd(), "storage/temp", fileToken);
      const pdfInspection = await inspectAndRasterizePdf(tempPdfPath);
      pages = pdfInspection.pages;
    } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
      const b64 = buffer.toString("base64");
      pages = [
        {
          pageNumber: 1,
          pngBase64: b64,
          text: "",
        },
      ];
    } else {
      return NextResponse.json(
        { error: { code: "UNSUPPORTED_TYPE", message: "Please upload a PDF, PNG, or JPG file" } },
        { status: 400 }
      );
    }

    // Call LLM orchestrator with images
    const images = pages.map((p) => ({
      mime: "image/png" as const,
      base64: p.pngBase64,
    }));

    const extraction = await extractInvoiceData({
      images,
      fileHash,
    });

    const draft = extraction.draft;

    // Validate extracted draft
    const validation = validateInvoice(draft);

    // Customer resolution
    const customerMatch = await resolveCustomer(draft.customer);
    if (customerMatch.status === "MATCHED" && customerMatch.customerName) {
      if (customerMatch.reason === "GSTIN" || draft.customer.gstin) {
        draft.customer.name = customerMatch.customerName;
      }
    }

    // Product resolution for each item
    const productMatches = await Promise.all(
      draft.items.map((item: any) => resolveProduct(item.productNameRaw))
    );

    // Duplicate invoice check by normalized invoice number
    const numberNorm = normalizeInvoiceNumber(draft.invoice.number);
    const existingInvoice = await prisma.invoice.findUnique({
      where: { invoice_number_norm: numberNorm },
      include: {
        customer: true,
        items: true,
      },
    });

    // Hash check
    const existingHash = await prisma.invoice.findFirst({
      where: { source_file_hash: fileHash },
      select: { id: true, invoice_number: true },
    });

    return NextResponse.json({
      draft,
      validation,
      customerMatch,
      productMatches,
      duplicate: existingInvoice
        ? {
            exists: true,
            invoiceId: existingInvoice.id,
            invoiceNumber: existingInvoice.invoice_number,
            customerName: existingInvoice.customer_name_snapshot,
            invoiceDate: existingInvoice.invoice_date,
            grandTotal: existingInvoice.grand_total,
            itemsCount: existingInvoice.items.length,
            existingInvoice,
          }
        : null,
      fileHashDuplicate: existingHash && existingHash.invoice_number !== draft.invoice.number
        ? { invoiceNumber: existingHash.invoice_number }
        : null,
      fileToken,
      pages: pages.map((p) => ({ pageNumber: p.pageNumber, pngBase64: p.pngBase64 })),
      providerUsed: extraction.provider,
      modelUsed: extraction.model,
      latencyMs: extraction.latencyMs,
    });
  } catch (error: any) {
    console.error("Extraction error:", error);
    if (error instanceof ExtractionError) {
      return NextResponse.json(
        {
          error: {
            code: "EXTRACTION_FAILED",
            message: error.message,
            providerErrors: error.providerErrors,
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "SERVER_ERROR",
          message: error.message || "Failed to process invoice",
        },
      },
      { status: 500 }
    );
  }
}
