import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalize } from "@/lib/matching/normalize";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceProductId, targetProductId } = body;

    if (!sourceProductId || !targetProductId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "sourceProductId and targetProductId are required" } },
        { status: 400 }
      );
    }

    if (sourceProductId === targetProductId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Cannot merge product into itself" } },
        { status: 400 }
      );
    }

    const [source, target] = await Promise.all([
      prisma.product.findUnique({ where: { id: sourceProductId }, include: { aliases: true, stock_movements: true } }),
      prisma.product.findUnique({ where: { id: targetProductId }, include: { aliases: true } }),
    ]);

    if (!source || !target) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Source or target product not found" } },
        { status: 404 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-point sales invoice items
      const invoiceItemsUpdate = await tx.invoiceItem.updateMany({
        where: { product_id: sourceProductId },
        data: { product_id: targetProductId },
      });

      // 2. Re-point purchase invoice items
      const purchaseItemsUpdate = await tx.purchaseInvoiceItem.updateMany({
        where: { product_id: sourceProductId },
        data: { product_id: targetProductId },
      });

      // 3. Re-point informal invoice items
      const informalItemsUpdate = await tx.informalInvoiceItem.updateMany({
        where: { product_id: sourceProductId },
        data: { product_id: targetProductId },
      });

      // 4. Re-point stock movements and ensure SALE quantities are positive
      const stockMovements = await tx.stockMovement.findMany({
        where: { product_id: sourceProductId },
      });
      for (const sm of stockMovements) {
        const positiveQty = Math.abs(Number(sm.qty_kg));
        await tx.stockMovement.update({
          where: { id: sm.id },
          data: {
            product_id: targetProductId,
            qty_kg: positiveQty,
          },
        });
      }

      // 3. Transfer aliases
      let aliasesMoved = 0;
      for (const alias of source.aliases) {
        const existingInTarget = await tx.productAlias.findUnique({
          where: { alias_norm: alias.alias_norm },
        });

        if (!existingInTarget) {
          await tx.productAlias.update({
            where: { id: alias.id },
            data: { product_id: targetProductId },
          });
          aliasesMoved++;
        }
      }

      // 4. Add source product name and code as aliases on target if not already present
      const sourceNames = [source.name, source.code].filter(Boolean);
      for (const name of sourceNames) {
        const norm = normalize(name);
        const existing = await tx.productAlias.findUnique({
          where: { alias_norm: norm },
        });
        if (!existing && name.toLowerCase() !== target.name.toLowerCase() && name.toLowerCase() !== target.code.toLowerCase()) {
          await tx.productAlias.create({
            data: {
              product_id: targetProductId,
              alias: name,
              alias_norm: norm,
            },
          });
          aliasesMoved++;
        }
      }

      // 5. If target lacks pack_size_kg or default_hsn or std rates and source has them, copy over
      const targetUpdates: any = {};
      if (!target.default_hsn && source.default_hsn) targetUpdates.default_hsn = source.default_hsn;
      if (!target.pack_size_kg && source.pack_size_kg) targetUpdates.pack_size_kg = source.pack_size_kg;
      if (!target.std_sale_rate && source.std_sale_rate) targetUpdates.std_sale_rate = source.std_sale_rate;
      if (!target.std_purchase_rate && source.std_purchase_rate) targetUpdates.std_purchase_rate = source.std_purchase_rate;

      if (Object.keys(targetUpdates).length > 0) {
        await tx.product.update({
          where: { id: targetProductId },
          data: targetUpdates,
        });
      }

      // 6. Delete source product
      await tx.product.delete({ where: { id: sourceProductId } });

      return {
        itemsMoved: invoiceItemsUpdate.count,
        movementsMoved: stockMovements.length,
        aliasesMoved,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Merged '${source.name}' into '${target.name}'. Migrated ${result.itemsMoved} invoice items, ${result.movementsMoved} stock movements, and ${result.aliasesMoved} aliases.`,
      result,
    });
  } catch (error) {
    console.error("Error merging products:", error);
    return NextResponse.json(
      { error: { code: "MERGE_FAILED", message: "Failed to merge products" } },
      { status: 500 }
    );
  }
}
