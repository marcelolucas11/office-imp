// SPDX-License-Identifier: AGPL-3.0-only
// Exterior do escritório (visual v2, Fase B): grama, árvores, arbustos e a vista das janelas,
// em quatro períodos do dia (amanhecer, dia, entardecer e noite).
//
// Tudo é só fundo: nada aqui entra no JSON do mapa nem na colisão. Cada período é uma PALETA
// CHAPADA (sem gradiente por pixel nem iluminação): troca-se a textura inteira quando o período
// muda. A distribuição das árvores é determinística e ancorada nas coordenadas do mundo, então
// continua igual quando o mapa cresce para leste ou sul.
import type { DayPeriod, OfficeMap } from '@office-imp/shared';
import { makeCanvas } from './canvas';
import { FLOOR_PATTERN, paintGrass, type GrassTones } from './floors';
import type { Mat } from './palette';
import { Sprite, noise, type Color } from './prim';

const T = 32;

/** Quantos blocos de exterior com árvores existem em volta do mapa (além disso, só grama). */
export const EXTERIOR_MARGIN = 16;

interface Tones3 {
  dark: Color;
  base: Color;
  light: Color;
}

export interface ExteriorPalette {
  grass: GrassTones;
  /** Copa das árvores de folha larga e dos arbustos. */
  leaf: Mat;
  /** Copa dos pinheiros. */
  pine: Mat;
  trunk: Tones3;
  rock: Tones3;
  /** Flores e frutinhas. */
  bloom: Color;
  bloom2: Color;
  /** Céu (vista das janelas): faixa de cima e faixa do horizonte. */
  sky: Color;
  skyLow: Color;
  cloud: Color | null;
  sun: Color | null;
  star: Color | null;
  moon: Color | null;
  /** Vidro da janela visto de fora (à noite, aceso). */
  glass: Tones3;
}

export const EXTERIOR: Record<DayPeriod, ExteriorPalette> = {
  dawn: {
    grass: { dark: '#4c8257', base: '#63966a', light: '#70a276', flower: '#f6e6d6' },
    leaf: { dark: '#2c5f47', base: '#3b7554', light: '#4d8c63', hi: '#73a67c' },
    pine: { dark: '#234f44', base: '#2f6350', light: '#3e7a60', hi: '#5a9176' },
    trunk: { dark: '#3b2a26', base: '#5a4338', light: '#77594a' },
    rock: { dark: '#6d6c7a', base: '#9a99a8', light: '#b9b5c2' },
    bloom: '#e88f86',
    bloom2: '#f6e6d6',
    sky: '#f3b9a4',
    skyLow: '#f9dcae',
    cloud: '#fdeee0',
    sun: '#fff3c9',
    star: null,
    moon: null,
    glass: { dark: '#c98f86', base: '#f0bfa8', light: '#fbe3cc' },
  },
  day: {
    grass: { dark: '#478a3c', base: '#5a9a4a', light: '#66a653', flower: '#f6f2e6' },
    leaf: { dark: '#2f6b3a', base: '#3e8247', light: '#4f9a55', hi: '#6fb56f' },
    pine: { dark: '#24573a', base: '#2f6b47', light: '#3f8257', hi: '#56996b' },
    trunk: { dark: '#3a261c', base: '#5c4130', light: '#7a5a44' },
    rock: { dark: '#6b6e75', base: '#9da2aa', light: '#b8bcc4' },
    bloom: '#e0635a',
    bloom2: '#f2d16b',
    sky: '#9fd3ee',
    skyLow: '#b8e0f2',
    cloud: '#eef7fb',
    sun: null,
    star: null,
    moon: null,
    glass: { dark: '#6fa9c9', base: '#9fd3ee', light: '#d6eef8' },
  },
  dusk: {
    grass: { dark: '#5c7a39', base: '#748c45', light: '#83994f', flower: '#f2d9a8' },
    leaf: { dark: '#3a5a30', base: '#4e7239', light: '#648745', hi: '#8aa255' },
    pine: { dark: '#2d4a34', base: '#3b5e3e', light: '#4d7449', hi: '#6b8c58' },
    trunk: { dark: '#3a2418', base: '#5e3d28', light: '#7d5536' },
    rock: { dark: '#75685f', base: '#a3927f', light: '#c2ae94' },
    bloom: '#d1543f',
    bloom2: '#f2c46b',
    sky: '#e98a5b',
    skyLow: '#f6bd6c',
    cloud: '#f9d7a0',
    sun: '#fff0b8',
    star: null,
    moon: null,
    glass: { dark: '#b96a4f', base: '#e99668', light: '#f8cf96' },
  },
  night: {
    grass: { dark: '#1c3b38', base: '#25493f', light: '#2b5346', flower: '#8fa3b8' },
    leaf: { dark: '#11302c', base: '#183f37', light: '#215045', hi: '#2f6455' },
    pine: { dark: '#0e2a2b', base: '#153835', light: '#1d4840', hi: '#295a4f' },
    trunk: { dark: '#17131a', base: '#272029', light: '#352c36' },
    rock: { dark: '#2a3140', base: '#3c4658', light: '#4f5b70' },
    bloom: '#6a4a5e',
    bloom2: '#8fa3b8',
    sky: '#141a33',
    skyLow: '#1e2a4d',
    cloud: null,
    sun: null,
    star: '#e8ecf8',
    moon: '#f1eed8',
    glass: { dark: '#c79a4a', base: '#f0cf7c', light: '#fbe9b0' },
  },
};

