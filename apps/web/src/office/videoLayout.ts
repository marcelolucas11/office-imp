// SPDX-License-Identifier: AGPL-3.0-only
// Regras do layout dos vídeos (Destaque, Lado a lado, Mosaico), sem React, para dar para testar.
import type { VideoLayout } from './av';

/** O mínimo de cada quadro de vídeo que as regras precisam conhecer. */
export interface LayoutEntry {
  /** `<id>:cam` ou `<id>:screen`; o seu é `me:cam` / `me:screen`. */
  key: string;
  kind: 'cam' | 'screen';
  speaking?: boolean;
}

export interface StagePlan {
  /** Layout que vale de verdade agora (o escolhido, ajustado ao que está acontecendo). */
  mode: VideoLayout;
  /** Quadros grandes, na ordem. */
  main: string[];
  /** Quadros pequenos da faixa. */
  strip: string[];
}

const isMine = (key: string) => key.startsWith('me:');

/**
 * Decide o que fica grande e o que fica na faixa.
 *  - Só a faixa ("bar"): clicar num vídeo abre ele em destaque (como sempre foi).
 *  - Sem ninguém na conversa (só o seu vídeo), no mapa, volta para a faixa: não cobre o mapa à toa.
 *  - Na Visualização Simplificada, "bar" vira Mosaico (é o jeito padrão dela).
 *  - Quem fica grande: os que você escolheu; depois, tela compartilhada por alguém, quem está
 *    falando, as outras pessoas e, por último, você.
 */
export function planStage(entries: LayoutEntry[], layout: VideoLayout, focus: string | null, focus2: string | null, simplified: boolean): StagePlan {
  const keys = entries.map((e) => e.key);
  const has = (k: string | null): k is string => Boolean(k && keys.includes(k));
  const inCall = entries.some((e) => e.key !== 'me:cam');
  let mode: VideoLayout = layout;
  if (mode === 'bar') mode = has(focus) ? 'spotlight' : simplified ? 'grid' : 'bar';
  if (!simplified && !inCall) mode = 'bar';
  if (!entries.length) mode = simplified ? 'grid' : 'bar';
  if (mode === 'bar') return { mode, main: [], strip: keys };
  if (mode === 'grid') return { mode, main: keys, strip: [] };

  const others = entries.filter((e) => !isMine(e.key));
  const order = uniq([
    ...[focus, focus2].filter(has),
    ...others.filter((e) => e.kind === 'screen').map((e) => e.key),
    ...others.filter((e) => e.speaking).map((e) => e.key),
    ...others.map((e) => e.key),
    ...keys,
  ]);
  const main = order.slice(0, mode === 'side' ? 2 : 1);
  return { mode, main, strip: keys.filter((k) => !main.includes(k)) };
}

/** Clique num vídeo pequeno: ele vai para o destaque (no Lado a lado, entra no lugar do mais antigo). */
export function pickTile(mode: VideoLayout, key: string, focus: string | null, main: string[]): { focus: string | null; focus2: string | null } {
  if (mode === 'side') {
    const keep = main.includes(focus ?? '') ? focus : (main[0] ?? null);
    return { focus: key, focus2: keep && keep !== key ? keep : null };
  }
  return { focus: key, focus2: null };
}

/**
 * Tamanho dos quadros para caberem todos num espaço W×H em 16:9, o maior possível.
 * `cols` força o número de colunas (Lado a lado sempre usa duas).
 */
export function fitTiles(W: number, H: number, n: number, gap: number, cols?: number): { cols: number; w: number; h: number } {
  let best = { cols: 1, w: 0, h: 0 };
  if (n <= 0 || W <= 0 || H <= 0) return best;
  const options = cols ? [Math.max(1, Math.min(cols, n))] : Array.from({ length: n }, (_, i) => i + 1);
  for (const c of options) {
    const rows = Math.ceil(n / c);
    const w = Math.floor(Math.min((W - gap * (c - 1)) / c, (((H - gap * (rows - 1)) / rows) * 16) / 9));
    if (w > best.w) best = { cols: c, w, h: Math.floor((w * 9) / 16) };
  }
  return best;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
