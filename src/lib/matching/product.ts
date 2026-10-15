import { prisma } from "@/lib/db";
import { normalize } from "./normalize";
import { calculateSimilarity } from "./customer";

export type ProductMatchStatus = "MATCHED" | "SUGGESTED" | "NEW";

export interface ProductResolution {
  status: ProductMatchStatus;
  productId?: string;
  productCode?: string;
  productName?: string;
  reason?: "ALIAS" | "CODE_EXACT" | "CODE_PREFIX" | "CODE_SUFFIX" | "CODE_CONTAINS" | "FUZZY";
  confidence: number;
  suggestions?: Array<{ id: string; code: string; name: string; score: number }>;
}

export async function resolveProduct(
  nameRaw: string,
  fuzzyThreshold = 0.85
): Promise<ProductResolution> {
  const norm = normalize(nameRaw);
  if (!norm) {
    return { status: "NEW", confidence: 0 };
  }

  // 1. Alias exact match
  const byAlias = await prisma.productAlias.findUnique({
    where: { alias_norm: norm },
    include: { product: true },
  });

  if (byAlias) {
    return {
      status: "MATCHED",
      productId: byAlias.product.id,
      productCode: byAlias.product.code,
      productName: byAlias.product.name,
      reason: "ALIAS",
      confidence: 1.0,
    };
  }

  // Fetch all active products
  const products = await prisma.product.findMany({
    where: { is_active: true },
    select: { id: true, code: true, name: true },
  });

  const tokens = norm.split(" ").filter(Boolean);

  // 2. Check exact code match
  const exactCode = products.find((p) => normalize(p.code) === norm);
  if (exactCode) {
    return {
      status: "MATCHED",
      productId: exactCode.id,
      productCode: exactCode.code,
      productName: exactCode.name,
      reason: "CODE_EXACT",
      confidence: 1.0,
    };
  }

  // 3. Leading-code rule:
  // e.g. "AA ACTOIL" -> first token "aa" matches code "AA"
  // e.g. "OIT 9 BATCH 1" -> first two tokens "oit 9" matches code "OIT 9"
  if (tokens.length >= 1) {
    const firstToken = tokens[0];
    const match1 = products.find((p) => normalize(p.code) === firstToken);
    if (match1) {
      return {
        status: "MATCHED",
        productId: match1.id,
        productCode: match1.code,
        productName: match1.name,
        reason: "CODE_PREFIX",
        confidence: 0.95,
      };
    }
  }

  if (tokens.length >= 2) {
    const firstTwoTokens = `${tokens[0]} ${tokens[1]}`;
    const match2 = products.find((p) => normalize(p.code) === firstTwoTokens);
    if (match2) {
      return {
        status: "MATCHED",
        productId: match2.id,
        productCode: match2.code,
        productName: match2.name,
        reason: "CODE_PREFIX",
        confidence: 0.95,
      };
    }
  }

  // 4. Trailing-code rule:
  // e.g. "ACTOIL AA" -> last token "aa" matches code "AA"
  // e.g. "SYNTHETIC WAK" -> last token "wak" matches code "WAK"
  if (tokens.length >= 2) {
    const lastToken = tokens[tokens.length - 1];
    const matchLast = products.find((p) => normalize(p.code) === lastToken);
    if (matchLast) {
      return {
        status: "MATCHED",
        productId: matchLast.id,
        productCode: matchLast.code,
        productName: matchLast.name,
        reason: "CODE_SUFFIX",
        confidence: 0.95,
      };
    }

    const lastTwoTokens = `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`;
    const matchLastTwo = products.find((p) => normalize(p.code) === lastTwoTokens);
    if (matchLastTwo) {
      return {
        status: "MATCHED",
        productId: matchLastTwo.id,
        productCode: matchLastTwo.code,
        productName: matchLastTwo.name,
        reason: "CODE_SUFFIX",
        confidence: 0.95,
      };
    }
  }

  // 5. Code contained in tokens: if a unique product code (length >= 2) is present in the phrase
  const tokenMatches = products.filter((p) => {
    const pCodeNorm = normalize(p.code);
    return pCodeNorm.length >= 2 && tokens.includes(pCodeNorm);
  });
  if (tokenMatches.length === 1) {
    const p = tokenMatches[0];
    return {
      status: "MATCHED",
      productId: p.id,
      productCode: p.code,
      productName: p.name,
      reason: "CODE_CONTAINS",
      confidence: 0.95,
    };
  } else if (tokenMatches.length > 1) {
    const suggestions = tokenMatches.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      score: 0.85,
    }));
    return {
      status: "SUGGESTED",
      productId: suggestions[0].id,
      productCode: suggestions[0].code,
      productName: suggestions[0].name,
      reason: "CODE_CONTAINS",
      confidence: 0.85,
      suggestions,
    };
  }

  // 5. Fuzzy match across product names and codes
  const suggestions: Array<{ id: string; code: string; name: string; score: number }> = [];

  for (const p of products) {
    const codeScore = calculateSimilarity(norm, normalize(p.code));
    const nameScore = calculateSimilarity(norm, normalize(p.name));
    const bestScore = Math.max(codeScore, nameScore);

    if (bestScore >= fuzzyThreshold) {
      suggestions.push({
        id: p.id,
        code: p.code,
        name: p.name,
        score: bestScore,
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  if (suggestions.length > 0) {
    const top = suggestions[0];
    return {
      status: "SUGGESTED",
      productId: top.id,
      productCode: top.code,
      productName: top.name,
      reason: "FUZZY",
      confidence: top.score,
      suggestions: suggestions.slice(0, 3),
    };
  }

  // 6. Otherwise New
  return {
    status: "NEW",
    confidence: 0,
  };
}