// ---------- grama ----------

const grassCache = new Map<DayPeriod, HTMLCanvasElement>();

/** Padrão de grama do exterior (256×256 px, repete sem emenda) no período dado. */
export function exteriorGrass(period: DayPeriod): HTMLCanvasElement {
  let c = grassCache.get(period);
  if (!c) {
    const s = new Sprite(FLOOR_PATTERN, FLOOR_PATTERN);
    paintGrass(s, EXTERIOR[period].grass, 97, 0.62);
    c = s.toCanvas();
    grassCache.set(period, c);
  }
  return c;
}

// ---------- árvores, arbustos e pedras ----------

export type DecorKind = 'tree_round' | 'tree_tall' | 'tree_small' | 'pine' | 'bush' | 'bush_bloom' | 'flowers' | 'rock';
export const DECOR_KINDS: DecorKind[] = ['tree_round', 'tree_tall', 'tree_small', 'pine', 'bush', 'bush_bloom', 'flowers', 'rock'];

/** Tamanho do sprite de cada tipo (o ponto de apoio é o meio da base). */
export const DECOR_SIZE: Record<DecorKind, { w: number; h: number }> = {
  tree_round: { w: 48, h: 64 },
  tree_tall: { w: 36, h: 72 },
  tree_small: { w: 32, h: 44 },
  pine: { w: 34, h: 68 },
  bush: { w: 30, h: 20 },
  bush_bloom: { w: 34, h: 22 },
  flowers: { w: 18, h: 12 },
  rock: { w: 18, h: 13 },
};

/** Copa: sombra embaixo, miolo, luz em cima à esquerda e tufos de folha de 1 px. */
function canopy(p: Sprite, x: number, y: number, w: number, h: number, m: Mat, seed: number): void {
  p.ellipse(x, y + 3, w, h - 3, m.dark);
  p.ellipse(x, y, w, h - 4, m.base);
  p.ellipse(x + Math.round(w * 0.12), y + 2, Math.round(w * 0.58), Math.round(h * 0.42), m.light);
  // tufos: pequenos arcos claros em cima e escuros embaixo, só dentro da copa
  const n = Math.round((w * h) / 46);
  for (let i = 0; i < n; i++) {
    const tx = x + 3 + Math.floor(noise(i, 1, seed) * (w - 8));
    const ty = y + 3 + Math.floor(noise(i, 2, seed) * (h - 9));
    const inside = (dx: number, dy: number) => p.alpha(tx + dx, ty + dy) > 0;
    if (!inside(-1, -1) || !inside(3, 2) || !inside(-1, 2) || !inside(3, -1)) continue;
    const upper = ty - y < h * 0.5;
    const cur = p.get(tx, ty);
    const c = upper ? (cur === m.light ? m.hi : m.light) : cur === m.dark ? m.base : m.dark;
    p.px(tx, ty, c).px(tx + 1, ty - 1, c).px(tx + 2, ty, c);
  }
}

