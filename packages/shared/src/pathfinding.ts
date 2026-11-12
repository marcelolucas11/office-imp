// SPDX-License-Identifier: AGPL-3.0-only
import type { Point } from './map';

/** A* em grade de 4 direções. `grid[y*width+x] === 1` significa bloqueado. */
export function findPath(
  grid: Uint8Array,
  width: number,
  height: number,
  from: Point,
  to: Point,
  maxNodes = 6000,
): Point[] | null {
  if (to.x < 0 || to.y < 0 || to.x >= width || to.y >= height) return null;
  if (grid[to.y * width + to.x] === 1) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open: { n: number; f: number }[] = [{ n: start, f: 0 }];
  const closed = new Set<number>();
  const h = (n: number) => Math.abs((n % width) - to.x) + Math.abs(Math.floor(n / width) - to.y);
  let visited = 0;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0].n;
    if (cur === goal) {
      const path: Point[] = [];
      let c = cur;
      while (c !== start) {
        path.push({ x: c % width, y: Math.floor(c / width) });
        c = came.get(c)!;
      }
      return path.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++visited > maxNodes) return null;
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    const nb = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (grid[n] === 1 || closed.has(n)) continue;
      const ng = g.get(cur)! + 1;
      if (ng < (g.get(n) ?? Infinity)) {
        g.set(n, ng);
        came.set(n, cur);
        open.push({ n, f: ng + h(n) });
      }
    }
  }
  return null;
}

/** Tiles alcançáveis a partir de um ponto (flood fill). */
export function floodFill(grid: Uint8Array, width: number, height: number, from: Point): Uint8Array {
  const seen = new Uint8Array(width * height);
  if (from.x < 0 || from.y < 0 || from.x >= width || from.y >= height) return seen;
  const stack = [from.y * width + from.x];
  if (grid[stack[0]] === 1) return seen;
  seen[stack[0]] = 1;
  while (stack.length) {
    const cur = stack.pop()!;
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    const nb = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (seen[n] || grid[n] === 1) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return seen;
}

/** Tile livre mais próximo de `target` (busca em anéis). */
export function nearestFree(grid: Uint8Array, width: number, height: number, target: Point, maxRadius = 6): Point | null {
  for (let r = 0; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = target.x + dx;
        const y = target.y + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (grid[y * width + x] === 0) return { x, y };
      }
    }
  }
  return null;
}
