// SPDX-License-Identifier: AGPL-3.0-only
import { Floor, Wall, type MapArea, type MapObject, type Point, type Dir } from '@office-imp/shared';

export const ROOM_H = 9; // altura de um cômodo, incluindo paredes
export const CORRIDOR_H = 3;

export type Side = 'top' | 'bottom';

export type ModuleSpec =
  | { kind: 'reception'; officeName?: string }
  | { kind: 'desks' }
  | { kind: 'meeting' }
  | { kind: 'lounge' }
  | { kind: 'auditorium' }
  | { kind: 'partnersShared'; count: number }
  | { kind: 'partnerSolo' }
  | { kind: 'blank'; width?: number };

/** Objeto/área com coordenadas relativas ao cômodo e ids provisórios. */
export interface Chunk {
  kind: ModuleSpec['kind'];
  w: number;
  h: number;
  floor: number[];
  walls: number[];
  objects: Omit<MapObject, 'id'>[];
  areas: (Omit<MapArea, 'id' | 'name'> & { nameKey: string })[];
  spawns: Point[];
  doorX: number;
  desks: number;
}

function shell(kind: ModuleSpec['kind'], w: number, floorType: number, side: Side): Chunk {
  const h = ROOM_H;
  const floor = new Array(w * h).fill(floorType);
  const walls = new Array(w * h).fill(0);
  const exteriorY = side === 'top' ? 0 : h - 1;
  for (let x = 0; x < w; x++) {
    walls[x] = Wall.Wall;
    walls[(h - 1) * w + x] = Wall.Wall;
  }
  for (let y = 0; y < h; y++) {
    walls[y * w] = Wall.Wall;
    walls[y * w + (w - 1)] = Wall.Wall;
  }
  // janelas na parede externa
  for (let x = 2; x < w - 2; x++) if (x % 3 === 0) walls[exteriorY * w + x] = Wall.Window;
  const doorX = Math.floor(w / 2);
  const doorY = side === 'top' ? h - 1 : 0;
  walls[doorY * w + doorX] = 0;
  const c: Chunk = { kind, w, h, floor, walls, objects: [], areas: [], spawns: [], doorX, desks: 0 };
  c.objects.push({ type: 'door', x: doorX, y: doorY });
  return c;
}

function add(c: Chunk, type: string, x: number, y: number, extra: Partial<MapObject> = {}) {
  c.objects.push({ type, x, y, ...extra });
}

function addDesk(c: Chunk, x: number, y: number, partner = false) {
  c.objects.push({
    type: 'desk',
    x,
    y,
    props: { zone: { x, y, w: 3, h: 1 }, seat: { x, y: y + 1 }, ...(partner ? { partner: true } : {}) },
  });
  add(c, 'chair', x, y + 1, { dir: 'up' });
  c.desks++;
}

function interior(c: Chunk) {
  return { x: 1, y: 1, w: c.w - 2, h: c.h - 2 };
}

function buildReception(side: Side, officeName?: string): Chunk {
  const c = shell('reception', 12, Floor.Tile, side);
  add(c, 'rug_logo', 4, 3);
  add(c, 'counter', 1, 3, { w: 1, h: 2 });
  add(c, 'sofa', 9, 2, { dir: 'down' });
  add(c, 'plant', 1, 1);
  add(c, 'plant', 10, 1);
  add(c, 'plant', 1, 7);
  add(c, 'plant', 10, 7);
  add(c, 'note', 3, 1, {
    props: { text: `Bem-vindo${officeName ? ` ao ${officeName}` : ''}! Use as setas ou WASD para andar. Chegue perto de alguém para conversar.` },
  });
  c.spawns.push({ x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 });
  return c;
}

function buildDesks(side: Side): Chunk {
  const c = shell('desks', 12, Floor.Wood, side);
  for (const y of [2, 5]) for (const x of [1, 4, 7]) addDesk(c, x, y);
  add(c, 'plant', 10, 2);
  add(c, 'bookshelf', 10, 5);
  return c;
}

function buildMeeting(side: Side): Chunk {
  const c = shell('meeting', 12, Floor.CarpetDark, side);
  add(c, 'table', 3, 3, { w: 6, h: 2 });
  for (let x = 4; x <= 7; x++) {
    add(c, 'chair', x, 2, { dir: 'down' });
    add(c, 'chair', x, 5, { dir: 'up' });
  }
  add(c, 'whiteboard', 1, 1);
  add(c, 'tv', 9, 1);
  add(c, 'plant', 1, 7);
  add(c, 'plant', 10, 7);
  c.areas.push({ nameKey: 'meeting', kind: 'private', staffOnly: false, meeting: true, capacity: 8, rects: [interior(c)] });
  return c;
}

