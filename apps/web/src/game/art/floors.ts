// SPDX-License-Identifier: AGPL-3.0-only
// Pisos do visual v2 (Fase B): traço de 1 px, 3 a 4 tons por material e contraste baixo
// (piso ruidoso atrapalha a leitura dos avatares).
//
// Cada piso é um PADRÃO de 256×256 px (8×8 blocos) que se repete sem emenda: tudo é
// calculado em coordenadas do mundo com `noise` e dá a volta em 256 px. O bloco (tx, ty)
// do mapa é o recorte (tx mod 8, ty mod 8) do padrão, então tábuas, veios e manchas
// atravessam os blocos. Só aparecem juntas onde elas são intencionais (rejunte, tábuas,
// juntas de dilatação). O padrão é desenhado uma vez por piso e fica em cache.
import { Floor } from '@office-imp/shared';
import { PAL } from './palette';
import { Sprite, noise, shade, type Color } from './prim';

/** Lado do bloco em pixels. */
const T = 32;
/** O padrão de cada piso se repete a cada `FLOOR_PERIOD` blocos. */
export const FLOOR_PERIOD = 8;
/** Lado do padrão em pixels. */
export const FLOOR_PATTERN = FLOOR_PERIOD * T;
const N = FLOOR_PATTERN;

const wrap = (v: number, m = N) => ((v % m) + m) % m;

/** Cor chapada de cada piso (mini-mapa, fundo da paleta do Mapmaker). */
export const FLOOR_COLOR: Record<number, string> = {
  [Floor.Wood]: '#b98b5e',
  [Floor.WoodDark]: '#6f4e37',
  [Floor.CarpetDark]: '#2e3038',
  [Floor.CarpetGold]: '#a88c4c',
  [Floor.Tile]: '#d9d6cf',
  [Floor.Concrete]: '#8d8f94',
  [Floor.Grass]: '#5a9a4a',
  [Floor.Kitchen]: '#d6d1c7',
  [Floor.Stage]: '#5b3a29',
  [Floor.Corridor]: '#3a3d47',
  [Floor.Porcelain]: '#e7e3da',
  [Floor.BurntCement]: '#a3a4a6',
  [Floor.Herringbone]: '#b4855a',
  [Floor.CarpetPattern]: '#3a4a5e',
  [Floor.SyntheticGrass]: '#4c9c58',
};

/** Ruído suave (bilinear) em uma grade de `cell` px, que dá a volta em 256 px. */
export function cloud(x: number, y: number, cell: number, seed: number): number {
  const n = N / cell;
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v = (ix: number, iy: number) => noise(wrap(ix, n), wrap(iy, n), seed);
  const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
  const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

/** Preenche o padrão inteiro com uma função de cor por pixel. */
function fill(s: Sprite, f: (x: number, y: number) => Color): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s.px(x, y, f(x, y));
}

/** Linha horizontal de 1 px que dá a volta no padrão. */
function hline(s: Sprite, x: number, y: number, len: number, c: Color): void {
  for (let i = 0; i < len; i++) s.px(wrap(x + i), wrap(y), c);
}

// ---------- madeira ----------

/** Tábuas corridas de 8 px, com emendas desencontradas e veios de 1 px. */
function planks(s: Sprite, base: Color, seed: number): void {
  const tones = [base, shade(base, -0.04), shade(base, 0.045)];
  const seam = shade(base, -0.15);
  const joint = shade(base, -0.11);
  const grain = [shade(base, -0.075), shade(base, 0.08)];
  for (let row = 0; row < N / 8; row++) {
    const y = row * 8;
    const joints: number[] = [];
    let x = Math.floor(noise(row, 0, seed) * 6) * 8;
    for (let k = 1; x < N; k++) {
      joints.push(x);
      x += 40 + Math.floor(noise(row, k, seed + 1) * 5) * 8;
    }
    // a última tábua emenda com a primeira (do outro lado do padrão): não pode ficar curta demais
    if (joints.length > 1 && N + joints[0] - joints[joints.length - 1] < 32) joints.pop();
    for (let j = 0; j < joints.length; j++) {
      const x0 = joints[j];
      const len = (j + 1 < joints.length ? joints[j + 1] : joints[0] + N) - x0;
      const tone = tones[Math.floor(noise(row, j, seed + 2) * tones.length)];
      for (let yy = 0; yy < 7; yy++) hline(s, x0, y + yy, len, tone);
      const streaks = 1 + Math.floor(noise(row, j, seed + 3) * 2);
      for (let g = 0; g < streaks; g++) {
        const gl = 4 + Math.floor(noise(row * 7 + g, j, seed + 4) * 7);
        const gx = x0 + 3 + Math.floor(noise(row * 7 + g, j, seed + 5) * Math.max(1, len - gl - 6));
        const gy = y + 1 + Math.floor(noise(row * 7 + g, j, seed + 6) * 5);
        hline(s, gx, gy, gl, grain[Math.floor(noise(row * 7 + g, j, seed + 7) * 2)]);
      }
    }
    hline(s, 0, y + 7, N, seam);
    for (const jx of joints) for (let yy = 0; yy < 7; yy++) s.px(jx, y + yy, joint);
  }
}

