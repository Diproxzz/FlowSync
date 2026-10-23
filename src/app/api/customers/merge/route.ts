export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceCustomerId, targetCustomerId } = body;

    if (!sourceCustomerId || !targetCustomerId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "sourceCustomerId and targetCustomerId are required" } },
        { status: 400 }
      );
    }

    if (sourceCustomerId === targetCustomerId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Cannot merge customer into itself" } },
        { status: 400 }
      );
    }

    const [source, target] = await Promise.all([
      prisma.customer.findUnique({ where: { id: sourceCustomerId }, include: { aliases: true } }),
      prisma.customer.findUnique({ where: { id: targetCustomerId } }),
    ]);

    if (!source || !target) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Source or target customer not found" } },
        { status: 404 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-point invoices
      const invoiceUpdate = await tx.invoice.updateMany({
        where: { customer_id: sourceCustomerId },
        data: { customer_id: targetCustomerId },
      });

      // 2. Transfer aliases
      let aliasesMoved = 0;
      for (const alias of source.aliases) {
        const existingInTarget = await tx.customerAlias.findUnique({
          where: { alias_norm: alias.alias_norm },
        });

        if (!existingInTarget) {
          await tx.customerAlias.update({
            where: { id: alias.id },
            data: { customer_id: targetCustomerId },
          });
          aliasesMoved++;
        }
      }

      // 3. Add source customer name as an alias on target if not already present
      const sourceNameNorm = source.name_norm;
      const targetHasSourceName = await tx.customerAlias.findUnique({
        where: { alias_norm: sourceNameNorm },
      });
      if (!targetHasSourceName && source.name !== target.name) {
        await tx.customerAlias.create({
          data: {
            customer_id: targetCustomerId,
            alias: source.name,
            alias_norm: sourceNameNorm,
          },
        });
        aliasesMoved++;
      }

      // 4. Delete source customer
      await tx.customer.delete({ where: { id: sourceCustomerId } });

      return {
        invoicesMoved: invoiceUpdate.count,
        aliasesMoved,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Merged '${source.name}' into '${target.name}'. Migrated ${result.invoicesMoved} invoices and ${result.aliasesMoved} aliases.`,
      result,
    });
  } catch (error) {
    console.error("Error merging customers:", error);
    return NextResponse.json(
      { error: { code: "MERGE_FAILED", message: "Failed to merge customers" } },
      { status: 500 }
    );
  }
}
