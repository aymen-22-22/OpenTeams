#!/bin/sh
# Restore a database dump (and optionally a files archive).
#   restore.sh /backups/db-20260105-030000.dump [/backups/files-20260105-030000.tar.gz]
# Stop the API first: docker compose stop api
set -eu

dump="${1:?usage: restore.sh DB_DUMP [FILES_ARCHIVE]}"
files="${2:-}"
FILES_DIR="${FILES_DIR:-/data/files}"

pg_restore --clean --if-exists --no-owner --dbname="$PGDATABASE" "$dump"
echo "database restored from $dump"

if [ -n "$files" ]; then
  mkdir -p "$FILES_DIR"
  tar -xzf "$files" -C "$FILES_DIR"
  echo "files restored into $FILES_DIR"
fi
