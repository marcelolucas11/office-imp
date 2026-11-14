// SPDX-License-Identifier: AGPL-3.0-only
import { OBJECT_DEFS, objColor, objSetup, objSize, objText, type MapObject } from '@office-imp/shared';
import { APPLIANCES } from './appliances';
import { CHAIRS } from './chairs';
import { DESK_ITEMS } from './deskitems';
import { DESKS } from './desks';
import { EXTRAS } from './extras';
import { FURNITURE } from './furniture';
import { PLANTS } from './plants';
import { Sprite } from './prim';
import { SEATING } from './seating';
import type { SpritePainter } from './sprites';
import { T, makeCanvas, r, shade, type Ctx } from './tiles';

const GOLD = '#d7b870';

/** Desenho antigo (retângulos direto no canvas). Vai sumindo conforme os tipos migram para `SpritePainter`. */
type Painter = (ctx: Ctx, w: number, h: number, top: number, o: MapObject) => void;

/** Desenhos do visual v2 (primitivas de `prim.ts`). Têm prioridade sobre os antigos. */
const spritePainters: Record<string, SpritePainter> = { ...SEATING, ...CHAIRS, ...DESKS, ...DESK_ITEMS, ...EXTRAS, ...PLANTS, ...FURNITURE, ...APPLIANCES };

/** Tipos já redesenhados no visual v2 (os outros ainda usam o desenho antigo, até a Fase C3). */
export const REDESIGNED_TYPES = Object.keys(spritePainters);

const painters: Record<string, Painter> = {
  door(ctx, _w, _h, top) {
    r(ctx, 0, top, 3, T, '#5b3a29');
    r(ctx, T - 3, top, 3, T, '#5b3a29');
    r(ctx, 3, top, 4, T, '#8a5a3a');
    r(ctx, 3, top + 14, 3, 3, GOLD);
  },
  portal(ctx, _w, _h, top) {
    const rings = ['#0e7490', '#22d3ee', '#a5f3fc'];
    rings.forEach((c, i) => {
      const s = 26 - i * 8;
      r(ctx, 16 - s / 2, top + 16 - s / 4, s, s / 2, c);
    });
    r(ctx, 14, top + 14, 4, 4, '#ffffff');
  },
  whiteboard(ctx, w, _h, top) {
    const y = top - 24;
    r(ctx, 2, y + 2, w - 4, 38, '#9ca3af');
    r(ctx, 4, y + 4, w - 8, 34, '#f9fafb');
    r(ctx, 8, y + 9, 22, 2, '#2563eb');
    r(ctx, 8, y + 14, 30, 2, '#111827');
    r(ctx, 8, y + 19, 16, 2, '#111827');
    r(ctx, 36, y + 22, 18, 10, '#fecaca');
    r(ctx, 38, y + 24, 14, 1, '#dc2626');
    r(ctx, 10, y + 26, 8, 8, GOLD);
    r(ctx, 6, y + 40, w - 12, 3, '#6b7280');
    r(ctx, 8, y + 43, 3, 11, '#4b5563');
    r(ctx, w - 11, y + 43, 3, 11, '#4b5563');
  },
  tv(ctx, w, _h, top) {
    const y = top - 24;
    r(ctx, 2, y + 2, w - 4, 36, '#0b0c0f');
    r(ctx, 4, y + 4, w - 8, 32, '#1e293b');
    r(ctx, 4, y + 4, w - 8, 10, '#273449');
    // ícone de play
    for (let i = 0; i < 7; i++) r(ctx, w / 2 - 5 + i, y + 13 + i, 2, 14 - i * 2, '#f87171');
    r(ctx, w / 2 - 3, y + 38, 6, 8, '#111318');
    r(ctx, w / 2 - 12, y + 46, 24, 4, '#111318');
    r(ctx, 6, y + 46, w - 12, 8, '#3f3f46');
    r(ctx, 6, y + 46, w - 12, 1, '#52525b');
  },
  kiosk(ctx, _w, _h, top) {
    const y = top - 20;
    r(ctx, 5, y + 2, 22, 20, '#111318');
    r(ctx, 7, y + 4, 18, 16, '#0ea5e9');
    r(ctx, 12, y + 7, 8, 10, '#bae6fd');
    r(ctx, 15, y + 7, 2, 10, '#0369a1');
    r(ctx, 12, y + 11, 8, 2, '#0369a1');
    r(ctx, 13, y + 22, 6, 18, '#3f3f46');
    r(ctx, 8, y + 40, 16, 8, '#27272a');
  },
  arcade(ctx, _w, _h, top) {
    const y = top - 24;
    r(ctx, 5, y + 2, 22, 52, '#3b0764');
    r(ctx, 5, y + 2, 22, 6, '#facc15');
    r(ctx, 7, y + 10, 18, 14, '#0b0c0f');
    r(ctx, 9, y + 12, 5, 4, '#22c55e');
    r(ctx, 17, y + 17, 5, 4, '#ef4444');
    r(ctx, 5, y + 26, 22, 8, '#581c87');
    r(ctx, 10, y + 27, 2, 5, '#e5e7eb');
    r(ctx, 9, y + 26, 4, 2, '#ef4444');
    r(ctx, 18, y + 29, 3, 3, '#3b82f6');
    r(ctx, 22, y + 28, 3, 3, '#facc15');
    r(ctx, 5, y + 50, 22, 4, '#1e0535');
  },
  poster(ctx, _w, _h, top) {
    r(ctx, 6, top + 3, 20, 26, '#1f2937');
    r(ctx, 8, top + 5, 16, 22, '#fef3c7');
    r(ctx, 10, top + 7, 12, 8, '#f97316');
    r(ctx, 10, top + 17, 12, 2, '#374151');
    r(ctx, 10, top + 21, 8, 2, '#374151');
  },
  note(ctx, _w, _h, top) {
    r(ctx, 15, top + 16, 2, 12, '#57534e');
    r(ctx, 7, top + 4, 18, 14, '#fde68a');
    r(ctx, 7, top + 4, 18, 2, '#facc15');
    r(ctx, 10, top + 9, 12, 1, '#78716c');
    r(ctx, 10, top + 12, 9, 1, '#78716c');
    r(ctx, 10, top + 15, 11, 1, '#78716c');
  },
};

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Chave do cache de sprite: tipo + tamanho + direção + cor + setup + texto. O padrão e a ausência
 * dão a mesma chave (cor padrão = sem cor; setup padrão = sem setup; texto padrão = sem texto).
 */