/** Espinha de peixe: colunas de 8 px com tacos em diagonal, alternando o sentido. */
function herringbone(s: Sprite, base: Color, seed: number): void {
  const tones = [base, shade(base, -0.05), shade(base, 0.055), shade(base, -0.02)];
  const seam = shade(base, -0.13);
  const W = 8;
  const TH = 4;
  fill(s, (x, y) => {
    const col = Math.floor(x / W);
    const xi = x % W;
    const d = y + (col % 2 === 0 ? W - 1 - xi : xi);
    if (wrap(d, TH) === 0) return seam;
    const k = wrap(Math.floor(d / TH), N / TH);
    const n = noise(col, k, seed);
    return n < 0.5 ? tones[0] : n < 0.7 ? tones[1] : n < 0.88 ? tones[2] : tones[3];
  });
}

// ---------- carpetes ----------

/** Trama fina de carpete: dois tons muito próximos e uns poucos fios soltos. */
function weave(s: Sprite, base: Color, seed: number, texture: (x: number, y: number) => number, fleck = 0.035): void {
  const tones = [shade(base, -0.035), base, shade(base, 0.03)];
  const up = shade(base, 0.075);
  const down = shade(base, -0.09);
  fill(s, (x, y) => {
    const n = noise(x, y, seed);
    if (n > 1 - fleck) return up;
    if (n < fleck) return down;
    return tones[texture(x, y) + 1];
  });
}

/** Carpete com padrão: treliça de losangos de 16 px, em dois tons, com um ponto no centro de cada um. */
function carpetPattern(s: Sprite, base: Color, seed: number): void {
  const line = shade(base, 0.1);
  const dot = shade(base, 0.22);
  const low = shade(base, -0.07);
  fill(s, (x, y) => {
    const m = Math.abs((x % 16) - 8) + Math.abs((y % 16) - 8);
    if (m === 8) return line;
    if (m <= 1 || m >= 15) return dot;
    if (noise(x, y, seed) > 0.975) return line;
    return m < 8 ? base : low;
  });
}

// ---------- pedras e cerâmicas ----------

/** Piso claro: placas de 32 px com rejunte de 1 px e um filete de luz. */
function ceramic(s: Sprite, base: Color, seed: number): void {
  const tones = [base, shade(base, -0.02), shade(base, 0.025)];
  const grout = shade(base, -0.12);
  const hi = shade(base, 0.35);
  const speck = shade(base, -0.05);
  fill(s, (x, y) => {
    const lx = x % T;
    const ly = y % T;
    if (lx === T - 1 || ly === T - 1) return grout;
    if (lx === 0 || ly === 0) return hi;
    if (noise(x, y, seed + 1) > 0.992) return speck;
    return tones[Math.floor(noise(Math.floor(x / T), Math.floor(y / T), seed) * tones.length)];
  });
}

