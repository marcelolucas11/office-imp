// SPDX-License-Identifier: AGPL-3.0-only
// Paredes do visual v2 (Fase B), altas desde o formato 2 do mapa. Um bloco de parede que não é
// face mostra só o TOPO (trecho vertical). A face (a parte da parede de frente para quem olha)
// ocupa até 2 blocos em pé (`stack`): o de cima tem o topo (8 px) e o começo da face, o de baixo
// termina no rodapé; numa parede fina (1 bloco), topo de 10 px e face de 22 px, como antes.
// A face é desenhada inteira numa coluna virtual de `stack` blocos e cada bloco pega a sua fatia.
// Acabamentos: ardósia, escura, lisa clara, tijolo aparente, painel de madeira, divisória de
// vidro; a janela adota o acabamento da parede vizinha e mostra a vista do exterior quando dá para fora.
import { Wall, type DayPeriod } from '@office-imp/shared';
import { EXTERIOR, VIEW_H, VIEW_VARIANTS, windowView } from './exterior';
import { PAL } from './palette';
import { Sprite, noise, shade, type Color } from './prim';

const T = 32;
/** Altura (px) do topo da parede num bloco com face (parede fina, de 1 bloco). */
export const WALL_CAP = 10;
/** Altura (px) do topo da parede alta (face de 2 blocos). */
export const TALL_CAP = 8;
/** Onde começa o vão da porta numa parede alta (px a partir do topo da coluna de 2 blocos): acima fica a verga. */
export const DOOR_HEAD = 14;

const capOf = (stack: number) => (stack > 1 ? TALL_CAP : WALL_CAP);

export interface WallNeighbors {
  below: boolean;
  above: boolean;
  left: boolean;
  right: boolean;
  /** O vizinho da esquerda/direita mostra a face (não tem parede embaixo). */
  leftFace?: boolean;
  rightFace?: boolean;
  /** Num bloco de topo: a partir de que altura (px) a face do vizinho da esquerda/direita aparece. */
  leftFaceFrom?: number;
  rightFaceFrom?: number;
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
  /** Quadro da vista da janela (nuvens andando, Fase F); 0 = estática. */
  frame?: number;
  /**
   * Fileira da face: -1 = topo (trecho vertical), 0 = a de baixo, 1 = a de cima. Ausente = como
   * antes das paredes altas (topo se há parede embaixo; senão, face de 1 bloco).
   */
  level?: number;
  /** Quantos blocos a face desta coluna tem em pé (1 ou 2). */
  stack?: number;
  /** Há parede logo acima do bloco de cima da face (o topo emenda com o de um trecho vertical). */
  capAbove?: boolean;
}

/** Fileira da face do bloco (-1 = topo) e altura da face em blocos. */
export function faceOf(t: WallTile): { level: number; stack: number } {
  const level = t.level ?? (t.n.below ? -1 : 0);
  return { level, stack: level < 0 ? 0 : Math.max(level + 1, t.stack ?? 1) };
}

interface Look {
  cap: Color;
  rim: Color;
  /** Moldura da janela e peitoril. */
  frame: Color;
  sill: Color;
  /** Borda escura na ponta da face (onde a parede acaba). */
  end: Color;
  /** Pinta a face de `top` (logo abaixo do topo) até `h` (o pé da coluna), com o rodapé no fim. */
  face: (s: Sprite, variant: number, top: number, h: number) => void;
}

/** Rodapé de 5 px no pé da face: linha de sombra e o rodapé em 3 tons. */
function baseboard(s: Sprite, h: number, low: Color, base: [Color, Color, Color]): void {
  s.rect(0, h - 5, T, 1, low);
  s.rect(0, h - 4, T, 1, base[0]);
  s.rect(0, h - 3, T, 2, base[1]);
  s.rect(0, h - 1, T, 1, base[2]);
}

