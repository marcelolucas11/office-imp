// SPDX-License-Identifier: AGPL-3.0-only
import {
  DESKS_PER_BLOCK,
  Floor,
  Wall,
  MAX_MAP_SIZE,
  buildCollision,
  emptyMap,
  floodFill,
  mapDesks,
  resizeMap,
  type GeneratorMeta,
  type MapArea,
  type OfficeMap,
  type WizardInput,
} from '@office-imp/shared';
import { AREA_NAMES, CORRIDOR_H, ROOM_H, buildChunk, type Chunk, type ModuleSpec, type Side } from './modules';

export const MAX_CUSTOM_EMPLOYEES = 100;
export const MAX_PARTNERS = 10;

export function employeesForInput(input: Pick<WizardInput, 'size' | 'customCount'>): number {
  if (input.size === 'small') return 10;
  if (input.size === 'medium') return 21;
  return Math.max(1, Math.min(MAX_CUSTOM_EMPLOYEES, Math.floor(input.customCount ?? 1)));
}

/** Lista de módulos de um escritório novo, conforme a tabela do wizard. */
export function modulesForInput(input: WizardInput): ModuleSpec[] {
  const n = employeesForInput(input);
  const partners = Math.max(0, Math.min(MAX_PARTNERS, Math.floor(input.partners || 0)));
  const deskBlocks = Math.ceil(n / DESKS_PER_BLOCK);
  const meetings = input.size === 'small' ? 1 : input.size === 'medium' ? 2 : Math.ceil(n / 10);
  const lounges = input.size === 'custom' ? 1 + Math.floor(n / 25) : 1;
  const auditorium = input.size === 'medium' || (input.size === 'custom' && n > 10);

  const mods: ModuleSpec[] = [{ kind: 'reception', officeName: input.name }];
  if (partners > 0) {
    if (input.partnersShareRoom) mods.push({ kind: 'partnersShared', count: partners });
    else for (let i = 0; i < partners; i++) mods.push({ kind: 'partnerSolo' });
  }
  // intercala blocos de mesas com salas de reunião e copas para ninguém ficar longe de uma sala
  const rest: ModuleSpec[] = [];
  let m = meetings;
  let l = lounges;
  for (let i = 0; i < deskBlocks; i++) {
    rest.push({ kind: 'desks' });
    if (i % 2 === 0 && m > 0) {
      rest.push({ kind: 'meeting' });
      m--;
    } else if (i % 2 === 1 && l > 0) {
      rest.push({ kind: 'lounge' });
      l--;
    }
  }
  while (m-- > 0) rest.push({ kind: 'meeting' });
  while (l-- > 0) rest.push({ kind: 'lounge' });
  mods.push(...rest);
  if (auditorium) mods.push({ kind: 'auditorium' });
  return mods;
}

function nextId(gen: GeneratorMeta, key: string): number {
  gen.counters[key] = (gen.counters[key] ?? 0) + 1;
  return gen.counters[key];
}

function placeChunk(map: OfficeMap, gen: GeneratorMeta, c: Chunk, ox: number, oy: number) {
  if (map.width < ox + c.w || map.height < oy + c.h) resizeMap(map, Math.max(map.width, ox + c.w), Math.max(map.height, oy + c.h));
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const i = (oy + y) * map.width + (ox + x);
      map.layers.floor[i] = c.floor[y * c.w + x];
      map.layers.walls[i] = c.walls[y * c.w + x];
    }
  }
  for (const o of c.objects) {
    const isDesk = o.type === 'desk';
    const id = isDesk ? `desk_${nextId(gen, 'desk')}` : `obj_${nextId(gen, 'obj')}`;
    const props = o.props ? JSON.parse(JSON.stringify(o.props)) : undefined;
    if (props?.zone) {
      props.zone.x += ox;
      props.zone.y += oy;
    }
    if (props?.seat) {
      props.seat.x += ox;
      props.seat.y += oy;
    }
    map.objects.push({ ...o, id, x: o.x + ox, y: o.y + oy, ...(props ? { props } : {}) });
  }
  for (const a of c.areas) {
    const { nameKey, ...rest } = a;
    const n = nextId(gen, `area:${nameKey}`);
    const area: MapArea = {
      ...rest,
      id: `area_${nextId(gen, 'area')}`,
      name: (AREA_NAMES[nameKey] ?? ((k: number) => `Área ${k}`))(n),
      rects: a.rects.map((r) => ({ ...r, x: r.x + ox, y: r.y + oy })),
    };
    map.areas.push(area);
  }
  for (const s of c.spawns) map.spawns.push({ x: s.x + ox, y: s.y + oy });
}

