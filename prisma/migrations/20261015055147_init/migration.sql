-- CreateEnum
CREATE TYPE "ProductSource" AS ENUM ('MASTER', 'INVOICE_AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING', 'PURCHASE', 'SALE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MovementSource" AS ENUM ('SEED_OPENING', 'INVOICE', 'MANUAL', 'LEGACY_XLSX');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "default_hsn" TEXT,
    "pack_size_kg" DECIMAL(8,2),
    "std_purchase_rate" DECIMAL(10,2),
    "std_sale_rate" DECIMAL(10,2),
    "reorder_level_kg" DECIMAL(12,3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "source" "ProductSource" NOT NULL DEFAULT 'MASTER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_aliases" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "alias_norm" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_norm" TEXT NOT NULL,
    "gstin" TEXT,
    "address" TEXT,
    "state_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_aliases" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "alias_norm" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_number_norm" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "financial_year" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name_snapshot" TEXT NOT NULL,
    "customer_gstin_snapshot" TEXT,
    "taxable_total" DECIMAL(14,2) NOT NULL,
    "cgst_total" DECIMAL(14,2) NOT NULL,
    "sgst_total" DECIMAL(14,2) NOT NULL,
    "igst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
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

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name_raw" TEXT NOT NULL,
    "hsn" TEXT,
    "qty_kg" DECIMAL(12,3) NOT NULL,
    "pack_size_kg" DECIMAL(8,2),
    "rate" DECIMAL(10,2) NOT NULL,
    "taxable_amount" DECIMAL(14,2) NOT NULL,
    "cgst_pct" DECIMAL(5,2) NOT NULL,
    "sgst_pct" DECIMAL(5,2) NOT NULL,
    "igst_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2) NOT NULL,
    "sgst_amount" DECIMAL(14,2) NOT NULL,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_revisions" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "movement_date" DATE NOT NULL,
    "type" "MovementType" NOT NULL,
    "qty_kg" DECIMAL(12,3) NOT NULL,
    "invoice_item_id" TEXT,
    "source" "MovementSource" NOT NULL,
    "party_text" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_logs" (
    "id" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "raw_response" JSONB,
    "validation" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_aliases_alias_norm_key" ON "product_aliases"("alias_norm");

-- CreateIndex
CREATE UNIQUE INDEX "customers_gstin_key" ON "customers"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "customer_aliases_alias_norm_key" ON "customer_aliases"("alias_norm");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_norm_key" ON "invoices"("invoice_number_norm");

-- CreateIndex
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "invoices_customer_id_invoice_date_idx" ON "invoices"("customer_id", "invoice_date");

-- CreateIndex
CREATE INDEX "invoices_financial_year_idx" ON "invoices"("financial_year");

-- CreateIndex
CREATE INDEX "invoice_items_product_id_idx" ON "invoice_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_invoice_id_line_no_key" ON "invoice_items"("invoice_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_invoice_item_id_key" ON "stock_movements"("invoice_item_id");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_movement_date_idx" ON "stock_movements"("product_id", "movement_date");

-- AddForeignKey
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_aliases" ADD CONSTRAINT "customer_aliases_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_revisions" ADD CONSTRAINT "invoice_revisions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
