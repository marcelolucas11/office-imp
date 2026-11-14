// SPDX-License-Identifier: AGPL-3.0-only
import {
  MAX_MAP_SIZE,
  OBJECT_DEFS,
  buildCollision,
  deskSeat,
  floodFill,
  mapDesks,
  objSize,
  objectGroup,
  rectsOverlap,
  validateMapShape,
  type OfficeMap,
} from '@office-imp/shared';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  desks: number;
}

/** Validação completa de um mapa antes de publicar. */
export function validateOffice(map: OfficeMap): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const shape = validateMapShape(map);
  if (shape) return { ok: false, errors: [shape], warnings, desks: 0 };
  if (map.width > MAX_MAP_SIZE || map.height > MAX_MAP_SIZE) errors.push('O mapa excede o tamanho máximo.');

  const grid = buildCollision(map);
  const spawn = map.spawns.find((s) => s.x >= 0 && s.y >= 0 && s.x < map.width && s.y < map.height && grid[s.y * map.width + s.x] === 0);
  if (!spawn) {
    errors.push('Nenhum ponto de entrada (spawn) está em um tile andável.');
    return { ok: false, errors, warnings, desks: mapDesks(map).length };
  }
  for (const s of map.spawns) {
    if (s.x < 0 || s.y < 0 || s.x >= map.width || s.y >= map.height || grid[s.y * map.width + s.x] === 1) warnings.push(`Ponto de entrada bloqueado em (${s.x}, ${s.y}).`);
  }
  const reach = floodFill(grid, map.width, map.height, spawn);

  for (const o of map.objects) {
    const { w, h } = objSize(o);
    if (o.x < 0 || o.y < 0 || o.x + w > map.width || o.y + h > map.height) errors.push(`Objeto "${OBJECT_DEFS[o.type]?.label ?? o.type}" fora do mapa.`);
  }

  for (const d of mapDesks(map)) {
    const seat = deskSeat(d);
    const ok = [seat, { x: seat.x + 1, y: seat.y }, { x: d.x, y: d.y - 1 }, { x: d.x + 1, y: d.y - 1 }, { x: d.x - 1, y: d.y }, { x: d.x + 2, y: d.y }].some(
      (p) => p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height && reach[p.y * map.width + p.x] === 1,
    );
    if (!ok) errors.push(`A mesa ${d.id} não é alcançável a partir da entrada.`);
  }

  const privates = map.areas.filter((a) => a.kind === 'private');
  for (const a of map.areas) {
    if (!a.rects.length) {
      errors.push(`A área "${a.name}" está vazia.`);
      continue;
    }
    let reachable = false;
    for (const r of a.rects) {
      for (let y = r.y; y < r.y + r.h && !reachable; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (x >= 0 && y >= 0 && x < map.width && y < map.height && reach[y * map.width + x] === 1) {
            reachable = true;
            break;
          }
        }
      }
    }
    if (!reachable) errors.push(`A área "${a.name}" não é alcançável a partir da entrada.`);
    if (a.capacity < 1) errors.push(`A área "${a.name}" precisa de capacidade maior que zero.`);
  }
  for (let i = 0; i < privates.length; i++) {
    for (let j = i + 1; j < privates.length; j++) {
      if (privates[i].rects.some((r) => privates[j].rects.some((q) => rectsOverlap(r, q)))) {
        errors.push(`As áreas privadas "${privates[i].name}" e "${privates[j].name}" se sobrepõem.`);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings, desks: mapDesks(map).length };
}

/** Desenho em texto do mapa (depuração e testes). */
export function renderAscii(map: OfficeMap): string {
  const rows: string[][] = [];
  for (let y = 0; y < map.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      row.push(map.layers.walls[i] === 2 ? '=' : map.layers.walls[i] ? '#' : map.layers.floor[i] ? '.' : ' ');
    }
    rows.push(row);
  }
  for (const a of map.areas) for (const r of a.rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (rows[y]?.[x] === '.') rows[y][x] = a.kind === 'private' ? ':' : '*';
  const sym: Record<string, string> = { desk: 'D', chair: 'c', table: 'T', table_round: 'o', door: '+', plant: 'p', sofa: 's', whiteboard: 'W', tv: 'V' };
  for (const o of map.objects) {
    const { w, h } = objSize(o);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (rows[o.y + dy]?.[o.x + dx] !== undefined) rows[o.y + dy][o.x + dx] = sym[o.type] ?? (objectGroup(o.type) === 'plants' ? 'p' : 'x');
  }
  for (const s of map.spawns) if (rows[s.y]?.[s.x] !== undefined) rows[s.y][s.x] = '@';
  return rows.map((r) => r.join('')).join('\n');
}