/**
 * Constrói uma "ala": um trecho de corredor horizontal com cômodos em cima e embaixo.
 * Usado tanto na criação (a partir de x=0) quanto na expansão (a partir da borda leste).
 */
export function buildWing(map: OfficeMap, gen: GeneratorMeta, modules: ModuleSpec[], startX: number, isExpansion: boolean): void {
  const cy = gen.corridorY;
  const canTop = cy - ROOM_H >= 0;
  let top = isExpansion ? gen.topX : startX;
  let bottom = isExpansion ? gen.bottomX : startX;
  for (const spec of modules) {
    const side: Side = canTop && top <= bottom ? 'top' : 'bottom';
    const chunk = buildChunk(spec, side);
    const ox = side === 'top' ? top : bottom;
    const oy = side === 'top' ? cy - ROOM_H : cy + CORRIDOR_H;
    placeChunk(map, gen, chunk, ox, oy);
    if (side === 'top') top = ox + chunk.w - 1;
    else bottom = ox + chunk.w - 1;
  }
  const endX = Math.max(top, bottom, gen.endX);
  const needW = endX + 1;
  const needH = Math.max(map.height, cy + CORRIDOR_H + 1);
  if (map.width < needW || map.height < needH) resizeMap(map, Math.max(map.width, needW), needH);
  const W = map.width;
  // piso do corredor
  for (let x = startX + 1; x < endX; x++) {
    for (let y = cy; y < cy + CORRIDOR_H; y++) {
      map.layers.floor[y * W + x] = Floor.Corridor;
      map.layers.walls[y * W + x] = 0;
    }
  }
  // paredes ao longo do corredor onde não há cômodo
  for (let x = startX; x <= endX; x++) {
    for (const y of [cy - 1, cy + CORRIDOR_H]) {
      if (y < 0 || y >= map.height) continue;
      const i = y * W + x;
      if (map.layers.floor[i] === 0 && map.layers.walls[i] === 0) {
        map.layers.floor[i] = Floor.Corridor;
        map.layers.walls[i] = Wall.Wall;
      }
    }
  }
  // fechamento leste
  for (let y = cy; y < cy + CORRIDOR_H; y++) {
    map.layers.floor[y * W + endX] = Floor.Corridor;
    map.layers.walls[y * W + endX] = Wall.Wall;
  }
  if (!isExpansion) {
    for (let y = cy; y < cy + CORRIDOR_H; y++) {
      map.layers.floor[y * W + startX] = Floor.Corridor;
      map.layers.walls[y * W + startX] = Wall.Wall;
    }
  } else {
    // abre a antiga parede leste e marca a passagem com uma porta
    for (let y = cy; y < cy + CORRIDOR_H; y++) {
      map.layers.floor[y * W + startX] = Floor.Corridor;
      map.layers.walls[y * W + startX] = 0;
    }
    map.objects.push({ id: `obj_${nextId(gen, 'obj')}`, type: 'door', x: startX, y: cy + 1 });
  }
  gen.topX = top;
  gen.bottomX = bottom;
  gen.endX = endX;
}

/** Gera um escritório novo. Determinístico: a mesma entrada produz o mesmo mapa. */
export function generateOffice(input: WizardInput): OfficeMap {
  const map = emptyMap(1, ROOM_H * 2 + CORRIDOR_H);
  const gen: GeneratorMeta = { version: 1, corridorY: ROOM_H, topX: 0, bottomX: 0, endX: 0, roomHeight: ROOM_H, counters: {} };
  buildWing(map, gen, modulesForInput(input), 0, false);
  map.meta = { gen };
  return map;
}

export interface ExpansionPlan {
  map: OfficeMap;
  addedDesks: number;
  addedMeetingRooms: number;
  /** Retângulo (em tiles) da ala nova, para destacar na pré-visualização. */
  region: { x: number; y: number; w: number; h: number };
}

function cloneMap(map: OfficeMap): OfficeMap {
  return JSON.parse(JSON.stringify(map));
}

/** O meta do gerador ainda descreve o mapa (ninguém redimensionou/fechou o corredor)? */
function trustedGen(map: OfficeMap): GeneratorMeta | null {
  const g = map.meta?.gen;
  if (!g) return null;
  if (map.width !== g.endX + 1) return null;
  const cyMid = g.corridorY + 1;
  if (cyMid >= map.height) return null;
  // o corredor precisa continuar andável junto à borda leste
  const grid = buildCollision(map);
  if (grid[cyMid * map.width + (g.endX - 1)] === 1) return null;
  return JSON.parse(JSON.stringify(g));
}

