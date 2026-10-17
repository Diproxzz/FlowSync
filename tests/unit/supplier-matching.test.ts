import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { resolveSupplier } from "@/lib/matching/supplier";

describe("Supplier Matching & Resolution (Phase 2)", () => {
  let createdSupplierId: string;
  let createdCustomerId: string;

  beforeAll(async () => {
    // Create a supplier with alias and GSTIN
    const sup = await prisma.supplier.create({
      data: {
        name: "ATC Chemicals India Private Limited",
        name_norm: "atc chemicals india",
        gstin: "34AAECA6767B1ZV",
        address: "Puducherry",
        state_code: "34",
        aliases: {
          create: [{ alias: "ATC Chemicals", alias_norm: "atc chemicals" }],
        },
      },
    });
    createdSupplierId = sup.id;

    // Create a customer with the same GSTIN to test "alsoCustomer" hint
    const cust = await prisma.customer.create({
      data: {
        name: "ATC Chemicals Buyer Dept",
        name_norm: "atc chemicals buyer dept",
        gstin: "34AAECA6767B1ZV",
      },
    });
    createdCustomerId = cust.id;
  });

  afterAll(async () => {
    if (createdSupplierId) {
      await prisma.supplier.delete({ where: { id: createdSupplierId } }).catch(() => {});
    }
    if (createdCustomerId) {
      await prisma.customer.delete({ where: { id: createdCustomerId } }).catch(() => {});
    }
  });

  it("resolves supplier by exact GSTIN first with confidence 1.0", async () => {
    const res = await resolveSupplier({
      name: "ATC Chemicals Random Name",
      gstin: "34AAECA6767B1ZV",
    });

    expect(res.status).toBe("MATCHED");
    expect(res.supplierId).toBe(createdSupplierId);
    expect(res.reason).toBe("GSTIN");
    expect(res.confidence).toBe(1.0);
    expect(res.alsoCustomer).toBeDefined();
    expect(res.alsoCustomer?.id).toBe(createdCustomerId);
  });

  it("resolves supplier by exact normalized name", async () => {
    const res = await resolveSupplier({
      name: "ATC Chemicals India Private Limited",
    });

    expect(res.status).toBe("MATCHED");
    expect(res.supplierId).toBe(createdSupplierId);
    expect(res.reason).toBe("NAME");
    expect(res.confidence).toBeGreaterThanOrEqual(0.98);
  });

  it("resolves supplier by alias", async () => {
    const res = await resolveSupplier({
      name: "ATC Chemicals",
    });

    expect(res.status).toBe("MATCHED");
    expect(res.supplierId).toBe(createdSupplierId);
    expect(res.reason).toBe("ALIAS");
    expect(res.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("resolves and draws name from customer record when GSTIN exists in customers but not in suppliers", async () => {
    const custOnly = await prisma.customer.create({
      data: {
        name: "Sole Customer Pvt Ltd",
        name_norm: "sole customer",
        gstin: "19AABCS1429B1Z1",
      },
    });

    try {
      const res = await resolveSupplier({
        name: "Random Raw Name",
        gstin: "19AABCS1429B1Z1",
      });

      expect(res.status).toBe("MATCHED");
      expect(res.supplierName).toBe("Sole Customer Pvt Ltd");
      expect(res.reason).toBe("GSTIN");
      expect(res.confidence).toBe(1.0);
      expect(res.alsoCustomer?.id).toBe(custOnly.id);
    } finally {
      await prisma.customer.delete({ where: { id: custOnly.id } }).catch(() => {});
    }
  });

  it("returns NEW for an unknown supplier", async () => {
    const res = await resolveSupplier({
      name: "Completely Unheard Supplier XYZ 123",
      gstin: "19ZZZZZ9999Z9ZZ",
    });

    expect(res.status).toBe("NEW");
    expect(res.supplierId).toBeUndefined();
  });
});
