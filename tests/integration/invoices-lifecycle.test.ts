// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { confirmInvoice } from "@/lib/invoices/confirm";
import { getStockSummary } from "@/lib/stock/summary";
import fixture473 from "../fixtures/inv-473.json";

describe("Phase 5: Invoices Confirmation, Duplicates, Revisions, and Stock Lifecycle", () => {
  let createdInvoiceId: string;
  let testCustomerName = "RAHMAN INDUSTRIES LTD.";
  let bestrubProductId: string;
  let initialBestrubStock: number = 0;

  beforeAll(async () => {
    // Look up or ensure BESTRUB 108 exists in products
    let prod = await prisma.product.findUnique({ where: { code: "BESTRUB 108" } });
    if (!prod) {
      prod = await prisma.product.create({
        data: {
          code: "BESTRUB 108",
          name: "Bestrub 108 Polymer",
          std_sale_rate: 320,
          source: "MASTER",
        },
      });

      // Add opening stock movement
      await prisma.stockMovement.create({
        data: {
          product_id: prod.id,
          movement_date: new Date("2026-04-01"),
          type: "OPENING",
          source: "SEED_OPENING",
          qty_kg: 1000,
          note: "Opening stock test",
        },
      });
    }
    bestrubProductId = prod.id;

    // Check initial stock
    const summary = await getStockSummary();
    const item = summary.find((p) => p.code === "BESTRUB 108");
    initialBestrubStock = item?.closing || 0;

    // Clean up any previous test invoice 473 if left over
    await prisma.invoice.deleteMany({
      where: { invoice_number_norm: "ib26-27/0473" },
    });
  });

  afterAll(async () => {
    // Clean up test invoice and customer
    await prisma.invoice.deleteMany({
      where: { invoice_number_norm: "ib26-27/0473" },
    });

    await prisma.customer.deleteMany({
      where: { name: testCustomerName },
    });

    await prisma.customerAlias.deleteMany({
      where: { customer: { name: testCustomerName } },
    });

    await prisma.stockMovement.deleteMany({
      where: {
        OR: [
          { product: { code: { in: ["BESTRUB 108", "SILCOAT CS30"] } } },
          { product: { code: "KG" }, type: { not: "OPENING" } },
        ],
      },
    });

    await prisma.productAlias.deleteMany({
      where: { product: { code: { in: ["BESTRUB 108", "SILCOAT CS30"] } } },
    });

    await prisma.product.deleteMany({
      where: { code: { in: ["BESTRUB 108", "SILCOAT CS30"] } },
    });

    await prisma.$disconnect();
  });

  it("Acceptance Test 1: should confirm invoice 473 inside a single transaction and deduct stock", async () => {
    const draft: any = {
      ...fixture473,
    };

    const result = await confirmInvoice({
      draft,
      customerResolution: {
        action: "CREATE_NEW",
        customerName: draft.customer.name,
        customerGstin: draft.customer.gstin,
        customerAddress: draft.customer.address,
      },
      productResolutions: [
        {
          lineNo: 1,
          action: "USE_MATCHED",
          productId: bestrubProductId,
          productCode: "BESTRUB 108",
          productNameRaw: "BESTRUB 108",
        },
        {
          lineNo: 2,
          action: "CREATE_NEW",
          productCode: "SILCOAT CS30",
          productName: "Silcoat CS30,OSOL TSM3",
          productNameRaw: "Silcoat CS30,OSOL TSM3",
        },
      ],
      mode: "create",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });

    expect(result.invoice).toBeDefined();
    expect(result.invoice.invoice_number).toBe("IB26-27/0473");
    expect(result.invoice.version).toBe(1);
    createdInvoiceId = result.invoice.id;

    // Verify stock deduction for BESTRUB 108 (-660 kg)
    const summary = await getStockSummary();
    const bestrub = summary.find((p) => p.code === "BESTRUB 108");
    expect(bestrub?.closing).toBe(initialBestrubStock - 660);

    // Verify stock movements were created
    const movements = await prisma.stockMovement.findMany({
      where: { invoice_item: { invoice_id: createdInvoiceId } },
    });
    expect(movements.length).toBe(2);
    expect(movements.every((m) => m.type === "SALE" && m.source === "INVOICE")).toBe(true);
  });

  it("Acceptance Test 2: duplicate detection prevents re-creating existing invoice", async () => {
    const draft: any = {
      ...fixture473,
    };

    await expect(
      confirmInvoice({
        draft,
        customerResolution: {
          action: "USE_MATCHED",
          customerName: draft.customer.name,
        },
        productResolutions: [
          {
            lineNo: 1,
            action: "USE_MATCHED",
            productId: bestrubProductId,
            productCode: "BESTRUB 108",
            productNameRaw: "BESTRUB 108",
          },
          {
            lineNo: 2,
            action: "USE_MATCHED",
            productCode: "SILCOAT CS30",
            productNameRaw: "Silcoat CS30,OSOL TSM3",
          },
        ],
        mode: "create",
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("Acceptance Test 3: alias learning saves product and customer aliases", async () => {
    const custAlias = await prisma.customerAlias.findFirst({
      where: { customer: { name: testCustomerName } },
    });
    expect(custAlias).toBeDefined();

    const prodAlias = await prisma.productAlias.findFirst({
      where: { product_id: bestrubProductId },
    });
    expect(prodAlias).toBeDefined();
    expect(prodAlias?.alias_norm).toBe("bestrub 108");
  });

  it("Acceptance Test 4: modifying existing invoice creates revision snapshot and adjusts stock", async () => {
    // Modify draft: change quantity of BESTRUB 108 from 660 kg to 440 kg
    const modifiedDraft: any = {
      ...fixture473,
      items: [
        {
          ...fixture473.items[0],
          qtyKg: 440,
          taxableAmount: 140800,
          cgstAmount: 12672,
          sgstAmount: 12672,
          lineTotal: 166144,
        },
        fixture473.items[1],
      ],
      totals: {
        taxableSubtotal: 247600,
        cgstTotal: 22284,
        sgstTotal: 22284,
        igstTotal: 0,
        roundOff: 0,
        grandTotal: 292168,
      },
    };

    const res = await confirmInvoice({
      draft: modifiedDraft,
      customerResolution: {
        action: "USE_MATCHED",
        customerName: modifiedDraft.customer.name,
      },
      productResolutions: [
        {
          lineNo: 1,
          action: "USE_MATCHED",
          productId: bestrubProductId,
          productCode: "BESTRUB 108",
          productNameRaw: "BESTRUB 108",
        },
        {
          lineNo: 2,
          action: "USE_MATCHED",
          productCode: "SILCOAT CS30",
          productNameRaw: "Silcoat CS30,OSOL TSM3",
        },
      ],
      mode: "replace",
    });

    expect(res.invoice.version).toBe(2);
    expect(Number(res.invoice.grand_total)).toBe(292168);

    // Verify revision record exists
    const revisions = await prisma.invoiceRevision.findMany({
      where: { invoice_id: createdInvoiceId },
    });
    expect(revisions.length).toBe(1);
    expect(revisions[0].version).toBe(1);

    // Verify stock updated: now only 440 kg deducted instead of 660 kg
    const summary = await getStockSummary();
    const bestrub = summary.find((p) => p.code === "BESTRUB 108");
    expect(bestrub?.closing).toBe(initialBestrubStock - 440);
  });

  it("Acceptance Test 5: deleting invoice reverses inventory stock movements", async () => {
    // Delete invoice
    await prisma.invoice.delete({
      where: { id: createdInvoiceId },
    });

    // Verify closing stock is back to initial
    const summary = await getStockSummary();
    const bestrub = summary.find((p) => p.code === "BESTRUB 108");
    expect(bestrub?.closing).toBe(initialBestrubStock);
  });
});
