/**
 * String normalization for products, aliases, and customers
 * Per Architecture §7:
 * - lowercase
 * - remove punctuation except digits and letters
 * - collapse whitespace
 * - for customers: strip legal suffixes (ltd, pvt, private, limited, co) while keeping meaningful trade terms (enterprises, brothers, international)
 */

export function normalize(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LEGAL_FORM_TOKENS = new Set([
  "ltd",
  "limited",
  "pvt",
  "private",
  "co",
  "corp",
  "inc",
]);

export function normalizeCustomerName(name: string): string {
  const norm = normalize(name);
  const tokens = norm.split(" ").filter((t) => !LEGAL_FORM_TOKENS.has(t));
  return tokens.join(" ").trim();
}

export function normalizeInvoiceNumber(num: string): string {
  if (!num) return "";
  return num
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}
