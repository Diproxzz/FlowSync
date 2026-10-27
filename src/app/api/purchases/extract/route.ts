export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { inspectAndRasterizePdf } from "@/lib/pdf/detectText";
import { extractPurchaseData, ExtractionError } from "@/lib/llm/extract";
import { validatePurchaseInvoice } from "@/lib/validation/purchase";
import { resolveSupplier } from "@/lib/matching/supplier";
import { resolveProduct } from "@/lib/matching/product";
import { normalizeInvoiceNumber } from "@/lib/matching/normalize";
import { normalizeUnit } from "@/lib/units/convert";
import { storage } from "@/lib/storage/adapter";

export const maxDuration = 180;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: { code: "NO_FILE", message: "No purchase invoice file uploaded" } },
        { status: 400 }
      );
    }

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

    // Rasterize pages and extract text
    let pages: Array<{ pageNumber: number; pngBase64: string; text?: string }> = [];
    let extractedText = "";
    const ext = path.extname(file.name).toLowerCase();

    if (ext === ".pdf") {
      const tempPdfPath = path.resolve(process.cwd(), "storage/temp", fileToken);
      const pdfInspection = await inspectAndRasterizePdf(tempPdfPath);
      pages = pdfInspection.pages;
      extractedText = pdfInspection.extractedText || "";
    } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
      const b64 = buffer.toString("base64");
      pages = [{ pageNumber: 1, pngBase64: b64, text: "" }];
    } else {
      return NextResponse.json(
        { error: { code: "UNSUPPORTED_TYPE", message: "Please upload a PDF, PNG, or JPG file" } },
        { status: 400 }
      );
    }

    // Call LLM orchestrator for Purchase with valid images and text
    const images = pages
      .filter((p) => p.pngBase64 && p.pngBase64.length > 100)
      .map((p) => ({
        mime: "image/png" as const,
        base64: p.pngBase64,
      }));

    const extraction = await extractPurchaseData({
      images,
      text: extractedText,
      fileHash,
    });

    const draft = extraction.draft;
    for (const item of draft.items) {
      item.unitPrinted = normalizeUnit(item.unitPrinted);
    }

    // Supplier resolution
    const supplierMatch = await resolveSupplier(draft.supplier);
    if (supplierMatch.status === "MATCHED" && supplierMatch.supplierName) {
      if (supplierMatch.reason === "GSTIN" || draft.supplier.gstin) {
        draft.supplier.name = supplierMatch.supplierName;
      }
    }

    // Product resolution for each item
    const productMatches = await Promise.all(
      draft.items.map((item) => resolveProduct(item.productNameRaw))
    );

    // Product contexts for validation (packSizeKg and stdPurchaseRate)
    const productContexts = await Promise.all(
      draft.items.map(async (item, idx) => {
        const pMatch = productMatches[idx];
        let packSizeKg: number | null = null;
        let stdPurchaseRate: number | null = null;

        if (pMatch?.productId) {
          const prod = await prisma.product.findUnique({
            where: { id: pMatch.productId },
            select: { pack_size_kg: true, std_purchase_rate: true },
          });
          if (prod) {
            packSizeKg = prod.pack_size_kg ? Number(prod.pack_size_kg) : null;
            stdPurchaseRate = prod.std_purchase_rate ? Number(prod.std_purchase_rate) : null;
          }
        }

        return {
          lineNo: item.lineNo,
          productId: pMatch?.productId,
          packSizeKg,
          stdPurchaseRate,
        };
      })
    );

    // Validate extracted draft
    const companyGstin = env.COMPANY_GSTIN || "19AVZPC2361G1ZA";
    const validation = validatePurchaseInvoice(draft, companyGstin, productContexts);

    // Duplicate purchase invoice check: key is (supplier, number)
    const numberNorm = normalizeInvoiceNumber(draft.invoice.number);
    let existingInvoice: any = null;

    if (supplierMatch.supplierId) {
      existingInvoice = await prisma.purchaseInvoice.findUnique({
        where: {
          supplier_id_invoice_number_norm: {
            supplier_id: supplierMatch.supplierId,
            invoice_number_norm: numberNorm,
          },
        },
        include: {
          supplier: true,
          items: true,
        },
      });
    } else if (draft.supplier.gstin) {
      // Check if another invoice with same number exists under this supplier's GSTIN
      existingInvoice = await prisma.purchaseInvoice.findFirst({
        where: {
          invoice_number_norm: numberNorm,
          supplier: { gstin: draft.supplier.gstin.trim().toUpperCase() },
        },
        include: {
          supplier: true,
          items: true,
        },
      });
    }

    // Hash check
    const existingHash = await prisma.purchaseInvoice.findFirst({
      where: { source_file_hash: fileHash },
      select: { id: true, supplier_invoice_number: true },
    });

    return NextResponse.json({
      draft,
      validation,
      supplierMatch,
      productMatches,
      duplicate: existingInvoice
        ? {
            exists: true,
            invoiceId: existingInvoice.id,
            invoiceNumber: existingInvoice.supplier_invoice_number,
            supplierName: existingInvoice.supplier_name_snapshot,
            invoiceDate: existingInvoice.invoice_date,
            grandTotal: existingInvoice.grand_total,
            itemsCount: existingInvoice.items.length,
            existingInvoice,
          }
        : null,
      fileHashDuplicate: existingHash && existingHash.supplier_invoice_number !== draft.invoice.number
        ? { invoiceNumber: existingHash.supplier_invoice_number }
        : null,
      fileToken,
      pages: pages.map((p) => ({ pageNumber: p.pageNumber, pngBase64: p.pngBase64 })),
      providerUsed: extraction.provider,
      modelUsed: extraction.model,
      latencyMs: extraction.latencyMs,
    });
  } catch (error: any) {
    console.error("Purchase extraction error:", error);
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
          message: error.message || "Failed to process purchase invoice",
        },
      },
      { status: 500 }
    );
  }
}