/** Porcelanato: placas grandes de 64 px, rejunte fino e veios de mármore de 1 px. */
function porcelain(s: Sprite, base: Color, seed: number): void {
  const S = 64;
  const tones = [base, shade(base, -0.015), shade(base, 0.03)];
  const grout = shade(base, -0.11);
  const hi = shade(base, 0.45);
  const vein = shade(base, -0.06);
  const veinSoft = shade(base, -0.03);
  fill(s, (x, y) => {
    const lx = x % S;
    const ly = y % S;
    if (lx === S - 1 || ly === S - 1) return grout;
    if (lx === 0 || ly === 0) return hi;
    return tones[Math.floor(noise(Math.floor(x / S), Math.floor(y / S), seed) * tones.length)];
  });
  for (let ty = 0; ty < N / S; ty++) {
    for (let tx = 0; tx < N / S; tx++) {
      const veins = 1 + Math.floor(noise(tx, ty, seed + 1) * 2);
      for (let v = 0; v < veins; v++) {
        const k = tx * 31 + ty * 17 + v * 7;
        let x = 3 + Math.floor(noise(k, 1, seed + 2) * 30);
        let y = 3 + Math.floor(noise(k, 2, seed + 2) * 56);
        const dir = noise(k, 3, seed + 2) > 0.5 ? 1 : -1;
        const len = 16 + Math.floor(noise(k, 4, seed + 2) * 26);
        for (let i = 0; i < len; i++) {
          if (x < 2 || y < 2 || x > S - 3 || y > S - 3) break;
          s.px(tx * S + x, ty * S + y, i < 3 || i > len - 4 ? veinSoft : vein);
          const n = noise(k, 10 + i, seed + 3);
          x += 1;
          if (n > 0.55) y += dir;
          else if (n < 0.1) y -= dir;
        }
      }
    }
  }
}

/** Cimento queimado: manchas largas e chapadas em 3 tons, com juntas de dilatação a cada 4 blocos. */
function burntCement(s: Sprite, base: Color, seed: number): void {
  const dark = shade(base, -0.04);
  const light = shade(base, 0.05);
  const joint = shade(base, -0.14);
  const pit = shade(base, -0.09);
  const J = 128;
  fill(s, (x, y) => {
    if (x % J === J - 1 || y % J === J - 1) return joint;
    if (noise(x, y, seed + 2) > 0.994) return pit;
    const v = cloud(x, y, 32, seed) * 0.6 + cloud(x, y, 16, seed + 1) * 0.4;
    return v < 0.4 ? dark : v > 0.6 ? light : base;
  });
}

/** Concreto bruto: granulado miúdo de 1 px, sem juntas. */
function concrete(s: Sprite, base: Color, seed: number): void {
  const dark = shade(base, -0.07);
  const light = shade(base, 0.07);
  const soft = shade(base, -0.025);
  fill(s, (x, y) => {
    const n = noise(x, y, seed);
    if (n > 0.95) return dark;
    if (n < 0.05) return light;
    return cloud(x, y, 16, seed + 1) < 0.42 ? soft : base;
  });
}

/** Copa: xadrez de 16 px em dois tons, com rejunte de 1 px. */
function checker(s: Sprite, a: Color, b: Color): void {
  fill(s, (x, y) => {
    const c = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0 ? a : b;
    return x % 16 === 15 || y % 16 === 15 ? shade(c, -0.06) : c;
  });
}

// ---------- gramas ----------

export interface GrassTones {
  dark: Color;
  base: Color;
  light: Color;
  /** Pontinhos de flor (opcional). */
  flower?: Color;
}

/** Grama natural: manchas largas e tufos irregulares de 1 px. Também é o chão do exterior. */
export function paintGrass(s: Sprite, g: GrassTones, seed: number, density = 0.5): void {
  const mid = shade(g.base, -0.04);
  fill(s, (x, y) => {
    const v = cloud(x, y, 32, seed) * 0.65 + cloud(x, y, 16, seed + 1) * 0.35;
    return v > 0.61 ? g.light : v < 0.4 ? mid : g.base;
  });
  const C = 8;
  for (let cy = 0; cy < N / C; cy++) {
    for (let cx = 0; cx < N / C; cx++) {
      const n = noise(cx, cy, seed + 2);
      if (n > density) continue;
      const x = cx * C + Math.floor(noise(cx, cy, seed + 3) * C);
      const y = cy * C + Math.floor(noise(cx, cy, seed + 4) * C);
      const kind = Math.floor(noise(cx, cy, seed + 5) * 4);
      // tufos: uma ou duas lâminas escuras com uma ponta clara ao lado
      s.px(wrap(x), wrap(y), g.dark);
      if (kind !== 0) s.px(wrap(x), wrap(y - 1), g.dark);
      if (kind >= 2) s.px(wrap(x + 1), wrap(y), g.light);
      if (kind === 3) s.px(wrap(x + 2), wrap(y - 1), g.dark);
      if (g.flower && n < density * 0.06) s.px(wrap(x + 3), wrap(y + 2), g.flower);
    }
  }
}

