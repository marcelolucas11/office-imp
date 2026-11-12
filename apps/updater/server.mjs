// SPDX-License-Identifier: AGPL-3.0-only
// Atualizador do office-imp.
// Recebe POST /update { version } do servidor do escritório (botão "Atualizar servidor" do Dono) e:
//   1. faz backup do banco;  2. troca OFFICE_IMP_VERSION no .env;  3. baixa e sobe as novas imagens;
//   4. confere a saúde;      5. se falhar, volta para a versão anterior.
// Só mexe nos serviços listados em SERVICES, dentro do projeto Compose do office-imp.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGzip } from 'node:zlib';

const env = process.env;
const INSTALL_DIR = env.INSTALL_DIR ?? '/opt/office-imp';
const COMPOSE_FILE = env.COMPOSE_FILE ?? path.join(INSTALL_DIR, 'docker-compose.yml');
const ENV_FILE = path.join(INSTALL_DIR, '.env');
const HEALTH_URL = env.HEALTH_URL ?? 'http://app:3000/api/health';
const SERVICES = (env.SERVICES ?? 'app whisper').split(/\s+/).filter(Boolean);
const TOKEN = env.UPDATER_TOKEN ?? '';
const PORT = Number(env.PORT ?? 8787);

export const isVersion = (v) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v);

export function readVersion(envText) {
  const m = envText.match(/^OFFICE_IMP_VERSION=(.*)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

export function withVersion(envText, version) {
  if (/^OFFICE_IMP_VERSION=.*$/m.test(envText)) return envText.replace(/^OFFICE_IMP_VERSION=.*$/m, `OFFICE_IMP_VERSION=${version}`);
  return `${envText.replace(/\n*$/, '\n')}OFFICE_IMP_VERSION=${version}\n`;
}

const state = { state: 'idle', log: [], startedAt: null, finishedAt: null, version: null, previous: null, error: null };
function log(line) {
  const text = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  state.log.push(text);
  if (state.log.length > 300) state.log.shift();
  console.log(text);
}

function run(cmd, args, { stdoutTo } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: INSTALL_DIR, env: process.env });
    const lines = (buf) => String(buf).split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => log(`  ${l.slice(0, 300)}`));
    if (stdoutTo) p.stdout.pipe(stdoutTo);
    else p.stdout.on('data', lines);
    p.stderr.on('data', lines);
    p.on('error', (e) => {
      log(`  erro ao executar ${cmd}: ${e.message}`);
      resolve(1);
    });
    p.on('close', (code) => resolve(code ?? 1));
  });
}
const compose = (...args) => run('docker', ['compose', '--project-directory', INSTALL_DIR, '-f', COMPOSE_FILE, '--env-file', ENV_FILE, ...args]);

async function healthy(version, seconds) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const j = await res.json();
        if (!version || j.version === version) return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function update(version) {
  Object.assign(state, { state: 'running', log: [], startedAt: Date.now(), finishedAt: null, version, error: null });
  const original = readFileSync(ENV_FILE, 'utf8');
  const previous = readVersion(original);
  state.previous = previous;
  log(`atualizando de ${previous || '?'} para ${version} (serviços: ${SERVICES.join(', ')})`);
  let changed = false;
  try {
    await backup(previous);
    writeFileSync(ENV_FILE, withVersion(original, version));
    changed = true;
    if ((await compose('pull', ...SERVICES)) !== 0) throw new Error('não foi possível baixar as imagens da nova versão');
    if ((await compose('up', '-d', '--no-deps', ...SERVICES)) !== 0) throw new Error('o Docker não conseguiu subir a nova versão');
    log('aguardando o servidor responder na nova versão...');
    if (!(await healthy(version, 240))) throw new Error('o servidor não respondeu na nova versão dentro do prazo');
    log('atualização concluída.');
    Object.assign(state, { state: 'done', finishedAt: Date.now() });
  } catch (e) {
    log(`FALHA: ${e.message}`);
    if (changed) {
      log(`voltando para a versão ${previous}...`);
      writeFileSync(ENV_FILE, original);
      await compose('up', '-d', '--no-deps', ...SERVICES);
      log((await healthy(previous, 180)) ? 'versão anterior restaurada.' : 'ATENÇÃO: a versão anterior também não respondeu; confira com "docker compose logs app".');
    }
    Object.assign(state, { state: 'failed', finishedAt: Date.now(), error: e.message });
  }
}

async function backup(previous) {
  const dir = path.join(INSTALL_DIR, 'backups');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `pre-update-${previous || 'x'}-${new Date().toISOString().replace(/[:.]/g, '-')}.sql.gz`);
  const gz = createGzip();
  const out = createWriteStream(file);
  gz.pipe(out);
  const closed = new Promise((r) => out.on('close', r));
  const code = await run('docker', ['compose', '--project-directory', INSTALL_DIR, '-f', COMPOSE_FILE, '--env-file', ENV_FILE, 'exec', '-T', 'postgres', 'pg_dump', '-U', 'officeimp', '-d', 'officeimp', '--no-owner'], { stdoutTo: gz });
  await closed;
  if (code !== 0) throw new Error('o backup do banco falhou; nada foi alterado');
  log(`backup salvo em ${file}`);
}

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createServer() {
  return http.createServer((req, res) => {
    if (req.url === '/health') return send(res, 200, { ok: true });
    if (!TOKEN || req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { message: 'Não autorizado.' });
    if (req.method === 'GET' && req.url === '/status') return send(res, 200, state);
    if (req.method === 'POST' && req.url === '/update') {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
        if (raw.length > 2000) req.destroy();
      });
      req.on('end', () => {
        let version;
        try {
          version = JSON.parse(raw || '{}').version;
        } catch {}
        if (!isVersion(version)) return send(res, 400, { message: 'Versão inválida.' });
        if (state.state === 'running') return send(res, 409, { message: 'Já existe uma atualização em andamento.' });
        if (!existsSync(ENV_FILE) || !existsSync(COMPOSE_FILE)) return send(res, 500, { message: `Instalação não encontrada em ${INSTALL_DIR}.` });
        void update(version);
        send(res, 202, { ok: true, state: 'running', version });
      });
      return;
    }
    send(res, 404, { message: 'Não encontrado.' });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!TOKEN || TOKEN.length < 16) {
    console.error('[updater] UPDATER_TOKEN ausente ou curto demais; encerrando.');
    process.exit(1);
  }
  createServer().listen(PORT, '0.0.0.0', () => console.log(`[updater] ouvindo na porta ${PORT}; instalação em ${INSTALL_DIR}`));
}
