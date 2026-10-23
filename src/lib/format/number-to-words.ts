/**
 * Converts a numeric amount into Indian English currency words format.
 * Matches Marg ERP INDOBEST invoice style:
 * e.g.
 * 9426   -> "Rs. Nine Thousand Four Hundred and Twenty Six only"
 * 16992  -> "Rs. Sixteen Thousand Nine Hundred and Ninety Two only"
 * 7613   -> "Rs. Seven Thousand Six Hundred and Thirteen only"
 * 56640  -> "Rs. Fifty Six Thousand Six Hundred and Forty only"
 */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigitsToWords(n: number): string {
  if (n < 20) {
    return ONES[n];
  }
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

export function numberToWordsINR(amount: number | string): string {
  const num = Math.round(Number(amount));
  if (isNaN(num) || num === 0) {
    return "Rs. Zero only";
  }

  const parts: string[] = [];

  // Crores (1,00,00,000)
  const crores = Math.floor(num / 10000000);
  let rem = num % 10000000;
  if (crores > 0) {
    parts.push(`${twoDigitsToWords(crores)} Crore`);
  }

  // Lakhs (1,00,000)
  const lakhs = Math.floor(rem / 100000);
  rem = rem % 100000;
  if (lakhs > 0) {
    parts.push(`${twoDigitsToWords(lakhs)} Lakh`);
  }

  // Thousands (1,000)
  const thousands = Math.floor(rem / 1000);
  rem = rem % 1000;
  if (thousands > 0) {
    parts.push(`${twoDigitsToWords(thousands)} Thousand`);
  }

  // Hundreds & remainder
  if (rem > 0) {
    const hundreds = Math.floor(rem / 100);
    const lastTwo = rem % 100;

    if (hundreds > 0) {
      parts.push(`${ONES[hundreds]} Hundred`);
    }

    if (lastTwo > 0) {
      const words = twoDigitsToWords(lastTwo);
      if (parts.length > 0) {
        parts.push(`and ${words}`);
      } else {
        parts.push(words);
      }
    }
  }

  return `Rs. ${parts.join(" ")} only`;
}
