/**
 * Formatting utilities for Indobest Insights
 * Follows Design System §8 (Content and formatting rules):
 * - Currency: ₹ + Indian grouping + 2 decimals (e.g. ₹3,75,240.00)
 * - Quantity: kg, trailing zeros trimmed (e.g. 660 kg or 12.5 kg)
 * - Dates: '12 Oct 2026' in UI, ISO in data/exports
 * - Percentages: one decimal (e.g. 9.0%)
 * - Negative numbers use true minus −
 */

export function formatINR(val: number | string | null | undefined, abbreviate = false): string {
  if (val === null || val === undefined || isNaN(Number(val))) return "₹0.00";
  const num = Number(val);
  const isNegative = num < 0;
  const abs = Math.abs(num);

  if (abbreviate) {
    if (abs >= 10000000) {
      // Crores
      const cr = (abs / 10000000).toFixed(2);
      return `${isNegative ? "−" : ""}₹${cr} Cr`;
    }
    if (abs >= 100000) {
      // Lakhs
      const lk = (abs / 100000).toFixed(2);
      return `${isNegative ? "−" : ""}₹${lk} L`;
    }
  }

  const parts = abs.toFixed(2).split(".");
  let intPart = parts[0];
  const decPart = parts[1];

  // Indian digit grouping: 3 digits from right, then groups of 2
  if (intPart.length > 3) {
    const last3 = intPart.substring(intPart.length - 3);
    const otherNumbers = intPart.substring(0, intPart.length - 3);
    intPart = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }

  return `${isNegative ? "−" : ""}₹${intPart}.${decPart}`;
}

export function formatKg(val: number | string | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) return "0 kg";
  const num = Number(val);
  const isNegative = num < 0;
  const abs = Math.abs(num);

  // Trim trailing zeros after decimal, max 3 decimals
  const formatted = parseFloat(abs.toFixed(3)).toString();
  return `${isNegative ? "−" : ""}${formatted} kg`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const day = d.getDate().toString().padStart(2, "0");
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  return `${day} ${month} ${year}`;
}

export function formatPercent(val: number | string | null | undefined, showSign = false): string {
  if (val === null || val === undefined || isNaN(Number(val))) return "0.0%";
  const num = Number(val);
  const sign = showSign && num > 0 ? "+" : num < 0 ? "−" : "";
  const abs = Math.abs(num);
  return `${sign}${abs.toFixed(1)}%`;
}
