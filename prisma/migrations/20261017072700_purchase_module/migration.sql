-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('SALES', 'PURCHASE');

-- AlterEnum
ALTER TYPE "MovementSource" ADD VALUE 'PURCHASE_INVOICE';

-- AlterTable
ALTER TABLE "extraction_logs" ADD COLUMN     "document_type" "DocumentType" NOT NULL DEFAULT 'SALES';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "purchase_invoice_item_id" TEXT;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_norm" TEXT NOT NULL,
    "gstin" TEXT,
    "address" TEXT,
    "state_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_aliases" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "alias_norm" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" TEXT NOT NULL,
    "supplier_invoice_number" TEXT NOT NULL,
    "invoice_number_norm" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "received_date" DATE,
    "financial_year" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_name_snapshot" TEXT NOT NULL,
    "supplier_gstin_snapshot" TEXT,
    "buyer_gstin_snapshot" TEXT,
    "reference_no" TEXT,
    "vehicle_no" TEXT,
    "taxable_total" DECIMAL(14,2) NOT NULL,
    "cgst_total" DECIMAL(14,2) NOT NULL,
    "sgst_total" DECIMAL(14,2) NOT NULL,
    "igst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tcs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "round_off" DECIMAL(6,2) NOT NULL,
    "grand_total" DECIMAL(14,2) NOT NULL,
    "source_file_hash" TEXT NOT NULL,
    "source_file_key" TEXT,
    "extraction_provider" TEXT,
    "extraction_model" TEXT,
    "warnings" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_items" (
    "id" TEXT NOT NULL,
    "purchase_invoice_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name_raw" TEXT NOT NULL,
    "hsn" TEXT,
    "qty_printed" DECIMAL(12,3) NOT NULL,
    "unit_printed" TEXT NOT NULL,
    "qty_kg" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "rate_per_kg" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(14,2) NOT NULL,
    "cgst_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgst_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igst_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2),
    "sgst_amount" DECIMAL(14,2),
    "igst_amount" DECIMAL(14,2),
    "line_total" DECIMAL(14,2),

    CONSTRAINT "purchase_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_revisions" (
    "id" TEXT NOT NULL,
    "purchase_invoice_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_invoice_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_gstin_key" ON "suppliers"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_aliases_alias_norm_key" ON "supplier_aliases"("alias_norm");

-- CreateIndex
CREATE INDEX "purchase_invoices_invoice_date_idx" ON "purchase_invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "purchase_invoices_supplier_id_invoice_date_idx" ON "purchase_invoices"("supplier_id", "invoice_date");

-- CreateIndex
CREATE INDEX "purchase_invoices_financial_year_idx" ON "purchase_invoices"("financial_year");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_supplier_id_invoice_number_norm_key" ON "purchase_invoices"("supplier_id", "invoice_number_norm");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_product_id_idx" ON "purchase_invoice_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_items_purchase_invoice_id_line_no_key" ON "purchase_invoice_items"("purchase_invoice_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_revisions_purchase_invoice_id_version_key" ON "purchase_invoice_revisions"("purchase_invoice_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_purchase_invoice_item_id_key" ON "stock_movements"("purchase_invoice_item_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_invoice_item_id_fkey" FOREIGN KEY ("purchase_invoice_item_id") REFERENCES "purchase_invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_aliases" ADD CONSTRAINT "supplier_aliases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_revisions" ADD CONSTRAINT "purchase_invoice_revisions_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Check constraint: Stock movement can link to at most one item (invoice_item_id OR purchase_invoice_item_id)
ALTER TABLE "stock_movements" ADD CONSTRAINT "check_stock_movement_item_link"
CHECK (
  (invoice_item_id IS NULL OR purchase_invoice_item_id IS NULL)
);

-- Insert default purchase settings if not present
INSERT INTO "settings" ("key", "value")
VALUES 
  ('purchase_rate_variance_pct', '5'::jsonb),
  ('supplier_lapsed_days', '90'::jsonb)
ON CONFLICT ("key") DO NOTHING;
