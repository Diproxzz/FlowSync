#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${DB_NAME:-indobest}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="$BACKUP_DIR/${DB_NAME}_backup_${TIMESTAMP}.dump"

echo "Creating custom format backup of database '$DB_NAME' to '$OUTPUT_FILE'..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -b -v -f "$OUTPUT_FILE"

echo "Backup completed successfully: $OUTPUT_FILE"
