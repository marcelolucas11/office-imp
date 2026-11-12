#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# office-imp — instalador para VPS (Ubuntu/Debian).
#
#   curl -fsSL https://raw.githubusercontent.com/marcelolucas11/office-imp/main/infra/install.sh | sudo bash
#
# O que ele faz: instala o office-imp em /opt/office-imp com Docker Compose, em um projeto separado.
# O que ele NÃO faz: parar, reiniciar, remover ou alterar containers, serviços, volumes ou
# configurações que já existem na máquina (o seu CRM, por exemplo). Se as portas 80/443 já estão
# em uso, ele não toca no proxy atual sem pedir: mostra o que acrescentar.
#
# Pode rodar de novo quando quiser: os segredos e os dados são preservados.
#
# Variáveis opcionais (para rodar sem perguntas: OFFICE_IMP_NONINTERACTIVE=1):
#   DOMAIN, RTC_DOMAIN, PUBLIC_IP, INSTALL_DIR, OFFICE_IMP_VERSION, ACME_EMAIL,
#   PROXY_MODE (caddy | external | none), BIND_ADDR, APP_PORT, LIVEKIT_PORT,
#   OFFICE_IMP_IMAGE, WHISPER_IMAGE, UPDATER_IMAGE (imagens locais, sem "pull"),
#   OFFICE_IMP_SKIP_PULL=1, OFFICE_IMP_SERVICES="postgres redis livekit app" (subconjunto).
set -euo pipefail

REPO="${OFFICE_IMP_REPO:-marcelolucas11/office-imp}"
REF="${OFFICE_IMP_REF:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/office-imp}"
NONINTERACTIVE="${OFFICE_IMP_NONINTERACTIVE:-0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"

say() { printf '\n\033[1;33m==>\033[0m %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;31m!!\033[0m  %s\n' "$*"; }
die() { warn "$*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
tty_ok() { [ "$NONINTERACTIVE" != "1" ] && [ -r /dev/tty ] && [ -w /dev/tty ]; }

ask() { # ask VAR "pergunta" "padrão"
  local var="$1" q="$2" def="${3:-}" ans=""
  if [ -n "${!var:-}" ]; then return 0; fi
  if tty_ok; then
    read -r -p "    $q [$def]: " ans </dev/tty || true
  fi
  printf -v "$var" '%s' "${ans:-$def}"
}
confirm() { # confirm "pergunta" (padrão: não)
  local ans=""
  tty_ok || return 1
  read -r -p "    $1 [s/N]: " ans </dev/tty || true
  [[ "$ans" =~ ^[sSyY]$ ]]
}
rand() { head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c "${1:-48}"; }
port_busy() { ss -Hltnu 2>/dev/null | awk '{print $5}' | grep -Eq "[:.]$1\$"; }
listeners() { ss -Hltnp "sport = :$1" 2>/dev/null | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | sort -u | tr '\n' ' '; }

[ "$(id -u)" = "0" ] || die "Rode como root (sudo)."
have ss || die "Comando 'ss' não encontrado (instale o pacote iproute2)."
have curl || die "Comando 'curl' não encontrado (apt-get install -y curl)."

# ---------------------------------------------------------------- 1. descoberta
say "1/8 Conhecendo a VPS (nada é alterado nesta etapa)"
MEM_TOTAL_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
MEM_AVAIL_MB="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
DISK_FREE_GB="$(df -BG --output=avail / | tail -1 | tr -dc '0-9')"
# shellcheck disable=SC1091
OS_NAME="$( . /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-Linux}" || echo Linux)"
info "Sistema: $OS_NAME · $(nproc) vCPU · RAM ${MEM_TOTAL_MB} MB (livre: ${MEM_AVAIL_MB} MB) · disco livre: ${DISK_FREE_GB} GB"
P80="$(listeners 80)"; P443="$(listeners 443)"
info "Porta 80:  ${P80:-livre}"
info "Porta 443: ${P443:-livre}"
if have docker; then
  info "Containers que já estão rodando (não serão tocados):"
  docker ps --format '      {{.Names}}  ({{.Image}})' 2>/dev/null | grep -v '^ *office-imp-' || info "  (nenhum)"
fi
[ "$DISK_FREE_GB" -ge 8 ] || warn "Pouco espaço em disco (${DISK_FREE_GB} GB livres). O office-imp precisa de uns 6 GB para imagens e modelo de transcrição."
[ "$MEM_AVAIL_MB" -ge 1500 ] || warn "Pouca memória livre (${MEM_AVAIL_MB} MB). Funciona, mas considere subir o plano da VPS."

