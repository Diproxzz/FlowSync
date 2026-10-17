// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { confirmPurchaseInvoice } from "@/lib/purchases/confirm";
import { getStockSummary } from "@/lib/stock/summary";

describe("Phase 4: Purchase Invoices Confirmation, Duplicates, Revisions, and Stock Lifecycle", () => {
  const supplier1Name = "LIFECYCLE TEST SUPPLIER ALPHA";
  const supplier2Name = "LIFECYCLE TEST SUPPLIER BETA";
  const sharedInvoiceNumber = "PUR/2026/TEST-101";

  const testProductCode = "TEST-PUR-POLY-101";
  let testProductId: string;
  let initialStock: number = 0;

  beforeAll(async () => {
    // 1. Create or get test product
    let prod = await prisma.product.findUnique({ where: { code: testProductCode } });
    if (!prod) {
      prod = await prisma.product.create({
        data: {
          code: testProductCode,
          name: "Test Purchase Polymer",
          pack_size_kg: 200,
          std_purchase_rate: 150,
          source: "MASTER",
        },
      });
    }
    testProductId = prod.id;

    // Clean any prior movements for this test product
    await prisma.stockMovement.deleteMany({
      where: { product_id: testProductId },
    });

    // Opening stock 500 kg
    await prisma.stockMovement.create({
      data: {
        product_id: testProductId,
        movement_date: new Date("2026-04-01"),
        type: "OPENING",
        source: "SEED_OPENING",
        qty_kg: 500,
      },
    });

    const summary = await getStockSummary();
    const item = summary.find((p) => p.code === testProductCode);
    initialStock = item?.closing || 0;

    // Clean prior test invoices if any
    await prisma.purchaseInvoice.deleteMany({
      where: {
        supplier_invoice_number: sharedInvoiceNumber,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.purchaseInvoice.deleteMany({
      where: {
        supplier_invoice_number: sharedInvoiceNumber,
      },
    });

    await prisma.supplierAlias.deleteMany({
      where: { supplier: { name: { in: [supplier1Name, supplier2Name] } } },
    });

    await prisma.supplier.deleteMany({
      where: { name: { in: [supplier1Name, supplier2Name] } },
    });

    await prisma.stockMovement.deleteMany({
      where: { product_id: testProductId },
    });

    await prisma.productAlias.deleteMany({
      where: { product_id: testProductId },
    });

    await prisma.product.deleteMany({
      where: { id: testProductId },
    });

    await prisma.$disconnect();
  });

  it("saves a purchase invoice from Supplier 1 and increases product closing stock", async () => {
    const draft1: any = {
      invoice: {
        number: sharedInvoiceNumber,
        date: "2026-06-15",
        receivedDate: "2026-06-16",
      },
      supplier: {
        name: supplier1Name,
        gstin: "19AGDPA1084B1Z1",
      },
      items: [
        {
          lineNo: 1,
          productNameRaw: "Test Purchase Polymer",
          qtyPrinted: 2,
          unitPrinted: "DRUM",
          qtyKg: 400,
          packSizeKg: 200,
          rate: 30000,
          ratePerKg: 150,
          discount: 0,
          taxableAmount: 60000,
          cgstPct: 9,
          sgstPct: 9,
          igstPct: 0,
          cgstAmount: 5400,
          sgstAmount: 5400,
          igstAmount: 0,
          lineTotal: 70800,
        },
      ],
      totals: {
        taxableSubtotal: 60000,
        cgstTotal: 5400,
        sgstTotal: 5400,
        igstTotal: 0,
        otherCharges: 0,
        tcs: 0,
        roundOff: 0,
        grandTotal: 70800,
      },
    };

    const res1 = await confirmPurchaseInvoice({
      draft: draft1,
      supplierResolution: {
        action: "CREATE_NEW",
        supplierName: supplier1Name,
        supplierGstin: "19AGDPA1084B1Z1",
      },
      productResolutions: [
        {
          lineNo: 1,
          action: "USE_MATCHED",
          productId: testProductId,
          productCode: testProductCode,
          productNameRaw: "Test Purchase Polymer",
          packSizeKg: 200,
        },
      ],
      mode: "create",
    });

    expect(res1.invoiceId).toBeDefined();
    expect(res1.invoiceNumber).toBe(sharedInvoiceNumber);

    // Verify stock movement was created
    const movements = await prisma.stockMovement.findMany({
      where: { product_id: testProductId, type: "PURCHASE" },
    });
    expect(movements.length).toBe(1);
    expect(Number(movements[0].qty_kg)).toBe(400);
    expect(movements[0].source).toBe("PURCHASE_INVOICE");

    // Verify closing stock increased by exactly 400 kg (from 500 to 900)
    const summary = await getStockSummary();
    const item = summary.find((p) => p.code === testProductCode);
    expect(item?.closing).toBe(initialStock + 400);
  });

  it("allows Supplier 2 to save the same invoice number (supplier, number key isolation)", async () => {
    const draft2: any = {
      invoice: {
        number: sharedInvoiceNumber,
        date: "2026-06-20",
      },
      supplier: {
        name: supplier2Name,
        gstin: "34AAECA6767B1ZV", // Maharashtra (Inter-state)
      },
      items: [
        {
          lineNo: 1,
          productNameRaw: "Test Purchase Polymer",
          qtyPrinted: 100,
          unitPrinted: "KG",
          qtyKg: 100,
          rate: 160,
          ratePerKg: 160,
          discount: 0,
          taxableAmount: 16000,
          cgstPct: 0,
          sgstPct: 0,
          igstPct: 18,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 2880,
          lineTotal: 18880,
        },
      ],
      totals: {
        taxableSubtotal: 16000,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 2880,
        otherCharges: 0,
        tcs: 0,
        roundOff: 0,
        grandTotal: 18880,
      },
    };

    const res2 = await confirmPurchaseInvoice({
      draft: draft2,
      supplierResolution: {
        action: "CREATE_NEW",
        supplierName: supplier2Name,
        supplierGstin: "34AAECA6767B1ZV",
      },
      productResolutions: [
        {
          lineNo: 1,
          action: "USE_MATCHED",
          productId: testProductId,
          productCode: testProductCode,
          productNameRaw: "Test Purchase Polymer",
        },
      ],
      mode: "create",
    });

    expect(res2.invoiceId).toBeDefined();
    expect(res2.invoiceNumber).toBe(sharedInvoiceNumber);

    // Verify both invoices exist in database with the same number under different suppliers
    const bothInvoices = await prisma.purchaseInvoice.findMany({
      where: { supplier_invoice_number: sharedInvoiceNumber },
      include: { supplier: true },
    });
    expect(bothInvoices.length).toBe(2);
    expect(bothInvoices.map((i) => i.supplier.name)).toContain(supplier1Name);
    expect(bothInvoices.map((i) => i.supplier.name)).toContain(supplier2Name);

    // Closing stock is now 500 + 400 + 100 = 1000 kg
    const summary = await getStockSummary();
    const item = summary.find((p) => p.code === testProductCode);
    expect(item?.closing).toBe(initialStock + 500);
  });

  it("throws DUPLICATE_INVOICE if Supplier 1 tries to save the same invoice number again in create mode", async () => {
    const draftDuplicate: any = {
      invoice: {
        number: sharedInvoiceNumber,
        date: "2026-06-15",
      },
      supplier: {
        name: supplier1Name,
        gstin: "19AGDPA1084B1Z1",
      },
      items: [
        {
          lineNo: 1,
          productNameRaw: "Test Purchase Polymer",
          qtyPrinted: 1,
          unitPrinted: "KG",
          qtyKg: 1,
          rate: 150,
          ratePerKg: 150,
          taxableAmount: 150,
          cgstPct: 9,
          sgstPct: 9,
          igstPct: 0,
          lineTotal: 177,
        },
      ],
      totals: {
        taxableSubtotal: 150,
        cgstTotal: 13.5,
        sgstTotal: 13.5,
        igstTotal: 0,
        otherCharges: 0,
        tcs: 0,
        roundOff: 0,
        grandTotal: 177,
      },
    };

    await expect(
      confirmPurchaseInvoice({
        draft: draftDuplicate,
        supplierResolution: {
          action: "CREATE_NEW",
          supplierName: supplier1Name,
          supplierGstin: "19AGDPA1084B1Z1",
        },
        productResolutions: [
          {
            lineNo: 1,
            action: "USE_MATCHED",
            productId: testProductId,
            productCode: testProductCode,
            productNameRaw: "Test Purchase Polymer",
          },
        ],
        mode: "create",
      })
    ).rejects.toThrow(/already exists in database/);
  });

  it("modifies existing purchase invoice in replace mode, snapshots revision, and rebuilds stock movements", async () => {
    const sup1 = await prisma.supplier.findFirst({ where: { name: supplier1Name } });

    // Modify: Increase quantity to 3 drums = 600 kg (from 2 drums = 400 kg)
    const modifiedDraft: any = {
      invoice: {
        number: sharedInvoiceNumber,
        date: "2026-06-15",
        receivedDate: "2026-06-16",
      },
      supplier: {
        name: supplier1Name,
        gstin: "19AGDPA1084B1Z1",
      },
      items: [
        {
          lineNo: 1,
          productNameRaw: "Test Purchase Polymer",
          qtyPrinted: 3,
          unitPrinted: "DRUM",
          qtyKg: 600,
          packSizeKg: 200,
          rate: 30000,
          ratePerKg: 150,
          discount: 0,
          taxableAmount: 90000,
          cgstPct: 9,
          sgstPct: 9,
          igstPct: 0,
          cgstAmount: 8100,
          sgstAmount: 8100,
          igstAmount: 0,
          lineTotal: 106200,
        },
      ],
      totals: {
        taxableSubtotal: 90000,
        cgstTotal: 8100,
        sgstTotal: 8100,
        igstTotal: 0,
        otherCharges: 0,
        tcs: 0,
        roundOff: 0,
        grandTotal: 106200,
      },
    };

    const resReplace = await confirmPurchaseInvoice({
      draft: modifiedDraft,
      supplierResolution: {
        action: "USE_MATCHED",
        supplierId: sup1!.id,
        supplierName: supplier1Name,
        supplierGstin: "19AGDPA1084B1Z1",
      },
      productResolutions: [
        {
          lineNo: 1,
          action: "USE_MATCHED",
          productId: testProductId,
          productCode: testProductCode,
          productNameRaw: "Test Purchase Polymer",
          packSizeKg: 200,
        },
      ],
      mode: "replace",
      updateStdPurchaseRates: {
        [testProductId]: true,
      },
    });

    expect(resReplace.mode).toBe("replace");

    // Check revision snapshot was created
    const revisions = await prisma.purchaseInvoiceRevision.findMany({
      where: { purchase_invoice_id: resReplace.invoiceId },
    });
    expect(revisions.length).toBe(1);
    expect(revisions[0].version).toBe(1);

    // Stock movement should reflect 600 kg now
    const movements = await prisma.stockMovement.findMany({
      where: {
        purchase_invoice_item: { purchase_invoice_id: resReplace.invoiceId },
      },
    });
    expect(movements.length).toBe(1);
    expect(Number(movements[0].qty_kg)).toBe(600);

    // Closing stock should now be 500 (opening) + 600 (sup1) + 100 (sup2) = 1200 kg
    const summary = await getStockSummary();
    const item = summary.find((p) => p.code === testProductCode);
    expect(item?.closing).toBe(initialStock + 700);
  });

  it("deletes a purchase invoice, removes its movements, and restores stock level", async () => {
    const inv1 = await prisma.purchaseInvoice.findFirst({
      where: {
        supplier_invoice_number: sharedInvoiceNumber,
        supplier: { name: supplier1Name },
      },
    });
    expect(inv1).toBeDefined();

    // Delete invoice
    await prisma.purchaseInvoice.delete({
      where: { id: inv1!.id },
    });

    // Stock movements for this invoice should be removed
    const remainingMovements = await prisma.stockMovement.findMany({
      where: {
        purchase_invoice_item: { purchase_invoice_id: inv1!.id },
      },
    });
    expect(remainingMovements.length).toBe(0);

    // Stock should drop by 600 kg (from 1200 down to 600)
    const summary = await getStockSummary();
    const item = summary.find((p) => p.code === testProductCode);
    expect(item?.closing).toBe(initialStock + 100);
  });
});
