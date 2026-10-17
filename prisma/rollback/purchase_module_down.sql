-- Down migration for Purchase Module

-- 1. Remove any stock movements linked to purchase invoice items
DELETE FROM "stock_movements" WHERE "source" = 'PURCHASE_INVOICE' OR "purchase_invoice_item_id" IS NOT NULL;

-- 2. Drop constraint and foreign key from stock_movements
ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "check_stock_movement_item_link";
ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "stock_movements_purchase_invoice_item_id_fkey";
ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "purchase_invoice_item_id";

-- 3. Drop tables in cascade order
DROP TABLE IF EXISTS "purchase_invoice_revisions" CASCADE;
DROP TABLE IF EXISTS "purchase_invoice_items" CASCADE;
DROP TABLE IF EXISTS "purchase_invoices" CASCADE;
DROP TABLE IF EXISTS "supplier_aliases" CASCADE;
DROP TABLE IF EXISTS "suppliers" CASCADE;

-- 4. Alter extraction_logs
ALTER TABLE "extraction_logs" DROP COLUMN IF EXISTS "document_type";

-- 5. Drop enum DocumentType
DROP TYPE IF EXISTS "DocumentType";

-- 6. Clean up settings
DELETE FROM "settings" WHERE "key" IN ('purchase_rate_variance_pct', 'supplier_lapsed_days');
