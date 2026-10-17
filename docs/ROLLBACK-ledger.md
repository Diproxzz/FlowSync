# Rollback Guide: Account Statements (Party Ledger) Module

This document outlines the rollback procedures for the Account Statements (Party Ledger) module.

## 1. Code Only Rollback
If you need to revert code changes back to the pre-ledger baseline:
```powershell
git checkout feature/purchase-module
# or
git reset --hard pre-ledger-module
```

## 2. Full Database & Code Rollback
To restore code and database to the exact pre-ledger state:
1. Revert to `pre-ledger-module` git tag:
   ```powershell
   git checkout pre-ledger-module
   ```
2. Restore database from backup:
   ```powershell
   $env:PGPASSWORD="postgres"
   & "C:\Program Files\PostgreSQL\16\bin\dropdb.exe" -U postgres -h localhost indobest
   & "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres -h localhost indobest
   & "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -U postgres -h localhost -d indobest backups/20261017_1919/db.dump
   ```

## 3. Ledger Tables Only Rollback (Down-Script)
To keep all other data (invoices, purchases, products, stock) intact while removing only the ledger module:
Run `prisma/rollback/ledger_module_down.sql` using psql:
```powershell
$env:PGPASSWORD="postgres"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -d indobest -f prisma/rollback/ledger_module_down.sql
```

## 4. Feature Flag Switch-Off
To immediately disable the ledger module without touching the database schema:
In `.env`:
```env
FEATURE_LEDGER=false
```
When `FEATURE_LEDGER=false`, invoice confirmations and all existing workflows run without ledger hooks.
