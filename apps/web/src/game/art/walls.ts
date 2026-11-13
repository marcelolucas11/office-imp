// SPDX-License-Identifier: AGPL-3.0-only
// Paredes do visual v2 (Fase B). O modelo é o de sempre: um bloco de parede com outra parede
// embaixo mostra só o TOPO (trecho vertical); sem parede embaixo, mostra o topo (10 px) e a
// FACE frontal (22 px). Aqui só muda o desenho: acabamentos (ardósia, escura, lisa clara,
// tijolo aparente, painel de madeira, divisória de vidro) e a janela, que adota o acabamento
// da parede vizinha e mostra a vista do exterior quando dá para fora.
import { Wall, type DayPeriod } from '@office-imp/shared';
import { EXTERIOR, VIEW_H, VIEW_VARIANTS, windowView } from './exterior';
import { PAL } from './palette';
import { Sprite, noise, shade, type Color } from './prim';

const T = 32;
/** Altura (px) do topo da parede num bloco com face. */
export const WALL_CAP = 10;

export interface WallNeighbors {
  below: boolean;
  above: boolean;
  left: boolean;
  right: boolean;
  /** O vizinho da esquerda/direita mostra a face (não tem parede embaixo). */
  leftFace?: boolean;
  rightFace?: boolean;
}

/**
 * O que a janela mostra: `view` = paisagem (dá para o exterior, vista de dentro);
 * `outside` = vidro visto de fora (reflete o céu; à noite, aceso); `inner` = vidro entre dois cômodos.
 */
export type WindowKind = 'view' | 'outside' | 'inner';

export interface WallTile {
  /** Acabamento: id de `Wall` que não seja `Window` (a janela herda o do vizinho). */
  style: number;
  n: WallNeighbors;
  /** `null` = parede sem janela. */
  window?: WindowKind | null;
  /** Há janela no bloco da esquerda/direita (as janelas se emendam). */
  winLeft?: boolean;
  winRight?: boolean;
  /** tx mod 4: varia tijolos, ripas e o trecho da paisagem. */
  variant?: number;
  period?: DayPeriod;
}

interface Look {
  cap: Color;
  rim: Color;
  /** Moldura da janela e peitoril. */
  frame: Color;
  sill: Color;
  /** Borda escura na ponta da face (onde a parede acaba). */
  end: Color;
  face: (s: Sprite, variant: number) => void;
}

/** Face lisa: filete de luz em cima, corpo chapado e rodapé de 4 px. */
function plainFace(body: Color, hi: Color, low: Color, base: [Color, Color, Color]) {
  return (s: Sprite) => {
    s.rect(0, WALL_CAP, T, 1, hi);
    s.rect(0, WALL_CAP + 1, T, 16, body);
    s.rect(0, 27, T, 1, low);
    s.rect(0, 28, T, 1, base[0]);
    s.rect(0, 29, T, 2, base[1]);
    s.rect(0, 31, T, 1, base[2]);
  };
}

const SLATE = '#3d404c';
const SLATE_DARK = '#2a2c35';
const BRICK = { dark: '#96502f', base: '#a85f3a', light: '#b96d45', mortar: '#c4ab93' };
const PANEL = { dark: '#6b4830', base: '#8a5f3f', light: '#99694a', hi: '#ab7b56' };