export function objectKey(o: MapObject): string {
  const { w, h } = objSize(o);
  const base = `${o.type}:${w}x${h}:${o.dir ?? ''}:${objColor(o)?.id ?? ''}`;
  const setup = objSetup(o);
  const text = objText(o);
  return `${base}${setup ? `:${setup.id}` : ''}${text === null ? '' : `:${text}`}`;
}

/** Sprite do objeto. A altura inclui a parte "alta" (tall) acima do footprint. */
export function objectSprite(o: MapObject): HTMLCanvasElement {
  const key = objectKey(o);
  const hit = cache.get(key);
  if (hit) return hit;
  const def = OBJECT_DEFS[o.type];
  const { w, h } = objSize(o);
  const tall = def?.tall ?? 0;
  let c: HTMLCanvasElement;
  const paintSprite = spritePainters[o.type];
  if (paintSprite) {
    const s = new Sprite(w * T, (h + tall) * T);
    paintSprite(s, { o, w: w * T, h: h * T, top: tall * T, color: objColor(o), setup: objSetup(o), text: objText(o) });
    c = s.toCanvas();
  } else {
    c = makeCanvas(w * T, (h + tall) * T);
    const ctx = c.getContext('2d')!;
    const paint = painters[o.type];
    if (paint) paint(ctx, w * T, h, tall * T, o);
    // tipo sem desenho: um bloco na cor da variante (ou magenta), para não sumir do mapa
    else r(ctx, 4, tall * T + 4, w * T - 8, h * T - 8, objColor(o)?.hex ?? '#be185d');
  }
  cache.set(key, c);
  return c;
}

let closedDoor: HTMLCanvasElement | null = null;

/** Porta fechada: folha de madeira inteira no vão, com maçaneta dourada. */
export function doorClosedSprite(): HTMLCanvasElement {
  if (closedDoor) return closedDoor;
  const c = makeCanvas(T, T);
  const ctx = c.getContext('2d')!;
  r(ctx, 0, 0, 3, T, '#5b3a29');
  r(ctx, T - 3, 0, 3, T, '#5b3a29');
  r(ctx, 3, 0, T - 6, T, '#8a5a3a');
  r(ctx, 3, 0, T - 6, 2, shade('#8a5a3a', 0.15));
  r(ctx, 3, T - 3, T - 6, 3, shade('#8a5a3a', -0.25));
  r(ctx, 6, 4, T - 12, 10, shade('#8a5a3a', -0.1));
  r(ctx, 6, 17, T - 12, 10, shade('#8a5a3a', -0.1));
  r(ctx, T - 9, 14, 3, 3, GOLD);
  closedDoor = c;
  return c;
}

export function objectTall(type: string): number {
  return OBJECT_DEFS[type]?.tall ?? 0;
}

/** Ícone do objeto (paleta do Mapmaker e da Build Tool). `color` e `setup` = ids das variantes (opcionais). */
export function objectIcon(type: string, color?: string, setup?: string): string {
  const sprite = objectSprite({ id: 'icon', type, x: 0, y: 0, color, setup });
  const c = makeCanvas(40, 40);
  const ctx = c.getContext('2d')!;
  const scale = Math.min(40 / sprite.width, 40 / sprite.height, 1.25);
  const dw = sprite.width * scale;
  const dh = sprite.height * scale;
  ctx.drawImage(sprite, (40 - dw) / 2, (40 - dh) / 2, dw, dh);
  return c.toDataURL();
}
