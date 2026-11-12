#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# office-imp — atualização manual pela VPS (equivale ao botão "Atualizar servidor" do painel).
# Uso:  ./update.sh            (última versão publicada)
#       ./update.sh 1.2.0      (uma versão específica)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
# shellcheck disable=SC1091
set -a; . "$DIR/.env"; set +a
REPO="${GITHUB_REPO:-marcelolucas11/office-imp}"
VERSION="${1:-}"
compose() { docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" --env-file "$DIR/.env" "$@"; }

if [ -z "$VERSION" ]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)"
fi
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Não foi possível descobrir a versão (use: $0 X.Y.Z)."; exit 1; }
PREV="${OFFICE_IMP_VERSION:-}"
echo "==> atualizando de ${PREV:-?} para $VERSION"
"$DIR/backup.sh"
cp "$DIR/.env" "$DIR/.env.bak"
# arquivos de infraestrutura da nova versão (o .env e os dados não mudam)
for f in docker-compose.prod.yml:docker-compose.yml Caddyfile:Caddyfile scripts/backup.sh:backup.sh scripts/restore.sh:restore.sh scripts/update.sh:update.sh.new; do
  src="${f%%:*}"; dst="${f##*:}"
  curl -fsSL "https://raw.githubusercontent.com/$REPO/v$VERSION/infra/$src" -o "$DIR/$dst.tmp" && mv "$DIR/$dst.tmp" "$DIR/$dst" || rm -f "$DIR/$dst.tmp"
done
chmod +x "$DIR"/*.sh 2>/dev/null || true
sed -i "s/^OFFICE_IMP_VERSION=.*/OFFICE_IMP_VERSION=$VERSION/" "$DIR/.env"
PROFILE=()
[ "${PROXY_MODE:-}" = "caddy" ] && PROFILE=(--profile caddy)
if compose "${PROFILE[@]}" pull && compose "${PROFILE[@]}" up -d; then
  for _ in $(seq 1 60); do
    if curl -fsS "http://${BIND_ADDR:-127.0.0.1}:${APP_PORT:-3080}/api/health" 2>/dev/null | grep -q "\"version\":\"$VERSION\""; then
      [ -f "$DIR/update.sh.new" ] && mv "$DIR/update.sh.new" "$DIR/update.sh" && chmod +x "$DIR/update.sh"
      echo "==> office-imp $VERSION no ar."
      exit 0
    fi
    sleep 3
  done
fi
echo "!! a nova versão não respondeu; voltando para ${PREV:-a anterior}"
cp "$DIR/.env.bak" "$DIR/.env"
compose "${PROFILE[@]}" up -d
exit 1
