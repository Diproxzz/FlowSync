import path from "path";
import fs from "fs";
import { prisma } from "@/lib/db";

let lastSyncMtime = 0;
let duplicatesCleaned = false;

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function cleanupDuplicateProducts(db: typeof prisma) {
  try {
    // 1. Clean up duplicate RU ACTIPACT
    const canonicalRU = await db.product.findUnique({
      where: { code: "RU" },
    });
    if (canonicalRU) {
      const duplicateRUs = await db.product.findMany({
        where: {
          id: { not: canonicalRU.id },
          OR: [
            { code: { in: ["RU ACTIPACT", "ACTIPACT RU"] } },
            { name: { in: ["RU ACTIPACT", "ACTIPACT RU"] } },
          ],
        },
      });

      for (const dup of duplicateRUs) {
        await db.$transaction(async (tx) => {
          await tx.invoiceItem.updateMany({
            where: { product_id: dup.id },
            data: { product_id: canonicalRU.id },
          });
          await tx.purchaseInvoiceItem.updateMany({
            where: { product_id: dup.id },
            data: { product_id: canonicalRU.id },
          });
          await tx.informalInvoiceItem.updateMany({
            where: { product_id: dup.id },
            data: { product_id: canonicalRU.id },
          });
          await tx.stockMovement.updateMany({
            where: { product_id: dup.id },
            data: { product_id: canonicalRU.id },
          });
          await tx.productAlias.deleteMany({
            where: { product_id: dup.id },
          });
          await tx.product.delete({
            where: { id: dup.id },
          });
        });
      }

      // Ensure aliases on canonicalRU
      const ruAliases = ["RU ACTIPACT", "ACTIPACT RU"];
      for (const aliasText of ruAliases) {
        const aliasNorm = normalize(aliasText);
        const existing = await db.productAlias.findUnique({ where: { alias_norm: aliasNorm } });
        if (existing && existing.product_id !== canonicalRU.id) {
          await db.productAlias.update({ where: { id: existing.id }, data: { product_id: canonicalRU.id } });
        } else if (!existing) {
          try {
            await db.productAlias.create({
              data: { product_id: canonicalRU.id, alias: aliasText, alias_norm: aliasNorm },
            });
          } catch {}
        }
      }
    }

    // 2. Clean up duplicate SUL / SARCULROL SUL
    const canonicalSUL = await db.product.findUnique({
      where: { code: "SUL" },
    });
    if (canonicalSUL) {
      if (canonicalSUL.name !== "SARCUROL SUL") {
        await db.product.update({
          where: { id: canonicalSUL.id },
          data: { name: "SARCUROL SUL" },
        });
      }

      const duplicateSULs = await db.product.findMany({
        where: {
          id: { not: canonicalSUL.id },
          OR: [
            { code: { in: ["SARCULROL SUL", "SARCUROL SUL"] } },
            { name: { in: ["SARCULROL SUL", "SARCUROL SUL"] } },
          ],
        },
      });

      for (const dup of duplicateSULs) {
        await db.$transaction(async (tx) => {
          await tx.invoiceItem.updateMany({
            where: { product_id: dup.id },
            data: { product_id: canonicalSUL.id },
          });
          await tx.purchaseInvoiceItem.updateMany({
            where: { product_id: dup.id },
            data: { product_id: canonicalSUL.id },
          });
          await tx.informalInvoiceItem.updateMany({
            where: { product_id: dup.id },
            data: { product_id: canonicalSUL.id },
          });
          await tx.stockMovement.updateMany({
            where: { product_id: dup.id },
            data: { product_id: canonicalSUL.id },
          });
          await tx.productAlias.deleteMany({
            where: { product_id: dup.id },
          });
          await tx.product.delete({
            where: { id: dup.id },
          });
        });
      }

      // Purge misspelled aliases containing "SARCULROL"
      await db.productAlias.deleteMany({
        where: {
          OR: [
            { alias: { contains: "SARCULROL", mode: "insensitive" } },
            { alias_norm: { contains: "sarculrol" } },
          ],
        },
      });

      // Correct historical raw invoice items
      await db.invoiceItem.updateMany({
        where: { product_name_raw: { contains: "SARCULROL", mode: "insensitive" } },
        data: { product_name_raw: "SARCUROL SUL" },
      });

      // Ensure canonical alias
      const sulNorm = normalize("SARCUROL SUL");
      const existingSulAlias = await db.productAlias.findUnique({ where: { alias_norm: sulNorm } });
      if (existingSulAlias && existingSulAlias.product_id !== canonicalSUL.id) {
        await db.productAlias.update({ where: { id: existingSulAlias.id }, data: { product_id: canonicalSUL.id } });
      } else if (!existingSulAlias) {
        try {
          await db.productAlias.create({
            data: { product_id: canonicalSUL.id, alias: "SARCUROL SUL", alias_norm: sulNorm },
          });
        } catch {}
      }
    }
  } catch (err) {
    console.error("Cleanup duplicate products error:", err);
  }
}

