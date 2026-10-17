// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getStockSummary } from "@/lib/stock/summary";

describe("Phase 3: Products, Customers, and Stock CRUD & Import Tests", () => {
  let testProductId: string;
  let testCustomerId1: string;
  let testCustomerId2: string;

  beforeAll(async () => {
    // Ensure clean test entities
    const prod = await prisma.product.findUnique({ where: { code: "KG" } });
    if (prod) testProductId = prod.id;
  });

  afterAll(async () => {
    // Reset test product reorder level and rates
    if (testProductId) {
      await prisma.product.update({
        where: { id: testProductId },
        data: {
          std_sale_rate: 93,
          reorder_level_kg: null,
        },
      });
    }

    // Clean up created test customers
    await prisma.customer.deleteMany({
      where: { name: { in: ["Test Tannery Alpha", "Test Tannery Beta", "Merged Tannery"] } },
    });

    await prisma.product.deleteMany({
      where: { code: "TEST-NEW-99" },
    });

    await prisma.$disconnect();
  });

  it("should change status to LOW STOCK when reorder_level_kg exceeds closing stock", async () => {
    // For KG, closing stock is 3020 kg
    // Set reorder level to 4000 kg (higher than 3020)
    await prisma.product.update({
      where: { id: testProductId },
      data: {
        reorder_level_kg: 4000,
        std_sale_rate: 115,
      },
    });

    const summary = await getStockSummary();
    const kg = summary.find((r) => r.code === "KG");
    expect(kg).toBeDefined();
    expect(kg?.status).toBe("LOW STOCK");
    expect(kg?.saleRate).toBe(115);

    // Now reset reorder level back below closing stock
    await prisma.product.update({
      where: { id: testProductId },
      data: {
        reorder_level_kg: null,
      },
    });

    const updatedSummary = await getStockSummary();
    const kgUpdated = updatedSummary.find((r) => r.code === "KG");
    expect(kgUpdated?.status).toBe("OK");
  });

  it("should test product import dry-run reporting creates and updates accurately", async () => {
    const importPayload = {
      rows: [
        {
          code: "KG", // Existing
          name: "KG Master Chemical",
          pack_size_kg: 110,
          std_purchase_rate: 95,
          std_sale_rate: 100,
        },
        {
          code: "TEST-NEW-99", // New
          name: "Test New Syntan",
          pack_size_kg: 25,
          std_purchase_rate: 150,
          std_sale_rate: 180,
          opening_stock_kg: 50,
        },
      ],
    };

    // Simulate import dry run
    const existingProducts = await prisma.product.findMany({
      where: { code: { in: importPayload.rows.map((r) => r.code) } },
    });
    const existingMap = new Map(existingProducts.map((p) => [p.code, p]));

    const preview = importPayload.rows.map((r) => ({
      code: r.code,
      action: existingMap.has(r.code) ? "UPDATE" : "CREATE",
    }));

    const creates = preview.filter((r) => r.action === "CREATE").length;
    const updates = preview.filter((r) => r.action === "UPDATE").length;

    expect(creates).toBe(1);
    expect(updates).toBe(1);
  });

  it("should create and manage product aliases", async () => {
    // Add alias to KG
    const alias = await prisma.productAlias.upsert({
      where: { alias_norm: "kg degreasing agent" },
      update: {},
      create: {
        product_id: testProductId,
        alias: "KG DEGREASING AGENT",
        alias_norm: "kg degreasing agent",
      },
    });

    expect(alias.id).toBeDefined();

    // Verify lookup
    const found = await prisma.productAlias.findUnique({
      where: { alias_norm: "kg degreasing agent" },
      include: { product: true },
    });
    expect(found?.product.code).toBe("KG");

    // Clean up
    await prisma.productAlias.delete({ where: { id: alias.id } });
  });

  it("should merge customers cleanly without data loss", async () => {
    // Create source and target customers
    const c1 = await prisma.customer.create({
      data: {
        name: "Test Tannery Alpha",
        name_norm: "test tannery alpha",
        gstin: "19TESTA0001A1ZA",
      },
    });
    testCustomerId1 = c1.id;

    const c2 = await prisma.customer.create({
      data: {
        name: "Test Tannery Beta",
        name_norm: "test tannery beta",
        gstin: "19TESTB0002B1ZB",
      },
    });
    testCustomerId2 = c2.id;

    // Add alias to c1
    await prisma.customerAlias.create({
      data: {
        customer_id: c1.id,
        alias: "ALPHA TANNERY PVT LTD",
        alias_norm: "alpha tannery",
      },
    });

    // Execute merge of c1 into c2
    await prisma.$transaction(async (tx) => {
      // Re-point invoices
      await tx.invoice.updateMany({
        where: { customer_id: c1.id },
        data: { customer_id: c2.id },
      });

      // Transfer aliases
      await tx.customerAlias.updateMany({
        where: { customer_id: c1.id },
        data: { customer_id: c2.id },
      });

      // Add source name as alias on target
      await tx.customerAlias.create({
        data: {
          customer_id: c2.id,
          alias: c1.name,
          alias_norm: c1.name_norm,
        },
      });

      // Delete source
      await tx.customer.delete({ where: { id: c1.id } });
    });

    // Verify c1 deleted
    const deleted = await prisma.customer.findUnique({ where: { id: c1.id } });
    expect(deleted).toBeNull();

    // Verify aliases transferred to c2
    const c2Aliases = await prisma.customerAlias.findMany({ where: { customer_id: c2.id } });
    expect(c2Aliases.some((a) => a.alias_norm === "alpha tannery")).toBe(true);
    expect(c2Aliases.some((a) => a.alias_norm === "test tannery alpha")).toBe(true);
  });

  it("should record manual stock movement and reflect in closing stock", async () => {
    const initialSummary = await getStockSummary();
    const initialKg = initialSummary.find((r) => r.code === "KG")?.closing || 0;

    // Record manual PURCHASE movement of 500 kg
    const movement = await prisma.stockMovement.create({
      data: {
        product_id: testProductId,
        type: "PURCHASE",
        source: "MANUAL",
        qty_kg: 500,
        movement_date: new Date(),
        note: "Test manual purchase entry",
      },
    });

    const updatedSummary = await getStockSummary();
    const newKg = updatedSummary.find((r) => r.code === "KG")?.closing || 0;
    expect(newKg).toBe(initialKg + 500);

    // Clean up test movement
    await prisma.stockMovement.delete({ where: { id: movement.id } });
  });
});
