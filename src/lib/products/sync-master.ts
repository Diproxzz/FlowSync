import path from "path";
import fs from "fs";
import { prisma } from "@/lib/db";

let lastSyncMtime = 0;

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function ensureProductMasterSynced(force = false) {
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