const LOOKS: Record<number, Look> = {
  [Wall.Wall]: {
    cap: '#1b1c22',
    rim: '#3d404c',
    frame: '#23242b',
    sill: '#55585f',
    end: shade(SLATE, -0.3),
    face: plainFace(SLATE, shade(SLATE, 0.14), shade(SLATE, -0.16), [PAL.gold.base, PAL.gold.dark, shade(SLATE, -0.38)]),
  },
  [Wall.Dark]: {
    cap: '#0f1014',
    rim: '#2a2c35',
    frame: '#15161a',
    sill: '#3a3c45',
    end: shade(SLATE_DARK, -0.3),
    face: plainFace(SLATE_DARK, shade(SLATE_DARK, 0.12), shade(SLATE_DARK, -0.18), [PAL.gold.dark, shade(PAL.gold.dark, -0.18), shade(SLATE_DARK, -0.4)]),
  },
  [Wall.Plain]: {
    cap: '#2b2c33',
    rim: '#4a4c56',
    frame: '#5d6068',
    sill: PAL.metal.light,
    end: PAL.wall.dark,
    face: plainFace(PAL.wall.base, PAL.wall.hi, PAL.wall.dark, [PAL.woodDark.light, PAL.woodDark.base, PAL.woodDark.dark]),
  },
  [Wall.Brick]: {
    cap: '#3b2b27',
    rim: '#5e463d',
    frame: '#4a4c54',
    sill: PAL.metal.base,
    end: shade(BRICK.dark, -0.25),
    face: (s, variant) => {
      s.rect(0, WALL_CAP, T, 18, BRICK.mortar);
      // 4 fiadas de 3 px + 1 px de argamassa, em amarração (meio tijolo de deslocamento)
      for (let course = 0; course < 4; course++) {
        const y = WALL_CAP + 1 + course * 4;
        const shift = course % 2 === 0 ? 0 : 4;
        for (let x = 0; x < T; x++) {
          const wx = variant * T + x + shift;
          if (wx % 8 === 7) continue;
          const n = noise(Math.floor(wx / 8), course, 401);
          s.rect(x, y, 1, 3, n < 0.62 ? BRICK.base : n < 0.82 ? BRICK.dark : BRICK.light);
        }
      }
      s.rect(0, 27, T, 1, shade(BRICK.dark, -0.3));
      s.rect(0, 28, T, 1, '#85807a');
      s.rect(0, 29, T, 2, '#6b6660');
      s.rect(0, 31, T, 1, '#4d4944');
    },
  },
  [Wall.WoodPanel]: {
    cap: '#33221a',
    rim: PAL.woodDark.base,
    frame: PAL.woodDark.dark,
    sill: PAL.woodDark.light,
    end: shade(PANEL.dark, -0.25),
    face: (s, variant) => {
      s.rect(0, WALL_CAP, T, 1, PANEL.hi);
      s.rect(0, WALL_CAP + 1, T, 1, PANEL.light);
      s.rect(0, WALL_CAP + 2, T, 1, PANEL.dark);
      // ripas verticais de 8 px
      for (let x = 0; x < T; x++) {
        const slat = variant * 4 + Math.floor(x / 8);
        const n = noise(slat, 0, 411);
        s.rect(x, WALL_CAP + 3, 1, 14, x % 8 === 7 ? PANEL.dark : n < 0.5 ? PANEL.base : n < 0.8 ? PANEL.light : shade(PANEL.base, -0.06));
      }
      for (let k = 0; k < 4; k++) {
        const gx = k * 8 + 1 + Math.floor(noise(variant * 4 + k, 1, 411) * 5);
        const gy = WALL_CAP + 4 + Math.floor(noise(variant * 4 + k, 2, 411) * 7);
        s.rect(gx, gy, 1, 5, shade(PANEL.base, -0.09));
      }
      s.rect(0, 27, T, 1, PAL.woodDark.dark);
      s.rect(0, 28, T, 1, PAL.woodDark.light);
      s.rect(0, 29, T, 2, PAL.woodDark.base);
      s.rect(0, 31, T, 1, PAL.woodDark.dark);
    },
  },
};

/** Acabamento usado quando o id não tem desenho próprio. */
const look = (style: number): Look => LOOKS[style] ?? LOOKS[Wall.Wall];

function paintCap(s: Sprite, l: Look, n: WallNeighbors, h: number): void {
  s.rect(0, 0, T, h, l.cap);
  if (!n.above) s.rect(0, 0, T, 1, l.rim);
  if (!n.left) s.rect(0, 0, 1, h, l.rim);
  if (!n.right) s.rect(T - 1, 0, 1, h, l.rim);
  // ao lado de um vizinho que mostra a face, a quina do topo aparece a partir da altura da face
  if (h === T && n.left && n.leftFace) s.rect(0, WALL_CAP, 1, T - WALL_CAP, l.rim);
  if (h === T && n.right && n.rightFace) s.rect(T - 1, WALL_CAP, 1, T - WALL_CAP, l.rim);
}

/** Vidro chapado com dois reflexos em diagonal. */
function glassPane(s: Sprite, x0: number, x1: number, y0: number, y1: number, g: { dark: Color; base: Color; light: Color }, streaks: boolean): void {
  s.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, g.base);
  s.rect(x0, y0, x1 - x0 + 1, 1, g.light);
  s.rect(x0, y1, x1 - x0 + 1, 1, g.dark);
  if (!streaks) return;
  for (let y = y0 + 1; y < y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = (x + y) % 14;
      if (k === 3 || k === 4 || k === 7) s.px(x, y, g.light);
    }
  }
}

function paintWindow(s: Sprite, l: Look, t: WallTile): void {
  const period = t.period ?? 'day';
  const fx0 = t.winLeft ? 0 : 3;
  const fx1 = t.winRight ? T - 1 : T - 4;
  const top = 12;
  const bottom = top + VIEW_H + 1;
  s.rect(fx0, top, fx1 - fx0 + 1, VIEW_H + 2, l.frame);
  const vx0 = t.winLeft ? 0 : fx0 + 1;
  const vx1 = t.winRight ? T - 1 : fx1 - 1;
  if (t.window === 'view') {
    const view = windowView(period, t.variant ?? 0);
    for (let y = 0; y < VIEW_H; y++) for (let x = vx0; x <= vx1; x++) s.px(x, top + 1 + y, view.get(x, y));
  } else {
    const g = t.window === 'outside' ? EXTERIOR[period].glass : PAL.glass;
    glassPane(s, vx0, vx1, top + 1, bottom - 1, g, !(t.window === 'outside' && period === 'night'));
  }
  // montantes: um no meio e um em cada emenda com a janela vizinha
  s.rect(15, top + 1, 2, VIEW_H, l.frame);
  if (t.winLeft) s.rect(0, top + 1, 1, VIEW_H, l.frame);
  if (t.winRight) s.rect(T - 1, top + 1, 1, VIEW_H, l.frame);
  // peitoril
  s.rect(Math.max(0, fx0 - 1), bottom + 1, Math.min(T - 1, fx1 + 1) - Math.max(0, fx0 - 1) + 1, 1, l.sill);
}

