// SPDX-License-Identifier: AGPL-3.0-only
import { OBJECT_DEFS, objSize, type MapArea, type OfficeMap, type Rect } from '@office-imp/shared';
import { objectSprite, objectTall } from './objects';
import { FLOOR_COLOR, T, WALL_COLOR, drawStatic, makeCanvas, type Ctx } from './tiles';

export function sortedObjects(map: OfficeMap) {
  return [...map.objects].sort((a, b) => {
    const fa = OBJECT_DEFS[a.type]?.solid ? 1 : 0;
    const fb = OBJECT_DEFS[b.type]?.solid ? 1 : 0;
    const ya = a.y + objSize(a).h;
    const yb = b.y + objSize(b).h;
    // tapetes e itens de chão primeiro; depois por profundidade
    const ra = a.type.startsWith('rug') || a.type === 'door' || a.type === 'portal' ? 0 : 1;
    const rb = b.type.startsWith('rug') || b.type === 'door' || b.type === 'portal' ? 0 : 1;
    return ra - rb || ya - yb || fa - fb;
  });
}

export function drawObjects(ctx: Ctx, map: OfficeMap, x0 = 0, y0 = 0) {
  for (const o of sortedObjects(map)) {
    const sprite = objectSprite(o);
    ctx.drawImage(sprite, (o.x - x0) * T, (o.y - y0 - objectTall(o.type)) * T);
  }
}

export function drawAreas(ctx: Ctx, areas: MapArea[], x0 = 0, y0 = 0, selectedId?: string | null) {
  for (const a of areas) {
    const color = a.kind === 'spotlight' ? '250,204,21' : a.staffOnly ? '215,184,112' : '56,189,248';
    for (const rc of a.rects) {
      ctx.fillStyle = `rgba(${color},${a.id === selectedId ? 0.38 : 0.2})`;
      ctx.fillRect((rc.x - x0) * T, (rc.y - y0) * T, rc.w * T, rc.h * T);
      ctx.strokeStyle = `rgba(${color},0.9)`;
      ctx.lineWidth = a.id === selectedId ? 3 : 1;
      ctx.strokeRect((rc.x - x0) * T + 0.5, (rc.y - y0) * T + 0.5, rc.w * T - 1, rc.h * T - 1);
    }
    const first = a.rects[0];
    if (first) {
      ctx.font = 'bold 11px Montserrat Variable, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      const label = `${a.kind === 'spotlight' ? '★ ' : a.staffOnly ? '🔒 ' : ''}${a.name}`;
      const tw = ctx.measureText(label).width;
      ctx.fillRect((first.x - x0) * T + 3, (first.y - y0) * T + 3, tw + 8, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, (first.x - x0) * T + 7, (first.y - y0) * T + 15);
    }
  }
}

/** Mapa inteiro em resolução cheia (Mapmaker). */
export function renderFull(map: OfficeMap, opts: { areas?: boolean; spawns?: boolean; grid?: boolean; selectedArea?: string | null } = {}): HTMLCanvasElement {
  const c = makeCanvas(map.width * T, map.height * T);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, c.width, c.height);
  drawStatic(ctx, map, 0, 0, map.width, map.height);
  drawObjects(ctx, map);
  if (opts.areas) drawAreas(ctx, map.areas, 0, 0, opts.selectedArea);
  if (opts.spawns) {
    for (const s of map.spawns) {
      ctx.fillStyle = 'rgba(52,211,153,0.85)';
      ctx.beginPath();
      ctx.arc(s.x * T + 16, s.y * T + 16, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#052e16';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('E', s.x * T + 13, s.y * T + 20);
    }
  }
  if (opts.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= map.width; x++) {
      ctx.moveTo(x * T + 0.5, 0);
      ctx.lineTo(x * T + 0.5, c.height);
    }
    for (let y = 0; y <= map.height; y++) {
      ctx.moveTo(0, y * T + 0.5);
      ctx.lineTo(c.width, y * T + 0.5);
    }
    ctx.stroke();
  }
  return c;
}

/** Miniatura com cores chapadas (mini-mapa, pré-visualizações). `px` = pixels por tile. */
export function renderMini(map: OfficeMap, px: number, highlight?: Rect | null): HTMLCanvasElement {
  const c = makeCanvas(map.width * px, map.height * px);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const wl = map.layers.walls[i];
      const f = map.layers.floor[i];
      if (wl) ctx.fillStyle = wl === 2 ? '#5d8fb0' : WALL_COLOR === '#17181d' ? '#4a4d5a' : WALL_COLOR;
      else if (f) ctx.fillStyle = FLOOR_COLOR[f] ?? '#555';
      else continue;
      ctx.fillRect(x * px, y * px, px, px);
    }
  }
  for (const a of map.areas) {
    ctx.fillStyle = a.kind === 'spotlight' ? 'rgba(250,204,21,0.35)' : 'rgba(56,189,248,0.22)';
    for (const rc of a.rects) ctx.fillRect(rc.x * px, rc.y * px, rc.w * px, rc.h * px);
  }
  for (const o of map.objects) {
    const def = OBJECT_DEFS[o.type];
    if (!def || (!def.solid && o.type !== 'chair')) continue;
    const { w, h } = objSize(o);
    ctx.fillStyle = o.type === 'desk' ? '#d7b870' : o.type === 'plant' ? '#22c55e' : o.type === 'chair' ? 'rgba(20,20,24,0.55)' : 'rgba(20,20,24,0.8)';
    const pad = o.type === 'chair' ? px * 0.25 : 0;
    ctx.fillRect(o.x * px + pad, o.y * px + pad, w * px - pad * 2, h * px - pad * 2);
  }
  if (highlight) {
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = Math.max(2, px / 3);
    ctx.setLineDash([px, px / 2]);
    ctx.strokeRect(highlight.x * px + 1, highlight.y * px + 1, highlight.w * px - 2, highlight.h * px - 2);
    ctx.fillStyle = 'rgba(52,211,153,0.12)';
    ctx.fillRect(highlight.x * px, highlight.y * px, highlight.w * px, highlight.h * px);
  }
  return c;
}
