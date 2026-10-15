import path from "path";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage/adapter";
import { inspectAndRasterizePdf } from "@/lib/pdf/detectText";
import { extractInvoiceData, ExtractionError } from "@/lib/llm/extract";
import { validateInvoice } from "@/lib/validation/invoice";
import { resolveCustomer } from "@/lib/matching/customer";
import { resolveProduct } from "@/lib/matching/product";
import { normalizeInvoiceNumber } from "@/lib/matching/normalize";

// In-memory set of actively executing jobs in this Node process
const activeJobs = new Set<string>();
let isWorkerRunning = false;

// Strict ONE AT A TIME concurrency as requested
const MAX_CONCURRENT = 1;

export async function processUploadJob(jobId: string) {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);

  try {
    // 1. Fetch job from PostgreSQL
    const job = await prisma.uploadJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.status === "CANCELLED" || job.status === "SAVED") {
      activeJobs.delete(jobId);
      return;
    }

    // 2. Mark status as PROCESSING in PostgreSQL
    await prisma.uploadJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING", error: null },
    });

    // 3. Check cancellation helper
    const isCancelled = async () => {
      const current = await prisma.uploadJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      return current?.status === "CANCELLED";
    };

    if (await isCancelled()) {
      activeJobs.delete(jobId);
      return;
    }

    // 4. Load file from storage/temp
    const { buffer } = await storage.getTemp(job.file_token);
    const ext = path.extname(job.file_name).toLowerCase();

    let pages: Array<{ pageNumber: number; pngBase64: string; text?: string }> = [];

    if (ext === ".pdf") {
      const tempPdfPath = path.resolve(process.cwd(), "storage/temp", job.file_token);
      const pdfInspection = await inspectAndRasterizePdf(tempPdfPath);
      pages = pdfInspection.pages;
    } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
      pages = [
        {
          pageNumber: 1,
          pngBase64: buffer.toString("base64"),
          text: "",
        },
      ];
    } else {
      throw new Error(`Unsupported file type: ${ext}. Please upload a PDF, PNG, or JPG file.`);
    }

    if (await isCancelled()) {
      activeJobs.delete(jobId);
      return;
    }

    // 5. Call LLM extraction orchestrator with images
    const images = pages.map((p) => ({
      mime: "image/png" as const,
      base64: p.pngBase64,
    }));

    const extraction = await extractInvoiceData({
      images,
      fileHash: job.file_hash,
    });

    if (await isCancelled()) {
      activeJobs.delete(jobId);
      return;
    }

    const draft = extraction.draft;

    // 6. Validate extracted draft
    const validation = validateInvoice(draft);

    // 7. Customer resolution
    const customerMatch = await resolveCustomer(draft.customer);

    // 8. Product resolution for each item
    const productMatches = await Promise.all(
      draft.items.map((item) => resolveProduct(item.productNameRaw))
    );

    // 9. Duplicate invoice check by normalized invoice number
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
      where: { source_file_hash: job.file_hash },
      select: { id: true, invoice_number: true },
    });

    const extractedData = {
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
            grandTotal: Number(existingInvoice.grand_total),
            itemsCount: existingInvoice.items.length,
            existingInvoice,
          }
        : null,
      fileHashDuplicate:
        existingHash && existingHash.invoice_number !== draft.invoice.number
          ? { invoiceNumber: existingHash.invoice_number }
          : null,
      fileToken: job.file_token,
      pages: pages.map((p) => ({ pageNumber: p.pageNumber, pngBase64: p.pngBase64 })),
      providerUsed: extraction.provider,
      modelUsed: extraction.model,
      latencyMs: extraction.latencyMs,
    };

    if (await isCancelled()) {
      activeJobs.delete(jobId);
      return;
    }

    // 10. Save results to PostgreSQL and mark READY
    await prisma.uploadJob.update({
      where: { id: jobId },
      data: {
        status: "READY",
        extracted_data: extractedData as any,
        error: null,
      },
    });
  } catch (err: any) {
    console.error(`Error processing upload job ${jobId}:`, err);
    const current = await prisma.uploadJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (current?.status !== "CANCELLED") {
      await prisma.uploadJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: err.message || "Extraction failed",
        },
      });
    }
  } finally {
    activeJobs.delete(jobId);
    // Queue next job one at a time with a 500ms pacing delay
    setTimeout(() => {
      processNextQueuedJobs().catch(console.error);
    }, 500);
  }
}

// Background scheduler: strictly ONE AT A TIME
export async function processNextQueuedJobs() {
  if (isWorkerRunning) return;
  if (activeJobs.size >= MAX_CONCURRENT) return;

  isWorkerRunning = true;
  try {
    const nextJob = await prisma.uploadJob.findFirst({
      where: {
        status: "QUEUED",
        id: { notIn: Array.from(activeJobs) },
      },
      orderBy: { created_at: "asc" },
    });

    if (!nextJob) return;

    processUploadJob(nextJob.id).catch((err) =>
      console.error(`Unhandled error in background job ${nextJob.id}:`, err)
    );
  } finally {
    isWorkerRunning = false;
  }
}

export async function retryUploadJob(jobId: string) {
  await prisma.uploadJob.update({
    where: { id: jobId },
    data: {
      status: "QUEUED",
      error: null,
    },
  });
  processNextQueuedJobs().catch(console.error);
}

export async function retryAllFailedJobs() {
  await prisma.uploadJob.updateMany({
    where: { status: { in: ["FAILED", "CANCELLED"] } },
    data: {
      status: "QUEUED",
      error: null,
    },
  });
  processNextQueuedJobs().catch(console.error);
}
