// SPDX-License-Identifier: AGPL-3.0-only
// Pixel art 32×32 desenhada por código (sem arquivos de imagem de terceiros).
import { Wall, type DayPeriod, type OfficeMap } from '@office-imp/shared';
import { makeCanvas } from './canvas';
import { isVoid } from './exterior';
import { FLOOR_COLOR, drawFloorTile } from './floors';
import { noise } from './prim';
import { WALL_MINI, wallCanvas, type WallNeighbors, type WallTile, type WindowKind } from './walls';

export { FLOOR_COLOR, WALL_MINI, makeCanvas, noise };
export type { WallNeighbors };

export type Ctx = CanvasRenderingContext2D;
export const T = 32;

export function r(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * Sombreado ADITIVO da arte antiga (soma `255 * amt` em cada canal e devolve `rgb()`).
 * A arte nova usa o `shade` de `prim.ts` (proporcional, devolve hex). Desde a Fase C3, só o
 * avatar usa este e o `r` acima: o boneco tem que sair pixel a pixel igual ao de antes do v2.
 */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export const WALL_COLOR = '#17181d';

/** Desenha o bloco (tx, ty) de um piso. O desenho vem do padrão contínuo de `floors.ts`. */
export function drawFloor(ctx: Ctx, id: number, ox: number, oy: number, tx: number, ty: number) {
  drawFloorTile(ctx, id, ox, oy, tx, ty);
}

export function isWallAt(map: OfficeMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return map.layers.walls[y * map.width + x] !== 0;
}

function wallId(map: OfficeMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  return map.layers.walls[y * map.width + x];
}

/**
 * Acabamento de um bloco de parede. A janela (`Wall.Window`) não tem acabamento próprio: adota o
 * da parede mais próxima na mesma fileira (esquerda, depois direita) ou coluna (cima, depois baixo),
 * passando por cima de outras janelas. Sem vizinha, fica com o da parede padrão.
 */
export function wallStyle(map: OfficeMap, x: number, y: number): number {
  const id = wallId(map, x, y);
  if (id !== Wall.Window) return id;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    for (let k = 1; k <= 24; k++) {
      const w = wallId(map, x + dx * k, y + dy * k);
      if (w === Wall.Window) continue;
      if (w !== 0 && w !== Wall.Glass) return w;
      break;
    }
  }
  return Wall.Wall;
}

/** Seguindo na direção (dx, dy) a partir da parede, chega-se ao exterior (vazio ou fora do mapa)? */
function exteriorBeyond(map: OfficeMap, x: number, y: number, dx: number, dy: number): boolean {
  for (let k = 1; k <= 4; k++) {
    const cx = x + dx * k;
    const cy = y + dy * k;
    if (isVoid(map, cx, cy)) return true;
    if (!isWallAt(map, cx, cy)) return false;
  }
  return false;
}

/** O que a janela em (x, y) mostra. `vertical` = trecho de parede que só mostra o topo. */
export function windowKind(map: OfficeMap, x: number, y: number, vertical: boolean): WindowKind {
  if (vertical) return exteriorBeyond(map, x, y, -1, 0) || exteriorBeyond(map, x, y, 1, 0) ? 'outside' : 'inner';
  if (exteriorBeyond(map, x, y, 0, -1)) return 'view';
  if (exteriorBeyond(map, x, y, 0, 1)) return 'outside';
  return 'inner';
}

/** Tudo o que o desenho de um bloco de parede precisa saber sobre a vizinhança. */
export function wallTileAt(map: OfficeMap, x: number, y: number, period: DayPeriod = 'day'): WallTile | null {
  const id = wallId(map, x, y);
  if (!id) return null;
  const below = isWallAt(map, x, y + 1);
  const left = isWallAt(map, x - 1, y);
  const right = isWallAt(map, x + 1, y);
  const isWindow = id === Wall.Window;
  return {
    style: wallStyle(map, x, y),
    n: { below, above: isWallAt(map, x, y - 1), left, right, leftFace: left && !isWallAt(map, x - 1, y + 1), rightFace: right && !isWallAt(map, x + 1, y + 1) },
    window: isWindow ? windowKind(map, x, y, below) : null,
    winLeft: isWindow && wallId(map, x - 1, y) === Wall.Window && !isWallAt(map, x - 1, y + 1),
    winRight: isWindow && wallId(map, x + 1, y) === Wall.Window && !isWallAt(map, x + 1, y + 1),
    variant: x & 3,
    period,
  };
}

/**
 * Desenha um trecho (em tiles) do chão e das paredes do mapa. Blocos sem piso nem parede ficam
 * transparentes (é onde o exterior aparece). `period` só muda a vista e o vidro das janelas externas.
 */
export function drawStatic(ctx: Ctx, map: OfficeMap, x0: number, y0: number, w: number, h: number, period: DayPeriod = 'day') {
  for (let ty = Math.max(0, y0); ty < Math.min(map.height, y0 + h); ty++) {
    for (let tx = Math.max(0, x0); tx < Math.min(map.width, x0 + w); tx++) {
      const i = ty * map.width + tx;
      const ox = (tx - x0) * T;
      const oy = (ty - y0) * T;
      const f = map.layers.floor[i];
      if (f) drawFloor(ctx, f, ox, oy, tx, ty);
      const wall = wallTileAt(map, tx, ty, period);
      if (wall) ctx.drawImage(wallCanvas(wall), ox, oy);
    }
  }
}

/** O mapa tem janela ou vidro cujo desenho muda com o período do dia? */
export function hasPeriodWalls(map: OfficeMap): boolean {
  return map.layers.walls.includes(Wall.Window);
}

/** Maior id de piso/parede que cabe na folha de tiles (16 colunas, o id 0 é vazio). */
const TILESET_COLS = 16;

/** Folhas de tiles (para a paleta do Mapmaker e para exportar ao Tiled). */
export function tilesetCanvas(kind: 'floor' | 'walls'): HTMLCanvasElement {
  const c = makeCanvas(TILESET_COLS * T, T);
  const ctx = c.getContext('2d')!;
  for (let id = 1; id < TILESET_COLS; id++) {
    if (kind === 'floor') drawFloor(ctx, id, (id - 1) * T, 0, id, 0);
    else if (WALL_MINI[id]) {
      const n = { below: false, above: false, left: true, right: true };
      ctx.drawImage(wallCanvas(id === Wall.Window ? { style: Wall.Wall, n, window: 'view', variant: 1 } : { style: id, n, variant: id }), (id - 1) * T, 0);
    }
  }
  return c;
}
