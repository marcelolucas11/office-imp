#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# office-imp — restaura um backup.  Uso:  ./restore.sh backups/db-AAAAMMDD-HHMMSS.sql.gz [backups/data-AAAAMMDD-HHMMSS.tar.gz]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
DB="${1:-}"
DATA="${2:-}"
[ -f "$DB" ] || { echo "Uso: $0 backups/db-....sql.gz [backups/data-....tar.gz]"; exit 1; }
compose() { docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" --env-file "$DIR/.env" "$@"; }

if [ "${RESTORE_YES:-0}" != "1" ]; then
  read -r -p "Isto substitui o banco atual pelo backup $DB. Continuar? [s/N] " ans
  [[ "$ans" =~ ^[sSyY]$ ]] || { echo "Cancelado."; exit 1; }
fi
echo "==> parando o app"
compose stop app
echo "==> restaurando o banco"
compose exec -T postgres psql -U officeimp -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS officeimp WITH (FORCE);" -c "CREATE DATABASE officeimp OWNER officeimp;"
gunzip -c "$DB" | compose exec -T postgres psql -U officeimp -d officeimp -v ON_ERROR_STOP=1 -q
if [ -n "$DATA" ]; then
  [ -f "$DATA" ] || { echo "Arquivo não encontrado: $DATA"; exit 1; }
  echo "==> restaurando os arquivos"
  docker run --rm -v office-imp_officeimp_data:/data -v "$(cd "$(dirname "$DATA")" && pwd)":/backup:ro alpine:3 \
    sh -c "tar xzf /backup/$(basename "$DATA") -C /data"
fi
echo "==> subindo o app"
compose up -d app
echo "Restauração concluída."
