# PostgreSQL Backup Script for Windows (PowerShell)
param(
  [string]$DbName = "indobest",
  [string]$DbUser = "postgres",
  [string]$DbHost = "localhost",
  [string]$DbPort = "5432",
  [string]$BackupDir = "./backups"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutputFile = "$BackupDir/${DbName}_backup_$Timestamp.sql"

Write-Host "Creating backup of database '$DbName' to '$OutputFile'..." -ForegroundColor Cyan

# Check if pg_dump is available
$PgDump = Get-Command "pg_dump" -ErrorAction SilentlyContinue
if (!$PgDump) {
  # Check common Postgres install locations
  $StandardPaths = @(
    "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe"
  )
  foreach ($p in $StandardPaths) {
    if (Test-Path $p) {
      $PgDump = $p
      break
    }
  }
}

if (!$PgDump) {
  Write-Error "pg_dump was not found in PATH or standard PostgreSQL directory. Please add it to your PATH."
  exit 1
}

& $PgDump -h $DbHost -p $DbPort -U $DbUser -d $DbName -F c -b -v -f $OutputFile

if ($LASTEXITCODE -eq 0) {
  Write-Host "Backup completed successfully: $OutputFile" -ForegroundColor Green
} else {
  Write-Error "pg_dump failed with exit code $LASTEXITCODE"
}