# ---------------------------------------------------------------- 2. docker
say "2/8 Docker"
if ! have docker; then
  if [ "$NONINTERACTIVE" = "1" ] || confirm "O Docker não está instalado. Instalar agora (script oficial get.docker.com)?"; then
    curl -fsSL https://get.docker.com | sh
  else
    die "Instale o Docker e rode de novo."
  fi
fi
docker compose version >/dev/null 2>&1 || die "O plugin 'docker compose' não está disponível. Instale o pacote docker-compose-plugin."
info "$(docker --version) · $(docker compose version --short 2>/dev/null || true)"

# ---------------------------------------------------------------- 3. perguntas
say "3/8 Endereços"
if [ -f "$INSTALL_DIR/.env" ]; then
  info "Instalação existente em $INSTALL_DIR: os segredos e as escolhas anteriores serão mantidos."
  set -a
  # shellcheck disable=SC1091
  . "$INSTALL_DIR/.env"
  set +a
fi
ask DOMAIN "Domínio do escritório" "office-impera.imperaservices.com"
ask RTC_DOMAIN "Domínio do áudio/vídeo (LiveKit)" "rtc-${DOMAIN}"
DETECTED_IP="$(curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null || ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)"
ask PUBLIC_IP "IP público desta VPS" "${DETECTED_IP:-}"
[[ "${PUBLIC_IP:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "IP público inválido: '${PUBLIC_IP:-}'. Rode de novo informando PUBLIC_IP=x.x.x.x"
if [ -z "${OFFICE_IMP_VERSION:-}" ]; then
  OFFICE_IMP_VERSION="$(curl -fsSL --max-time 10 "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1 || true)"
  OFFICE_IMP_VERSION="${OFFICE_IMP_VERSION:-latest}"
fi
info "Versão: $OFFICE_IMP_VERSION"

# ---------------------------------------------------------------- 4. proxy reverso
say "4/8 Proxy reverso (HTTPS)"
BIND_ADDR="${BIND_ADDR:-127.0.0.1}"
if [ -z "${PROXY_MODE:-}" ]; then
  if [ -z "$P80" ] && [ -z "$P443" ]; then
    PROXY_MODE="caddy"
  else
    PROXY_MODE="external"
  fi
fi
case "$PROXY_MODE" in
  caddy)
    info "As portas 80 e 443 estão livres: o office-imp sobe um Caddy próprio, com HTTPS automático (Let's Encrypt)."
    ask ACME_EMAIL "E-mail para avisos do certificado HTTPS (opcional)" ""
    ;;
  external)
    info "As portas 80/443 já estão em uso por: ${P80}${P443}"
    info "O office-imp NÃO vai mexer nesse proxy. Ele fica disponível só localmente e você acrescenta dois endereços ao proxy atual (instruções no final)."
    if echo "$P80 $P443" | grep -q docker-proxy; then
      DOCKER0="$(ip -4 addr show docker0 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 | head -1)"
      if [ -n "$DOCKER0" ] && [ "$BIND_ADDR" = "127.0.0.1" ]; then
        BIND_ADDR="$DOCKER0"
        info "O proxy atual roda em container: o office-imp vai escutar em $BIND_ADDR (rede interna do Docker)."
      fi
    fi
    ;;
  none) info "Sem proxy: o app fica em http://$BIND_ADDR (use só para testes)." ;;
  *) die "PROXY_MODE inválido: $PROXY_MODE (use caddy, external ou none)." ;;
esac

APP_PORT="${APP_PORT:-3080}"
LIVEKIT_PORT="${LIVEKIT_PORT:-7880}"
if [ ! -f "$INSTALL_DIR/.env" ]; then
  while port_busy "$APP_PORT"; do APP_PORT=$((APP_PORT + 1)); done
  while port_busy "$LIVEKIT_PORT"; do LIVEKIT_PORT=$((LIVEKIT_PORT + 10)); done
  port_busy 7881 && die "A porta 7881/tcp (mídia do LiveKit) já está em uso nesta máquina."
  port_busy 7882 && die "A porta 7882/udp (mídia do LiveKit) já está em uso nesta máquina."
fi
info "App em $BIND_ADDR:$APP_PORT · LiveKit em $BIND_ADDR:$LIVEKIT_PORT · mídia em 7881/tcp e 7882/udp"