/** Face lisa: filete de luz em cima, corpo chapado (com um degradê leve na parede alta) e rodapé. */
function plainFace(body: Color, hi: Color, low: Color, base: [Color, Color, Color]) {
  return (s: Sprite, _variant: number, top: number, h: number) => {
    s.rect(0, top, T, 1, hi);
    s.rect(0, top + 1, T, h - top - 6, body);
    // na parede alta, a parte de cima é um tom mais clara (luz do teto) e há uma faixa de sombra junto ao rodapé
    if (h - top > 30) {
      s.rect(0, top + 1, T, 3, shade(body, 0.05));
      s.rect(0, h - 8, T, 3, shade(body, -0.05));
    }
    baseboard(s, h, low, base);
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
    face: (s, variant, top, h) => {
      s.rect(0, top, T, h - top - 5, BRICK.mortar);
      // fiadas de 3 px + 1 px de argamassa, em amarração (meio tijolo de deslocamento)
      const courses = Math.floor((h - top - 6) / 4);
      for (let course = 0; course < courses; course++) {
        const y = top + 1 + course * 4;
        const shift = course % 2 === 0 ? 0 : 4;
        for (let x = 0; x < T; x++) {
          const wx = variant * T + x + shift;
          if (wx % 8 === 7) continue;
          const n = noise(Math.floor(wx / 8), course, 401);
          s.rect(x, y, 1, 3, n < 0.62 ? BRICK.base : n < 0.82 ? BRICK.dark : BRICK.light);
        }
      }
      baseboard(s, h, shade(BRICK.dark, -0.3), ['#85807a', '#6b6660', '#4d4944']);
    },
  },
  [Wall.WoodPanel]: {
    cap: '#33221a',
    rim: PAL.woodDark.base,
    frame: PAL.woodDark.dark,
    sill: PAL.woodDark.light,
    end: shade(PANEL.dark, -0.25),
    face: (s, variant, top, h) => {
      s.rect(0, top, T, 1, PANEL.hi);
      s.rect(0, top + 1, T, 1, PANEL.light);
      s.rect(0, top + 2, T, 1, PANEL.dark);
      // ripas verticais de 8 px
      const slatH = h - top - 8;
      for (let x = 0; x < T; x++) {
        const slat = variant * 4 + Math.floor(x / 8);
        const n = noise(slat, 0, 411);
        s.rect(x, top + 3, 1, slatH, x % 8 === 7 ? PANEL.dark : n < 0.5 ? PANEL.base : n < 0.8 ? PANEL.light : shade(PANEL.base, -0.06));
      }
      for (let k = 0; k < 4; k++) {
        const gx = k * 8 + 1 + Math.floor(noise(variant * 4 + k, 1, 411) * 5);
        const gy = top + 4 + Math.floor(noise(variant * 4 + k, 2, 411) * Math.max(1, slatH - 7));
        s.rect(gx, gy, 1, 5, shade(PANEL.base, -0.09));
      }
      baseboard(s, h, PAL.woodDark.dark, [PAL.woodDark.light, PAL.woodDark.base, PAL.woodDark.dark]);
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
  if (h === T && n.left && (n.leftFaceFrom != null || n.leftFace)) {
    const from = n.leftFaceFrom ?? WALL_CAP;
    s.rect(0, from, 1, T - from, l.rim);
  }
  if (h === T && n.right && (n.rightFaceFrom != null || n.rightFace)) {
    const from = n.rightFaceFrom ?? WALL_CAP;
    s.rect(T - 1, from, 1, T - from, l.rim);
  }
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

/** Caixilho da janela na coluna virtual: [topo do caixilho, altura da vista]. Fina: como antes; alta: vista de 28 px. */
function windowBox(stack: number): [number, number] {
  return stack > 1 ? [16, 28] : [12, VIEW_H];
}

function paintWindow(s: Sprite, l: Look, t: WallTile, stack: number): void {
  const period = t.period ?? 'day';
  const [top, viewH] = windowBox(stack);
  const fx0 = t.winLeft ? 0 : 3;
  const fx1 = t.winRight ? T - 1 : T - 4;
  const bottom = top + viewH + 1;
  s.rect(fx0, top, fx1 - fx0 + 1, viewH + 2, l.frame);
  const vx0 = t.winLeft ? 0 : fx0 + 1;
  const vx1 = t.winRight ? T - 1 : fx1 - 1;
  if (t.window === 'view') {
    const view = windowView(period, t.variant ?? 0, t.frame ?? 0, viewH);
    for (let y = 0; y < viewH; y++) for (let x = vx0; x <= vx1; x++) s.px(x, top + 1 + y, view.get(x, y));
  } else {
    const g = t.window === 'outside' ? EXTERIOR[period].glass : PAL.glass;
    glassPane(s, vx0, vx1, top + 1, bottom - 1, g, !(t.window === 'outside' && period === 'night'));
  }
  // montantes: um no meio e um em cada emenda com a janela vizinha; na alta, uma travessa
  s.rect(15, top + 1, 2, viewH, l.frame);
  if (t.winLeft) s.rect(0, top + 1, 1, viewH, l.frame);
  if (t.winRight) s.rect(T - 1, top + 1, 1, viewH, l.frame);
  if (stack > 1) s.rect(vx0, top + 10, vx1 - vx0 + 1, 1, l.frame);
  // peitoril
  const sx0 = Math.max(0, fx0 - 1);
  const sx1 = Math.min(T - 1, fx1 + 1);
  s.rect(sx0, bottom + 1, sx1 - sx0 + 1, 1, l.sill);
  if (stack > 1) s.rect(sx0, bottom + 2, sx1 - sx0 + 1, 1, shade(l.sill, -0.25));
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
function paintGlass(s: Sprite, n: WallNeighbors, cap: boolean, h = T, capAbove = n.above): void {
  const m = PAL.metal;
  if (cap) {
    // trecho vertical: o vidro visto de cima é só um filete
    s.rect(14, 0, 4, T, m.dark);
    s.rect(15, 0, 2, T, PAL.glass.light);
    if (!n.above) s.rect(13, 0, 6, 2, m.base);
    return;
  }
  const top = 4;
  if (capAbove) {
    s.rect(14, 0, 4, top, m.dark);
    s.rect(15, 0, 2, top, PAL.glass.light);
  }
  for (let y = top + 2; y <= h - 4; y++) {
    for (let x = 0; x < T; x++) {
      const k = (x + y) % 32;
      s.px(x, y, k === 12 || k === 13 || k === 17 ? GLASS.streak : GLASS.fill);
    }
  }
  s.rect(0, h - 4, T, 1, GLASS.edge);
  // trilho de cima e de baixo
  s.rect(0, top, T, 1, m.light);
  s.rect(0, top + 1, T, 1, m.dark);
  s.rect(0, h - 3, T, 1, m.light);
  s.rect(0, h - 2, T, 1, m.base);
  s.rect(0, h - 1, T, 1, m.dark);
  // montantes: um fino a cada bloco, um reforçado nas pontas
  s.rect(0, top, 1, h - top, m.dark);
  if (!n.left) {
    s.rect(0, top, 2, h - top, m.base);
    s.rect(0, top, 1, h - top, m.light);
  }
  if (!n.right) {
    s.rect(T - 2, top, 2, h - top, m.base);
    s.rect(T - 1, top, 1, h - top, m.dark);
  }
}

/** Fatia `level` (0 = a de baixo) de uma coluna virtual de `stack` blocos. */
function slice(v: Sprite, stack: number, level: number): Sprite {
  if (stack === 1) return v;
  const s = new Sprite(T, T);
  const y0 = (stack - 1 - level) * T;
  s.data.set(v.data.subarray(y0 * T * 4, (y0 + T) * T * 4));
  return s;
}

/** Coluna virtual da face inteira (`stack` blocos em pé): topo, face, janela e as pontas. */
function paintFaceColumn(t: WallTile, stack: number): Sprite {
  const h = stack * T;
  const v = new Sprite(T, h);
  if (t.style === Wall.Glass && !t.window) {
    paintGlass(v, t.n, false, h, t.capAbove ?? t.n.above);
    return v;
  }
  const l = look(t.style);
  const cap = capOf(stack);
  paintCap(v, l, { ...t.n, above: t.capAbove ?? t.n.above }, cap);
  l.face(v, t.variant ?? 0, cap, h);
  if (!t.n.left) v.rect(0, cap, 1, h - cap, l.end);
  if (!t.n.right) v.rect(T - 1, cap, 1, h - cap, l.end);
  if (t.window) paintWindow(v, l, t, stack);
  return v;
}

/**
 * Verga sobre o vão de uma porta numa parede alta: o topo e a face acima do vão (até `DOOR_HEAD`),
 * no acabamento das paredes dos lados. `level` = fileira do vão (só a de cima tem verga).
 */
export function paintLintel(style: number, n: WallNeighbors, stack: number, level: number): Sprite | null {
  if (stack < 2 || level !== stack - 1) return null;
  const v = new Sprite(T, stack * T);
  if (style === Wall.Glass) {
    const m = PAL.metal;
    v.rect(0, 4, T, 1, m.light).rect(0, 5, T, 1, m.dark);
    v.rect(0, 6, T, DOOR_HEAD - 6, GLASS.fill);
    v.rect(0, DOOR_HEAD - 1, T, 1, m.dark);
    return slice(v, stack, level);
  }
  const l = look(style);
  const cap = capOf(stack);
  paintCap(v, l, { ...n, left: true, right: true }, cap);
  l.face(v, 0, cap, stack * T);
  // só o que fica acima do vão
  v.rect(0, DOOR_HEAD, T, stack * T - DOOR_HEAD, null);
  v.rect(0, DOOR_HEAD - 1, T, 1, shade(l.cap, 0.1));
  return slice(v, stack, level);
}

/** Desenha um bloco de parede (32×32 px). */
export function paintWall(t: WallTile): Sprite {
  const { level, stack } = faceOf(t);
  if (level < 0) {
    const s = new Sprite(T, T);
    if (t.style === Wall.Glass && !t.window) {
      paintGlass(s, t.n, true);
      return s;
    }
    const l = look(t.style);
    paintCap(s, l, t.n, T);
    if (t.window) paintWindowTop(s, l, t);
    return s;
  }
  return slice(paintFaceColumn(t, stack), stack, level);
}

/** Chave do desenho de um bloco de parede (acabamento, vizinhança, janela, variação, período e quadro). */
export function wallKey(t: WallTile): string {
  const n = t.n;
  const mask = (n.below ? 1 : 0) | (n.above ? 2 : 0) | (n.left ? 4 : 0) | (n.right ? 8 : 0) | (n.leftFace ? 16 : 0) | (n.rightFace ? 32 : 0) | (t.capAbove ? 64 : 0);
  const { level, stack } = faceOf(t);
  const face = `${level}/${stack}/${n.leftFaceFrom ?? ''}/${n.rightFaceFrom ?? ''}`;
  const usesPeriod = t.window === 'view' || t.window === 'outside';
  const variant = (((t.variant ?? 0) % VIEW_VARIANTS) + VIEW_VARIANTS) % VIEW_VARIANTS;
  const frame = t.window === 'view' && t.frame ? `#${t.frame}` : '';
  return `${t.style}:${mask}:${face}:${t.window ?? '-'}:${t.winLeft ? 1 : 0}${t.winRight ? 1 : 0}:${variant}:${usesPeriod ? (t.period ?? 'day') : '-'}${frame}`;
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
