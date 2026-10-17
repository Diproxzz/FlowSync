/**
 * String normalization for products, aliases, and customers
 * Per Architecture §7:
 * - lowercase
 * - remove punctuation except digits and letters
 * - collapse whitespace
 * - for customers: strip legal suffixes (ltd, pvt, private, limited, co) while keeping meaningful trade terms (enterprises, brothers, international)
 */

const CYRILLIC_LOOKALIKES: Record<string, string> = {
  "\u0410": "A", "\u0430": "a",
  "\u0412": "B", "\u0432": "b",
  "\u0415": "E", "\u0435": "e",
  "\u041A": "K", "\u043A": "k",
  "\u041C": "M", "\u043C": "m",
  "\u041D": "H", "\u043D": "h",
  "\u041E": "O", "\u043E": "o",
  "\u0420": "P", "\u0440": "p",
  "\u0421": "C", "\u0441": "c",
  "\u0422": "T", "\u0442": "t",
  "\u0425": "X", "\u0445": "x",
  "\u0443": "y",
  "\u0456": "i", "\u0406": "I",
};

export function cleanLookalikes(s: string): string {
  if (!s) return "";
  return s.replace(/[\u0400-\u04FF]/g, (ch) => CYRILLIC_LOOKALIKES[ch] || ch);
}

export function normalize(s: string): string {
  if (!s) return "";
  return cleanLookalikes(s)
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

export function normalizeSupplierName(name: string): string {
  return normalizeCustomerName(name);
}

export function normalizeInvoiceNumber(num: string): string {
  if (!num) return "";
  return num
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}
