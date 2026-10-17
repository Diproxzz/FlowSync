import { describe, it, expect } from "vitest";
import { parseInvoiceTextToDraft, normalizeDateToIso } from "@/lib/ocr/parse-invoice-text";
import { ExtractedInvoiceSchema } from "@/lib/llm/schema";

describe("OCR Pipeline & Invoice Text Parser", () => {
  it("normalizes diverse date formats to ISO YYYY-MM-DD", () => {
    expect(normalizeDateToIso("12/08/2026")).toBe("2026-08-12");
    expect(normalizeDateToIso("05-04-2026")).toBe("2026-04-05");
    expect(normalizeDateToIso("2026-06-15")).toBe("2026-06-15");
  });

  it("parses raw OCR text into valid ExtractedInvoice schema", () => {
    const rawOcrText = `
TAX INVOICE
INDOBEST
19/10/2, GOBINDA KHATICK ROAD, KOLKATA-700046
GSTIN: 19AVZPC2361G1ZA

Invoice No: IB26-27/0473
Date: 12-08-2026

Billed to:
RAHMAN INDUSTRIES LTD.
123 TANNERS ROAD, KANPUR
GSTIN: 09AAACR1234A1Z5

| Sl | Description | HSN | Qty | Rate | Amount |
| 1 | BINDER P-200 | 3204 | 500.00 | 120.00 | 60000.00 |
| 2 | BLACK DYES | 3204 | 250.00 | 200.00 | 50000.00 |

Sub Total: 110000.00
Grand Total: 129800.00
Round Off: 0.00
`;

    const draft = parseInvoiceTextToDraft(rawOcrText);

    expect(draft.invoice.number).toBe("IB26-27/0473");
    expect(draft.invoice.date).toBe("2026-08-12");
    expect(draft.customer.name).toBe("RAHMAN INDUSTRIES LTD.");
    expect(draft.customer.gstin).toBe("09AAACR1234A1Z5");
    expect(draft.items.length).toBe(2);
    expect(draft.items[0].productNameRaw).toBe("BINDER P-200");
    expect(draft.items[0].qtyKg).toBe(500);
    expect(draft.items[0].rate).toBe(120);

    // Validate that the output satisfies ExtractedInvoiceSchema
    const parseResult = ExtractedInvoiceSchema.safeParse(draft);
    expect(parseResult.success).toBe(true);
  });

  it("parses embedded JSON directly if model returns JSON string", () => {
    const jsonOutput = JSON.stringify({
      customer: {
        name: "TEST TANNERIES",
        gstin: "19AABCT1234P1Z1",
      },
      invoice: {
        number: "IB26-27/0999",
        date: "2026-09-01",
      },
      items: [
        {
          lineNo: 1,
          productNameRaw: "SYNTHETIC FATLIQUOR",
          qtyKg: 100,
          rate: 150,
          taxableAmount: 15000,
          cgstPct: 9,
          sgstPct: 9,
          lineTotal: 17700,
        },
      ],
      totals: {
        taxableSubtotal: 15000,
        cgstTotal: 1350,
        sgstTotal: 1350,
        grandTotal: 17700,
      },
    });

    const draft = parseInvoiceTextToDraft(jsonOutput);
    expect(draft.invoice.number).toBe("IB26-27/0999");
    expect(draft.customer.name).toBe("TEST TANNERIES");
    expect(draft.items[0].qtyKg).toBe(100);
  });
});
