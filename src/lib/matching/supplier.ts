import { prisma } from "@/lib/db";
import { normalizeSupplierName } from "./normalize";
import { calculateSimilarity } from "./customer";

export type SupplierMatchStatus = "MATCHED" | "SUGGESTED" | "NEW";

export interface SupplierResolution {
  status: SupplierMatchStatus;
  supplierId?: string;
  supplierName?: string;
  supplierGstin?: string | null;
  reason?: "GSTIN" | "NAME" | "ALIAS" | "FUZZY";
  confidence: number;
  suggestions?: Array<{ id: string; name: string; gstin: string | null; score: number }>;
  nameChanged?: boolean;
  offerAddGstin?: boolean;
  alsoCustomer?: { id: string; name: string } | null;
}

export async function resolveSupplier(
  supplierDraft: { name: string; gstin?: string | null; address?: string | null },
  fuzzyThreshold = 0.85
): Promise<SupplierResolution> {
  const { name, gstin } = supplierDraft;
  const cleanGstin = gstin ? gstin.trim().toUpperCase() : null;
  const nameNorm = normalizeSupplierName(name || "");

  // Check if GSTIN matches an existing customer (FR-SUP-5: "also a customer" hint)
  let alsoCustomer: { id: string; name: string } | null = null;
  if (cleanGstin) {
    const cust = await prisma.customer.findUnique({
      where: { gstin: cleanGstin },
      select: { id: true, name: true },
    });
    if (cust) {
      alsoCustomer = { id: cust.id, name: cust.name };
    }
  }

  // 1. Exact GSTIN match
  if (cleanGstin) {
    const byGstin = await prisma.supplier.findUnique({
      where: { gstin: cleanGstin },
    });

    if (byGstin) {
      const nameSim = calculateSimilarity(nameNorm, byGstin.name_norm);
      return {
        status: "MATCHED",
        supplierId: byGstin.id,
        supplierName: byGstin.name,
        supplierGstin: byGstin.gstin,
        reason: "GSTIN",
        confidence: 1.0,
        nameChanged: nameSim < 0.8,
        alsoCustomer,
      };
    }

    // If not in suppliers, but GSTIN already exists in the system (e.g. as a customer), draw name from there
    if (alsoCustomer) {
      return {
        status: "MATCHED",
        supplierName: alsoCustomer.name,
        supplierGstin: cleanGstin,
        reason: "GSTIN",
        confidence: 1.0,
        alsoCustomer,
      };
    }
  }

  // 2. Exact normalized name or alias
  const byName = await prisma.supplier.findFirst({
    where: { name_norm: nameNorm, is_active: true },
  });

  if (byName) {
    return {
      status: "MATCHED",
      supplierId: byName.id,
      supplierName: byName.name,
      supplierGstin: byName.gstin,
      reason: "NAME",
      confidence: 0.98,
      offerAddGstin: Boolean(cleanGstin && !byName.gstin),
      alsoCustomer,
    };
  }

  const byAlias = await prisma.supplierAlias.findUnique({
    where: { alias_norm: nameNorm },
    include: { supplier: true },
  });

  if (byAlias && byAlias.supplier.is_active) {
    return {
      status: "MATCHED",
      supplierId: byAlias.supplier.id,
      supplierName: byAlias.supplier.name,
      supplierGstin: byAlias.supplier.gstin,
      reason: "ALIAS",
      confidence: 0.95,
      offerAddGstin: Boolean(cleanGstin && !byAlias.supplier.gstin),
      alsoCustomer,
    };
  }

  // 3. Fuzzy search across all active suppliers
  const allSuppliers = await prisma.supplier.findMany({
    where: { is_active: true },
    select: { id: true, name: true, name_norm: true, gstin: true },
  });

  const suggestions: Array<{ id: string; name: string; gstin: string | null; score: number }> = [];

  for (const s of allSuppliers) {
    const score = calculateSimilarity(nameNorm, s.name_norm);
    if (score >= fuzzyThreshold) {
      suggestions.push({
        id: s.id,
        name: s.name,
        gstin: s.gstin,
        score,
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  if (suggestions.length > 0) {
    const top = suggestions[0];
    return {
      status: "SUGGESTED",
      supplierId: top.id,
      supplierName: top.name,
      supplierGstin: top.gstin,
      reason: "FUZZY",
      confidence: top.score,
      suggestions: suggestions.slice(0, 3),
      offerAddGstin: Boolean(cleanGstin && !top.gstin),
      alsoCustomer,
    };
  }

  // 4. New supplier
  return {
    status: "NEW",
    confidence: 0,
    alsoCustomer,
  };
}
