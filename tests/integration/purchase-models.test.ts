import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { MovementSource, MovementType } from "@prisma/client";

describe("Purchase Data Models & Constraints (Phase 1)", () => {
  let testSupplierId: string;
  let testProductId: string;
  let testPurchaseInvoiceId: string;
  let testPurchaseItemId: string;

  beforeAll(async () => {
    // 1. Create test supplier
    const supplier = await prisma.supplier.create({
      data: {
        name: "Test Chemicals India Ltd",
        name_norm: "TEST CHEMICALS INDIA LTD",
        gstin: "34TESTC1234F1Z9",
        address: "Puducherry",
        state_code: "34",
      },
    });
    testSupplierId = supplier.id;

    // 2. Fetch or create test product
    let product = await prisma.product.findFirst({ where: { is_active: true } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          code: "TEST-PROD-01",
          name: "Test Compound",
          pack_size_kg: 200,
        },
      });
    }
    testProductId = product.id;

    // 3. Create purchase invoice
    const pInv = await prisma.purchaseInvoice.create({
      data: {
        supplier_id: testSupplierId,
        supplier_invoice_number: "PINV-001",
        invoice_number_norm: "PINV-001",
        invoice_date: new Date("2026-10-01"),
        financial_year: "2026-27",
        supplier_name_snapshot: "Test Chemicals India Ltd",
        supplier_gstin_snapshot: "34TESTC1234F1Z9",
        taxable_total: 10000,
        cgst_total: 0,
        sgst_total: 0,
        igst_total: 1800,
        other_charges: 0,
        tcs: 0,
        round_off: 0,
        grand_total: 11800,
        source_file_hash: "test-hash-p1",
      },
    });
    testPurchaseInvoiceId = pInv.id;

    // 4. Create purchase invoice item
    const item = await prisma.purchaseInvoiceItem.create({
      data: {
        purchase_invoice_id: testPurchaseInvoiceId,
        line_no: 1,
        product_id: testProductId,
        product_name_raw: "Test Compound",
        qty_printed: 10,
        unit_printed: "DRUM",
        qty_kg: 2000,
        rate: 1000,
        rate_per_kg: 5,
        taxable_amount: 10000,
        igst_pct: 18,
        igst_amount: 1800,
        line_total: 11800,
      },
    });
    testPurchaseItemId = item.id;
  });

  afterAll(async () => {
    // Cascade delete purchase invoice and test supplier
    if (testPurchaseInvoiceId) {
      await prisma.purchaseInvoice.delete({ where: { id: testPurchaseInvoiceId } }).catch(() => {});
    }
    if (testSupplierId) {
      await prisma.supplier.delete({ where: { id: testSupplierId } }).catch(() => {});
    }
  });

  it("enforces unique (supplier_id, invoice_number_norm)", async () => {
    await expect(
      prisma.purchaseInvoice.create({
        data: {
          supplier_id: testSupplierId,
          supplier_invoice_number: "PINV-001",
          invoice_number_norm: "PINV-001",
          invoice_date: new Date("2026-10-02"),
          financial_year: "2026-27",
          supplier_name_snapshot: "Test Chemicals India Ltd",
          taxable_total: 5000,
          cgst_total: 0,
          sgst_total: 0,
          igst_total: 900,
          round_off: 0,
          grand_total: 5900,
          source_file_hash: "test-hash-p2",
        },
      })
    ).rejects.toThrow();
  });

  it("allows same invoice number for a DIFFERENT supplier", async () => {
    const supplier2 = await prisma.supplier.create({
      data: {
        name: "Different Supplier Ltd",
        name_norm: "DIFFERENT SUPPLIER LTD",
      },
    });

    const diffSupplierInv = await prisma.purchaseInvoice.create({
      data: {
        supplier_id: supplier2.id,
        supplier_invoice_number: "PINV-001", // same number!
        invoice_number_norm: "PINV-001",
        invoice_date: new Date("2026-10-02"),
        financial_year: "2026-27",
        supplier_name_snapshot: "Different Supplier Ltd",
        taxable_total: 5000,
        cgst_total: 0,
        sgst_total: 0,
        round_off: 0,
        grand_total: 5000,
        source_file_hash: "test-hash-p3",
      },
    });

    expect(diffSupplierInv.id).toBeDefined();

    // Clean up supplier2
    await prisma.purchaseInvoice.delete({ where: { id: diffSupplierInv.id } });
    await prisma.supplier.delete({ where: { id: supplier2.id } });
  });

  it("links StockMovement with PURCHASE_INVOICE source and purchase_invoice_item_id", async () => {
    const sm = await prisma.stockMovement.create({
      data: {
        product_id: testProductId,
        movement_date: new Date("2026-10-01"),
        type: MovementType.PURCHASE,
        qty_kg: 2000,
        source: MovementSource.PURCHASE_INVOICE,
        purchase_invoice_item_id: testPurchaseItemId,
      },
    });

    expect(sm.id).toBeDefined();
    expect(sm.source).toBe(MovementSource.PURCHASE_INVOICE);

    await prisma.stockMovement.delete({ where: { id: sm.id } });
  });

  it("enforces check_stock_movement_item_link: movement cannot link to both sales and purchase item", async () => {
    // Find an existing sales invoice item
    const salesItem = await prisma.invoiceItem.findFirst();
    if (!salesItem) return;

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO stock_movements (id, product_id, movement_date, type, qty_kg, source, invoice_item_id, purchase_invoice_item_id)
         VALUES ('conflict-chk', '${testProductId}', '2026-10-01', 'PURCHASE', 100, 'PURCHASE_INVOICE', '${salesItem.id}', '${testPurchaseItemId}');`
      )
    ).rejects.toThrow();
  });
});
