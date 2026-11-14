// SPDX-License-Identifier: AGPL-3.0-only
// Folhas de conferência visual: todos os pisos, paredes, objetos (em todas as cores e
// direções) e avatares de exemplo. Tudo sai das definições de `@office-imp/shared`, então
// um tipo novo de piso, parede ou objeto aparece aqui sozinho.
// Usado por `pnpm art:sheet` (Node, gera PNG) e pela página /dev/arte (navegador).
import { ACC, AVATAR_ACCESSORIES, AVATAR_OPTIONS, DAY_PERIODS, LEGACY_ACCESSORY_COUNT, avatarAccessory, sanitizeAvatar, DEFAULT_DESK_SETUP, DIRS, Floor, OBJECT_DEFS, OBJECT_TYPES, Wall, deskSetups, emptyMap, objectColors, type AvatarConfig, type DayPeriod, type Dir, type MapObject, type OfficeMap } from '@office-imp/shared';
import { AV_H, AV_W, avatarSheet } from './avatar';
import { makeCanvas } from './canvas';
import { ANIM_CLOUDS, ANIM_TREE, SWAY_TYPES, clockFrameSecond, objectAnim, type AnimDef } from './anim';
import { DECOR_SIZE, decorFrames, decorSprite, viewFrames, type DecorKind } from './exterior';
import { doorClosedSprite, objectSprite, objectStrip } from './objects';
import { FONT_H, drawText, textWidth } from './pixfont';
import { Sprite } from './prim';
import { renderScene } from './render';
import { T, drawFloor, drawStatic } from './tiles';
import { wallCanvas } from './walls';

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
function layout(title: string, cells: Cell[], sheetW = SHEET_W): HTMLCanvasElement {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let x = PAD;
  for (const c of cells) {
    const w = cellWidth(c);
    if (row.length && x + w + PAD > sheetW) {
      rows.push(row);
      row = [];
      x = PAD;
    }
    row.push(c);
    x += w + PAD;
  }
  if (row.length) rows.push(row);
  const width = Math.max(sheetW, ...cells.map((c) => cellWidth(c) + PAD * 2));
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

/** Pisos em blocos de 4×3 (para ver a continuidade entre blocos) e paredes num trecho com frente, quina, lateral e janela. */
export function floorCells(): Cell[] {
  const cells: Cell[] = [];
  for (const id of ids(Floor)) {
    const canvas = makeCanvas(4 * T, 3 * T);
    const ctx = canvas.getContext('2d')!;
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 4; tx++) drawFloor(ctx, id, tx * T, ty * T, tx, ty);
    cells.push({ canvas, lines: [constName(Floor, id), `PISO ${id}`] });
  }
  for (const id of ids(Wall)) {
    const W = 6;
    const H = 4;
    const map = emptyMap(W, H);
    map.layers.floor.fill(id === Wall.Glass ? Floor.Herringbone : Floor.Tile);
    for (let x = 0; x < W; x++) map.layers.walls[x] = id;
    for (let y = 1; y < H; y++) map.layers.walls[y * W] = id;
    map.layers.walls[2 * W + 4] = id;
    // duas janelas emendadas na parede de cima (a própria janela herda o acabamento da vizinha)
    if (id !== Wall.Window && id !== Wall.Glass) map.layers.walls[2] = map.layers.walls[3] = Wall.Window;
    const canvas = makeCanvas(W * T, H * T);
    drawStatic(canvas.getContext('2d')!, map, 0, 0, W, H);
    cells.push({ canvas, lines: [constName(Wall, id), `PAREDE ${id}`] });
  }
  return cells;
}

/** Salinha de exemplo: parede lisa com janelas para o exterior, uma divisória de vidro e uma janela vista de fora. */
export function sampleRoom(): OfficeMap {
  const W = 9;
  const H = 6;
  const map = emptyMap(W, H);
  const at = (x: number, y: number) => y * W + x;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      map.layers.floor[at(x, y)] = x < 5 ? Floor.Herringbone : Floor.BurntCement;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) map.layers.walls[at(x, y)] = x < 5 ? Wall.Plain : Wall.Brick;
    }
  }
  for (const x of [1, 2, 3, 6, 7]) map.layers.walls[at(x, 0)] = Wall.Window;
  for (const x of [2, 6]) map.layers.walls[at(x, H - 1)] = Wall.Window;
  for (let y = 1; y < H - 2; y++) map.layers.walls[at(4, y)] = Wall.Glass;
  map.objects.push({ id: 'p1', type: 'plant', x: 1, y: 4 }, { id: 'c1', type: 'chair', x: 2, y: 3 }, { id: 's1', type: 'sofa', x: 6, y: 2, dir: 'down' });
  map.spawns.push({ x: 2, y: 2 });
  return map;
}

