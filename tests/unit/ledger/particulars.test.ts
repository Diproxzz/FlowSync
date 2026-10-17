import { describe, it, expect } from "vitest";
import {
  formatParticularsText,
  extractReferencedBills,
} from "@/lib/ledger/particulars";

describe("Particulars Formatting & Reference Parsing (§5.5)", () => {
  it("extracts referenced bills and flags truncated lists", () => {
    // Normal complete list
    const p1 =
      "Cheque No. : 002215 DT-09.09.2026 Ag. IB26-27/0011,IB26-27/0032,IB26-27/0040,IB26-27/0080";
    const res1 = extractReferencedBills(p1, "26-27");
    expect(res1.referencedDocs).toEqual([
      "IB26-27/0011",
      "IB26-27/0032",
      "IB26-27/0040",
      "IB26-27/0080",
    ]);
    expect(res1.priorYearRefs).toHaveLength(0);
    expect(res1.truncated).toBe(false);

    // Prior year with * and truncated tail ending in *I
    const p2 =
      "Cheque No. : 976588 DT-13.04.2026 Ag. *IB25-26/0587,*IB25-26/0590,*IB25-26/0594,*IB25-26/0609,*IB25-26/0610,*I";
    const res2 = extractReferencedBills(p2, "26-27");
    expect(res2.referencedDocs).toEqual([
      "IB25-26/0587",
      "IB25-26/0590",
      "IB25-26/0594",
      "IB25-26/0609",
      "IB25-26/0610",
    ]);
    expect(res2.priorYearRefs).toHaveLength(5);
    expect(res2.truncated).toBe(true);
  });

  it("formats particulars correctly for UI and exports", () => {
    const text = formatParticularsText({
      entryType: "RECEIPT",
      paymentMode: "CHEQUE",
      instrumentNo: "002237",
      instrumentDate: new Date("2026-09-30"),
      referencedDocs: ["IB26-27/0123", "IB26-27/0151"],
    });
    expect(text).toBe(
      "Cheque No. : 002237 DT-30.09.2026 Ag. IB26-27/0123,IB26-27/0151"
    );
  });
});
