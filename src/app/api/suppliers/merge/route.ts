export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeSupplierName } from "@/lib/matching/normalize";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceSupplierId, targetSupplierId } = body;

    if (!sourceSupplierId || !targetSupplierId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "sourceSupplierId and targetSupplierId are required" } },
        { status: 400 }
      );
    }

    if (sourceSupplierId === targetSupplierId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Cannot merge supplier into itself" } },
        { status: 400 }
      );
    }

    const [source, target] = await Promise.all([
      prisma.supplier.findUnique({
        where: { id: sourceSupplierId },
        include: { aliases: true, purchase_invoices: true },
      }),
      prisma.supplier.findUnique({
        where: { id: targetSupplierId },
        include: { aliases: true, purchase_invoices: true },
      }),
    ]);

    if (!source || !target) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Source or target supplier not found" } },
        { status: 404 }
      );
    }

    // Check for invoice number collision under target
    const targetInvNums = new Set(target.purchase_invoices.map((i) => i.invoice_number_norm));
    const conflicting = source.purchase_invoices.find((i) => targetInvNums.has(i.invoice_number_norm));
    if (conflicting) {
      return NextResponse.json(
        {
          error: {
            code: "MERGE_CONFLICT",
            message: `Cannot merge: Target supplier already has invoice number '${conflicting.supplier_invoice_number}'`,
          },
        },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-point purchase invoices to target
      await tx.purchaseInvoice.updateMany({
        where: { supplier_id: sourceSupplierId },
        data: { supplier_id: targetSupplierId },
      });

      // 2. Transfer aliases
      for (const al of source.aliases) {
        const existing = await tx.supplierAlias.findUnique({
          where: { alias_norm: al.alias_norm },
        });
        if (existing) {
          if (existing.supplier_id === sourceSupplierId) {
            await tx.supplierAlias.update({
              where: { id: al.id },
              data: { supplier_id: targetSupplierId },
            });
          }
        } else {
          await tx.supplierAlias.create({
            data: {
              supplier_id: targetSupplierId,
              alias: al.alias,
              alias_norm: al.alias_norm,
            },
          });
        }
      }

      // 3. Create alias for source supplier's name if not already exists
      const sourceNorm = source.name_norm;
      const existingSourceAlias = await tx.supplierAlias.findUnique({
        where: { alias_norm: sourceNorm },
      });
      if (!existingSourceAlias && sourceNorm !== target.name_norm) {
        await tx.supplierAlias.create({
          data: {
            supplier_id: targetSupplierId,
            alias: source.name,
            alias_norm: sourceNorm,
          },
        });
      }

      // 4. Deactivate source supplier
      await tx.supplier.update({
        where: { id: sourceSupplierId },
        data: { is_active: false },
      });

      return {
        invoicesMoved: source.purchase_invoices.length,
        aliasesMoved: source.aliases.length,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Successfully merged '${source.name}' into '${target.name}'`,
      details: result,
    });
  } catch (error: any) {
    console.error("Error merging suppliers:", error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: error.message || "Failed to merge suppliers" } },
      { status: 500 }
    );
  }
}
