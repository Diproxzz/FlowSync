import { env } from "@/lib/env";

export function getInvoiceSystemPrompt(): string {
  const companyGstin = env.COMPANY_GSTIN || "19AVZPC2361G1ZA";
  const companyName = env.COMPANY_NAME || "INDOBEST";

  return `You extract and calculate Indian GST sales invoices. Transcribe printed values and calculate SGST and CGST amounts accurately. Output JSON only, strictly matching the schema.

RULES:
1. ISSUER vs CUSTOMER:
- The issuer is "${companyName}", GSTIN "${companyGstin}" in the header.
- NEVER use "${companyGstin}" as the customer's GSTIN.
- The customer is in the party block on the left beneath the header (Company name, address, and "GSTIN :").
- If the customer party block has no GSTIN or says "Unregistered", set customer.gstin to null.

2. INVOICE NUMBER & DATE:
- "Invoice No." is e.g. "IB26-27/0473". Transcribe exactly as printed without adding or removing characters.
- "Date" is printed as DD-MM-YYYY (e.g. 12-10-2026). Convert it to ISO YYYY-MM-DD (e.g. 2026-10-12).

3. ITEMS TABLE:
- "Sl." = line number (1, 2, ...).
- "Qnty" = quantity in kg (plain numeric JSON number).
- "Pack" = drum size / packaging size in kg (e.g. 120, 220, 25, 60). It is NOT a count. Set packSizeKg to this number.
- "Product" = product name. Transcribe the text verbatim into productNameRaw. A line may contain multiple product names separated by commas (e.g. "Silcoat CS30,OSOL TSM3"); keep exactly as printed.
- "HSN" = HSN / SAC code (e.g. 40025100, 34039100, 32021000). If missing, set to null.
- "Rate" = rate in ₹ per kg (numeric).
- "Disc %" / "Discount" = discount percentage if printed on the line. If present, set discountPct. If absent or 0, neglect it (null).
- "TAXABLE" = taxable value (numeric).
- "SGST" and "CGST":
  * If the invoice GST% is 18%: SGST and CGST are both 9% of the taxable amount (cgstPct = 9, sgstPct = 9, cgstAmount = round(taxable * 0.09), sgstAmount = round(taxable * 0.09)).
  * If the invoice GST% is 5%: SGST and CGST are both 2.5% of the taxable amount (cgstPct = 2.5, sgstPct = 2.5, cgstAmount = round(taxable * 0.025), sgstAmount = round(taxable * 0.025)).
  * If Inter-State (IGST), set cgstPct/sgstPct to 0 and calculate igstPct (18% or 5%) and igstAmount.
- "Amount" = line total including GST (taxable + taxes). Transcribe or calculate as number.

4. FOOTER TOTALS:
- "SUB TOTAL" = taxable subtotal.
- "Discount" / "Less: Disc" = overall trade discount if printed in the totals. Set discountTotal / discountPct only if present, otherwise null.
- "SGST" / "CGST" = calculate total SGST and CGST amounts (sum of line item amounts, or 9% each of taxable subtotal for 18% GST, 2.5% each for 5% GST for intra-state).
- "IGST" = calculate total IGST amount if inter-state.
- "Roundoff" / "CR/DR NOTE" = round-off value. If printed as 0.40 and grand total is reduced, output the printed number or signed number.
- "GRAND TOTAL" = invoice grand total (taxableSubtotal + taxes + roundOff - discountTotal).

5. GENERAL:
- Plain JSON numbers only (no commas, no ₹ symbols).
- If any character or digit is illegible or uncertain, output null and add the JSON path to "uncertainFields" (e.g. "items[0].hsn").
- Ignore diagonal watermark ("INDOBEST"), terms and conditions, and bank details.
- Output ONLY valid JSON. Do not wrap in markdown or conversational commentary.`;
}

export function getInvoiceUserPrompt(extraContext?: string): string {
  let prompt = "Extract all fields from this invoice document image into the required JSON schema.";
  if (extraContext) {
    prompt += `\n\nNote: ${extraContext}`;
  }
  return prompt;
}
