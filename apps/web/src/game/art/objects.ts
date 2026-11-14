// SPDX-License-Identifier: AGPL-3.0-only
import { OBJECT_DEFS, TILE, objColor, objSetup, objSize, objText, type MapObject } from '@office-imp/shared';
import { APPLIANCES } from './appliances';
import { makeCanvas } from './canvas';
import { CHAIRS } from './chairs';
import { DESK_ITEMS } from './deskitems';
import { DESKS } from './desks';
import { EXTRAS } from './extras';
import { FURNITURE } from './furniture';
import { INTERACTIVE } from './interactive';
import { PLANTS } from './plants';
import { Sprite } from './prim';
import { SEATING } from './seating';
import type { PaintInfo, SpritePainter } from './sprites';
import { STRUCTURE, paintDoorClosed } from './structure';

const T = TILE;

/**
 * Desenho de cada tipo (visual v2, primitivas de `prim.ts`). Desde a Fase C3 é o único caminho:
 * a arte antiga (retângulos direto no canvas) saiu, e um teste cobra que todo tipo de
 * `OBJECT_DEFS` esteja aqui.
 */
const spritePainters: Record<string, SpritePainter> = {
  ...SEATING,
  ...CHAIRS,
  ...DESKS,
  ...DESK_ITEMS,
  ...EXTRAS,
  ...PLANTS,
  ...FURNITURE,
  ...APPLIANCES,
  ...INTERACTIVE,
  ...STRUCTURE,
};

/** Tipos com desenho do visual v2 (desde a Fase C3, todos os do catálogo). */
export const REDESIGNED_TYPES = Object.keys(spritePainters);

/** Tipo sem desenho (só um tipo novo esquecido): um bloco na cor da variante, contornado, para não sumir do mapa. */
const fallback: SpritePainter = (s, info) => {
  s.piece((p) => p.rect(4, info.top + 4, info.w - 8, info.h - 8, info.color?.hex ?? '#be185d'));
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
  const s = new Sprite(w * T, (h + tall) * T);
  const info: PaintInfo = { o, w: w * T, h: h * T, top: tall * T, color: objColor(o), setup: objSetup(o), text: objText(o) };
  (spritePainters[o.type] ?? fallback)(s, info);
  const c = s.toCanvas();
  cache.set(key, c);
  return c;
}

/** Chave (e nome da textura na cena) da porta fechada: uma por variante de cor. */
export function doorClosedKey(o: Pick<MapObject, 'color'> = {}): string {
  return `door:closed:${objColor({ type: 'door', color: o.color })?.id ?? ''}`;
}

/** Porta fechada: a folha inteira no vão, na cor da porta. Não é um tipo de objeto; a cena troca a textura. */
export function doorClosedSprite(o: Pick<MapObject, 'color'> = {}): HTMLCanvasElement {
  const key = doorClosedKey(o);
  const hit = cache.get(key);
  if (hit) return hit;
  const s = new Sprite(T, T);
  const door: MapObject = { id: 'door', type: 'door', x: 0, y: 0, color: o.color };
  paintDoorClosed(s, { o: door, w: T, h: T, top: 0, color: objColor(door), setup: null, text: null });
  const c = s.toCanvas();
  cache.set(key, c);
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
