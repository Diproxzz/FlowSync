export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage/adapter";
import { getStockSummary } from "@/lib/stock/summary";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const purchase = await prisma.purchaseInvoice.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: {
        orderBy: { line_no: "asc" },
        include: {
          product: {
            select: {
              id: true,
              code: true,
              name: true,
              pack_size_kg: true,
              default_hsn: true,
              std_purchase_rate: true,
            },
          },
        },
      },
      revisions: {
        orderBy: { version: "desc" },
      },
    },
  });

  if (!purchase) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Purchase invoice not found" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ purchase });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = request.nextUrl;
    const force = searchParams.get("force") === "true";

    const purchase = await prisma.purchaseInvoice.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: { product: true },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Purchase invoice not found" } },
        { status: 404 }
      );
    }

    // Check negative stock impact (FR-PUR-INV-2)
    const stockSummary = await getStockSummary();
    const stockMap = new Map(stockSummary.map((s) => [s.productId, s.closing]));

    const stockEffects: Array<{
      productId: string;
      productName: string;
      productCode: string;
      qtyReductionKg: number;
      currentClosingKg: number;
      resultingClosingKg: number;
      wouldBeNegative: boolean;
    }> = [];

    let hasNegativeWarning = false;

    for (const item of purchase.items) {
      const currentStock = stockMap.get(item.product_id) || 0;
      const reduction = Number(item.qty_kg);
      const resulting = currentStock - reduction;
      const wouldBeNegative = resulting < 0;

      if (wouldBeNegative) hasNegativeWarning = true;

      stockEffects.push({
        productId: item.product_id,
        productName: item.product.name,
        productCode: item.product.code,
        qtyReductionKg: reduction,
        currentClosingKg: currentStock,
        resultingClosingKg: resulting,
        wouldBeNegative,
      });
    }

    // If dry run requested or would be negative and not forced
    if (searchParams.get("checkOnly") === "true") {
      return NextResponse.json({
        stockEffects,
        hasNegativeWarning,
        message: hasNegativeWarning
          ? "Warning: Deleting this invoice will cause stock to become negative for one or more products."
          : "Deleting this invoice will cleanly deduct purchased quantities from stock.",
      });
    }

    if (hasNegativeWarning && !force) {
      return NextResponse.json(
        {
          error: {
            code: "NEGATIVE_STOCK_WARNING",
            message: "Deleting this invoice would cause stock to drop below zero for some products.",
            stockEffects,
          },
        },
        { status: 409 }
      );
    }

    // Execute deletion in transaction
    await prisma.$transaction(async (tx) => {
      // Unlink or remove ledger entry if FEATURE_LEDGER is enabled
      if (process.env.FEATURE_LEDGER === "true") {
        const { removePurchaseInvoiceFromLedger } = await import("@/lib/ledger/posting");
        await removePurchaseInvoiceFromLedger(tx, id);
      }

      // 1. Delete items (cascade removes linked StockMovements)
      await tx.purchaseInvoiceItem.deleteMany({
        where: { purchase_invoice_id: id },
      });

      // 2. Delete purchase invoice
      await tx.purchaseInvoice.delete({
        where: { id },
      });
    });

    // Delete stored file
    if (purchase.source_file_key) {
      await storage.deleteFile(purchase.source_file_key).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: `Purchase invoice '${purchase.supplier_invoice_number}' deleted.`,
      stockEffects,
    });
  } catch (error: any) {
    console.error("Delete purchase invoice error:", error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: error.message || "Failed to delete purchase invoice" } },
      { status: 500 }
    );
  }
}
