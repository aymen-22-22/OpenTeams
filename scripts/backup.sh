#!/bin/sh
# Back up the database (and local files, if used) into $BACKUP_DIR, keeping $BACKUP_KEEP_DAYS days.
# Uses the standard PG* variables: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
FILES_DIR="${FILES_DIR:-/data/files}"
stamp="$(date -u +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
umask 077  # backups contain everyone's messages: readable by the owner only

pg_dump --format=custom --no-owner --file="$BACKUP_DIR/db-$stamp.dump.partial"
mv "$BACKUP_DIR/db-$stamp.dump.partial" "$BACKUP_DIR/db-$stamp.dump"
echo "database -> $BACKUP_DIR/db-$stamp.dump"

# Local storage only. Files stored in Nextcloud are backed up with Nextcloud itself.
if [ -d "$FILES_DIR" ] && [ -n "$(ls -A "$FILES_DIR" 2>/dev/null)" ]; then
  tar -czf "$BACKUP_DIR/files-$stamp.tar.gz" -C "$FILES_DIR" .
  echo "files -> $BACKUP_DIR/files-$stamp.tar.gz"
fi

find "$BACKUP_DIR" -name 'db-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'files-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