function trunk(p: Sprite, cx: number, top: number, bottom: number, w: number, t: Tones3): void {
  const x = cx - Math.floor(w / 2);
  p.rect(x, top, w, bottom - top + 1, t.base);
  p.rect(x, top, 1, bottom - top + 1, t.light);
  p.rect(x + w - 1, top, 1, bottom - top + 1, t.dark);
  // raízes
  p.px(x - 1, bottom, t.base).px(x + w, bottom, t.dark);
}

function paintDecor(kind: DecorKind, pal: ExteriorPalette): Sprite {
  const { w, h } = DECOR_SIZE[kind];
  const s = new Sprite(w, h);
  const cx = Math.floor(w / 2);
  switch (kind) {
    case 'tree_round':
      s.piece((p) => trunk(p, cx, 40, h - 2, 6, pal.trunk));
      s.piece((p) => {
        canopy(p, 2, 1, 44, 44, pal.leaf, 3);
      });
      break;
    case 'tree_tall':
      s.piece((p) => trunk(p, cx, 46, h - 2, 5, pal.trunk));
      s.piece((p) => {
        canopy(p, 3, 1, 30, 54, pal.leaf, 5);
      });
      break;
    case 'tree_small':
      s.piece((p) => trunk(p, cx, 26, h - 2, 4, pal.trunk));
      s.piece((p) => {
        canopy(p, 2, 1, 28, 30, pal.leaf, 7);
      });
      break;
    case 'pine':
      s.piece((p) => trunk(p, cx, 54, h - 2, 4, pal.trunk));
      s.piece((p) => {
        // três saias sobrepostas, da base para a ponta
        const tiers: [number, number, number][] = [
          [30, 58, 15],
          [12, 42, 12],
          [1, 26, 9],
        ];
        for (const [top, bottom, half] of tiers) {
          p.poly([[cx, top], [cx + half, bottom], [cx - half, bottom]], pal.pine.base);
          p.poly([[cx, top + 2], [cx - 2, bottom - 2], [cx - half + 2, bottom - 1]], pal.pine.light);
          p.rect(cx - half + 1, bottom - 1, half * 2 - 1, 2, pal.pine.dark);
          for (let i = 0; i < 5; i++) {
            const lx = cx - half + 3 + Math.floor(noise(i, top, 11) * (half * 2 - 6));
            const ly = bottom - 3 - Math.floor(noise(i, top, 12) * 3);
            if (p.alpha(lx, ly - 2) > 0) p.px(lx, ly, pal.pine.dark).px(lx, ly - 1, pal.pine.dark);
          }
        }
        p.px(cx, 1, pal.pine.hi).px(cx, 2, pal.pine.hi);
      });
      break;
    case 'bush':
      s.piece((p) => {
        p.ellipse(1, 6, 18, 13, pal.leaf.dark);
        p.ellipse(11, 3, 18, 16, pal.leaf.dark);
        p.ellipse(1, 5, 18, 12, pal.leaf.base);
        p.ellipse(11, 2, 18, 15, pal.leaf.base);
        p.ellipse(3, 6, 9, 5, pal.leaf.light);
        p.ellipse(14, 3, 10, 6, pal.leaf.light);
        p.px(6, 7, pal.leaf.hi).px(7, 6, pal.leaf.hi).px(17, 4, pal.leaf.hi).px(18, 4, pal.leaf.hi);
        p.px(9, 14, pal.leaf.dark).px(10, 13, pal.leaf.dark).px(21, 13, pal.leaf.dark).px(22, 12, pal.leaf.dark);
      });
      break;
    case 'bush_bloom':
      s.piece((p) => {
        p.ellipse(1, 5, 32, 16, pal.leaf.dark);
        p.ellipse(1, 3, 32, 16, pal.leaf.base);
        p.ellipse(4, 4, 16, 6, pal.leaf.light);
        for (let i = 0; i < 9; i++) {
          const bx = 4 + Math.floor(noise(i, 1, 21) * 25);
          const by = 5 + Math.floor(noise(i, 2, 21) * 10);
          if (p.alpha(bx - 1, by - 1) === 0 || p.alpha(bx + 2, by + 2) === 0) continue;
          p.rect(bx, by, 2, 2, i % 3 === 0 ? pal.bloom2 : pal.bloom);
        }
      });
      break;
    case 'flowers':
      s.piece(
        (p) => {
          const stems: [number, number, Color][] = [
            [3, 4, pal.bloom],
            [8, 2, pal.bloom2],
            [13, 5, pal.bloom],
          ];
          for (const [fx, fy, c] of stems) {
            p.rect(fx, fy + 2, 1, h - 3 - fy, pal.leaf.base);
            p.px(fx + 1, fy + 4, pal.leaf.light);
            p.rect(fx - 1, fy, 3, 2, c);
            p.px(fx, fy - 1, c);
          }
        },
        { amount: 0.55 },
      );
      break;
    case 'rock':
      s.piece((p) => {
        p.rrect(1, 3, 16, 9, pal.rock.base, 3);
        p.rrect(3, 1, 10, 6, pal.rock.base, 2);
        p.rrect(4, 2, 7, 3, pal.rock.light, 1);
        p.rect(3, 10, 12, 1, pal.rock.dark);
        p.px(13, 6, pal.rock.dark).px(12, 7, pal.rock.dark).px(14, 8, pal.rock.dark);
      });
      break;
  }
  return s;
}

