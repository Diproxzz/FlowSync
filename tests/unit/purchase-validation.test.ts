import { describe, it, expect } from "vitest";
import { validatePurchaseInvoice } from "@/lib/validation/purchase";
import { ExtractedPurchaseInvoice } from "@/lib/llm/schema.purchase";

describe("Purchase Invoice Validation (Phase 3)", () => {
  const baseValidInvoice: ExtractedPurchaseInvoice = {
    supplier: {
      name: "Agarwal & Company",
      gstin: "19AGDPA1084B1Z1", // West Bengal (19)
      address: "Kolkata",
    },
    buyer: {
      name: "INDOBEST",
      gstin: "19AVZPC2361G1ZA",
    },
    invoice: {
      number: "P000015",
      date: "2026-06-09",
    },
    items: [
      {
        lineNo: 1,
        productNameRaw: "Basic Chrome Sulphate",
        hsn: "32029010",
        qtyPrinted: 50,
        unitPrinted: "KG",
        rate: 82,
        discount: 0,
        taxableAmount: 4100,
        cgstPct: 9,
        sgstPct: 9,
        igstPct: 0,
        cgstAmount: 369,
        sgstAmount: 369,
        igstAmount: 0,
        lineTotal: 4838,
      },
      {
        lineNo: 2,
        productNameRaw: "Ammonium Bi-Carbonate",
        hsn: "28369990",
        qtyPrinted: 50,
        unitPrinted: "KG",
        rate: 32,
        discount: 0,
        taxableAmount: 1600,
        cgstPct: 9,
        sgstPct: 9,
        igstPct: 0,
        cgstAmount: 144,
        sgstAmount: 144,
        igstAmount: 0,
        lineTotal: 1888,
      },
    ],
    totals: {
      taxableSubtotal: 5700,
      cgstTotal: 513,
      sgstTotal: 513,
      igstTotal: 0,
      otherCharges: 0,
      tcs: 0,
      roundOff: 0,
      grandTotal: 6726,
    },
    uncertainFields: [],
    isImport: false,
  };

  it("validates a clean intra-state (CGST + SGST) purchase invoice", () => {
    const res = validatePurchaseInvoice(baseValidInvoice);
    expect(res.isValid).toBe(true);
    expect(res.hasErrors).toBe(false);
    expect(res.taxType).toBe("CGST_SGST");
    expect(res.derivedRoundOff).toBe(0);
  });

  it("validates an inter-state (IGST) purchase invoice with other charges and round-off", () => {
    const igstInvoice: ExtractedPurchaseInvoice = {
      ...baseValidInvoice,
      supplier: {
        name: "Oceanic Solvent Industries",
        gstin: "24AAAFO4471D1ZN", // Gujarat (24)
        address: "Jamnagar",
      },
      invoice: {
        number: "P000008",
        date: "2026-04-19",
      },
      items: [
        {
          lineNo: 1,
          productNameRaw: "Silcoat CS30,OSOL TSM3",
          hsn: "38241000",
          qtyPrinted: 2040,
          unitPrinted: "KG",
          rate: 47,
          discount: 0,
          taxableAmount: 95880,
          cgstPct: 0,
          sgstPct: 0,
          igstPct: 18,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 17258.4,
          lineTotal: 113138.4,
        },
      ],
      totals: {
        taxableSubtotal: 95880,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 17258.4,
        otherCharges: 0.4,
        tcs: 0,
        roundOff: -0.8,
        grandTotal: 113138,
      },
    };

    const res = validatePurchaseInvoice(igstInvoice);
    expect(res.isValid).toBe(true);
    expect(res.taxType).toBe("IGST");
    expect(res.derivedRoundOff).toBe(-0.8);
  });

  it("errors if supplier GSTIN matches company GSTIN (SUPPLIER_GSTIN_IS_COMPANY)", () => {
    const invalidDraft: ExtractedPurchaseInvoice = {
      ...baseValidInvoice,
      supplier: {
        name: "Indobest Mistaken Self",
        gstin: "19AVZPC2361G1ZA", // Company's own GSTIN
      },
    };

    const res = validatePurchaseInvoice(invalidDraft);
    expect(res.hasErrors).toBe(true);
    const issue = res.issues.find((i) => i.code === "SUPPLIER_GSTIN_IS_COMPANY");
    expect(issue).toBeDefined();
  });

  it("warns if buyer GSTIN does not match company GSTIN (BUYER_GSTIN_MISMATCH)", () => {
    const wrongBuyer: ExtractedPurchaseInvoice = {
      ...baseValidInvoice,
      buyer: {
        name: "Another Buyer Ltd",
        gstin: "27AABCT1234D1ZP",
      },
    };

    const res = validatePurchaseInvoice(wrongBuyer);
    const issue = res.issues.find((i) => i.code === "BUYER_GSTIN_MISMATCH");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
  });

  it("warns when CGST/SGST and IGST are both present on the same invoice (TAX_TYPE_INCONSISTENT)", () => {
    const mixedTaxes: ExtractedPurchaseInvoice = {
      ...baseValidInvoice,
      items: [
        { ...baseValidInvoice.items[0], cgstPct: 9, sgstPct: 9, igstPct: 0 },
        { ...baseValidInvoice.items[1], cgstPct: 0, sgstPct: 0, igstPct: 18 },
      ],
    };

    const res = validatePurchaseInvoice(mixedTaxes);
    expect(res.taxType).toBe("MIXED");
    expect(res.issues.some((i) => i.code === "TAX_TYPE_INCONSISTENT")).toBe(true);
  });

  it("errors when grand total arithmetic fails beyond round-off limit (GRAND_TOTAL_MISMATCH)", () => {
    const tamperedTotals: ExtractedPurchaseInvoice = {
      ...baseValidInvoice,
      totals: {
        ...baseValidInvoice.totals,
        grandTotal: 99999, // tampered
      },
    };

    const res = validatePurchaseInvoice(tamperedTotals);
    expect(res.hasErrors).toBe(true);
    expect(res.issues.some((i) => i.code === "GRAND_TOTAL_MISMATCH")).toBe(true);
  });

  it("does not block saving on units like PCS or drum without pack size", () => {
    const pcsUnit: ExtractedPurchaseInvoice = {
      ...baseValidInvoice,
      items: [
        {
          ...baseValidInvoice.items[0],
          qtyPrinted: 10,
          unitPrinted: "PCS",
        },
      ],
    };

    const res = validatePurchaseInvoice(pcsUnit);
    expect(res.hasErrors).toBe(false);
    expect(res.isValid).toBe(true);
  });

  it("passes when pack size or manual kg is provided for drum unit", () => {
    const drumUnitWithPack: ExtractedPurchaseInvoice = {
      ...baseValidInvoice,
      items: [
        {
          ...baseValidInvoice.items[0],
          qtyPrinted: 10,
          unitPrinted: "DRUM",
        },
      ],
    };

    const res = validatePurchaseInvoice(drumUnitWithPack, "19AVZPC2361G1ZA", [
      { lineNo: 1, packSizeKg: 200 },
    ]);
    expect(res.issues.some((i) => i.code === "UNIT_UNCONVERTIBLE")).toBe(false);
  });

  it("correctly validates taxable arithmetic when discount percentage is applied", () => {
    // 50 Qty * 100 Rate = 5000; 10% discount = 4500 Taxable
    const discountedInvoice: ExtractedPurchaseInvoice = {
      ...baseValidInvoice,
      items: [
        {
          ...baseValidInvoice.items[0],
          qtyPrinted: 50,
          rate: 100,
          discount: 10, // 10%
          taxableAmount: 4500, // 50 * 100 * (1 - 0.1)
          cgstPct: 9,
          sgstPct: 9,
          cgstAmount: 405,
          sgstAmount: 405,
          lineTotal: 5310,
        },
      ],
      totals: {
        taxableSubtotal: 4500,
        cgstTotal: 405,
        sgstTotal: 405,
        igstTotal: 0,
        otherCharges: 0,
        tcs: 0,
        roundOff: 0,
        grandTotal: 5310,
      },
    };

    const res = validatePurchaseInvoice(discountedInvoice);
    expect(res.isValid).toBe(true);
    expect(res.issues.some((i) => i.code === "LINE_TAXABLE_MISMATCH")).toBe(false);
  });

  it("permits foreign overseas supplier without GSTIN when isImport is true", () => {
    const importInvoice: ExtractedPurchaseInvoice = {
      ...baseValidInvoice,
      isImport: true,
      supplier: {
        name: "BASF SE Germany",
        gstin: null, // Foreign supplier has no Indian GSTIN
        address: "Ludwigshafen, Germany",
      },
      items: [
        {
          lineNo: 1,
          productNameRaw: "Imported Specialty Chemical",
          hsn: "29051100",
          qtyPrinted: 100,
          unitPrinted: "KG",
          rate: 200,
          discount: 0,
          taxableAmount: 20000,
          cgstPct: 0,
          sgstPct: 0,
          igstPct: 18,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 3600,
          lineTotal: 23600,
        },
      ],
      totals: {
        taxableSubtotal: 20000,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 3600,
        otherCharges: 0,
        tcs: 0,
        roundOff: 0,
        grandTotal: 23600,
      },
    };

    const res = validatePurchaseInvoice(importInvoice);
    expect(res.isValid).toBe(true);
    expect(res.hasErrors).toBe(false);
    expect(res.taxType).toBe("IGST");
    expect(res.issues.some((i) => i.code.startsWith("GSTIN_"))).toBe(false);
    expect(res.issues.some((i) => i.code === "IMPORT_SUPPLIER_NO_GSTIN")).toBe(true);
  });
});
