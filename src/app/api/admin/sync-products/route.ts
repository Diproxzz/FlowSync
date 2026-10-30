export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { cleanupDuplicateProducts } from "@/lib/products/sync-master";

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const session = await getSession();

    const isBearerAuthorized = authHeader === `Bearer ${env.SESSION_SECRET}`;
    const isAdminAuthorized = session?.authenticated && (session?.role === "ADMIN" || session?.username?.toLowerCase() === "admin");

    if (!isBearerAuthorized && !isAdminAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jsonPath = path.resolve(process.cwd(), "data/seed/products-master.json");
    if (!fs.existsSync(jsonPath)) {
      return NextResponse.json({ error: "Product master JSON not found" }, { status: 404 });
    }

    await cleanupDuplicateProducts(prisma);

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

    return NextResponse.json({
      ok: true,
      message: `Product master synced successfully: ${updatedCount} updated, ${createdCount} created.`,
      updatedCount,
      createdCount,
    });
  } catch (error: any) {
    console.error("Product sync failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
