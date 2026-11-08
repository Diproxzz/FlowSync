import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function cleanupDuplicateProducts(db: PrismaClient) {
  try {
    const canonicalRU = await db.product.findUnique({ where: { code: "RU" } });
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
          await tx.invoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalRU.id } });
          await tx.purchaseInvoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalRU.id } });
          await tx.informalInvoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalRU.id } });
          await tx.stockMovement.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalRU.id } });
          await tx.productAlias.deleteMany({ where: { product_id: dup.id } });
          await tx.product.delete({ where: { id: dup.id } });
        });
      }
    }

    const canonicalSUL = await db.product.findUnique({ where: { code: "SUL" } });
    if (canonicalSUL) {
      if (canonicalSUL.name !== "SARCUROL SUL") {
        await db.product.update({ where: { id: canonicalSUL.id }, data: { name: "SARCUROL SUL" } });
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
          await tx.invoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalSUL.id } });
          await tx.purchaseInvoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalSUL.id } });
          await tx.informalInvoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalSUL.id } });
          await tx.stockMovement.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalSUL.id } });
          await tx.productAlias.deleteMany({ where: { product_id: dup.id } });
          await tx.product.delete({ where: { id: dup.id } });
        });
      }
      await db.productAlias.deleteMany({
        where: {
          OR: [
            { alias: { contains: "SARCULROL", mode: "insensitive" } },
            { alias_norm: { contains: "sarculrol" } },
          ],
        },
      });
      await db.invoiceItem.updateMany({
        where: { product_name_raw: { contains: "SARCULROL", mode: "insensitive" } },
        data: { product_name_raw: "SARCUROL SUL" },
      });
    }

    const canonicalSNA = await db.product.findUnique({ where: { code: "SNA" } });
    if (canonicalSNA) {
      const duplicateSNAs = await db.product.findMany({
        where: {
          id: { not: canonicalSNA.id },
          OR: [
            { code: { in: ["SNA ACTOIL", "ACTOIL SNA"] } },
            { name: { in: ["SNA ACTOIL", "ACTOIL SNA"] } },
            { code: { contains: "SNA ACTOIL", mode: "insensitive" } },
            { name: { equals: "SNA ACTOIL", mode: "insensitive" } },
          ],
        },
      });
      for (const dup of duplicateSNAs) {
        await db.$transaction(async (tx) => {
          await tx.invoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalSNA.id } });
          await tx.purchaseInvoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalSNA.id } });
          await tx.informalInvoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalSNA.id } });
          const movements = await tx.stockMovement.findMany({ where: { product_id: dup.id } });
          for (const sm of movements) {
            await tx.stockMovement.update({
              where: { id: sm.id },
              data: { product_id: canonicalSNA.id, qty_kg: Math.abs(Number(sm.qty_kg)) },
            });
          }
          await tx.productAlias.deleteMany({ where: { product_id: dup.id } });
          await tx.product.delete({ where: { id: dup.id } });
        });
      }
      const snaAliases = ["SNA ACTOIL", "ACTOIL SNA"];
      for (const aliasText of snaAliases) {
        const normWithSpace = aliasText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
        const normWithoutSpace = aliasText.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const norm of [normWithSpace, normWithoutSpace]) {
          if (!norm) continue;
          const existing = await db.productAlias.findUnique({ where: { alias_norm: norm } });
          if (existing && existing.product_id !== canonicalSNA.id) {
            await db.productAlias.update({ where: { id: existing.id }, data: { product_id: canonicalSNA.id } });
          } else if (!existing) {
            try {
              await db.productAlias.create({
                data: { product_id: canonicalSNA.id, alias: aliasText, alias_norm: norm },
              });
            } catch {}
          }
        }
      }
    }

    const canonicalOIT = await db.product.findUnique({
      where: { code: "OIT 9" },
    });
    if (canonicalOIT) {
      const duplicateOITs = await db.product.findMany({
        where: {
          id: { not: canonicalOIT.id },
          OR: [
            { code: { in: ["OIT 9 BIOCIDE", "OIT9 BIOCIDE"] } },
            { name: { in: ["OIT 9 BIOCIDE", "OIT9 BIOCIDE", "oit 9 biocide"] } },
            { code: { contains: "OIT 9 BIOCIDE", mode: "insensitive" } },
            { name: { equals: "oit 9 biocide", mode: "insensitive" } },
            { name: { equals: "OIT 9 BIOCIDE", mode: "insensitive" } },
          ],
        },
      });

      for (const dup of duplicateOITs) {
        await db.$transaction(async (tx) => {
          await tx.invoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalOIT.id } });
          await tx.purchaseInvoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalOIT.id } });
          await tx.informalInvoiceItem.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalOIT.id } });
          await tx.stockMovement.updateMany({ where: { product_id: dup.id }, data: { product_id: canonicalOIT.id } });
          await tx.productAlias.deleteMany({ where: { product_id: dup.id } });
          await tx.product.delete({ where: { id: dup.id } });
        });
      }

      const oitAliases = ["OIT 9 ACTISOLV", "OIT 9 BIOCIDE", "OIT9 BIOCIDE", "OIT9 ACTISOLV"];
      for (const aliasText of oitAliases) {
        const normWithSpace = aliasText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
        const normWithoutSpace = aliasText.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const norm of [normWithSpace, normWithoutSpace]) {
          if (!norm) continue;
          const existing = await db.productAlias.findUnique({ where: { alias_norm: norm } });
          if (existing && existing.product_id !== canonicalOIT.id) {
            await db.productAlias.update({ where: { id: existing.id }, data: { product_id: canonicalOIT.id } });
          } else if (!existing) {
            try {
              await db.productAlias.create({
                data: { product_id: canonicalOIT.id, alias: aliasText, alias_norm: norm },
              });
            } catch {}
          }
        }
      }
    }

    const xac = await db.product.findUnique({ where: { code: "XAC" } });
    if (xac) {
      await db.stockMovement.deleteMany({
        where: {
          product_id: xac.id,
          type: "PURCHASE",
          OR: [
            { source: { not: "PURCHASE_INVOICE" } },
            { qty_kg: 431 },
          ],
        },
      });
    }
  } catch (err) {
    console.error("Cleanup error during sync:", err);
  }
}