const PERIOD_LABEL: Record<DayPeriod, string> = { dawn: 'AMANHECER', day: 'DIA', dusk: 'ENTARDECER', night: 'NOITE' };

/** O exterior (grama, árvores e vista das janelas) nos 4 períodos do dia, em volta da salinha de exemplo. */
export function exteriorCells(): Cell[] {
  const map = sampleRoom();
  return DAY_PERIODS.map((period) => ({ canvas: renderScene(map, { period, margin: 5 }), lines: [PERIOD_LABEL[period], `EXTERIOR ${period.toUpperCase()}`] }));
}

function pixelKey(c: HTMLCanvasElement): string {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
  return `${c.width}x${c.height}:${h >>> 0}`;
}

/** Fundo de um sprite de objeto: footprint em xadrez de blocos e a parte alta (tall) mais clara. */
function objectBackdrop(ctx: CanvasRenderingContext2D, x: number, w: number, h: number, tall: number): void {
  ctx.fillStyle = '#a9a59c';
  ctx.fillRect(x, 0, w, tall);
  for (let ty = 0; ty * T < h - tall; ty++) {
    for (let tx = 0; tx * T < w; tx++) {
      ctx.fillStyle = (tx + ty) % 2 === 0 ? '#8f8c85' : '#86837c';
      ctx.fillRect(x + tx * T, tall + ty * T, Math.min(T, w - tx * T), T);
    }
  }
}

function objectCell(o: MapObject, lines: string[]): Cell {
  const sprite = objectSprite(o);
  const tall = (OBJECT_DEFS[o.type]?.tall ?? 0) * T;
  const canvas = makeCanvas(sprite.width, sprite.height);
  const ctx = canvas.getContext('2d')!;
  objectBackdrop(ctx, 0, sprite.width, sprite.height, tall);
  ctx.drawImage(sprite, 0, 0);
  return { canvas, lines };
}

