#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"
output_directory="${1:-./backups}"
mkdir -p "$output_directory"
output="$output_directory/tarzan-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --file="$output" "$DATABASE_URL"
echo "Backup created: $output"
