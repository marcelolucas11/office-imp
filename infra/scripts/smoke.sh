#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Teste de fumaça de uma instalação feita pelo install.sh (usado no CI).
set -euo pipefail
DIR="${INSTALL_DIR:-/opt/office-imp}"
BASE="${BASE_URL:-http://127.0.0.1:3080}"
TOKEN="$(sudo sed -n 's/^SETUP_TOKEN=//p' "$DIR/.env")"
JAR="$(mktemp)"
step() { printf '\n== %s\n' "$*"; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(String(($1)))})"; }

step "saúde e página inicial"
curl -fsS "$BASE/api/health"
curl -fsS "$BASE/" | grep -q '<div id="root">' && echo " · cliente web servido"
curl -fsS -o /dev/null -w '%{http_code}\n' "$BASE/excalidraw/fonts/Virgil/Virgil-Regular.woff2" | grep -q 200 && echo "fontes do quadro branco servidas"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/nao-existe.png")" = "404" ] && echo "arquivo inexistente responde 404"

step "configuração inicial pelo token"
curl -fsS -c "$JAR" -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\",\"owners\":[{\"username\":\"dono\",\"displayName\":\"Dono\",\"password\":\"senha-de-teste-123\"}]}" "$BASE/api/setup"
echo
ME="$(curl -fsS -b "$JAR" "$BASE/api/auth/me")"
echo "$ME" | json 'j.role + " · 2FA pendente: " + j.mustSetupTotp'

step "serviços"
cd "$DIR"
sudo docker compose ps --format '{{.Service}}: {{.State}}'
for s in postgres redis livekit egress whisper app updater; do
  state="$(sudo docker compose ps --format '{{.State}}' "$s")"
  [ "$state" = "running" ] || { echo "serviço $s não está rodando ($state)"; exit 1; }
done

step "LiveKit responde e o app fala com o atualizador"
curl -fsS http://127.0.0.1:7880 >/dev/null && echo "livekit ok"
sudo docker compose exec -T app node -e "fetch(process.env.UPDATER_URL+'/status',{headers:{authorization:'Bearer '+process.env.UPDATER_TOKEN}}).then(r=>r.json()).then(j=>{console.log('updater:',j.state);process.exit(j.state==='idle'?0:1)}).catch(e=>{console.error(e);process.exit(1)})"

step "ffmpeg na imagem do app e binário do Whisper"
sudo docker compose exec -T app ffmpeg -version | head -1
sudo docker compose exec -T whisper sh -c 'whisper-server --help 2>&1 | head -3'

step "backup e restauração"
sudo "$DIR/backup.sh"
DB="$(sudo sh -c "ls -t $DIR/backups/db-*.sql.gz | head -1")"
sudo env RESTORE_YES=1 "$DIR/restore.sh" "$DB"
for _ in $(seq 1 30); do curl -fsS "$BASE/api/health" >/dev/null 2>&1 && break; sleep 2; done
curl -fsS -b "$JAR" "$BASE/api/auth/me" | json '"sessão preservada após restaurar: " + j.name'

step "transcrição local (Whisper) responde"
for _ in $(seq 1 80); do
  sudo docker compose exec -T whisper sh -c 'curl -fsS -o /dev/null http://127.0.0.1:8080/' 2>/dev/null && break
  sleep 3
done
sudo docker compose exec -T app sh -c 'ffmpeg -loglevel error -f lavfi -i "sine=frequency=440:duration=2" -ar 16000 -ac 1 -y /tmp/tom.wav'
sudo docker compose exec -T app node -e "
const fs = require('fs');
const f = new FormData();
f.append('file', new Blob([fs.readFileSync('/tmp/tom.wav')]), 'tom.wav');
f.append('response_format', 'verbose_json');
f.append('language', 'pt');
fetch('http://whisper:8080/inference', { method: 'POST', body: f })
  .then((r) => r.text())
  .then((t) => { console.log('whisper:', t.slice(0, 240)); process.exit(t.includes('text') || t.includes('segments') ? 0 : 1); })
  .catch((e) => { console.error(e); process.exit(1); });
"
echo
echo
echo "TUDO CERTO"