const decorCache = new Map<string, HTMLCanvasElement>();

/** Sprite (com contorno) de uma árvore, arbusto ou pedra no período dado. */
export function decorSprite(kind: DecorKind, period: DayPeriod): HTMLCanvasElement {
  const key = `${kind}:${period}`;
  let c = decorCache.get(key);
  if (!c) {
    c = paintDecor(kind, EXTERIOR[period]).toCanvas();
    decorCache.set(key, c);
  }
  return c;
}

export interface Decor {
  kind: DecorKind;
  /** Canto de cima à esquerda do sprite, em pixels do mundo. */
  x: number;
  y: number;
}

/** O bloco não tem piso nem parede (ou está fora do mapa): ali aparece o exterior. */
export function isVoid(map: OfficeMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  const i = ty * map.width + tx;
  return map.layers.floor[i] === 0 && map.layers.walls[i] === 0;
}

/** Ruído suave sem repetição (para os bosques). */
function soft(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = noise(x0, y0, seed) + (noise(x0 + 1, y0, seed) - noise(x0, y0, seed)) * sx;
  const b = noise(x0, y0 + 1, seed) + (noise(x0 + 1, y0 + 1, seed) - noise(x0, y0 + 1, seed)) * sx;
  return a + (b - a) * sy;
}

/** Lado (em blocos) da célula da grade de distribuição: no máximo dois elementos por célula. */
const CELL = 3;

function pickKind(grove: number, r: number): DecorKind {
  if (grove > 0.52) return r < 0.34 ? 'tree_round' : r < 0.54 ? 'tree_tall' : r < 0.76 ? 'pine' : r < 0.9 ? 'bush' : 'tree_small';
  return r < 0.16 ? 'tree_small' : r < 0.28 ? 'tree_round' : r < 0.52 ? 'bush' : r < 0.68 ? 'bush_bloom' : r < 0.88 ? 'flowers' : 'rock';
}

