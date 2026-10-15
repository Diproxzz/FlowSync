// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolveProduct } from "@/lib/matching/product";
import { resolveCustomer } from "@/lib/matching/customer";
import { prisma } from "@/lib/db";

describe("Phase 4: Customer and Product Matching Rules", () => {
  let createdCustomerId: string;

  beforeAll(async () => {
    // Seed a known customer with GSTIN
    const c = await prisma.customer.upsert({
      where: { gstin: "19ACUPA0333J1ZL" },
      update: {},
      create: {
        name: "Tiger International",
        name_norm: "tiger international",
        gstin: "19ACUPA0333J1ZL",
      },
    });
    createdCustomerId = c.id;

    // Create an alias for DLPS
    const dlps = await prisma.product.findUnique({ where: { code: "DLPS" } });
    if (dlps) {
      await prisma.productAlias.upsert({
        where: { alias_norm: "actipact dlp s" },
        update: {},
        create: {
          product_id: dlps.id,
          alias: "ACTIPACT DLP-S",
          alias_norm: "actipact dlp s",
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({
      where: { gstin: "19ACUPA0333J1ZL" },
    });
    await prisma.productAlias.deleteMany({
      where: { alias_norm: "actipact dlp s" },
    });
    await prisma.$disconnect();
  });

  describe("Product Matching", () => {
    it("should match 'AA ACTOIL' to product 'AA' via leading-code rule", async () => {
      const match = await resolveProduct("AA ACTOIL");
      expect(match.status).toBe("MATCHED");
      expect(match.productCode).toBe("AA");
      expect(match.reason).toBe("CODE_PREFIX");
    });

    it("should match 'ACTIPACT DLP-S' to 'DLPS' via exact alias", async () => {
      const match = await resolveProduct("ACTIPACT DLP-S");
      expect(match.status).toBe("MATCHED");
      expect(match.productCode).toBe("DLPS");
      expect(match.reason).toBe("ALIAS");
    });

    it("should return NEW for unknown product 'BESTRUB 108'", async () => {
      const match = await resolveProduct("BESTRUB 108");
      expect(match.status).toBe("NEW");
    });

    it("should match exact code 'WAK'", async () => {
      const match = await resolveProduct("WAK");
      expect(match.status).toBe("MATCHED");
      expect(match.productCode).toBe("WAK");
      expect(match.reason).toBe("CODE_EXACT");
    });
  });

  describe("Customer Matching", () => {
    it("should match customer by exact GSTIN with priority over name case", async () => {
      const match = await resolveCustomer({
        name: "TIGER INTERNATIONAL",
        gstin: "19ACUPA0333J1ZL",
        address: null,
      });

      expect(match.status).toBe("MATCHED");
      expect(match.reason).toBe("GSTIN");
      expect(match.customerId).toBe(createdCustomerId);
      expect(match.customerName).toBe("Tiger International");
    });

    it("should match customer by normalized name without legal suffix", async () => {
      const match = await resolveCustomer({
        name: "Tiger International Pvt. Ltd.",
        gstin: null,
        address: null,
      });

      expect(match.status).toBe("MATCHED");
      expect(match.reason).toBe("NAME");
      expect(match.customerId).toBe(createdCustomerId);
    });

    it("should return NEW for completely unknown customer", async () => {
      const match = await resolveCustomer({
        name: "Completely Unregistered Unknown Tannery XYZ",
        gstin: "19ZZZZZ9999Z1ZZ",
        address: null,
      });

      expect(match.status).toBe("NEW");
    });
  });
});
