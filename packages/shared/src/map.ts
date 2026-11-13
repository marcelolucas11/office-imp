// SPDX-License-Identifier: AGPL-3.0-only
// Formato do mapa do escritório. Estrutura inspirada no Tiled (camadas de
// tiles + grupos de objetos), com tiles de 32×32.

export const TILE = 32;
export const MAP_FORMAT_VERSION = 1;
export const MAX_MAP_SIZE = 300;

export const Floor = {
  None: 0,
  Wood: 1,
  WoodDark: 2,
  CarpetDark: 3,
  CarpetGold: 4,
  Tile: 5,
  Concrete: 6,
  Grass: 7,
  Kitchen: 8,
  Stage: 9,
  Corridor: 10,
} as const;

export const FLOOR_LABEL: Record<number, string> = {
  1: 'Madeira',
  2: 'Madeira escura',
  3: 'Carpete grafite',
  4: 'Carpete dourado',
  5: 'Piso claro',
  6: 'Concreto',
  7: 'Grama',
  8: 'Copa (xadrez)',
  9: 'Palco',
  10: 'Corredor',
};

export const Wall = {
  None: 0,
  Wall: 1,
  Window: 2,
  Dark: 3,
} as const;

export const WALL_LABEL: Record<number, string> = {
  1: 'Parede',
  2: 'Janela',
  3: 'Parede escura',
};

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Dir[] = ['down', 'left', 'right', 'up'];
export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type InteractKind = 'whiteboard' | 'website' | 'tv' | 'poster' | 'game' | 'note';
export type ObjectCategory = 'structure' | 'furniture' | 'decor' | 'interactive';

export interface ObjectDef {
  type: string;
  label: string;
  w: number;
  h: number;
  solid: boolean;
  category: ObjectCategory;
  interact?: InteractKind;
  /** Renderizado acima dos avatares (camada "acima do avatar"). */
  above?: boolean;
  /** Pode ter largura/altura por instância. */
  resizable?: boolean;
  /** Sprite mais alto que o footprint (em tiles a mais para cima). */
  tall?: number;
}

const defs: ObjectDef[] = [
  { type: 'desk', label: 'Mesa de trabalho', w: 2, h: 1, solid: true, category: 'structure', tall: 1 },
  { type: 'chair', label: 'Cadeira', w: 1, h: 1, solid: false, category: 'furniture' },
  { type: 'table', label: 'Mesa de reunião', w: 4, h: 2, solid: true, category: 'furniture', resizable: true },
  { type: 'table_round', label: 'Mesa redonda', w: 1, h: 1, solid: true, category: 'furniture' },
  { type: 'counter', label: 'Balcão', w: 2, h: 1, solid: true, category: 'furniture', resizable: true },
  { type: 'sofa', label: 'Sofá', w: 2, h: 1, solid: true, category: 'furniture' },
  { type: 'armchair', label: 'Poltrona', w: 1, h: 1, solid: false, category: 'furniture' },
  { type: 'bookshelf', label: 'Estante', w: 1, h: 1, solid: true, category: 'furniture', tall: 1 },
  { type: 'cabinet', label: 'Armário', w: 1, h: 1, solid: true, category: 'furniture' },
  { type: 'coffee', label: 'Máquina de café', w: 1, h: 1, solid: true, category: 'decor', tall: 1 },
  { type: 'cooler', label: 'Bebedouro', w: 1, h: 1, solid: true, category: 'decor', tall: 1 },
  { type: 'fridge', label: 'Geladeira', w: 1, h: 1, solid: true, category: 'decor', tall: 1 },
  { type: 'plant', label: 'Planta', w: 1, h: 1, solid: true, category: 'decor', tall: 1 },
  { type: 'plant_small', label: 'Vaso pequeno', w: 1, h: 1, solid: false, category: 'decor' },
  { type: 'lamp', label: 'Luminária', w: 1, h: 1, solid: false, category: 'decor', tall: 1 },
  { type: 'frame', label: 'Quadro decorativo', w: 1, h: 1, solid: false, category: 'decor' },
  { type: 'photo', label: 'Porta-retrato', w: 1, h: 1, solid: false, category: 'decor' },
  { type: 'trophy', label: 'Troféu', w: 1, h: 1, solid: false, category: 'decor' },
  { type: 'rug', label: 'Tapete', w: 3, h: 2, solid: false, category: 'decor', resizable: true },
  { type: 'rug_logo', label: 'Tapete com logo', w: 4, h: 2, solid: false, category: 'decor' },
  { type: 'podium', label: 'Púlpito', w: 1, h: 1, solid: false, category: 'decor' },
  { type: 'door', label: 'Porta', w: 1, h: 1, solid: false, category: 'structure' },
  { type: 'portal', label: 'Portal', w: 1, h: 1, solid: false, category: 'structure' },
  { type: 'whiteboard', label: 'Quadro branco', w: 2, h: 1, solid: true, category: 'interactive', interact: 'whiteboard', tall: 1 },
  { type: 'tv', label: 'TV (vídeo do YouTube)', w: 2, h: 1, solid: true, category: 'interactive', interact: 'tv', tall: 1 },
  { type: 'kiosk', label: 'Site incorporado', w: 1, h: 1, solid: true, category: 'interactive', interact: 'website', tall: 1 },
  { type: 'arcade', label: 'Jogo', w: 1, h: 1, solid: true, category: 'interactive', interact: 'game', tall: 1 },
  { type: 'poster', label: 'Pôster / imagem', w: 1, h: 1, solid: false, category: 'interactive', interact: 'poster' },
  { type: 'note', label: 'Nota / placa', w: 1, h: 1, solid: false, category: 'interactive', interact: 'note' },
];

