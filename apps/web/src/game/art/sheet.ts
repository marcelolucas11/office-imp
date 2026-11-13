// SPDX-License-Identifier: AGPL-3.0-only
// Folhas de conferência visual: todos os pisos, paredes, objetos (em todas as cores e
// direções) e avatares de exemplo. Tudo sai das definições de `@office-imp/shared`, então
// um tipo novo de piso, parede ou objeto aparece aqui sozinho.
// Usado por `pnpm art:sheet` (Node, gera PNG) e pela página /dev/arte (navegador).
import { AVATAR_OPTIONS, DIRS, Floor, OBJECT_DEFS, OBJECT_TYPES, Wall, emptyMap, objectColors, type AvatarConfig, type Dir, type MapObject } from '@office-imp/shared';
import { avatarSheet } from './avatar';
import { makeCanvas } from './canvas';
import { doorClosedSprite, objectSprite } from './objects';
import { FONT_H, drawText, textWidth } from './pixfont';
import { Sprite } from './prim';
import { T, drawFloor, drawStatic } from './tiles';

export interface ArtSheet {
  /** Nome do arquivo, sem extensão. */
  name: string;
  title: string;
  canvas: HTMLCanvasElement;
  /** Quantos itens (pisos, sprites, avatares) a folha mostra. */
  count: number;
}

interface Cell {
  canvas: HTMLCanvasElement;
  lines: string[];
}

const BG = '#2a2b31';
const INK = '#e8e3d9';
const INK_DIM = '#9da2aa';
const PAD = 6;
const LINE_H = FONT_H + 2;
/** Largura da folha em pixels de arte (antes de ampliar). */
const SHEET_W = 448;

function cellWidth(c: Cell): number {
  return Math.max(c.canvas.width, ...c.lines.map(textWidth));
}

function cellHeight(c: Cell): number {
  return c.canvas.height + 2 + c.lines.length * LINE_H;
}

/** Distribui as células em linhas (da esquerda para a direita) e devolve a folha em escala 1×. */
function layout(title: string, cells: Cell[]): HTMLCanvasElement {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let x = PAD;
  for (const c of cells) {
    const w = cellWidth(c);
    if (row.length && x + w + PAD > SHEET_W) {
      rows.push(row);
      row = [];
      x = PAD;
    }
    row.push(c);
    x += w + PAD;
  }
  if (row.length) rows.push(row);
  const width = Math.max(SHEET_W, ...cells.map((c) => cellWidth(c) + PAD * 2));
  const headerH = PAD + LINE_H + 2;
  const height = headerH + rows.reduce((sum, r) => sum + Math.max(...r.map(cellHeight)) + PAD, 0);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);
  const text = new Sprite(width, height);
  drawText(text, title, PAD, PAD, '#d7b870');
  let y = headerH;
  for (const r of rows) {
    const rowH = Math.max(...r.map(cellHeight));
    let cx = PAD;
    for (const c of r) {
      const w = cellWidth(c);
      const labelsH = c.lines.length * LINE_H;
      // sprites alinhados pela base da linha
      ctx.drawImage(c.canvas, cx + Math.floor((w - c.canvas.width) / 2), y + rowH - labelsH - 2 - c.canvas.height);
      c.lines.forEach((line, i) => drawText(text, line, cx + Math.floor((w - textWidth(line)) / 2), y + rowH - labelsH + i * LINE_H + 1, i === 0 ? INK : INK_DIM));
      cx += w + PAD;
    }
    y += rowH + PAD;
  }
  text.drawTo(ctx, 0, 0);
  return canvas;
}