# ---------------------------------------------------------------- 5. arquivos
say "5/8 Arquivos em $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/backups" "$INSTALL_DIR/proxy"
fetch() { # fetch caminho-no-repo destino
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/$1" ]; then
    cp "$SCRIPT_DIR/$1" "$2"
  else
    curl -fsSL "https://raw.githubusercontent.com/$REPO/$REF/infra/$1" -o "$2" || die "Não foi possível baixar infra/$1 do GitHub ($REPO@$REF)."
  fi
}
fetch docker-compose.prod.yml "$INSTALL_DIR/docker-compose.yml"
fetch Caddyfile "$INSTALL_DIR/Caddyfile"
fetch scripts/backup.sh "$INSTALL_DIR/backup.sh"
fetch scripts/restore.sh "$INSTALL_DIR/restore.sh"
fetch scripts/update.sh "$INSTALL_DIR/update.sh"
fetch proxy/nginx.conf "$INSTALL_DIR/proxy/nginx.conf"
fetch proxy/Caddyfile.snippet "$INSTALL_DIR/proxy/Caddyfile.snippet"
fetch proxy/traefik.yml "$INSTALL_DIR/proxy/traefik.yml"
chmod +x "$INSTALL_DIR"/*.sh
# os exemplos de proxy já saem com os seus domínios e portas
sed -i "s/rtc-office-impera\.imperaservices\.com/$RTC_DOMAIN/g; s/office-impera\.imperaservices\.com/$DOMAIN/g; s/127\.0\.0\.1:3080/$BIND_ADDR:$APP_PORT/g; s/127\.0\.0\.1:7880/$BIND_ADDR:$LIVEKIT_PORT/g" "$INSTALL_DIR"/proxy/*

PUBLIC_URL="${PUBLIC_URL:-https://$DOMAIN}"
LIVEKIT_PUBLIC_URL="${LIVEKIT_PUBLIC_URL:-wss://$RTC_DOMAIN}"
COOKIE_SECURE="${COOKIE_SECURE:-true}"
umask 077
cat > "$INSTALL_DIR/.env" <<EOF
# office-imp — gerado pelo install.sh em $(date '+%F %T'). Guarde uma cópia deste arquivo em lugar seguro.
DOMAIN=$DOMAIN
RTC_DOMAIN=$RTC_DOMAIN
PUBLIC_URL=$PUBLIC_URL
LIVEKIT_PUBLIC_URL=$LIVEKIT_PUBLIC_URL
PUBLIC_IP=$PUBLIC_IP
INSTALL_DIR=$INSTALL_DIR
OFFICE_IMP_VERSION=$OFFICE_IMP_VERSION
PROXY_MODE=$PROXY_MODE
BIND_ADDR=$BIND_ADDR
APP_PORT=$APP_PORT
LIVEKIT_PORT=$LIVEKIT_PORT
COOKIE_SECURE=$COOKIE_SECURE
ACME_EMAIL=${ACME_EMAIL:-}
GITHUB_REPO=$REPO
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-$(rand 40)}
APP_SECRET=${APP_SECRET:-$(rand 64)}
APP_ENCRYPTION_KEY=${APP_ENCRYPTION_KEY:-$(rand 64)}
LIVEKIT_API_KEY=${LIVEKIT_API_KEY:-API$(rand 12)}
LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET:-$(rand 48)}
UPDATER_TOKEN=${UPDATER_TOKEN:-$(rand 48)}
SETUP_TOKEN=${SETUP_TOKEN:-$(rand 24)}
WHISPER_MODEL=${WHISPER_MODEL:-auto}
WHISPER_THREADS=${WHISPER_THREADS:-2}
WHISPER_LANGUAGE=${WHISPER_LANGUAGE:-pt}
SUMMARY_LLM_URL=${SUMMARY_LLM_URL:-}
SUMMARY_LLM_MODEL=${SUMMARY_LLM_MODEL:-}
SUMMARY_LLM_KEY=${SUMMARY_LLM_KEY:-}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
EOF
for v in OFFICE_IMP_IMAGE WHISPER_IMAGE UPDATER_IMAGE LIVEKIT_VERSION EGRESS_VERSION; do
  [ -n "${!v:-}" ] && echo "$v=${!v}" >> "$INSTALL_DIR/.env"
done
umask 022
# shellcheck disable=SC1091
set -a; . "$INSTALL_DIR/.env"; set +a
info ".env gravado (permissão 600)."

# ---------------------------------------------------------------- 6. firewall
say "6/8 Firewall"
if have ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 7881/tcp comment 'office-imp midia' >/dev/null
  ufw allow 7882/udp comment 'office-imp midia' >/dev/null
  if [ "$PROXY_MODE" = "caddy" ]; then
    ufw allow 80/tcp >/dev/null
    ufw allow 443 >/dev/null
  fi
  info "UFW ativo: liberadas 7881/tcp e 7882/udp$([ "$PROXY_MODE" = "caddy" ] && echo ', 80 e 443')."
else
  info "Nenhum firewall UFW ativo. As portas publicadas pelo Docker (7881/tcp e 7882/udp) já ficam acessíveis."
fi

# ---------------------------------------------------------------- 7. subir
say "7/8 Subindo o office-imp"
compose() { docker compose --project-directory "$INSTALL_DIR" -f "$INSTALL_DIR/docker-compose.yml" --env-file "$INSTALL_DIR/.env" "$@"; }
PROFILE=()
[ "$PROXY_MODE" = "caddy" ] && PROFILE=(--profile caddy)
# shellcheck disable=SC2206
SERVICES=(${OFFICE_IMP_SERVICES:-})
if [ "${OFFICE_IMP_SKIP_PULL:-0}" != "1" ]; then
  if ! compose "${PROFILE[@]}" pull "${SERVICES[@]}"; then
    warn "Não foi possível baixar as imagens. Se os pacotes do GitHub (ghcr.io/$REPO) estiverem privados,"
    warn "torne-os públicos em github.com → seu perfil → Packages → Package settings → Change visibility,"
    die "e rode este instalador de novo."
  fi
fi
compose "${PROFILE[@]}" up -d "${SERVICES[@]}"

info "Aguardando o servidor responder..."
OK=0
for _ in $(seq 1 60); do
  if curl -fsS "http://$BIND_ADDR:$APP_PORT/api/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 3
done
if [ "$OK" != "1" ]; then
  compose logs --tail 60 app || true
  die "O servidor não respondeu em http://$BIND_ADDR:$APP_PORT. Veja os logs acima."
fi
info "Servidor no ar: $(curl -fsS "http://$BIND_ADDR:$APP_PORT/api/health")"

# backup diário às 03:30
cat > /etc/cron.d/office-imp <<EOF
30 3 * * * root $INSTALL_DIR/backup.sh >> $INSTALL_DIR/backups/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/office-imp
info "Backup diário agendado (03:30) em $INSTALL_DIR/backups."

# ---------------------------------------------------------------- 8. resumo
say "8/8 Pronto. Faltam só estes passos:"
cat <<EOF

  A) DNS (Cloudflare) — crie dois registros do tipo A apontando para $PUBLIC_IP:
       $DOMAIN        ->  $PUBLIC_IP   (DNS only / nuvem cinza)
       $RTC_DOMAIN    ->  $PUBLIC_IP   (DNS only / nuvem cinza — obrigatório: a Cloudflare não repassa áudio/vídeo)
EOF
if [ "$PROXY_MODE" = "external" ]; then
  cat <<EOF

  B) Proxy — no proxy que já atende as portas 80/443, acrescente (com HTTPS e WebSocket):
       https://$DOMAIN      ->  http://$BIND_ADDR:$APP_PORT
       https://$RTC_DOMAIN  ->  http://$BIND_ADDR:$LIVEKIT_PORT
     Exemplos prontos com os seus domínios: $INSTALL_DIR/proxy/ (nginx.conf, Caddyfile.snippet, traefik.yml)
EOF
elif [ "$PROXY_MODE" = "caddy" ]; then
  cat <<EOF

  B) HTTPS — automático: assim que o DNS propagar, o Caddy emite os certificados sozinho.
EOF
fi
cat <<EOF

  C) Primeiro acesso — abra  $PUBLIC_URL/setup  e crie as contas de Dono.
       Token de configuração:  $SETUP_TOKEN

  Transcrição: o modelo do Whisper está sendo baixado em segundo plano (alguns minutos).
  Comandos úteis (em $INSTALL_DIR):
       docker compose ps              ver os serviços
       docker compose logs -f app     acompanhar o servidor
       ./update.sh                    atualizar para a última versão
       ./backup.sh  |  ./restore.sh   backup e restauração

EOF
info "Uso de memória agora: $(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo) MB livres de ${MEM_TOTAL_MB} MB."
docker stats --no-stream --format '      {{.Name}}: {{.MemUsage}} · CPU {{.CPUPerc}}' $(compose ps -q 2>/dev/null) 2>/dev/null || true
if [ "$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)" -lt 1000 ]; then
  warn "Menos de 1 GB de memória livre com tudo rodando: vale subir o plano da VPS para o CRM e o escritório não disputarem memória."
fi