/** Todos os tipos de `OBJECT_DEFS`, em todas as cores, em cada direção que muda o desenho e, nas mesas, em cada setup. */
export function objectCells(only?: string[]): Cell[] {
  const cells: Cell[] = [];
  const wants = (type: string) => !only || only.some((name) => (name.endsWith('*') ? type.startsWith(name.slice(0, -1)) : type === name));
  for (const type of OBJECT_TYPES) {
    if (!wants(type)) continue;
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
    // mesas de trabalho: cada setup, na cor padrão (o setup padrão já saiu acima)
    for (const setup of deskSetups(type)) {
      if (setup.id === DEFAULT_DESK_SETUP) continue;
      cells.push(objectCell({ id: 'sheet', type, x: 0, y: 0, setup: setup.id }, [type, `setup ${setup.id}`]));
    }
    // tipos com texto no sprite (letreiro neon): um texto diferente do padrão, num tamanho maior
    if (def.text) cells.push(objectCell({ id: 'sheet', type, x: 0, y: 0, w: def.w + 1, props: { text: 'Bom dia, time!' } }, [type, 'texto']));
  }
  if (!wants('door')) return cells;
  // sprite especial: a porta fechada não é um tipo de objeto (uma por cor de porta)
  for (const color of objectColors('door')) {
    const closed = doorClosedSprite({ color: color.id });
    const canvas = makeCanvas(closed.width, closed.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#8f8c85';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(closed, 0, 0);
    cells.push({ canvas, lines: ['door', `closed ${color.id}`] });
  }
  return cells;
}

/** Espaço entre os quadros de uma animação na folha. */
const FRAME_GAP = 2;

const rhythm = (def: AnimDef) => `${def.frames} QUADROS ${def.ms} MS${def.flicker ? ' PISCA RARO' : ''}`;

/** Quadros lado a lado, cada um com o fundo do objeto. */
function framesCell(frames: HTMLCanvasElement[], tall: number, lines: string[], backdrop = true): Cell {
  const w = frames[0].width;
  const h = frames[0].height;
  const canvas = makeCanvas(frames.length * (w + FRAME_GAP) - FRAME_GAP, h);
  const ctx = canvas.getContext('2d')!;
  frames.forEach((f, i) => {
    const x = i * (w + FRAME_GAP);
    if (backdrop) objectBackdrop(ctx, x, w, h, tall);
    ctx.drawImage(f, x, 0);
  });
  return { canvas, lines };
}

function animObjectCell(o: MapObject, label: string, opts: { breeze?: boolean; time?: { hour: number; minute: number } } = {}): Cell {
  const def = objectAnim(o, opts)!;
  const { canvas, frames, w } = objectStrip(o, opts);
  const list = Array.from({ length: frames }, (_, i) => {
    const c = makeCanvas(w, canvas.height);
    c.getContext('2d')!.drawImage(canvas, i * w, 0, w, canvas.height, 0, 0, w, canvas.height);
    return c;
  });
  return framesCell(list, (OBJECT_DEFS[o.type]?.tall ?? 0) * T, [label, rhythm(def)]);
}

/**
 * Animações de contexto (Fase F): cada objeto animado com todos os quadros lado a lado (o quadro 0,
 * à esquerda, é o desenho estático), as árvores do exterior e as nuvens na vista das janelas.
 */
export function animationCells(): Cell[] {
  const cells: Cell[] = [];
  const o = (type: string, extra: Partial<MapObject> = {}): MapObject => ({ id: 'anim', type, x: 0, y: 0, ...extra });
  for (const setup of deskSetups('desk')) {
    if (setup.id === 'none') continue;
    cells.push(animObjectCell(o('desk', { setup: setup.id }), `DESK SETUP ${setup.id.toUpperCase()}`));
  }
  cells.push(animObjectCell(o('desk_gamer', { setup: 'gamer' }), 'DESK_GAMER SETUP GAMER'));
  cells.push(animObjectCell(o('keyboard'), 'KEYBOARD RGB'));
  for (const color of ['white', 'black']) cells.push(animObjectCell(o('mug', { color }), `MUG ${color.toUpperCase()}`));
  cells.push(animObjectCell(o('coffee'), 'COFFEE'));
  cells.push(animObjectCell(o('coffee', { color: 'white' }), 'COFFEE WHITE'));
  cells.push(animObjectCell(o('espresso'), 'ESPRESSO'));
  cells.push(animObjectCell(o('espresso', { color: 'red' }), 'ESPRESSO RED'));
  cells.push(animObjectCell(o('aquarium'), 'AQUARIUM'));
  cells.push(animObjectCell(o('neon'), 'NEON'));
  cells.push(animObjectCell(o('neon', { color: 'cyan', w: 3, props: { text: 'Bom dia, time!' } }), 'NEON CYAN TEXTO'));
  cells.push(animObjectCell(o('wall_clock'), `WALL_CLOCK 10H10 (SEGUNDOS ${Array.from({ length: 8 }, (_, i) => clockFrameSecond(i)).join(' ')})`));
  for (const [color, hour, minute] of [
    ['white', 3, 45],
    ['gold', 18, 0],
    ['wood', 23, 59],
  ] as const) {
    cells.push(animObjectCell(o('wall_clock', { color }), `WALL_CLOCK ${color.toUpperCase()} ${hour}H${String(minute).padStart(2, '0')}`, { time: { hour, minute } }));
  }
  for (const type of SWAY_TYPES) cells.push(animObjectCell(o(type), `${type.toUpperCase()} PERTO DO SPLIT`, { breeze: true }));
  // árvores do exterior: de dia e à noite
  for (const period of ['day', 'night'] as DayPeriod[]) {
    for (const kind of Object.keys(DECOR_SIZE) as DecorKind[]) {
      const n = decorFrames(kind);
      if (n < 2) continue;
      const frames = Array.from({ length: n }, (_, i) => {
        const sprite = decorSprite(kind, period, i);
        const c = makeCanvas(sprite.width, sprite.height);
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = period === 'night' ? '#25493f' : '#5a9a4a';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(sprite, 0, 0);
        return c;
      });
      cells.push(framesCell(frames, 0, [`${kind.toUpperCase()} ${period.toUpperCase()}`, rhythm(ANIM_TREE)], false));
    }
  }
  // vista das janelas: os 4 trechos da paisagem (128 px) em cada quadro, um embaixo do outro
  for (const period of DAY_PERIODS) {
    const n = viewFrames(period);
    if (n < 2) continue;
    const canvas = makeCanvas(4 * T, n * (T + FRAME_GAP) - FRAME_GAP);
    const ctx = canvas.getContext('2d')!;
    for (let f = 0; f < n; f++) {
      for (let v = 0; v < 4; v++) {
        const tile = wallCanvas({ style: Wall.Wall, n: { below: false, above: false, left: true, right: true }, window: 'view', winLeft: v > 0, winRight: v < 3, variant: v, period, frame: f });
        ctx.drawImage(tile, v * T, f * (T + FRAME_GAP));
      }
    }
    cells.push({ canvas, lines: [`JANELAS ${period.toUpperCase()}`, rhythm(ANIM_CLOUDS)] });
  }
  return cells;
}

/** Os 10 avatares de exemplo de antes do visual v2 (formato antigo), já normalizados. */
export function sampleAvatars(): AvatarConfig[] {
  const L = { skin: 5, hair: 6, hairColor: 7, shirt: 10, pants: 6, accessory: LEGACY_ACCESSORY_COUNT };
  return Array.from({ length: 10 }, (_, i) =>
    sanitizeAvatar({
      skin: i % L.skin,
      hair: (i + 1) % L.hair,
      hairColor: i % L.hairColor,
      shirt: i % L.shirt,
      pants: i % L.pants,
      accessory: i % L.accessory,
    }),
  );
}

const AV_BG = '#8f8c85';
/** Largura da folha de avatares (cabem 4 tiras de 4 direções por linha). */
const AVATAR_SHEET_W = 560;

const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

/** Folha completa do avatar: 4 direções (linhas) × 3 quadros de caminhada. */
function avatarFull(cfg: AvatarConfig): HTMLCanvasElement {
  const sheet = avatarSheet(cfg);
  const canvas = makeCanvas(sheet.width, sheet.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = AV_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sheet, 0, 0);
  return canvas;
}

/** As 4 direções paradas lado a lado (frente, esquerda, direita, costas). */
function avatarStrip(cfg: AvatarConfig): HTMLCanvasElement {
  const sheet = avatarSheet(cfg);
  const canvas = makeCanvas(AV_W * DIRS.length, AV_H);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = AV_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  DIRS.forEach((_, i) => ctx.drawImage(sheet, 0, i * AV_H, AV_W, AV_H, i * AV_W, 0, AV_W, AV_H));
  return canvas;
}

/** Grade 8×2 de avatares de frente (uma cor da paleta em cada). */
function avatarGrid(cfgs: AvatarConfig[]): HTMLCanvasElement {
  const cols = 8;
  const canvas = makeCanvas(AV_W * cols, AV_H * Math.ceil(cfgs.length / cols));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = AV_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  cfgs.forEach((cfg, i) => ctx.drawImage(avatarSheet(cfg), 0, 0, AV_W, AV_H, (i % cols) * AV_W, Math.floor(i / cols) * AV_H, AV_W, AV_H));
  return canvas;
}

/** Folha completa de cada avatar de exemplo do formato antigo. */
export function avatarCells(): Cell[] {
  return sampleAvatars().map((cfg) => ({
    canvas: avatarFull(cfg),
    lines: [`PELE ${cfg.skin} CABELO ${cfg.hair}/${cfg.hairColor}`, `ROUPA ${cfg.shirt}/${cfg.pants} ACESS ${cfg.accessories.join('+') || 0}`],
  }));
}

const BASE: AvatarConfig = { skin: 1, hair: 1, hairColor: 1, shirt: 3, pants: 0, accessories: [] };
const av = (extra: Partial<AvatarConfig>): AvatarConfig => sanitizeAvatar({ ...BASE, ...extra });
const accName = (ids: number[]) => ids.map((id) => plain(avatarAccessory(id)?.label ?? `#${id}`)).join(' + ');

/** Seções da folha de avatares do visual v2: cada opção nova aparece pelo menos uma vez. */
export function avatarSections(): { title: string; cells: Cell[] }[] {
  const O = AVATAR_OPTIONS;
  const hairColors = [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const hairs: Cell[] = O.hairStyles.map((name, i) => {
    const cfg = av({ hair: i, hairColor: hairColors[i % hairColors.length], skin: [1, 0, 2, 3, 4, 5, 6, 8][i % 8], shirt: i % O.shirt.length });
    return { canvas: avatarStrip(cfg), lines: [`CABELO ${i} ${plain(name)}`, `COR ${cfg.hairColor} PELE ${cfg.skin}`] };
  });
  const beards: Cell[] = [];
  O.beards.forEach((name, i) => {
    for (const [skin, hairColor, hair] of [
      [0, 1, 1],
      [4, 0, 6],
      [2, 10, 14],
    ]) {
      const cfg = av({ beard: i, skin, hairColor, hair });
      beards.push({ canvas: avatarStrip(cfg), lines: [`BARBA ${i} ${plain(name)}`, `PELE ${skin} COR ${hairColor}`] });
    }
  });
  const tops: Cell[] = [];
  const topColors = [0, 2, 12, 5, 1, 4, 14, 9];
  O.tops.forEach((top, t) =>
    O.patterns.forEach((pattern, k) => {
      const cfg = av({ top: t, pattern: k, shirt: topColors[(t * 2 + k) % topColors.length] });
      tops.push({ canvas: avatarStrip(cfg), lines: [`${plain(top)} ${plain(pattern)}`, `COR ${cfg.shirt}`] });
    }),
  );
  const legs: Cell[] = [];
  const legCfgs: [string, Partial<AvatarConfig>][] = [
    ['BERMUDA + TENIS', { bottom: 1, pants: 8, shoes: 2, shoeColor: 7 }],
    ['SAIA + SOCIAL', { bottom: 2, pants: 12, shoes: 1, shoeColor: 1, hair: 10, hairColor: 2 }],
    ['CALCA + BOTA', { shoes: 3, shoeColor: 2, pants: 6 }],
    ['SAIA + BOTA', { bottom: 2, pants: 0, shoes: 3, shoeColor: 0, hair: 3, hairColor: 13, skin: 3 }],
    ['CALCA + TENIS', { shoes: 2, shoeColor: 4, pants: 6, top: 2, shirt: 13 }],
  ];
  for (const [name, extra] of legCfgs) {
    const cfg = av(extra);
    legs.push({ canvas: avatarFull(cfg), lines: [name, `CALCA ${cfg.pants} SAPATO ${cfg.shoes ?? 0}/${cfg.shoeColor ?? 0}`] });
  }
  const accs: Cell[] = AVATAR_ACCESSORIES.map((a) => ({ canvas: avatarStrip(av({ accessories: [a.id], hair: a.id === ACC.Earring ? 13 : 1 })), lines: [`${a.id} ${plain(a.label)}`, a.slot ? `LUGAR ${{ eyes: 'OLHOS', head: 'CABECA', ears: 'ORELHAS' }[a.slot]}` : 'COMBINA COM TUDO'] }));
  const combos: [number[], Partial<AvatarConfig>][] = [
    [[ACC.Cap, ACC.Headphones], { hair: 3, hairColor: 2 }],
    [[ACC.Cap, ACC.Headset, ACC.Sunglasses], { accColor: 5, hair: 7, hairColor: 0, skin: 4 }],
    [[ACC.Hat, ACC.RoundGlasses, ACC.Tie, ACC.Watch], { top: 3, shirt: 1, hair: 10, hairColor: 9 }],
    [[ACC.Headset, ACC.Glasses, ACC.Watch], { top: 2, shirt: 14, beard: 1, hair: 9 }],
    [[ACC.Earring, ACC.RoundGlasses, ACC.Badge, ACC.Tie], { top: 1, shirt: 2, hair: 8, hairColor: 3 }],
    [[ACC.Badge, ACC.Tie, ACC.Sunglasses], { top: 3, shirt: 12, beard: 4, hair: 14, hairColor: 5 }],
    [[ACC.Hat, ACC.Earring, ACC.Watch], { accColor: 1, hair: 12, hairColor: 0, skin: 3, bottom: 2, pants: 4 }],
    [[ACC.Cap, ACC.Tie, ACC.Badge], { accColor: 7, hair: 11, hairColor: 10, shirt: 2 }],
  ];
  for (const [ids, extra] of combos) {
    const cfg = av({ ...extra, accessories: ids });
    accs.push({ canvas: avatarStrip(cfg), lines: [accName(cfg.accessories), extra.accColor ? `COR ${extra.accColor}` : 'COR ORIGINAL'] });
  }
  const palette = (label: string, n: number, make: (i: number) => AvatarConfig): Cell => ({ canvas: avatarGrid(Array.from({ length: n }, (_, i) => make(i))), lines: [label, `${n} CORES (0 A ${n - 1})`] });
  const colors: Cell[] = [
    palette('PELE', O.skin.length, (i) => av({ skin: i })),
    palette('CABELO E BARBA', O.hairColor.length, (i) => av({ hairColor: i, beard: 4 })),
    palette('ROUPA DE CIMA', O.shirt.length, (i) => av({ shirt: i })),
    palette('ROUPA DE BAIXO', O.pants.length, (i) => av({ pants: i })),
    palette('CALCADO (TENIS)', O.shoeColor.length, (i) => av({ shoeColor: i, shoes: 2 })),
    palette('ACESSORIOS (0 = ORIGINAL)', O.accColor.length, (i) => av({ accColor: i, accessories: [ACC.Cap, ACC.Tie] })),
  ];
  return [
    { title: 'FORMATO ANTIGO (IGUAL AO DE ANTES)', cells: avatarCells() },
    { title: `CABELOS (${hairs.length})`, cells: hairs },
    { title: 'BARBA E BIGODE', cells: beards },
    { title: 'ROUPA DE CIMA E ESTAMPA', cells: tops },
    { title: 'ROUPA DE BAIXO E CALCADOS (CAMINHADA)', cells: legs },
    { title: 'ACESSORIOS E COMBINACOES', cells: accs },
    { title: 'PALETAS (16 POR PECA)', cells: colors },
  ];
}

/** Empilha as seções numa folha só, em escala 1×. */
function avatarSheetCanvas(): { canvas: HTMLCanvasElement; count: number } {
  const sections = avatarSections();
  const count = sections.reduce((n, sec) => n + sec.cells.length, 0);
  const parts = sections.map((sec, i) => layout(i === 0 ? `OFFICE-IMP VISUAL V2 - AVATARES (${count}) - ${sec.title}` : sec.title, sec.cells, AVATAR_SHEET_W));
  const canvas = makeCanvas(Math.max(...parts.map((c) => c.width)), parts.reduce((h, c) => h + c.height, 0));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  for (const c of parts) {
    ctx.drawImage(c, 0, y);
    y += c.height;
  }
  return { canvas, count };
}

/**
 * Recorte da folha de objetos só com os tipos pedidos (nome exato, ou prefixo terminado em `*`),
 * mais um avatar para comparar a proporção. Serve para conferir uma família de perto
 * (`pnpm art:sheet --only=desk,chair* --scale=4 --out=/tmp/folha`).
 */
export function objectCrop(only: string[], scale = 4): ArtSheet {
  const sheet = avatarSheet(sampleAvatars()[1]);
  const avatar = makeCanvas(32, 48);
  const ctx = avatar.getContext('2d')!;
  ctx.fillStyle = '#8f8c85';
  ctx.fillRect(0, 0, 32, 48);
  ctx.drawImage(sheet, 0, 0, 32, 48, 0, 0, 32, 48);
  const cells = [{ canvas: avatar, lines: ['AVATAR', '32X48'] }, ...objectCells(only)];
  return { name: 'recorte', title: 'RECORTE', canvas: scaleCanvas(layout(`RECORTE - ${only.join(' ')} (${cells.length - 1})`, cells), scale), count: cells.length - 1 };
}

/** As folhas (pisos e paredes, exterior, objetos, avatares), ampliadas `scale` vezes com vizinho mais próximo. */
export function artSheets(scale = 3): ArtSheet[] {
  const build = (name: string, title: string, cells: Cell[], width = SHEET_W): ArtSheet => ({
    name,
    title,
    canvas: scaleCanvas(layout(`OFFICE-IMP VISUAL V2 - ${title} (${cells.length})`, cells, width), scale),
    count: cells.length,
  });
  const avatars = (): ArtSheet => {
    const { canvas, count } = avatarSheetCanvas();
    return { name: 'avatares', title: 'AVATARES', canvas: scaleCanvas(canvas, scale), count };
  };
  return [
    build('pisos', 'PISOS E PAREDES', floorCells()),
    build('exterior', 'EXTERIOR E PERIODOS DO DIA', exteriorCells()),
    build('objetos', 'OBJETOS', objectCells()),
    avatars(),
    build('animacoes', 'ANIMACOES DE CONTEXTO, QUADRO 0 (ESTATICO) A ESQUERDA', animationCells(), 640),
  ];
}
