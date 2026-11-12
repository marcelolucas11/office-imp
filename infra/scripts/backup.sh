#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# office-imp — backup diário: banco (pg_dump) + arquivos (áudios, transcrições, uploads). Mantém 7 dias.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
KEEP_DAYS="${KEEP_DAYS:-7}"
OUT="$DIR/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
compose() { docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" --env-file "$DIR/.env" "$@"; }

compose exec -T postgres pg_dump -U officeimp -d officeimp --no-owner | gzip > "$OUT/db-$STAMP.sql.gz"
docker run --rm -v office-imp_officeimp_data:/data:ro -v "$OUT":/backup alpine:3 \
  tar czf "/backup/data-$STAMP.tar.gz" -C /data .
find "$OUT" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'data-*.tar.gz' -o -name 'pre-update-*.sql.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "[$(date '+%F %T')] backup concluído: db-$STAMP.sql.gz ($(du -h "$OUT/db-$STAMP.sql.gz" | cut -f1)), data-$STAMP.tar.gz ($(du -h "$OUT/data-$STAMP.tar.gz" | cut -f1))"
