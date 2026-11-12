import { config } from '../config';
import { badRequest } from '../lib/errors';

interface Release {
  tag: string;
  version: string;
  url: string;
  publishedAt: string;
}

let cache: { at: number; release: Release | null } | null = null;

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

export async function latestRelease(force = false): Promise<Release | null> {
  if (!force && cache && Date.now() - cache.at < 10 * 60_000) return cache.release;
  let release: Release | null = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${config.githubRepo}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'office-imp' }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const j: any = await res.json();
      release = { tag: j.tag_name, version: String(j.tag_name).replace(/^v/, ''), url: j.html_url, publishedAt: j.published_at };
    }
  } catch {}
  cache = { at: Date.now(), release };
  return release;
}

export function updaterAvailable(): boolean {
  return Boolean(config.updater.url && config.updater.token);
}

async function callUpdater(pathname: string, method: 'GET' | 'POST', body?: unknown): Promise<any> {
  if (!updaterAvailable()) throw badRequest('O serviço de atualização não está configurado nesta instalação.', 'updater_unavailable');
  const res = await fetch(`${config.updater.url.replace(/\/$/, '')}${pathname}`, {
    method,
    headers: { authorization: `Bearer ${config.updater.token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw badRequest((json as any)?.message ?? 'O serviço de atualização recusou o pedido.');
  return json;
}

export const updaterStatus = () => callUpdater('/status', 'GET');
export const triggerServerUpdate = (version: string) => callUpdater('/update', 'POST', { version });