export const OBJECT_DEFS: Record<string, ObjectDef> = Object.fromEntries(defs.map((d) => [d.type, d]));
export const OBJECT_TYPES = defs.map((d) => d.type);
/** Objetos que um funcionário pode colocar na própria mesa. */
export const DESK_DECOR_TYPES = ['plant_small', 'plant', 'lamp', 'frame', 'photo', 'trophy', 'note', 'poster'];
export const MAX_DESK_DECOR = 8;

export interface MapObject {
  id: string;
  type: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Direção (cadeiras, sofás). */
  dir?: Dir;
  props?: Record<string, any>;
  /** Decoração pertencente a uma mesa (colocada pelo dono da mesa). */
  ownerDeskId?: string;
}

export type AreaKind = 'private' | 'spotlight';

export interface MapArea {
  id: string;
  name: string;
  kind: AreaKind;
  /** Somente equipe: convidados não entram. */
  staffOnly: boolean;
  /** Sala dos sócios (informativo). */
  partners?: boolean;
  /** Sala de reunião: permite notas de reunião. */
  meeting?: boolean;
  /** Área de conversa de uma mesa de funcionário (gerada automaticamente a partir da mesa). */
  desk?: boolean;
  /** Mesa dona da área (quando `desk`). */
  deskId?: string;
  capacity: number;
  rects: Rect[];
}

export interface MapPortal {
  id: string;
  x: number;
  y: number;
  toX: number;
  toY: number;
}

export interface GeneratorMeta {
  version: number;
  corridorY: number;
  topX: number;
  bottomX: number;
  endX: number;
  roomHeight: number;
  counters: Record<string, number>;
}

export interface OfficeMap {
  version: number;
  width: number;
  height: number;
  tileSize: number;
  layers: { floor: number[]; walls: number[] };
  objects: MapObject[];
  areas: MapArea[];
  spawns: Point[];
  meta?: { gen?: GeneratorMeta };
}

export function emptyMap(width: number, height: number): OfficeMap {
  return {
    version: MAP_FORMAT_VERSION,
    width,
    height,
    tileSize: TILE,
    layers: { floor: new Array(width * height).fill(0), walls: new Array(width * height).fill(0) },
    objects: [],
    areas: [],
    spawns: [],
  };
}

export function idx(map: { width: number }, x: number, y: number): number {
  return y * map.width + x;
}

export function inBounds(map: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function objSize(o: MapObject): { w: number; h: number } {
  const def = OBJECT_DEFS[o.type];
  return { w: o.w ?? def?.w ?? 1, h: o.h ?? def?.h ?? 1 };
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Redimensiona o mapa mantendo as coordenadas existentes (cresce para leste/sul). */
export function resizeMap(map: OfficeMap, width: number, height: number): void {
  if (width === map.width && height === map.height) return;
  const floor = new Array(width * height).fill(0);
  const walls = new Array(width * height).fill(0);
  const w = Math.min(width, map.width);
  const h = Math.min(height, map.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      floor[y * width + x] = map.layers.floor[y * map.width + x];
      walls[y * width + x] = map.layers.walls[y * map.width + x];
    }
  }
  map.layers.floor = floor;
  map.layers.walls = walls;
  map.width = width;
  map.height = height;
}

/** Grade de colisão: 1 = bloqueado. */
export function buildCollision(map: OfficeMap): Uint8Array {
  const grid = new Uint8Array(map.width * map.height);
  for (let i = 0; i < grid.length; i++) {
    if (map.layers.walls[i] !== 0 || map.layers.floor[i] === 0) grid[i] = 1;
  }
  for (const o of map.objects) {
    const def = OBJECT_DEFS[o.type];
    if (!def?.solid) continue;
    const { w, h } = objSize(o);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const x = o.x + dx;
        const y = o.y + dy;
        if (inBounds(map, x, y)) grid[y * map.width + x] = 1;
      }
    }
  }
  return grid;
}

