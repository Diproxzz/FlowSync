// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { confirmInvoice } from "@/lib/invoices/confirm";
import { getStockSummary } from "@/lib/stock/summary";
import { normalize } from "@/lib/matching/normalize";
import fixture473 from "../fixtures/inv-473.json";

describe("Phase 5: Invoices Confirmation, Duplicates, Revisions, and Stock Lifecycle", () => {
  let createdInvoiceId: string;
  const testInvoiceNumber = "IB26-27/TEST-9999";
  const testCustomerName = "TEST AUTOMATION CUSTOMER";
  const testProductCode = "TEST-BESTRUB-999";
  let testProductId: string;
  let initialStock: number = 0;

  beforeAll(async () => {
    // Look up or ensure TEST-BESTRUB-999 exists in products
    let prod = await prisma.product.findUnique({ where: { code: testProductCode } });
    if (!prod) {
      prod = await prisma.product.create({
        data: {
          code: testProductCode,
          name: "Test Bestrub Polymer",
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
    testProductId = prod.id;

    // Clean up any previous test movements for test product before measuring initial stock
    await prisma.stockMovement.deleteMany({
      where: { product: { code: testProductCode }, type: { not: "OPENING" } },
    });

    // Check initial stock
    const summary = await getStockSummary();
    const item = summary.find((p) => p.code === testProductCode);
    initialStock = item?.closing || 0;

    // Clean up any previous test invoice if left over
    await prisma.invoice.deleteMany({
      where: {
        OR: [
          { invoice_number_norm: testInvoiceNumber.toLowerCase() },
          { invoice_number_norm: testInvoiceNumber.toUpperCase() },
          { invoice_number: testInvoiceNumber },
        ],
      },
    });
  });

  afterAll(async () => {
    // Clean up test invoice and customer only
    await prisma.invoice.deleteMany({
      where: {
        OR: [
          { invoice_number_norm: testInvoiceNumber.toLowerCase() },
          { invoice_number_norm: testInvoiceNumber.toUpperCase() },
          { invoice_number: testInvoiceNumber },
        ],
      },
    });

    await prisma.customerAlias.deleteMany({
      where: { customer: { name: testCustomerName } },
    });

    await prisma.customer.deleteMany({
      where: { name: testCustomerName },
    });

    await prisma.stockMovement.deleteMany({
      where: {
        product: { code: { in: [testProductCode, "TEST-SILCOAT-999"] } },
      },
    });

    await prisma.productAlias.deleteMany({
      where: { product: { code: { in: [testProductCode, "TEST-SILCOAT-999"] } } },
    });

    await prisma.product.deleteMany({
      where: { code: { in: [testProductCode, "TEST-SILCOAT-999"] } },
    });

    await prisma.$disconnect();
  });

  it("Acceptance Test 1: should confirm test invoice inside a single transaction and deduct stock", async () => {
    const draft: any = {
      ...fixture473,
      invoice: {
        ...fixture473.invoice,
        number: testInvoiceNumber,
      },
      customer: {
        ...fixture473.customer,
        name: testCustomerName,
      },
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
          productId: testProductId,
          productCode: testProductCode,
          productNameRaw: testProductCode,
        },
        {
          lineNo: 2,
          action: "CREATE_NEW",
          productCode: "TEST-SILCOAT-999",
          productName: "Test Silcoat",
          productNameRaw: "Test Silcoat Raw",
        },
      ],
      mode: "create",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });

    expect(result.invoice).toBeDefined();
    expect(result.invoice.invoice_number).toBe(testInvoiceNumber);
    expect(result.invoice.version).toBe(1);
    createdInvoiceId = result.invoice.id;

    // Verify stock deduction (-660 kg)
    const summary = await getStockSummary();
    const testProd = summary.find((p) => p.code === testProductCode);
    expect(testProd?.closing).toBe(initialStock - 660);

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
      invoice: {
        ...fixture473.invoice,
        number: testInvoiceNumber,
      },
      customer: {
        ...fixture473.customer,
        name: testCustomerName,
      },
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
            productId: testProductId,
            productCode: testProductCode,
            productNameRaw: testProductCode,
          },
          {
            lineNo: 2,
            action: "USE_MATCHED",
            productCode: "TEST-SILCOAT-999",
            productNameRaw: "Test Silcoat Raw",
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
      where: { product_id: testProductId },
    });
    expect(prodAlias).toBeDefined();
    expect(prodAlias?.alias_norm).toBe(normalize(testProductCode));
  });

  it("Acceptance Test 4: modifying existing invoice creates revision snapshot and adjusts stock", async () => {
    const modifiedDraft: any = {
      ...fixture473,
      invoice: {
        ...fixture473.invoice,
        number: testInvoiceNumber,
      },
      customer: {
        ...fixture473.customer,
        name: testCustomerName,
      },
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
          productId: testProductId,
          productCode: testProductCode,
          productNameRaw: testProductCode,
        },
        {
          lineNo: 2,
          action: "USE_MATCHED",
          productCode: "TEST-SILCOAT-999",
          productNameRaw: "Test Silcoat Raw",
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
    const testProd = summary.find((p) => p.code === testProductCode);
    expect(testProd?.closing).toBe(initialStock - 440);
  });

  it("Acceptance Test 5: deleting invoice reverses inventory stock movements", async () => {
    // Delete invoice
    await prisma.invoice.delete({
      where: { id: createdInvoiceId },
    });

    // Verify closing stock is back to initial
    const summary = await getStockSummary();
    const testProd = summary.find((p) => p.code === testProductCode);
    expect(testProd?.closing).toBe(initialStock);
  });

  it("Acceptance Test 6: sets buyer name to existing customer name when GSTIN matches", async () => {
    // Look up existing customer by GSTIN
    const knownGstin = "19ACSFS7525C1ZP";
    const existingCust = await prisma.customer.findUniqueOrThrow({
      where: { gstin: knownGstin },
    });

    const draftWithMisspelledName: any = {
      ...fixture473,
      invoice: {
        ...fixture473.invoice,
        number: "IB26-27/TEST-GSTIN-MATCH",
      },
      customer: {
        name: "Completely Different Raw OCR Buyer Name",
        gstin: knownGstin,
        address: null,
      },
    };

    const res = await confirmInvoice({
      draft: draftWithMisspelledName,
      customerResolution: {
        action: "CREATE_NEW",
        customerName: draftWithMisspelledName.customer.name,
        customerGstin: knownGstin,
      },
      productResolutions: [
        {
          lineNo: 1,
          action: "USE_MATCHED",
          productId: testProductId,
          productCode: testProductCode,
          productNameRaw: testProductCode,
        },
        {
          lineNo: 2,
          action: "CREATE_NEW",
          productCode: "TEST-SILCOAT-999",
          productName: "Test Silcoat",
          productNameRaw: "Test Silcoat Raw",
        },
      ],
      mode: "create",
    });

    expect(res.invoice.customer_id).toBe(existingCust.id);
    expect(res.invoice.customer_name_snapshot).toBe(existingCust.name);

    // Clean up test invoice and alias
    await prisma.invoice.delete({ where: { id: res.invoice.id } });
    await prisma.customerAlias.deleteMany({
      where: { alias: "Completely Different Raw OCR Buyer Name" },
    });
  });
});