export async function ensureProductMasterSynced(force = false) {
  // Always clean duplicate products if not yet done in this runtime instance or if forced
  if (!duplicatesCleaned || force) {
    await cleanupDuplicateProducts(prisma);
    duplicatesCleaned = true;
  }

  const jsonPath = path.resolve(process.cwd(), "data/seed/products-master.json");
  if (!fs.existsSync(jsonPath)) return;

  try {
    const currentMtime = fs.statSync(jsonPath).mtimeMs;
    if (!force && lastSyncMtime === currentMtime) return;

    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Array<{
      code: string;
      name: string;
      category: string | null;
      default_hsn: string | null;
      pack_size_kg: number | null;
      landing_cost: number | null;
      std_purchase_rate: number | null;
      std_sale_rate: number | null;
      reorder_level_kg: number | null;
      aliases: string[];
    }>;

    for (const item of data) {
      const product = await prisma.product.upsert({
        where: { code: item.code },
        update: {
          name: item.name,
          category: item.category ?? undefined,
          default_hsn: item.default_hsn ?? undefined,
          pack_size_kg: item.pack_size_kg !== null ? item.pack_size_kg.toFixed(2) : undefined,
          landing_cost: item.landing_cost !== null ? item.landing_cost.toFixed(2) : undefined,
          std_purchase_rate: item.std_purchase_rate !== null ? item.std_purchase_rate.toFixed(2) : undefined,
          std_sale_rate: item.std_sale_rate !== null ? item.std_sale_rate.toFixed(2) : undefined,
          reorder_level_kg: item.reorder_level_kg !== null ? item.reorder_level_kg.toFixed(3) : undefined,
          is_active: true,
        },
        create: {
          code: item.code,
          name: item.name,
          category: item.category,
          default_hsn: item.default_hsn,
          pack_size_kg: item.pack_size_kg !== null ? item.pack_size_kg.toFixed(2) : null,
          landing_cost: item.landing_cost !== null ? item.landing_cost.toFixed(2) : null,
          std_purchase_rate: item.std_purchase_rate !== null ? item.std_purchase_rate.toFixed(2) : null,
          std_sale_rate: item.std_sale_rate !== null ? item.std_sale_rate.toFixed(2) : null,
          reorder_level_kg: item.reorder_level_kg !== null ? item.reorder_level_kg.toFixed(3) : null,
          source: "MASTER",
          is_active: true,
        },
      });

      for (const alias of item.aliases) {
        const aliasNorm = normalize(alias);
        if (!aliasNorm) continue;
        try {
          await prisma.productAlias.upsert({
            where: { alias_norm: aliasNorm },
            update: { product_id: product.id, alias },
            create: {
              product_id: product.id,
              alias,
              alias_norm: aliasNorm,
            },
          });
        } catch {
          // ignore unique constraint collisions across products
        }
      }
    }

    lastSyncMtime = currentMtime;
  } catch (err) {
    console.error("Auto product master sync error:", err);
  }
}