export function isBlocked(map: OfficeMap, grid: Uint8Array, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return true;
  return grid[y * map.width + x] === 1;
}

/** Índice de áreas por tile: para cada tile, o índice da área (ou -1). */
export interface AreaIndex {
  privateAt: Int16Array;
  spotlightAt: Uint8Array;
}

export function buildAreaIndex(map: OfficeMap): AreaIndex {
  const privateAt = new Int16Array(map.width * map.height).fill(-1);
  const spotlightAt = new Uint8Array(map.width * map.height);
  map.areas.forEach((a, i) => {
    for (const r of a.rects) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (!inBounds(map, x, y)) continue;
          if (a.kind === 'private') privateAt[y * map.width + x] = i;
          else spotlightAt[y * map.width + x] = 1;
        }
      }
    }
  });
  return { privateAt, spotlightAt };
}

export function privateAreaAt(map: OfficeMap, index: AreaIndex, x: number, y: number): MapArea | null {
  if (!inBounds(map, x, y)) return null;
  const i = index.privateAt[y * map.width + x];
  return i >= 0 ? map.areas[i] : null;
}

export function isSpotlightAt(map: OfficeMap, index: AreaIndex, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  return index.spotlightAt[y * map.width + x] === 1;
}

export function areaCenter(area: MapArea): Point {
  const r = area.rects[0];
  if (!r) return { x: 0, y: 0 };
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

/** Mesas atribuíveis presentes no mapa. */
export function mapDesks(map: OfficeMap): MapObject[] {
  return map.objects.filter((o) => o.type === 'desk');
}

/** Zona de decoração de uma mesa (onde o dono pode colocar objetos). */
export function deskZone(desk: MapObject): Rect {
  const z = desk.props?.zone as Rect | undefined;
  if (z) return z;
  return { x: desk.x, y: desk.y, w: 3, h: 2 };
}

/** Tile onde a pessoa fica ao "ir para a mesa". */
export function deskSeat(desk: MapObject): Point {
  const s = desk.props?.seat as Point | undefined;
  return s ?? { x: desk.x, y: desk.y + 1 };
}

/** Prefixo dos ids das áreas de mesa, que são derivadas das mesas e nunca gravadas no mapa. */
export const DESK_AREA_PREFIX = 'desk:';
/** Lugares na área de uma mesa: a cadeira + 3 em volta. */
export const DESK_AREA_CAPACITY = 4;

export function isDerivedArea(a: MapArea): boolean {
  return a.id.startsWith(DESK_AREA_PREFIX);
}

/** Remove as áreas derivadas (antes de gravar ou editar o mapa). */
export function stripDerivedAreas(map: OfficeMap): OfficeMap {
  if (!map.areas.some(isDerivedArea)) return map;
  return { ...map, areas: map.areas.filter((a) => !isDerivedArea(a)) };
}

/**
 * Área de conversa de cada mesa: um quadrado de 2×2 tiles (4 lugares) que inclui a cadeira.
 * Quem chega na mesa entra numa conversa privada com quem estiver nesses 4 tiles.
 * Mesas dentro de salas privadas (sócios) não ganham área própria: a sala já cumpre esse papel.
 */
export function deskAreas(map: OfficeMap): MapArea[] {
  const base = map.areas.filter((a) => !isDerivedArea(a) && a.kind === 'private');
  const grid = buildCollision(map);
  const taken: Rect[] = base.flatMap((a) => a.rects);
  const out: MapArea[] = [];
  let n = 0;
  for (const desk of mapDesks(map)) {
    n++;
    const seat = deskSeat(desk);
    const custom = desk.props?.area as Rect | undefined;
    const candidates: Rect[] = custom
      ? [custom]
      : [
          { x: seat.x, y: seat.y, w: 2, h: 2 },
          { x: seat.x - 1, y: seat.y, w: 2, h: 2 },
          { x: seat.x, y: seat.y - 1, w: 2, h: 2 },
          { x: seat.x - 1, y: seat.y - 1, w: 2, h: 2 },
        ];
    let best: Rect | null = null;
    let bestScore = 1;
    for (const r of candidates) {
      if (r.x < 0 || r.y < 0 || r.x + r.w > map.width || r.y + r.h > map.height) continue;
      if (taken.some((t) => rectsOverlap(t, r))) continue;
      let score = 0;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (grid[y * map.width + x] === 0) score++;
      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
      if (score === r.w * r.h) break;
    }
    if (!best) continue;
    taken.push(best);
    out.push({ id: `${DESK_AREA_PREFIX}${desk.id}`, name: `Mesa ${n}`, kind: 'private', staffOnly: false, desk: true, deskId: desk.id, capacity: DESK_AREA_CAPACITY, rects: [best] });
  }
  return out;
}

/** Mapa com as áreas das mesas recalculadas (usar depois de carregar o mapa). */
export function withDeskAreas(map: OfficeMap): OfficeMap {
  const clean = stripDerivedAreas(map);
  return { ...clean, areas: [...clean.areas, ...deskAreas(clean)] };
}

/** Junta tiles soltos em retângulos por linha (usado ao pintar áreas no Mapmaker). */
export function tilesToRects(tiles: Point[]): Rect[] {
  const byRow = new Map<number, number[]>();
  for (const t of tiles) {
    if (!byRow.has(t.y)) byRow.set(t.y, []);
    byRow.get(t.y)!.push(t.x);
  }
  const rects: Rect[] = [];
  for (const [y, xs] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...new Set(xs)].sort((a, b) => a - b);
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const x = sorted[i];
      if (x === prev + 1) {
        prev = x;
        continue;
      }
      rects.push({ x: start, y, w: prev - start + 1, h: 1 });
      start = x;
      prev = x;
    }
  }
  // mescla verticalmente retângulos idênticos em linhas consecutivas
  const merged: Rect[] = [];
  for (const r of rects) {
    const m = merged.find((o) => o.x === r.x && o.w === r.w && o.y + o.h === r.y);
    if (m) m.h += 1;
    else merged.push({ ...r });
  }
  return merged;
}

