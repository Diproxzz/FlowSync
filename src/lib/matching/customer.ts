import { prisma } from "@/lib/db";
import { normalizeCustomerName } from "./normalize";
import { distance } from "fastest-levenshtein";

export type CustomerMatchStatus = "MATCHED" | "SUGGESTED" | "NEW";

export interface CustomerResolution {
  status: CustomerMatchStatus;
  customerId?: string;
  customerName?: string;
  customerGstin?: string | null;
  reason?: "GSTIN" | "NAME" | "ALIAS" | "FUZZY";
  confidence: number;
  suggestions?: Array<{ id: string; name: string; gstin: string | null; score: number }>;
  nameChanged?: boolean;
  offerAddGstin?: boolean;
}

export function calculateSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;

  const dist = distance(s1, s2);
  return 1 - dist / maxLen;
}

export async function resolveCustomer(
  customerDraft: { name: string; gstin?: string | null; address?: string | null },
  fuzzyThreshold = 0.85
): Promise<CustomerResolution> {
  const { name, gstin } = customerDraft;
  const cleanGstin = gstin ? gstin.trim().toUpperCase() : null;
  const nameNorm = normalizeCustomerName(name);

  // 1. Exact GSTIN match
  if (cleanGstin) {
    const byGstin = await prisma.customer.findUnique({
      where: { gstin: cleanGstin },
    });

    if (byGstin) {
      const nameSim = calculateSimilarity(nameNorm, byGstin.name_norm);
      return {
        status: "MATCHED",
        customerId: byGstin.id,
        customerName: byGstin.name,
        customerGstin: byGstin.gstin,
        reason: "GSTIN",
        confidence: 1.0,
        nameChanged: nameSim < 0.8,
      };
    }
  }

  // 2. Exact normalized name or alias
  const byName = await prisma.customer.findFirst({
    where: { name_norm: nameNorm },
  });

  if (byName) {
    return {
      status: "MATCHED",
      customerId: byName.id,
      customerName: byName.name,
      customerGstin: byName.gstin,
      reason: "NAME",
      confidence: 0.98,
      offerAddGstin: Boolean(cleanGstin && !byName.gstin),
    };
  }

  const byAlias = await prisma.customerAlias.findUnique({
    where: { alias_norm: nameNorm },
    include: { customer: true },
  });

  if (byAlias) {
    return {
      status: "MATCHED",
      customerId: byAlias.customer.id,
      customerName: byAlias.customer.name,
      customerGstin: byAlias.customer.gstin,
      reason: "ALIAS",
      confidence: 0.95,
      offerAddGstin: Boolean(cleanGstin && !byAlias.customer.gstin),
    };
  }

  // 3. Fuzzy search across all customers
  const allCustomers = await prisma.customer.findMany({
    select: { id: true, name: true, name_norm: true, gstin: true },
  });

  const suggestions: Array<{ id: string; name: string; gstin: string | null; score: number }> = [];

  for (const c of allCustomers) {
    const score = calculateSimilarity(nameNorm, c.name_norm);
    if (score >= fuzzyThreshold) {
      suggestions.push({
        id: c.id,
        name: c.name,
        gstin: c.gstin,
        score,
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  if (suggestions.length > 0) {
    const top = suggestions[0];
    return {
      status: "SUGGESTED",
      customerId: top.id,
      customerName: top.name,
      customerGstin: top.gstin,
      reason: "FUZZY",
      confidence: top.score,
      suggestions: suggestions.slice(0, 3),
      offerAddGstin: Boolean(cleanGstin && !top.gstin),
    };
  }

  // 4. New customer
  return {
    status: "NEW",
    confidence: 0,
  };
}
