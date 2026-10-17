import { describe, it, expect } from "vitest";
import {
  normalizePartyName,
  partyComparisonKey,
  similarity,
} from "@/lib/matching/party";

describe("Party Name Normalization & Matching (§5.3)", () => {
  it("normalizes legal suffixes and punctuation", () => {
    // Abdin Leather Conceria Pvt. Ltd == Abdin Leather Conceria Pvt.Ltd
    expect(partyComparisonKey("Abdin Leather Conceria Pvt. Ltd")).toBe(
      partyComparisonKey("Abdin Leather Conceria Pvt.Ltd")
    );

    // A.I. LEATHER == A I Leather
    expect(partyComparisonKey("A.I. LEATHER")).toBe(
      partyComparisonKey("A I Leather")
    );

    // Dilshad Ahmed & Co == DILSHAD AHMED AND CO
    expect(partyComparisonKey("Dilshad Ahmed & Co")).toBe(
      partyComparisonKey("DILSHAD AHMED AND CO")
    );

    // Tiger International == TIGER INTERNATIONAL
    expect(partyComparisonKey("Tiger International")).toBe(
      partyComparisonKey("TIGER INTERNATIONAL")
    );
  });

  it("calculates fuzzy similarity accurately", () => {
    // Exact
    expect(similarity("Tiger International", "Tiger International")).toBe(1.0);
    // Typo: Tiger Internatioal
    const typoScore = similarity("Tiger International", "Tiger Internatioal");
    expect(typoScore).toBeGreaterThanOrEqual(0.9);

    // Initial / Acronym divergence must never match despite common entity suffix
    expect(similarity("A H ENTERPRISE", "A Z ENTERPRISE")).toBeLessThan(0.7);
    expect(similarity("A.H. ENTERPRISE", "A Z ENTERPRISE")).toBeLessThan(0.7);
    expect(similarity("S K TRADERS", "M K TRADERS")).toBeLessThan(0.7);
  });
});