export function rectsToTiles(rects: Rect[]): Point[] {
  const out: Point[] = [];
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y });
  return out;
}

/** Validação estrutural básica de um mapa recebido do cliente. */
export function validateMapShape(m: any): string | null {
  if (!m || typeof m !== 'object') return 'mapa inválido';
  if (!Number.isInteger(m.width) || !Number.isInteger(m.height)) return 'dimensões inválidas';
  if (m.width < 5 || m.height < 5 || m.width > MAX_MAP_SIZE || m.height > MAX_MAP_SIZE) return 'tamanho fora dos limites';
  const n = m.width * m.height;
  if (!Array.isArray(m.layers?.floor) || m.layers.floor.length !== n) return 'camada de chão inválida';
  if (!Array.isArray(m.layers?.walls) || m.layers.walls.length !== n) return 'camada de paredes inválida';
  if (!Array.isArray(m.objects) || !Array.isArray(m.areas) || !Array.isArray(m.spawns)) return 'listas ausentes';
  if (m.objects.length > 5000) return 'objetos demais';
  const ids = new Set<string>();
  for (const o of m.objects) {
    if (typeof o?.id !== 'string' || typeof o?.type !== 'string') return 'objeto inválido';
    if (!OBJECT_DEFS[o.type]) return `tipo de objeto desconhecido: ${o.type}`;
    if (!Number.isInteger(o.x) || !Number.isInteger(o.y)) return 'posição de objeto inválida';
    if (ids.has(o.id)) return 'id de objeto duplicado';
    ids.add(o.id);
  }
  const areaIds = new Set<string>();
  for (const a of m.areas) {
    if (typeof a?.id !== 'string' || typeof a?.name !== 'string') return 'área inválida';
    if (a.kind !== 'private' && a.kind !== 'spotlight') return 'tipo de área inválido';
    if (!Array.isArray(a.rects)) return 'área sem retângulos';
    if (areaIds.has(a.id)) return 'id de área duplicado';
    areaIds.add(a.id);
  }
  if (m.spawns.length === 0) return 'o mapa precisa de pelo menos um ponto de entrada (spawn)';
  return null;
}
