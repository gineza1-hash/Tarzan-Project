#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"
backup_file="${1:?Usage: ./restore.sh path/to/backup.dump}"
test -f "$backup_file" || { echo "Backup file was not found: $backup_file" >&2; exit 1; }
read -r -p "Type RESTORE to overwrite the target database: " confirmation
test "$confirmation" = "RESTORE" || { echo "Restore cancelled."; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$backup_file"
echo "Restore completed from: $backup_file"