/** Faixa de vidro vista de cima, no meio do topo (janela num trecho vertical de parede). */
function paintWindowTop(s: Sprite, l: Look, t: WallTile): void {
  const g = t.window === 'inner' ? PAL.glass : EXTERIOR[t.period ?? 'day'].glass;
  s.rect(13, 0, 6, T, l.rim);
  s.rect(14, 0, 4, T, g.base);
  s.rect(14, 0, 1, T, g.light);
  if (!t.n.above) s.rect(13, 0, 6, 1, l.rim);
}

const GLASS = { fill: '#a9d8f04d', streak: '#e3f3fa8c', edge: '#6fa9c980' };

/** Divisória de vidro: perfil de metal fino e vidro translúcido (o piso de trás aparece). */
function paintGlass(s: Sprite, n: WallNeighbors): void {
  const m = PAL.metal;
  if (n.below) {
    // trecho vertical: o vidro visto de cima é só um filete
    s.rect(14, 0, 4, T, m.dark);
    s.rect(15, 0, 2, T, PAL.glass.light);
    if (!n.above) s.rect(13, 0, 6, 2, m.base);
    return;
  }
  const top = 4;
  if (n.above) {
    s.rect(14, 0, 4, top, m.dark);
    s.rect(15, 0, 2, top, PAL.glass.light);
  }
  for (let y = top + 2; y <= 28; y++) {
    for (let x = 0; x < T; x++) {
      const k = (x + y) % 32;
      s.px(x, y, k === 12 || k === 13 || k === 17 ? GLASS.streak : GLASS.fill);
    }
  }
  s.rect(0, 28, T, 1, GLASS.edge);
  // trilho de cima e de baixo
  s.rect(0, top, T, 1, m.light);
  s.rect(0, top + 1, T, 1, m.dark);
  s.rect(0, 29, T, 1, m.light);
  s.rect(0, 30, T, 1, m.base);
  s.rect(0, 31, T, 1, m.dark);
  // montantes: um fino a cada bloco, um reforçado nas pontas
  s.rect(0, top, 1, 28, m.dark);
  if (!n.left) {
    s.rect(0, top, 2, 28, m.base);
    s.rect(0, top, 1, 28, m.light);
  }
  if (!n.right) {
    s.rect(T - 2, top, 2, 28, m.base);
    s.rect(T - 1, top, 1, 28, m.dark);
  }
}

/** Desenha um bloco de parede (32×32 px). */
export function paintWall(t: WallTile): Sprite {
  const s = new Sprite(T, T);
  if (t.style === Wall.Glass && !t.window) {
    paintGlass(s, t.n);
    return s;
  }
  const l = look(t.style);
  if (t.n.below) {
    paintCap(s, l, t.n, T);
    if (t.window) paintWindowTop(s, l, t);
    return s;
  }
  paintCap(s, l, t.n, WALL_CAP);
  l.face(s, t.variant ?? 0);
  if (!t.n.left) s.rect(0, WALL_CAP, 1, T - WALL_CAP, l.end);
  if (!t.n.right) s.rect(T - 1, WALL_CAP, 1, T - WALL_CAP, l.end);
  if (t.window) paintWindow(s, l, t);
  return s;
}

function wallKey(t: WallTile): string {
  const n = t.n;
  const mask = (n.below ? 1 : 0) | (n.above ? 2 : 0) | (n.left ? 4 : 0) | (n.right ? 8 : 0) | (n.leftFace ? 16 : 0) | (n.rightFace ? 32 : 0);
  const usesPeriod = t.window === 'view' || t.window === 'outside';
  const variant = (((t.variant ?? 0) % VIEW_VARIANTS) + VIEW_VARIANTS) % VIEW_VARIANTS;
  return `${t.style}:${mask}:${t.window ?? '-'}:${t.winLeft ? 1 : 0}${t.winRight ? 1 : 0}:${variant}:${usesPeriod ? (t.period ?? 'day') : '-'}`;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Canvas de um bloco de parede, com cache por acabamento, vizinhança, janela, variação e período. */
export function wallCanvas(t: WallTile): HTMLCanvasElement {
  const key = wallKey(t);
  let c = cache.get(key);
  if (!c) {
    c = paintWall(t).toCanvas();
    cache.set(key, c);
  }
  return c;
}

/** Cor chapada de cada parede no mini-mapa. */
export const WALL_MINI: Record<number, string> = {
  [Wall.Wall]: '#4a4d5a',
  [Wall.Window]: '#5d8fb0',
  [Wall.Dark]: '#33353f',
  [Wall.Plain]: '#bdb7ab',
  [Wall.Brick]: '#935a40',
  [Wall.WoodPanel]: '#7a5a44',
  [Wall.Glass]: '#9cc7de',
};