function buildLounge(side: Side): Chunk {
  const c = shell('lounge', 12, Floor.Kitchen, side);
  add(c, 'counter', 1, 1, { w: 2, h: 1 });
  add(c, 'coffee', 3, 1);
  add(c, 'cooler', 4, 1);
  add(c, 'fridge', 10, 1);
  const tableSet = (tx: number, ty: number) => {
    add(c, 'table_round', tx, ty);
    add(c, 'chair', tx - 1, ty, { dir: 'right' as Dir });
    add(c, 'chair', tx + 1, ty, { dir: 'left' as Dir });
    add(c, 'chair', tx, ty - 1, { dir: 'down' as Dir });
    add(c, 'chair', tx, ty + 1, { dir: 'up' as Dir });
    c.areas.push({ nameKey: 'coffee', kind: 'private', staffOnly: false, capacity: 4, rects: [{ x: tx - 1, y: ty - 1, w: 3, h: 3 }] });
  };
  tableSet(3, 4);
  tableSet(8, 4);
  add(c, 'sofa', 1, 7, { dir: 'up' });
  add(c, 'plant', 10, 7);
  return c;
}

function buildAuditorium(side: Side): Chunk {
  const c = shell('auditorium', 14, Floor.CarpetDark, side);
  for (let y = 2; y <= 6; y++) for (let x = 1; x <= 2; x++) c.floor[y * c.w + x] = Floor.Stage;
  c.areas.push({ nameKey: 'stage', kind: 'spotlight', staffOnly: false, capacity: 4, rects: [{ x: 1, y: 2, w: 2, h: 5 }] });
  add(c, 'podium', 2, 4);
  for (const y of [2, 3, 5, 6]) for (const x of [5, 6, 8, 9, 10, 11]) add(c, 'chair', x, y, { dir: 'left' });
  add(c, 'plant', 12, 1);
  add(c, 'plant', 12, 7);
  return c;
}

function buildPartnersShared(side: Side, count: number): Chunk {
  const n = Math.max(1, Math.min(10, count));
  const perRow = n <= 3 ? n : Math.ceil(n / 2);
  const w = Math.max(10, perRow * 3 + 3);
  const c = shell('partnersShared', w, Floor.CarpetGold, side);
  let placed = 0;
  for (const y of n <= 3 ? [2] : [2, 5]) {
    for (let i = 0; i < perRow && placed < n; i++) {
      addDesk(c, 1 + i * 3, y, true);
      placed++;
    }
  }
  if (n <= 3) {
    add(c, 'sofa', 1, 6, { dir: 'up' });
    add(c, 'rug', 4, 5, { w: 3, h: 2 });
  }
  add(c, 'plant', w - 2, 7);
  if (w - 2 !== c.doorX) add(c, 'bookshelf', w - 2, 1);
  c.areas.push({
    nameKey: 'partners',
    kind: 'private',
    staffOnly: true,
    partners: true,
    meeting: true,
    capacity: Math.max(6, n + 4),
    rects: [interior(c)],
  });
  return c;
}

function buildPartnerSolo(side: Side): Chunk {
  const c = shell('partnerSolo', 8, Floor.CarpetGold, side);
  addDesk(c, 2, 2, true);
  add(c, 'armchair', 5, 5, { dir: 'left' });
  add(c, 'bookshelf', 6, 1);
  add(c, 'plant', 1, 7);
  add(c, 'rug', 2, 5, { w: 3, h: 2 });
  c.areas.push({ nameKey: 'partnerSolo', kind: 'private', staffOnly: true, partners: true, meeting: true, capacity: 4, rects: [interior(c)] });
  return c;
}

function buildBlank(side: Side, width = 14): Chunk {
  return shell('blank', Math.max(6, Math.min(40, width)), Floor.Wood, side);
}

export function buildChunk(spec: ModuleSpec, side: Side): Chunk {
  switch (spec.kind) {
    case 'reception':
      return buildReception(side, spec.officeName);
    case 'desks':
      return buildDesks(side);
    case 'meeting':
      return buildMeeting(side);
    case 'lounge':
      return buildLounge(side);
    case 'auditorium':
      return buildAuditorium(side);
    case 'partnersShared':
      return buildPartnersShared(side, spec.count);
    case 'partnerSolo':
      return buildPartnerSolo(side);
    case 'blank':
      return buildBlank(side, spec.width);
  }
}

export const AREA_NAMES: Record<string, (n: number) => string> = {
  meeting: (n) => `Sala de Reunião ${n}`,
  coffee: (n) => `Mesa de café ${n}`,
  stage: (n) => (n > 1 ? `Palco ${n}` : 'Palco'),
  partners: () => 'Sala dos Sócios',
  partnerSolo: (n) => `Sala do Sócio ${n}`,
};
