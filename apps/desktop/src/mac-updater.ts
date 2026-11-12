// SPDX-License-Identifier: AGPL-3.0-only
// Atualização automática do app do Mac SEM certificado da Apple.
// O autoUpdater do Electron (Squirrel.Mac) recusa apps com assinatura ad-hoc, então fazemos o mesmo trabalho aqui:
//   1. lê o latest-mac.yml do último release no GitHub;
//   2. baixa o .zip em segundo plano e confere o SHA-512;
//   3. extrai com ditto e confere a assinatura e o identificador do app;
//   4. ao fechar (ou em "Reiniciar agora"), um script troca o .app, reabre se pedido e apaga tudo o que foi baixado.
// Restos de atualizações anteriores (pasta temporária e app antigo) são apagados na abertura seguinte.
import { app, net } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface MacUpdateEvents {
  onChecking(): void;
  onAvailable(version: string): void;
  onNotAvailable(): void;
  onProgress(percent: number): void;
  onDownloaded(version: string): void;
  onError(message: string): void;
}

interface Manifest {
  version: string;
  url: string;
  sha512: string;
  size: number;
}

const workDir = () => path.join(app.getPath('userData'), 'mac-update');
const OLD_SUFFIX = '.old-update';

/** Caminho do .app em execução (…/Office Impera.app). */
function currentBundle(): string {
  return path.resolve(process.execPath, '..', '..', '..');
}

/** Onde o app novo deve ficar: no lugar do atual, ou em /Applications se o atual roda do DMG ou isolado pelo Gatekeeper. */
function targetBundle(): string {
  const cur = currentBundle();
  if (cur.includes('/AppTranslocation/') || cur.startsWith('/Volumes/')) return path.join('/Applications', path.basename(cur));
  return cur;
}

function canWrite(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/** Lê o latest-mac.yml gerado pelo electron-builder (formato simples, sem precisar de biblioteca de YAML). */
export function parseManifest(text: string): Manifest | null {
  const version = text.match(/^version:\s*['"]?([^\s'"]+)/m)?.[1];
  const blocks = text.split(/\n\s*-\s+url:\s*/).slice(1);
  for (const b of blocks) {
    const url = b.match(/^['"]?([^\s'"]+)/)?.[1];
    if (!url || !url.endsWith('.zip')) continue;
    const sha512 = b.match(/sha512:\s*['"]?([^\s'"]+)/)?.[1];
    const size = Number(b.match(/size:\s*(\d+)/)?.[1] ?? 0);
    if (version && sha512) return { version, url, sha512, size };
  }
  return null;
}

export class MacUpdater {
  private busy = false;
  private ready: { version: string; appPath: string } | null = null;
  private installing = false;

  constructor(
    private readonly repo: string,
    private readonly bundleId: string,
    private readonly ev: MacUpdateEvents,
  ) {}

  get downloadedVersion(): string | null {
    return this.ready?.version ?? null;
  }

  /** Apaga restos de atualizações anteriores (chamar na abertura do app). */
  cleanup(): void {
    if (this.busy || this.ready) return;
    fs.rmSync(workDir(), { recursive: true, force: true });
    const old = targetBundle() + OLD_SUFFIX;
    if (fs.existsSync(old)) fs.rmSync(old, { recursive: true, force: true });
  }

  /** Procura e, se houver versão nova (e download=true), baixa e prepara em segundo plano. */
  async check(download = true): Promise<void> {
    if (this.busy || this.installing) return;
    if (this.ready) return this.ev.onDownloaded(this.ready.version);
    this.busy = true;
    try {
      this.ev.onChecking();
      const base = `https://github.com/${this.repo}/releases/latest/download`;
      const res = await net.fetch(`${base}/latest-mac.yml`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`não foi possível ler a versão mais recente (HTTP ${res.status})`);
      const m = parseManifest(await res.text());
      if (!m) throw new Error('latest-mac.yml sem o arquivo .zip');
      if (!newer(m.version, app.getVersion())) return this.ev.onNotAvailable();
      this.ev.onAvailable(m.version);
      if (!download) return;

      const target = targetBundle();
      if (!canWrite(path.dirname(target))) throw new Error(`sem permissão para gravar em ${path.dirname(target)}`);

      const dir = workDir();
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const zip = path.join(dir, 'update.zip');
      await this.download(`${base}/${m.url}`, zip, m);

      const out = path.join(dir, 'app');
      fs.mkdirSync(out);
      await run('/usr/bin/ditto', ['-x', '-k', zip, out]);
      fs.rmSync(zip, { force: true });
      const name = fs.readdirSync(out).find((f) => f.endsWith('.app'));
      if (!name) throw new Error('o pacote baixado não contém o app');
      const appPath = path.join(out, name);

      const { stdout: id } = await run('/usr/bin/defaults', ['read', path.join(appPath, 'Contents', 'Info'), 'CFBundleIdentifier']);
      if (id.trim() !== this.bundleId) throw new Error('o app baixado não é o Office Impera');
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
      await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', appPath]).catch(() => undefined);

      this.ready = { version: m.version, appPath };
      this.ev.onDownloaded(m.version);
    } catch (e) {
      fs.rmSync(workDir(), { recursive: true, force: true });
      this.ev.onError((e as Error).message);
    } finally {
      this.busy = false;
    }
  }

  private async download(url: string, file: string, m: Manifest): Promise<void> {
    const res = await net.fetch(url);
    if (!res.ok || !res.body) throw new Error(`falha no download (HTTP ${res.status})`);
    const total = m.size || Number(res.headers.get('content-length') ?? 0);
    const hash = createHash('sha512');
    const outStream = fs.createWriteStream(file);
    const reader = res.body.getReader();
    let got = 0;
    let lastPct = -1;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        got += value.length;
        if (!outStream.write(value)) await new Promise<void>((r) => outStream.once('drain', () => r()));
        const pct = total ? Math.floor((got / total) * 100) : 0;
        if (pct !== lastPct) {
          lastPct = pct;
          this.ev.onProgress(pct);
        }
      }
    } finally {
      await new Promise<void>((r) => outStream.end(r));
    }
    if (hash.digest('base64') !== m.sha512) throw new Error('o arquivo baixado está corrompido (SHA-512 não confere)');
  }

  /**
   * Troca o app pelo novo assim que este processo terminar. Chame e depois feche o app.
   * Retorna false se não houver atualização pronta.
   */
  install(relaunch: boolean): boolean {
    if (!this.ready || this.installing) return false;
    this.installing = true;
    const target = targetBundle();
    const script = path.join(workDir(), 'install.sh');
    fs.writeFileSync(
      script,
      `#!/bin/bash
# gerado pelo Office Impera: troca o app pela versão nova e apaga os arquivos da atualização
PID="$1"; NEW="$2"; TARGET="$3"; RELAUNCH="$4"; WORK="$5"; OLD="$TARGET${OLD_SUFFIX}"
for i in $(seq 1 600); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
rm -rf "$OLD"
if [ -d "$TARGET" ]; then mv "$TARGET" "$OLD" || { rm -rf "$WORK"; exit 1; }; fi
if mv "$NEW" "$TARGET"; then rm -rf "$OLD"; else [ -d "$OLD" ] && mv "$OLD" "$TARGET"; fi
rm -rf "$WORK"
[ "$RELAUNCH" = "1" ] && /usr/bin/open "$TARGET"
exit 0
`,
      { mode: 0o755 },
    );
    const child = spawn('/bin/bash', [script, String(process.pid), this.ready.appPath, target, relaunch ? '1' : '0', workDir()], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  }
}
