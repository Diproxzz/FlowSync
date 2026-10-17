import { prisma } from "@/lib/db";
import { cleanLookalikes } from "./normalize";

const PARTY_LEGAL_TOKENS = new Set([
  "pvt",
  "private",
  "ltd",
  "limited",
  "co",
  "and",
  "llp",
  "inc",
  "corp",
]);

/**
 * Normalizes party name per §5.3:
 * lowercase -> replace non-alphanumerics with space -> drop legal tokens -> compact spaces for comparison key.
 */
export function normalizePartyName(s: string): string {
  if (!s) return "";
  const cleaned = cleanLookalikes(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const tokens = cleaned.split(/\s+/).filter((t) => t && !PARTY_LEGAL_TOKENS.has(t));
  return tokens.join(" ").trim();
}

/**
 * Returns a compact comparison key with all whitespace stripped:
 * e.g. "Abdin Leather Conceria Pvt. Ltd" -> "abdinleatherconceria"
 * "A.I. LEATHER" -> "aileather"
 * "A I Leather" -> "aileather"
 */
export function partyComparisonKey(s: string): string {
  return normalizePartyName(s).replace(/\s+/g, "");
}

function levenshtein(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;

  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      if (b.charAt(j - 1) === a.charAt(i - 1)) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1, // substitution
          Math.min(
            matrix[j][i - 1] + 1, // insertion
            matrix[j - 1][i] + 1 // deletion
          )
        );
      }
    }
  }
  return matrix[bn][an];
}

const GENERIC_BUSINESS_TOKENS = new Set([
  "enterprise",
  "enterprises",
  "trader",
  "traders",
  "trading",
  "company",
  "corporation",
  "industry",
  "industries",
  "agency",
  "agencies",
  "store",
  "stores",
  "impex",
  "exports",
  "imports",
]);

export function similarity(a: string, b: string): number {
  const normA = normalizePartyName(a);
  const normB = normalizePartyName(b);
  const keyA = normA.replace(/\s+/g, "");
  const keyB = normB.replace(/\s+/g, "");
  if (keyA === keyB) return 1.0;
  if (!keyA || !keyB) return 0.0;

  const tokensA = normA.split(/\s+/).filter(Boolean);
  const tokensB = normB.split(/\s+/).filter(Boolean);

  // Check distinctive/core tokens (excluding generic entity suffixes)
  const coreA = tokensA.filter((t) => !GENERIC_BUSINESS_TOKENS.has(t));
  const coreB = tokensB.filter((t) => !GENERIC_BUSINESS_TOKENS.has(t));

  if (coreA.length > 0 && coreB.length > 0) {
    const coreKeyA = coreA.join("");
    const coreKeyB = coreB.join("");
    if (coreKeyA !== coreKeyB) {
      // If core consists of short initials/acronyms (<= 3 chars) and they differ, they must not match
      if (coreKeyA.length <= 3 || coreKeyB.length <= 3) {
        return 0.0;
      }
      const coreMaxLen = Math.max(coreKeyA.length, coreKeyB.length);
      const coreDist = levenshtein(coreKeyA, coreKeyB);
      const coreSim = 1 - coreDist / coreMaxLen;
      if (coreSim < 0.75) return coreSim;
    }
  }

  const maxLen = Math.max(keyA.length, keyB.length);
  const dist = levenshtein(keyA, keyB);
  return 1 - dist / maxLen;
}

export interface PartyResolution {
  status: "exact" | "alias" | "suggested" | "new";
  confidence: number;
  partyType: "CUSTOMER" | "SUPPLIER";
  matchedPartyId?: string;
  matchedName?: string;
  matchedGstin?: string | null;
  suggestedName?: string;
  sourceText: string;
}

/**
 * Matches a party name against existing Customers (and optionally Suppliers).
 */
