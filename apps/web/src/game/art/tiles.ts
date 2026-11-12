// SPDX-License-Identifier: AGPL-3.0-only
// Pixel art 32×32 desenhada por código (sem arquivos de imagem de terceiros).
import { Floor, Wall, type OfficeMap } from '@office-imp/shared';

export type Ctx = CanvasRenderingContext2D;
export const T = 32;

export function r(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Ruído determinístico 0..1 por coordenada. */
export function noise(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export const FLOOR_COLOR: Record<number, string> = {
  [Floor.Wood]: '#b98b5e',
  [Floor.WoodDark]: '#6f4e37',
  [Floor.CarpetDark]: '#2e3038',
  [Floor.CarpetGold]: '#a88c4c',
  [Floor.Tile]: '#d9d6cf',
  [Floor.Concrete]: '#8d8f94',
  [Floor.Grass]: '#5a9a4a',
  [Floor.Kitchen]: '#e4e0d8',
  [Floor.Stage]: '#5b3a29',
  [Floor.Corridor]: '#3a3d47',
};
export const WALL_COLOR = '#17181d';

function planks(ctx: Ctx, ox: number, oy: number, tx: number, ty: number, base: string) {
  r(ctx, ox, oy, T, T, base);
  for (let row = 0; row < 4; row++) {
    const y = oy + row * 8;
    r(ctx, ox, y + 7, T, 1, shade(base, -0.1));
    const off = Math.floor(noise(tx, ty * 4 + row, 3) * 28) + 2;
    r(ctx, ox + off, y, 1, 7, shade(base, -0.08));
    if (noise(tx, ty * 4 + row, 9) > 0.6) r(ctx, ox + ((off + 9) % 28), y + 3, 5, 1, shade(base, 0.05));
  }
}

function speckle(ctx: Ctx, ox: number, oy: number, tx: number, ty: number, base: string, strength: number) {
  r(ctx, ox, oy, T, T, base);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(noise(tx * 31 + i, ty * 17, 1) * 16) * 2;
    const y = Math.floor(noise(tx * 13, ty * 29 + i, 2) * 16) * 2;
    r(ctx, ox + x, oy + y, 2, 2, shade(base, noise(i, tx + ty, 5) > 0.5 ? strength : -strength));
  }
}

export function drawFloor(ctx: Ctx, id: number, ox: number, oy: number, tx: number, ty: number) {
  const base = FLOOR_COLOR[id];
  if (!base) return;
  switch (id) {
    case Floor.Wood:
    case Floor.WoodDark:
      planks(ctx, ox, oy, tx, ty, base);
      break;
    case Floor.Stage:
      planks(ctx, ox, oy, tx, ty, base);
      r(ctx, ox, oy, T, 1, '#d7b870');
      break;
    case Floor.CarpetDark:
    case Floor.Corridor:
      speckle(ctx, ox, oy, tx, ty, base, 0.025);
      break;
    case Floor.CarpetGold:
      speckle(ctx, ox, oy, tx, ty, base, 0.04);
      if ((tx + ty) % 2 === 0) r(ctx, ox + 14, oy + 14, 4, 4, shade(base, 0.08));
      break;
    case Floor.Tile:
      r(ctx, ox, oy, T, T, base);
      r(ctx, ox, oy + T - 1, T, 1, shade(base, -0.1));
      r(ctx, ox + T - 1, oy, 1, T, shade(base, -0.1));
      r(ctx, ox, oy, T, 1, shade(base, 0.05));
      break;
    case Floor.Concrete:
      speckle(ctx, ox, oy, tx, ty, base, 0.03);
      break;
    case Floor.Grass:
      speckle(ctx, ox, oy, tx, ty, base, 0.06);
      break;
    case Floor.Kitchen:
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) r(ctx, ox + i * 16, oy + j * 16, 16, 16, (i + j) % 2 === 0 ? base : '#c4bfb4');
      break;
  }
}

export interface WallNeighbors {
  below: boolean;
  above: boolean;
  left: boolean;
  right: boolean;
}

export function drawWall(ctx: Ctx, id: number, ox: number, oy: number, n: WallNeighbors) {
  const cap = id === Wall.Dark ? '#0f1014' : '#17181d';
  const edge = '#30323c';
  const face = id === Wall.Dark ? '#2a2c35' : '#3d404c';
  if (n.below) {
    // trecho vertical: só o topo da parede
    r(ctx, ox, oy, T, T, cap);
    if (!n.left) r(ctx, ox, oy, 2, T, edge);
    if (!n.right) r(ctx, ox + T - 2, oy, 2, T, edge);
    if (!n.above) r(ctx, ox, oy, T, 2, edge);
    return;
  }
  // face frontal visível
  r(ctx, ox, oy, T, 12, cap);
  if (!n.above) r(ctx, ox, oy, T, 2, edge);
  if (!n.left) r(ctx, ox, oy, 2, 12, edge);
  if (!n.right) r(ctx, ox + T - 2, oy, 2, 12, edge);
  r(ctx, ox, oy + 12, T, 20, face);
  r(ctx, ox, oy + 12, T, 1, shade(face, 0.12));
  r(ctx, ox, oy + 28, T, 2, '#b0914b');
  r(ctx, ox, oy + 30, T, 2, shade(face, -0.12));
  if (id === Wall.Window) {
    r(ctx, ox + 4, oy + 14, 24, 12, '#22242b');
    r(ctx, ox + 5, oy + 15, 22, 10, '#7fb7d9');
    r(ctx, ox + 5, oy + 15, 22, 3, '#a9d4ec');
    r(ctx, ox + 15, oy + 15, 2, 10, '#22242b');
    r(ctx, ox + 8, oy + 18, 3, 1, '#e8f4fb');
  }
}

export function isWallAt(map: OfficeMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return map.layers.walls[y * map.width + x] !== 0;
}

/** Desenha um trecho (em tiles) do chão e das paredes do mapa. */
export function drawStatic(ctx: Ctx, map: OfficeMap, x0: number, y0: number, w: number, h: number) {
  for (let ty = y0; ty < Math.min(map.height, y0 + h); ty++) {
    for (let tx = x0; tx < Math.min(map.width, x0 + w); tx++) {
      const i = ty * map.width + tx;
      const ox = (tx - x0) * T;
      const oy = (ty - y0) * T;
      const f = map.layers.floor[i];
      if (f) drawFloor(ctx, f, ox, oy, tx, ty);
      const wl = map.layers.walls[i];
      if (wl) drawWall(ctx, wl, ox, oy, { below: isWallAt(map, tx, ty + 1), above: isWallAt(map, tx, ty - 1), left: isWallAt(map, tx - 1, ty), right: isWallAt(map, tx + 1, ty) });
    }
  }
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return c;
}

/** Folhas de tiles (para a paleta do Mapmaker e para exportar ao Tiled). */
export function tilesetCanvas(kind: 'floor' | 'walls'): HTMLCanvasElement {
  const c = makeCanvas(16 * T, T);
  const ctx = c.getContext('2d')!;
  for (let id = 1; id <= 15; id++) {
    if (kind === 'floor') drawFloor(ctx, id, (id - 1) * T, 0, id, 0);
    else if (id <= 3) drawWall(ctx, id, (id - 1) * T, 0, { below: false, above: false, left: true, right: true });
  }
  return c;
}