/**
 * Árvores, arbustos, flores e pedras em volta do mapa e nos vazios internos, em ordem de
 * profundidade (de cima para baixo). Determinístico. Um elemento só entra se o sprite inteiro
 * cair em blocos vazios: assim nunca encosta em parede nem cobre o escritório.
 */
export function exteriorDecor(map: OfficeMap, margin = EXTERIOR_MARGIN): Decor[] {
  const out: Decor[] = [];
  const clear = (x: number, y: number, w: number, h: number) => {
    const pad = 5;
    for (let ty = Math.floor((y - pad) / T); ty <= Math.floor((y + h - 1 + pad) / T); ty++) {
      for (let tx = Math.floor((x - pad) / T); tx <= Math.floor((x + w - 1 + pad) / T); tx++) if (!isVoid(map, tx, ty)) return false;
    }
    return true;
  };
  const span = CELL * T;
  for (let cy = Math.floor(-margin / CELL); cy <= Math.floor((map.height + margin - 1) / CELL); cy++) {
    for (let cx = Math.floor(-margin / CELL); cx <= Math.floor((map.width + margin - 1) / CELL); cx++) {
      const grove = soft(cx / 2.5, cy / 2.5, 201);
      for (let slot = 0; slot < 2; slot++) {
        const chance = slot === 0 ? 0.3 + grove * 0.6 : 0.3;
        if (noise(cx, cy, 211 + slot) >= chance) continue;
        const kind = slot === 0 ? pickKind(grove, noise(cx, cy, 221)) : noise(cx, cy, 223) < 0.55 ? 'flowers' : noise(cx, cy, 223) < 0.85 ? 'bush' : 'rock';
        const { w, h } = DECOR_SIZE[kind];
        const bx = cx * span + 12 + Math.floor(noise(cx, cy, 231 + slot) * (span - 24));
        const by = cy * span + 12 + Math.floor(noise(cx, cy, 241 + slot) * (span - 24));
        const x = bx - Math.floor(w / 2);
        const y = by - h;
        const inside = bx >= -margin * T && by >= -margin * T && bx < (map.width + margin) * T && by < (map.height + margin) * T;
        if (inside && clear(x, y, w, h)) out.push({ kind, x, y });
      }
    }
  }
  return out.sort((a, b) => a.y + DECOR_SIZE[a.kind].h - (b.y + DECOR_SIZE[b.kind].h) || a.x - b.x);
}

/**
 * Desenha o exterior (grama + árvores) num trecho em blocos, que pode sair do mapa
 * (coordenadas negativas). Usado nos renders em Node (`pnpm art:map`, folha de conferência);
 * no jogo, a cena do Phaser usa um TileSprite de grama e um sprite por árvore.
 */
export function drawExterior(ctx: CanvasRenderingContext2D, map: OfficeMap, period: DayPeriod, x0: number, y0: number, w: number, h: number, decor?: Decor[]): void {
  const grass = exteriorGrass(period);
  const P = FLOOR_PATTERN;
  const left = x0 * T;
  const top = y0 * T;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w * T, h * T);
  ctx.clip();
  for (let py = Math.floor(top / P) * P; py < top + h * T; py += P) {
    for (let px = Math.floor(left / P) * P; px < left + w * T; px += P) ctx.drawImage(grass, px - left, py - top);
  }
  for (const d of decor ?? exteriorDecor(map, Math.max(EXTERIOR_MARGIN, -x0, -y0, x0 + w - map.width, y0 + h - map.height))) {
    const size = DECOR_SIZE[d.kind];
    if (d.x + size.w <= left || d.y + size.h <= top || d.x >= left + w * T || d.y >= top + h * T) continue;
    ctx.drawImage(decorSprite(d.kind, period), d.x - left, d.y - top);
  }
  ctx.restore();
}