export async function matchParty(
  name: string,
  partyType: "CUSTOMER" | "SUPPLIER" = "CUSTOMER"
): Promise<PartyResolution> {
  const inputKey = partyComparisonKey(name);
  if (!inputKey) {
    return {
      status: "new",
      confidence: 0,
      partyType,
      sourceText: name,
    };
  }

  if (partyType === "CUSTOMER") {
    const customers = await prisma.customer.findMany({
      include: { aliases: true },
    });

    // 1. Exact match on normalized key
    for (const c of customers) {
      if (partyComparisonKey(c.name) === inputKey) {
        return {
          status: "exact",
          confidence: 1.0,
          partyType: "CUSTOMER",
          matchedPartyId: c.id,
          matchedName: c.name,
          matchedGstin: c.gstin,
          sourceText: name,
        };
      }
    }

    // 2. Exact match on alias
    for (const c of customers) {
      for (const a of c.aliases) {
        if (partyComparisonKey(a.alias) === inputKey) {
          return {
            status: "alias",
            confidence: 0.98,
            partyType: "CUSTOMER",
            matchedPartyId: c.id,
            matchedName: c.name,
            matchedGstin: c.gstin,
            sourceText: name,
          };
        }
      }
    }

    // 3. Fuzzy search on names & aliases
    let bestMatch: any = null;
    let bestScore = 0;

    for (const c of customers) {
      const scoreName = similarity(name, c.name);
      if (scoreName > bestScore) {
        bestScore = scoreName;
        bestMatch = c;
      }
      for (const a of c.aliases) {
        const scoreAlias = similarity(name, a.alias);
        if (scoreAlias > bestScore) {
          bestScore = scoreAlias;
          bestMatch = c;
        }
      }
    }

    if (bestMatch && bestScore >= 0.85) {
      return {
        status: "suggested",
        confidence: Number(bestScore.toFixed(2)),
        partyType: "CUSTOMER",
        matchedPartyId: bestMatch.id,
        matchedName: bestMatch.name,
        matchedGstin: bestMatch.gstin,
        suggestedName: bestMatch.name,
        sourceText: name,
      };
    }

    return {
      status: "new",
      confidence: 0,
      partyType: "CUSTOMER",
      suggestedName: name.trim(),
      sourceText: name,
    };
  } else {
    const suppliers = await prisma.supplier.findMany({
      include: { aliases: true },
    });

    for (const s of suppliers) {
      if (partyComparisonKey(s.name) === inputKey) {
        return {
          status: "exact",
          confidence: 1.0,
          partyType: "SUPPLIER",
          matchedPartyId: s.id,
          matchedName: s.name,
          matchedGstin: s.gstin,
          sourceText: name,
        };
      }
    }

    for (const s of suppliers) {
      for (const a of s.aliases) {
        if (partyComparisonKey(a.alias) === inputKey) {
          return {
            status: "alias",
            confidence: 0.98,
            partyType: "SUPPLIER",
            matchedPartyId: s.id,
            matchedName: s.name,
            matchedGstin: s.gstin,
            sourceText: name,
          };
        }
      }
    }

    let bestMatch: any = null;
    let bestScore = 0;

    for (const s of suppliers) {
      const scoreName = similarity(name, s.name);
      if (scoreName > bestScore) {
        bestScore = scoreName;
        bestMatch = s;
      }
      for (const a of s.aliases) {
        const scoreAlias = similarity(name, a.alias);
        if (scoreAlias > bestScore) {
          bestScore = scoreAlias;
          bestMatch = s;
        }
      }
    }

    if (bestMatch && bestScore >= 0.85) {
      return {
        status: "suggested",
        confidence: Number(bestScore.toFixed(2)),
        partyType: "SUPPLIER",
        matchedPartyId: bestMatch.id,
        matchedName: bestMatch.name,
        matchedGstin: bestMatch.gstin,
        suggestedName: bestMatch.name,
        sourceText: name,
      };
    }

    return {
      status: "new",
      confidence: 0,
      partyType: "SUPPLIER",
      suggestedName: name.trim(),
      sourceText: name,
    };
  }
}
