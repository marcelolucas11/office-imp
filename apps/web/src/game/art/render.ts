// SPDX-License-Identifier: AGPL-3.0-only
import { OBJECT_DEFS, isDesk, objDepthRows, objSize, objSolidAt, type DayPeriod, type MapArea, type MapObject, type OfficeMap, type Rect } from '@office-imp/shared';
import { EXTERIOR_MARGIN, drawExterior } from './exterior';
import { objectSprite, objectTall } from './objects';
import { FLOOR_COLOR, T, WALL_MINI, drawStatic, makeCanvas, type Ctx } from './tiles';

/** Fundo neutro do Mapmaker: ali o vazio fica escuro, para se ver onde falta piso. */
export const VOID_COLOR = '#0b0b0d';
/** Cor do vazio no mini-mapa e nas miniaturas: verde escuro, lembrando a grama do exterior. */
export const MINI_VOID_COLOR = '#22382a';

const FLOOR_LEVEL = (type: string) => type.startsWith('rug') || type === 'door' || type === 'portal';

/**
 * Para cada bloco, o móvel sólido que o ocupa (chave `y * largura + x`). Um objeto não sólido
 * posto num desses blocos está "em cima" do móvel (a caneca na mesa) e é desenhado logo acima dele.
 */
export function surfaceIndex(map: OfficeMap): Map<number, MapObject> {
  const out = new Map<number, MapObject>();
  for (const o of map.objects) {
    if (!OBJECT_DEFS[o.type]?.solid) continue;
    const { w, h } = objSize(o);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (objSolidAt(o, dx, dy)) out.set((o.y + dy) * map.width + o.x + dx, o);
  }
  return out;
}

/** Objetos chatos que ficam por baixo dos outros quando dividem o tampo (o mousepad sob o teclado). */
export const FLAT_ON_SURFACE = new Set(['mousepad', 'postits']);

/** Ordem de desenho: itens de chão, depois por profundidade; o que está em cima de um móvel vem logo depois dele. */
export function sortedObjects(map: OfficeMap) {
  const surfaces = surfaceIndex(map);
  const key = (o: MapObject): [number, number, number] => {
    if (FLOOR_LEVEL(o.type)) return [0, o.y + objSize(o).h, 0];
    if (OBJECT_DEFS[o.type]?.solid) return [1, o.y + objDepthRows(o), 1];
    const under = surfaces.get(o.y * map.width + o.x);
    return under ? [1, under.y + objDepthRows(under), FLAT_ON_SURFACE.has(o.type) ? 2 : 3] : [1, o.y + objSize(o).h, 0];
  };
  const keyed = map.objects.map((o, i) => ({ o, i, k: key(o) }));
  keyed.sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i);
  return keyed.map((e) => e.o);
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
      const label = `${a.kind === 'spotlight' ? '★ ' : ''}${a.name}${a.staffOnly ? ' (equipe)' : ''}`;
      const tw = ctx.measureText(label).width;
      ctx.fillRect((first.x - x0) * T + 3, (first.y - y0) * T + 3, tw + 8, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, (first.x - x0) * T + 7, (first.y - y0) * T + 15);
    }
  }
}

/**
 * O escritório como aparece no jogo, com o exterior em volta: grama e árvores na margem e nos
 * vazios, chão, paredes (com a vista das janelas no período dado) e objetos. `margin` em blocos.
 * Usado por `pnpm art:map` e pela folha de conferência; a cena do Phaser monta o mesmo em camadas.
 */
export function renderScene(map: OfficeMap, opts: { period?: DayPeriod; margin?: number } = {}): HTMLCanvasElement {
  const period = opts.period ?? 'day';
  const m = Math.max(0, Math.round(opts.margin ?? EXTERIOR_MARGIN));
  const c = makeCanvas((map.width + m * 2) * T, (map.height + m * 2) * T);
  const ctx = c.getContext('2d')!;
  drawExterior(ctx, map, period, -m, -m, map.width + m * 2, map.height + m * 2);
  drawStatic(ctx, map, -m, -m, map.width + m * 2, map.height + m * 2, period);
  drawObjects(ctx, map, -m, -m);
  return c;
}

/**
 * Mapa inteiro em resolução cheia (Mapmaker). O fundo é neutro, sem o exterior: para editar,
 * importa ver quais blocos estão vazios. As janelas mostram a vista de dia.
 */
export function renderFull(map: OfficeMap, opts: { areas?: boolean; spawns?: boolean; grid?: boolean; selectedArea?: string | null } = {}): HTMLCanvasElement {
  const c = makeCanvas(map.width * T, map.height * T);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = VOID_COLOR;
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
  ctx.fillStyle = MINI_VOID_COLOR;
  ctx.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const wl = map.layers.walls[i];
      const f = map.layers.floor[i];
      if (wl) ctx.fillStyle = WALL_MINI[wl] ?? '#4a4d5a';
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
    ctx.fillStyle = isDesk(o) ? '#d7b870' : o.type === 'plant' ? '#22c55e' : o.type === 'chair' ? 'rgba(20,20,24,0.55)' : 'rgba(20,20,24,0.8)';
    const pad = o.type === 'chair' ? px * 0.25 : 0;
    if (def.cells) {
      // footprint que não é retangular (mesa em L): só os blocos sólidos
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (objSolidAt(o, dx, dy)) ctx.fillRect((o.x + dx) * px, (o.y + dy) * px, px, px);
      continue;
    }
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