/** Grama sintética: faixas regulares de 32 px e fios em padrão repetido (artificial de propósito). */
function syntheticGrass(s: Sprite, base: Color): void {
  const band = shade(base, 0.07);
  fill(s, (x, y) => {
    const c = Math.floor(x / T) % 2 === 0 ? base : band;
    const k = (x * 3 + y * 5) % 8;
    if (k === 0) return shade(c, -0.07);
    if (k === 4 && y % 2 === 0) return shade(c, 0.08);
    return c;
  });
}

export const GRASS_DAY: GrassTones = { dark: '#478a3c', base: '#5a9a4a', light: '#66a653' };

/** Desenha o padrão de 256×256 px de um piso. `null` se o id não existe. */
export function paintFloorPattern(id: number): Sprite | null {
  const base = FLOOR_COLOR[id];
  if (!base) return null;
  const s = new Sprite(N, N);
  switch (id) {
    case Floor.Wood:
      planks(s, PAL.woodLight.base, 11);
      break;
    case Floor.WoodDark:
      planks(s, base, 23);
      break;
    case Floor.Stage: {
      planks(s, base, 37);
      // filete dourado na borda de cada degrau (uma linha por bloco)
      for (let y = 0; y < N; y += T) hline(s, 0, y, N, PAL.gold.dark);
      break;
    }
    case Floor.Herringbone:
      herringbone(s, base, 41);
      break;
    case Floor.CarpetDark:
      weave(s, base, 51, (x, y) => ((x + y) % 2 === 0 ? 0 : 1), 0.03);
      break;
    case Floor.Corridor:
      // passadeira: frisos de 1 px atravessados no sentido do corredor
      weave(s, base, 53, (x) => (x % 4 === 0 ? -1 : x % 4 === 2 ? 1 : 0), 0.02);
      break;
    case Floor.CarpetGold:
      // sarja: diagonais finas
      weave(s, base, 57, (x, y) => ((x + y) % 4 === 0 ? 1 : (x + y) % 4 === 2 ? -1 : 0), 0.025);
      break;
    case Floor.CarpetPattern:
      carpetPattern(s, base, 59);
      break;
    case Floor.Tile:
      ceramic(s, base, 61);
      break;
    case Floor.Porcelain:
      porcelain(s, base, 67);
      break;
    case Floor.BurntCement:
      burntCement(s, base, 71);
      break;
    case Floor.Concrete:
      concrete(s, base, 73);
      break;
    case Floor.Kitchen:
      checker(s, '#e4e0d8', '#c8c3b8');
      break;
    case Floor.Grass:
      paintGrass(s, GRASS_DAY, 79, 0.45);
      break;
    case Floor.SyntheticGrass:
      syntheticGrass(s, base);
      break;
    default:
      s.rect(0, 0, N, N, base);
  }
  return s;
}

const patterns = new Map<number, HTMLCanvasElement | null>();

/** Canvas do padrão de um piso (desenhado uma vez e guardado). */
export function floorPattern(id: number): HTMLCanvasElement | null {
  let c = patterns.get(id);
  if (c === undefined) {
    c = paintFloorPattern(id)?.toCanvas() ?? null;
    patterns.set(id, c);
  }
  return c;
}

/** Esvazia o cache (testes que trocam a fábrica de canvas). */
export function clearFloorCache(): void {
  patterns.clear();
}

/** Desenha o bloco (tx, ty) do piso `id` em (ox, oy). */
export function drawFloorTile(ctx: CanvasRenderingContext2D, id: number, ox: number, oy: number, tx: number, ty: number): void {
  const pat = floorPattern(id);
  if (!pat) return;
  ctx.drawImage(pat, wrap(tx, FLOOR_PERIOD) * T, wrap(ty, FLOOR_PERIOD) * T, T, T, Math.round(ox), Math.round(oy), T, T);
}