export async function syncProductMaster() {
  await cleanupDuplicateProducts(prisma);
  const jsonPath = path.resolve(process.cwd(), "data/seed/products-master.json");
  if (!fs.existsSync(jsonPath)) {
    console.warn(`Product master JSON not found at ${jsonPath}, skipping sync.`);
    return;
  }

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

  console.log(`Syncing ${data.length} products to database...`);
  let updatedCount = 0;
  let createdCount = 0;

  for (const item of data) {
    const existing = await prisma.product.findUnique({
      where: { code: item.code },
    });

    let product;
    if (existing) {
      product = await prisma.product.update({
        where: { code: item.code },
        data: {
          name: item.name,
          category: item.category ?? existing.category,
          default_hsn: item.default_hsn ?? existing.default_hsn,
          pack_size_kg: item.pack_size_kg !== null ? item.pack_size_kg.toFixed(2) : existing.pack_size_kg,
          landing_cost: item.landing_cost !== null ? item.landing_cost.toFixed(2) : existing.landing_cost,
          std_purchase_rate: item.std_purchase_rate !== null ? item.std_purchase_rate.toFixed(2) : existing.std_purchase_rate,
          std_sale_rate: item.std_sale_rate !== null ? item.std_sale_rate.toFixed(2) : existing.std_sale_rate,
          reorder_level_kg: item.reorder_level_kg !== null ? item.reorder_level_kg.toFixed(3) : existing.reorder_level_kg,
          is_active: true,
        },
      });
      updatedCount++;
    } else {
      product = await prisma.product.create({
        data: {
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
      createdCount++;
    }

    // Ensure aliases
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
      } catch (err) {
        // ignore unique constraint collisions across products
      }
    }
  }

  console.log(`Product master sync complete: ${updatedCount} updated, ${createdCount} created.`);
}

syncProductMaster()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("Failed to sync product master:", err);
    prisma.$disconnect();
    process.exit(1);
  });
