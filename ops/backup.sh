#!/usr/bin/env bash
# Respaldo diario. Cron sugerido: 0 3 * * * /opt/neo-axis/ops/backup.sh
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
DEST="${BACKUP_DIR:-/var/backups/neoaxis}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$DEST"

docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
  | gzip > "$DEST/neoaxis-$STAMP.dump.gz"

find "$DEST" -name 'neoaxis-*.dump.gz' -mtime +"$RETENTION_DAYS" -delete
echo "Respaldo listo: $DEST/neoaxis-$STAMP.dump.gz"
