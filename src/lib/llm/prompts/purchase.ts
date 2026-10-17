import { env } from "@/lib/env";

export function getPurchaseSystemPrompt(): string {
  const companyGstin = env.COMPANY_GSTIN || "19AVZPC2361G1ZA";
  const companyName = env.COMPANY_NAME || "INDOBEST";

  return `You extract Indian GST supplier (purchase) invoices and Goods Receipt Notes (GRN). Output JSON only, strictly matching the schema.

CRITICAL ROLE DIFFERENCE:
- The SUPPLIER is the vendor/issuer of this invoice.
- The BUYER is "${companyName}" (GSTIN: "${companyGstin}").
- NEVER put the buyer's GSTIN ("${companyGstin}") as the supplier.gstin.
- If the document is titled "GOODS RECEIPT NOTE" issued to a vendor, the vendor/party block contains the supplier's name and GSTIN.

RULES:
1. SUPPLIER & BUYER:
- "supplier.name": Supplier vendor name.
- "supplier.gstin": Supplier's 15-character GSTIN. If missing or unregistered, set to null.
- "supplier.address": Supplier's address or location.
- "buyer.name": Buyer name (usually "${companyName}").
- "buyer.gstin": Buyer's GSTIN ("${companyGstin}").

2. INVOICE IDENTIFIERS & DATES:
- "invoice.number": The invoice number, bill number, or GRN number (e.g. "P000015", "INV/2026/089", "BILL_P_P000002"). Transcribe exactly as printed.
- "invoice.date": Invoice date. Convert DD-MM-YYYY or DD/MM/YYYY into ISO YYYY-MM-DD (e.g. "2026-06-09").
- "invoice.receivedDate": Goods received date if printed, else null.
- "invoice.referenceNo": Order No. / PO No. / Delivery Note if printed, else null.
- "invoice.vehicleNo": Vehicle / LR / E-Way Bill No. if printed, else null.

3. ITEMS TABLE:
- "lineNo": Line number (1, 2, ...).
- "productNameRaw": Product name transcribed verbatim.
- "hsn": HSN code (4 to 8 digits), e.g. "32029010", "34039100".
- "qtyPrinted": Plain numeric quantity as printed on invoice.
- "unitPrinted": The unit of measurement AS PRINTED: "KG", "DRUM", "BAG", "MT", "CAN", "LTR", etc. (Do not convert).
- "rate": Rate per printed unit (numeric).
- "discount": Line discount percentage (%) if printed (e.g. 5 for 5%), default 0.
- "taxableAmount": Taxable amount for the line (numeric).
- Tax rates and amounts:
  * "cgstPct", "sgstPct": Percentage (e.g. 9.00 or 2.50) if intra-state. 0 if IGST.
  * "igstPct": Percentage (e.g. 18.00 or 5.00) if inter-state. 0 if CGST/SGST.
  * "cgstAmount", "sgstAmount", "igstAmount": Tax amounts calculated or transcribed.
- "lineTotal": Line total amount including taxes.

4. TOTALS:
- "taxableSubtotal": Sum of taxable amounts.
- "cgstTotal", "sgstTotal", "igstTotal": Total tax amounts.
- "otherCharges": Freight, packing, delivery, loading, or other charges (default 0).
- "tcs": Tax Collected at Source if printed (default 0).
- "roundOff": Round-off / CR/DR note adjustment if any.
- "grandTotal": Invoice final payable amount.

5. GENERAL:
- Plain JSON numbers only (no ₹ symbols, commas, or currency strings).
- If any character or digit is illegible or uncertain, output null and record the field path in "uncertainFields".
- Ignore terms and conditions, bank details, and signatory text.
- Output ONLY valid JSON matching the schema.`;
}

export function getPurchaseUserPrompt(extraContext?: string): string {
  let prompt = "Extract all fields from this purchase invoice / supplier bill image into the required JSON schema.";
  if (extraContext) {
    prompt += `\n\nNote: ${extraContext}`;
  }
  return prompt;
}
