# Rollback Plan — Purchase Module

This document details the exact, tested rollback procedures for the Purchase Module.

## Available Backups

A full verified backup was created prior to Phase 1 in:
- `backups/20261017_125349/`
  - `db.dump`: PostgreSQL 16 custom-format binary dump (all 12 tables, 100% row match verified).
  - `code.tar.gz`: Git archive of project at git tag `pre-purchase-module`.
  - `storage/`: Full mirror of invoice file storage.
  - `.env.example`: Environment configuration template.
  - `MANIFEST.md`: Row counts and migration state.

---

## 1. Feature Flag Kill-Switch (Zero Downtime)
If any unexpected behavior occurs in production/development, set in `.env`:
```env
FEATURE_PURCHASES=false
```
When `false`, all Purchase navigation, UI controls, and API routes are disabled and hidden. No database or code changes required.

---

## 2. Revert Migration Only (Preserve Database)
To rollback only the Purchase Module schema additions while keeping the rest of the database intact:
Run the reviewed down-migration script:
```bash
psql -U postgres -d indobest -f prisma/rollback/purchase_module_down.sql
```
This script cleanly:
1. Deletes stock movements where `source = 'PURCHASE_INVOICE'`.
2. Drops tables `purchase_invoice_revisions`, `purchase_invoice_items`, `purchase_invoices`, `supplier_aliases`, `suppliers`.
3. Removes `purchase_invoice_item_id` foreign key and column from `stock_movements`.
4. Removes the check constraint on `stock_movements`.
5. Removes `document_type` from `extraction_logs`.
6. Removes `purchase_rate_variance_pct` and `supplier_lapsed_days` from `settings`.

---

## 3. Full Restore (Code + Database + Files)
To completely revert the entire environment to `pre-purchase-module`:

### Step 3.1: Code
```bash
git checkout master
# or if on feature branch:
git reset --hard pre-purchase-module
```

### Step 3.2: Database
```powershell
# Drop and recreate database
& "C:\Program Files\PostgreSQL\16\bin\dropdb.exe" -U postgres -h localhost -p 5432 indobest
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres -h localhost -p 5432 indobest

# Restore dump
& "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -U postgres -h localhost -p 5432 -d indobest "backups/20261017_125349/db.dump"

# Verify migration state
npx prisma migrate status
```

### Step 3.3: Storage Files
```powershell
Copy-Item -Path "backups/20261017_125349/storage/*" -Destination "storage/" -Recurse -Force
```
