-- Rollback down-script for Account Statements (Party Ledger) module
DROP TABLE IF EXISTS "ledger_audit" CASCADE;
DROP TABLE IF EXISTS "ledger_allocations" CASCADE;
DROP TABLE IF EXISTS "ledger_entries" CASCADE;
DROP TABLE IF EXISTS "statement_imports" CASCADE;
DROP TABLE IF EXISTS "ledger_accounts" CASCADE;

ALTER TABLE "customers" DROP COLUMN IF EXISTS "gstin_source";
ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "gstin_source";

DROP TYPE IF EXISTS "LedgerAccountType";
DROP TYPE IF EXISTS "LedgerEntryType";
DROP TYPE IF EXISTS "LedgerPaymentMode";
DROP TYPE IF EXISTS "LedgerEntrySource";
DROP TYPE IF EXISTS "LedgerAllocationSource";
DROP TYPE IF EXISTS "LedgerAuditAction";
DROP TYPE IF EXISTS "StatementParserType";