/** Amplia com vizinho mais próximo, pixel a pixel (não depende do `imageSmoothing` do canvas). */
export function scaleCanvas(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const k = Math.max(1, Math.round(scale));
  if (k === 1) return src;
  const { width: w, height: h } = src;
  const from = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = makeCanvas(w * k, h * k);
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(w * k, h * k);
  const to = new Uint32Array(img.data.buffer);
  const px = new Uint32Array(from.buffer, from.byteOffset, w * h);
  for (let y = 0; y < h; y++) {
    const line = y * k * w * k;
    for (let x = 0; x < w; x++) to.fill(px[y * w + x], line + x * k, line + x * k + k);
    for (let j = 1; j < k; j++) to.copyWithin(line + j * w * k, line, line + w * k);
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function constName(table: Record<string, number>, id: number): string {
  return Object.entries(table).find(([, v]) => v === id)?.[0] ?? `#${id}`;
}

function ids(table: Record<string, number>): number[] {
  return Object.values(table)
    .filter((v) => v !== 0)
    .sort((a, b) => a - b);
}

/** Pisos em blocos de 3×3 (para ver a repetição) e paredes num trecho com frente, quina e lateral. */
export function floorCells(): Cell[] {
  const cells: Cell[] = [];
  for (const id of ids(Floor)) {
    const canvas = makeCanvas(3 * T, 3 * T);
    const ctx = canvas.getContext('2d')!;
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) drawFloor(ctx, id, tx * T, ty * T, tx, ty);
    cells.push({ canvas, lines: [constName(Floor, id), `PISO ${id}`] });
  }
  for (const id of ids(Wall)) {
    const map = emptyMap(5, 4);
    map.layers.floor.fill(Floor.Tile);
    for (let x = 0; x < 5; x++) map.layers.walls[x] = id;
    for (let y = 1; y < 4; y++) map.layers.walls[y * 5] = id;
    map.layers.walls[2 * 5 + 3] = id;
    const canvas = makeCanvas(5 * T, 4 * T);
    drawStatic(canvas.getContext('2d')!, map, 0, 0, 5, 4);
    cells.push({ canvas, lines: [constName(Wall, id), `PAREDE ${id}`] });
  }
  return cells;
}

function pixelKey(c: HTMLCanvasElement): string {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
  return `${c.width}x${c.height}:${h >>> 0}`;
}

/** Fundo da célula: footprint em xadrez de blocos e a parte alta (tall) mais clara. */
function objectCell(o: MapObject, lines: string[]): Cell {
  const sprite = objectSprite(o);
  const tall = (OBJECT_DEFS[o.type]?.tall ?? 0) * T;
  const canvas = makeCanvas(sprite.width, sprite.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#a9a59c';
  ctx.fillRect(0, 0, sprite.width, tall);
  for (let ty = 0; ty * T < sprite.height - tall; ty++) {
    for (let tx = 0; tx * T < sprite.width; tx++) {
      ctx.fillStyle = (tx + ty) % 2 === 0 ? '#8f8c85' : '#86837c';
      ctx.fillRect(tx * T, tall + ty * T, T, T);
    }
  }
  ctx.drawImage(sprite, 0, 0);
  return { canvas, lines };
}

/** Todos os tipos de `OBJECT_DEFS`, em todas as cores e em cada direção que muda o desenho. */
export function objectCells(): Cell[] {
  const cells: Cell[] = [];
  for (const type of OBJECT_TYPES) {
    const def = OBJECT_DEFS[type];
    const colors = objectColors(type);
    const sizes: { w?: number; h?: number }[] = [{}];
    if (def.resizable) sizes.push({ w: def.w + 1, h: def.h + 1 });
    for (const size of sizes) {
      for (const color of colors.length ? colors : [null]) {
        const seen = new Set<string>();
        for (const dir of [undefined, ...DIRS] as (Dir | undefined)[]) {
          const o: MapObject = { id: 'sheet', type, x: 0, y: 0, ...size, ...(dir ? { dir } : {}), ...(color ? { color: color.id } : {}) };
          const key = pixelKey(objectSprite(o));
          if (seen.has(key)) continue;
          seen.add(key);
          const detail = [color?.id, dir, size.w ? `${size.w}x${size.h}` : undefined].filter(Boolean).join(' ');
          cells.push(objectCell(o, detail ? [type, detail] : [type]));
        }
      }
    }
  }
  // sprite especial: a porta fechada não é um tipo de objeto
  const closed = doorClosedSprite();
  const canvas = makeCanvas(closed.width, closed.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8f8c85';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(closed, 0, 0);
  cells.push({ canvas, lines: ['door', 'closed'] });
  return cells;
}

/** Avatares de exemplo que, juntos, passam por todas as opções de cada peça. */
export function sampleAvatars(): AvatarConfig[] {
  const O = AVATAR_OPTIONS;
  const n = Math.max(O.skin.length, O.hairStyles.length, O.hairColor.length, O.shirt.length, O.pants.length, O.accessories.length);
  return Array.from({ length: n }, (_, i) => ({
    skin: i % O.skin.length,
    hair: (i + 1) % O.hairStyles.length,
    hairColor: i % O.hairColor.length,
    shirt: i % O.shirt.length,
    pants: i % O.pants.length,
    accessory: i % O.accessories.length,
  }));
}

/** Folha completa de cada avatar: 4 direções (linhas) × 3 quadros de caminhada. */
export function avatarCells(): Cell[] {
  return sampleAvatars().map((cfg) => {
    const sheet = avatarSheet(cfg);
    const canvas = makeCanvas(sheet.width, sheet.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#8f8c85';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sheet, 0, 0);
    return { canvas, lines: [`PELE ${cfg.skin} CABELO ${cfg.hair}/${cfg.hairColor}`, `ROUPA ${cfg.shirt}/${cfg.pants} ACESS ${cfg.accessory}`] };
  });
}

/** As três folhas (pisos, objetos, avatares), ampliadas `scale` vezes com vizinho mais próximo. */
export function artSheets(scale = 3): ArtSheet[] {
  const build = (name: string, title: string, cells: Cell[]): ArtSheet => ({
    name,
    title,
    canvas: scaleCanvas(layout(`OFFICE-IMP VISUAL V2 - ${title} (${cells.length})`, cells), scale),
    count: cells.length,
  });
  return [build('pisos', 'PISOS E PAREDES', floorCells()), build('objetos', 'OBJETOS', objectCells()), build('avatares', 'AVATARES', avatarCells())];
}
