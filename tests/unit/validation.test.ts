// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateInvoice } from "@/lib/validation/invoice";
import inv473 from "../fixtures/inv-473.json";
import inv474 from "../fixtures/inv-474.json";
import inv475 from "../fixtures/inv-475.json";
import { ExtractedInvoice } from "@/lib/llm/schema";

describe("Phase 4: Invoice Validation Rules", () => {
  const COMPANY_GSTIN = "19AVZPC2361G1ZA";

  it("should validate Golden Fixture 473 (Rahman Industries) with zero errors", () => {
    const result = validateInvoice(inv473 as ExtractedInvoice, COMPANY_GSTIN);
    expect(result.hasErrors).toBe(false);
    expect(result.isValid).toBe(true);
    expect(result.derivedRoundOff).toBe(0);

    // Line 2 has comma separated products "Silcoat CS30,OSOL TSM3"
    const multipleHint = result.issues.find((i) => i.code === "MULTIPLE_PRODUCTS_IN_LINE");
    expect(multipleHint).toBeDefined();
    expect(multipleHint?.severity).toBe("info");
  });

  it("should validate Golden Fixture 474 (Super Tanners Syndicate) with zero errors", () => {
    const result = validateInvoice(inv474 as ExtractedInvoice, COMPANY_GSTIN);
    expect(result.hasErrors).toBe(false);
    expect(result.isValid).toBe(true);
    expect(result.derivedRoundOff).toBe(0);
  });

  it("should validate Golden Fixture 475 (Tiger International) with exact derived round-off -0.40", () => {
    const result = validateInvoice(inv475 as ExtractedInvoice, COMPANY_GSTIN);
    expect(result.hasErrors).toBe(false);
    expect(result.isValid).toBe(true);
    expect(result.derivedRoundOff).toBe(-0.4);
  });

  it("should flag tampered Grand Total with GRAND_TOTAL_MISMATCH warning", () => {
    const tampered = JSON.parse(JSON.stringify(inv474));
    tampered.totals.grandTotal = 20000; // was 14868

    const result = validateInvoice(tampered, COMPANY_GSTIN);
    expect(result.hasWarnings).toBe(true);

    const issue = result.issues.find((i) => i.code === "GRAND_TOTAL_MISMATCH");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
  });

  it("should flag tampered line rate/taxable with LINE_TAXABLE_MISMATCH warning", () => {
    const tampered = JSON.parse(JSON.stringify(inv474));
    tampered.items[0].taxableAmount = 15000; // Qty 120 * Rate 105 = 12600

    const result = validateInvoice(tampered, COMPANY_GSTIN);
    expect(result.hasWarnings).toBe(true);

    const issue = result.issues.find((i) => i.code === "LINE_TAXABLE_MISMATCH");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
  });

  it("should reject customer GSTIN matching Company Issuer GSTIN with GSTIN_IS_COMPANY", () => {
    const tampered = JSON.parse(JSON.stringify(inv473));
    tampered.customer.gstin = COMPANY_GSTIN;

    const result = validateInvoice(tampered, COMPANY_GSTIN);
    expect(result.hasErrors).toBe(true);

    const issue = result.issues.find((i) => i.code === "GSTIN_IS_COMPANY");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });

  it("should reject invalid GSTIN check digit with GSTIN_CHECKSUM", () => {
    const tampered = JSON.parse(JSON.stringify(inv473));
    // 19AAACR6862N1ZP -> change last digit P to X
    tampered.customer.gstin = "19AAACR6862N1ZX";

    const result = validateInvoice(tampered, COMPANY_GSTIN);
    expect(result.hasErrors).toBe(true);

    const issue = result.issues.find((i) => i.code === "GSTIN_CHECKSUM");
    expect(issue).toBeDefined();
  });

  it("should flag missing customer GSTIN as a warning (unregistered buyer)", () => {
    const unregistered = JSON.parse(JSON.stringify(inv474));
    unregistered.customer.gstin = null;

    const result = validateInvoice(unregistered, COMPANY_GSTIN);
    // Missing GSTIN is warning, not error (unregistered customers are valid in business)
    expect(result.hasErrors).toBe(false);
    expect(result.hasWarnings).toBe(true);

    const issue = result.issues.find((i) => i.code === "GSTIN_MISSING");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
  });
});