// ---------- vista das janelas ----------

/** Altura (px) da vista de uma janela. */
export const VIEW_H = 12;
/** A paisagem da vista se repete a cada 4 blocos. */
export const VIEW_VARIANTS = 4;
const VIEW_W = VIEW_VARIANTS * T;

/**
 * Trecho de 32×12 px da paisagem vista pela janela: céu em duas faixas chapadas, linha de árvores
 * e grama. De dia há nuvens; ao amanhecer e ao entardecer, o sol no horizonte; à noite, estrelas
 * e a lua (ela aparece em uma de cada quatro janelas). `variant` = tx mod 4, e a paisagem é
 * contínua entre janelas vizinhas.
 */
export function windowView(period: DayPeriod, variant: number): Sprite {
  const pal = EXTERIOR[period];
  const s = new Sprite(T, VIEW_H);
  const off = (((variant % VIEW_VARIANTS) + VIEW_VARIANTS) % VIEW_VARIANTS) * T;
  s.rect(0, 0, T, 6, pal.sky);
  s.rect(0, 6, T, 2, pal.skyLow);
  // desenha cada elemento também uma volta antes e depois, para a paisagem dar a volta
  const each = (draw: (dx: number) => void) => {
    for (const lap of [-VIEW_W, 0, VIEW_W]) draw(lap - off);
  };
  if (pal.star) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < T; x++) if (noise(x + off, y, 301) > 0.95) s.px(x, y, pal.star);
  }
  if (pal.moon) {
    const moon = pal.moon;
    each((dx) => {
      s.ellipse(dx + 50, 1, 5, 5, moon);
      s.px(dx + 53, 1, pal.sky).px(dx + 54, 2, pal.sky).px(dx + 53, 2, pal.sky);
    });
  }
  if (pal.sun) {
    const sun = pal.sun;
    each((dx) => {
      s.ellipse(dx + 84, 4, 8, 8, sun);
    });
  }
  if (pal.cloud) {
    const cloud = pal.cloud;
    each((dx) => {
      for (const [cx, cy, cw] of [[14, 2, 8], [70, 1, 10], [108, 3, 7]] as const) {
        s.rect(dx + cx, cy, cw, 1, cloud);
        s.rect(dx + cx + 2, cy - 1, cw - 4, 1, cloud);
      }
    });
  }
  // grama (cobre a metade de baixo do sol)
  s.rect(0, 8, T, 1, pal.grass.light);
  s.rect(0, 9, T, 3, pal.grass.base);
  // linha de árvores: 8 por volta, com tamanho e posição variando
  each((dx) => {
    for (let k = 0; k < 8; k++) {
      const cx = dx + k * 16 + 3 + Math.floor(noise(k, 0, 311) * 8);
      const cw = 9 + Math.floor(noise(k, 1, 311) * 4);
      const ch = 6 + Math.floor(noise(k, 2, 311) * 3);
      const top = 1 + Math.floor(noise(k, 3, 311) * 2);
      const x = cx - Math.floor(cw / 2);
      s.rect(cx, top + ch - 1, 1, 10 - (top + ch - 1), pal.trunk.base);
      s.ellipse(x, top, cw, ch, pal.leaf.dark);
      s.ellipse(x, top, cw - 2, ch - 1, pal.leaf.base);
      s.px(x + 2, top + 1, pal.leaf.light).px(x + 3, top + 1, pal.leaf.light).px(x + 2, top + 2, pal.leaf.light);
    }
  });
  return s;
}

/** Desenha num canvas novo (ajuda dos renders em Node). */
export function exteriorCanvas(map: OfficeMap, period: DayPeriod, x0: number, y0: number, w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w * T, h * T);
  drawExterior(c.getContext('2d')!, map, period, x0, y0, w, h);
  return c;
}