/** Quando o mapa foi editado à mão: acha uma linha andável junto à borda leste para ligar a ala nova. */
function fallbackGen(map: OfficeMap): GeneratorMeta {
  const grid = buildCollision(map);
  const spawn = map.spawns[0] ?? { x: 1, y: 1 };
  const reach = floodFill(grid, map.width, map.height, spawn);
  let best: { x: number; y: number } | null = null;
  for (let x = map.width - 1; x >= 0 && !best; x--) {
    for (let y = 1; y < map.height - 1; y++) {
      if (reach[y * map.width + x]) {
        best = { x, y };
        break;
      }
    }
  }
  const row = best?.y ?? Math.floor(map.height / 2);
  const cy = Math.max(1, row - 1);
  // abre um túnel da célula andável até a borda leste (só altera parede/vazio)
  if (best) {
    for (let x = best.x + 1; x < map.width; x++) {
      const i = row * map.width + x;
      map.layers.walls[i] = 0;
      if (map.layers.floor[i] === 0) map.layers.floor[i] = Floor.Corridor;
      map.objects = map.objects.filter((o) => !(o.x === x && o.y === row && o.type !== 'door'));
    }
  }
  const counters: Record<string, number> = { ...(map.meta?.gen?.counters ?? {}) };
  const maxNum = (prefix: string) =>
    Math.max(0, ...[...map.objects.map((o) => o.id), ...map.areas.map((a) => a.id)].filter((id) => id.startsWith(prefix)).map((id) => Number(id.slice(prefix.length)) || 0));
  counters.obj = Math.max(counters.obj ?? 0, maxNum('obj_')) + 1000;
  counters.desk = Math.max(counters.desk ?? 0, maxNum('desk_'));
  counters.area = Math.max(counters.area ?? 0, maxNum('area_'));
  counters['area:meeting'] = Math.max(counters['area:meeting'] ?? 0, map.areas.filter((a) => a.meeting && !a.partners).length);
  const end = map.width - 1;
  return { version: 1, corridorY: cy, topX: end, bottomX: end, endX: end, roomHeight: ROOM_H, counters };
}

function runExpansion(source: OfficeMap, modules: ModuleSpec[]): ExpansionPlan {
  const map = cloneMap(source);
  const before = mapDesks(map).length;
  const meetingsBefore = map.areas.filter((a) => a.meeting && !a.partners).length;
  const oldW = map.width;
  const oldH = map.height;
  const gen = trustedGen(map) ?? fallbackGen(map);
  const startX = gen.endX;
  buildWing(map, gen, modules, startX, true);
  map.meta = { ...(map.meta ?? {}), gen };
  if (map.width > MAX_MAP_SIZE || map.height > MAX_MAP_SIZE) throw new Error('O escritório atingiu o tamanho máximo do mapa.');
  return {
    map,
    addedDesks: mapDesks(map).length - before,
    addedMeetingRooms: map.areas.filter((a) => a.meeting && !a.partners).length - meetingsBefore,
    region: { x: Math.min(startX, oldW - 1), y: 0, w: map.width - Math.min(startX, oldW - 1), h: Math.max(map.height, oldH) },
  };
}

/**
 * Anexa uma ala nova para `extraPeople` pessoas, sem alterar o que já existe
 * (apenas abre a passagem na parede leste do corredor).
 */
export function expandOffice(source: OfficeMap, extraPeople: number): ExpansionPlan {
  const extra = Math.max(1, Math.min(MAX_CUSTOM_EMPLOYEES, Math.floor(extraPeople)));
  const blocks = Math.ceil(extra / DESKS_PER_BLOCK);
  const desksAfter = mapDesks(source).length + blocks * DESKS_PER_BLOCK;
  const meetings = source.areas.filter((a) => a.meeting && !a.partners).length;
  const modules: ModuleSpec[] = [];
  for (let i = 0; i < blocks; i++) modules.push({ kind: 'desks' });
  if (Math.ceil(desksAfter / 12) > meetings) modules.splice(1, 0, { kind: 'meeting' });
  return runExpansion(source, modules);
}

/** Reserva uma área nova em branco (para o ADM montar à mão no Mapmaker). */
export function reserveBlankWing(source: OfficeMap, width = 14): ExpansionPlan {
  return runExpansion(source, [{ kind: 'blank', width }]);
}
