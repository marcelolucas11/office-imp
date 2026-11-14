// SPDX-License-Identifier: AGPL-3.0-only
// Setups de mesa do visual v2: o que fica em cima do tampo de uma mesa de trabalho
// (`MapObject.setup`, ver `DESK_SETUPS` em `@office-imp/shared`). Cada setup é desenhado como
// peças separadas (contorno próprio) sobre o tampo e serve em qualquer tipo de mesa: a mesa só
// informa onde fica o tampo (`SetupSpot`).
// Nada de marcas: o notebook prata e o all-in-one são genéricos, sem logo.
import { PAL, type Mat } from './palette';
import { Sprite, mix } from './prim';

/** Onde o setup pode ser desenhado: o tampo da mesa, visto pela mesa. */
export interface SetupSpot {
  /** Centro (x) de quem senta à mesa: o setup é centrado aqui, sem sair do tampo. */
  cx: number;
  /** Primeira linha (y) do tampo, a do fundo. O monitor sobe a partir daqui. */
  y: number;
  /** Primeira e última coluna do tampo. */
  x0: number;
  x1: number;
}

type ScreenPainter = (p: Sprite, x: number, y: number, w: number, h: number) => void;

/** Cores das luzes RGB (fans e teclado do PC gamer): a única parte "arco-íris" do catálogo. */
export const RGB = ['#f0465a', '#f59a3c', '#f2d95c', '#5ee37f', '#3fd0e8', '#5c7cf0', '#a06cf5'];

/** Posição x de um conjunto de `width` px centrado em `spot.cx`, sem sair do tampo. */
function fit(spot: SetupSpot, width: number, margin = 1): number {
  const min = spot.x0 + margin;
  const max = spot.x1 - margin - width + 1;
  return Math.max(min, Math.min(max, Math.round(spot.cx - width / 2)));
}

// ---------- telas (chapadas: sem brilho nem gradiente) ----------

const SCR = PAL.screen;

/** Janela de trabalho: a tela do monitor de antes do visual v2 (barra azul, linhas e um detalhe dourado). */
const screenWork: ScreenPainter = (p, x, y, w, h) => {
  p.rect(x, y, w, h, SCR.base);
  p.rect(x + 2, y + 2, Math.min(10, w - 4), 2, '#6aa5ec');
  const lines = [w - 6, w - 10, w - 8];
  lines.forEach((len, i) => {
    const ly = y + 5 + i * 2;
    if (ly < y + h - 3) p.rect(x + 2, ly, Math.max(3, len), 1, SCR.hi);
  });
  p.rect(x + 2, y + h - 3, Math.min(7, w - 4), 1, PAL.gold.base);
};

/** Gráfico de barras (segundo monitor). */
const screenChart: ScreenPainter = (p, x, y, w, h) => {
  p.rect(x, y, w, h, SCR.base);
  p.rect(x + 2, y + 2, 5, 1, SCR.hi);
  const bars = [4, 7, 5, 9, 6];
  const colors = ['#6aa5ec', '#6aa5ec', PAL.gold.base, '#58b97a', '#6aa5ec'];
  bars.forEach((bh, i) => {
    const bx = x + 2 + i * 3;
    if (bx + 2 > x + w - 1) return;
    const hh = Math.min(bh, h - 5);
    p.rect(bx, y + h - 2 - hh, 2, hh, colors[i]);
  });
  p.rect(x + 1, y + h - 2, w - 2, 1, SCR.light);
};

/** Jogo no ultrawide: céu escuro, montanhas, barra de vida e mini-mapa. */
const screenGame: ScreenPainter = (p, x, y, w, h) => {
  p.rect(x, y, w, h, '#1b2140');
  p.rect(x, y + h - 3, w, 3, '#2a4a3c');
  const far = '#39446a';
  const near = '#2b3554';
  for (let i = 0; i < w; i++) {
    const a = Math.abs(((i + 5) % 16) - 8);
    const b = Math.abs(((i + 13) % 22) - 11);
    const hf = Math.max(1, Math.min(h - 6, Math.round((h - 3) * 0.75) - a));
    const hn = Math.max(1, Math.min(h - 7, Math.round((h - 3) * 0.6) - b));
    p.rect(x + i, y + h - 3 - hf, 1, hf, far);
    p.rect(x + i, y + h - 3 - hn, 1, hn, near);
  }
  p.rect(x + 2, y + 1, 6, 1, '#58d27a');
  p.rect(x + 8, y + 1, 2, 1, '#e0525a');
  p.rect(x + w - 6, y + 1, 4, 3, '#55607f');
  p.px(x + w - 4, y + 2, '#f2d95c');
  p.px(x + Math.floor(w / 2), y + Math.floor(h / 2), '#f4f6fb');
};

/** Área de trabalho com uma janela clara (notebook prata). */
const screenWindow: ScreenPainter = (p, x, y, w, h) => {
  p.rect(x, y, w, h, '#33456e');
  p.rect(x, y, w, 1, '#4a5d8a');
  const ww = Math.min(12, w - 6);
  const wx = x + Math.floor((w - ww) / 2) + 1;
  p.rect(wx, y + 2, ww, h - 4, PAL.paper.base);
  p.rect(wx, y + 2, ww, 2, PAL.gold.base);
  p.rect(wx + 1, y + 5, ww - 4, 1, PAL.metal.base);
  p.rect(wx + 1, y + 7, ww - 6, 1, PAL.metal.base);
  p.rect(x + 1, y + 3, 2, 2, '#6aa5ec');
  p.rect(x + 1, y + 6, 2, 2, '#58b97a');
};

/** Terminal escuro com linhas verdes (notebook comum). */
const screenTerminal: ScreenPainter = (p, x, y, w, h) => {
  p.rect(x, y, w, h, '#14161b');
  const lens = [8, 12, 6, 10];
  lens.forEach((len, i) => {
    const ly = y + 1 + i * 2;
    if (ly < y + h - 1) p.rect(x + 1, ly, Math.min(len, w - 3), 1, i === 2 ? PAL.gold.base : '#58b97a');
  });
  p.px(x + 1, y + h - 2, '#e9ecf2');
};

/** Papel de parede de paisagem com uma barra de ícones (all-in-one). */
const screenWallpaper: ScreenPainter = (p, x, y, w, h) => {
  p.rect(x, y, w, h, '#5d8fd6');
  p.rect(x, y + Math.floor(h / 2) - 1, w, h, '#86b3e6');
  for (let i = 0; i < w; i++) {
    const far = Math.max(1, 7 - Math.abs(((i + 3) % 18) - 9)) + 1;
    const near = Math.max(0, 4 - Math.abs(((i + 12) % 14) - 7)) + 1;
    p.rect(x + i, y + h - far, 1, far, '#3e8247');
    p.rect(x + i, y + h - near, 1, near, '#2f6b3a');
  }
  p.rect(x + w - 6, y + 2, 3, 3, '#f6e3a8');
  const dock = Math.min(10, w - 6);
  const dx = x + Math.floor((w - dock) / 2);
  p.rect(dx, y + h - 2, dock, 1, '#e9ecf2');
  p.px(dx + 1, y + h - 2, '#e0525a');
  p.px(dx + 3, y + h - 2, '#6aa5ec');
  p.px(dx + 5, y + h - 2, PAL.gold.base);
};

// ---------- peças ----------

interface MonitorOpts {
  /** Moldura (padrão: plástico preto). */
  bezel?: Mat;
  /** Linhas de moldura embaixo da tela (o "queixo" do all-in-one é maior e prateado). */
  chin?: number;
  /** Material do pé. */
  stand?: Mat;
  baseW?: number;
  neckW?: number;
  /** LED de energia no queixo. */
  led?: string;
}

/**
 * Monitor de frente: pé (peça própria) e painel. `x` é a borda esquerda, `y` a primeira linha do
 * tampo; a base do pé pisa no tampo e o painel fica logo acima dele.
 */
function monitor(s: Sprite, x: number, y: number, w: number, h: number, screen: ScreenPainter, opts: MonitorOpts = {}): void {
  const bezel = opts.bezel ?? PAL.plasticBlack;
  const stand = opts.stand ?? PAL.metalDark;
  const chin = opts.chin ?? 2;
  const baseW = opts.baseW ?? 12;
  const neckW = opts.neckW ?? 4;
  const cx = x + Math.floor(w / 2);
  const bottom = y - 2;
  const top = bottom - h + 1;
  s.piece((p) => {
    p.rect(cx - Math.floor(neckW / 2), bottom + 1, neckW, 3, stand.base);
    p.rect(cx - Math.floor(baseW / 2), bottom + 4, baseW, 2, stand.light);
    p.rect(cx - Math.floor(baseW / 2), bottom + 4, baseW, 1, stand.hi);
  });
  s.piece((p) => {
    p.rrect(x, top, w, h, bezel.base, 1);
    p.rect(x + 1, top, w - 2, 1, bezel.hi);
    if (chin > 2) {
      // all-in-one: vidro preto em volta da tela e queixo de alumínio
      p.rect(x + 1, top + 1, w - 2, h - 1 - chin, PAL.plasticBlack.dark);
      screen(p, x + 2, top + 2, w - 4, h - 3 - chin);
      p.rect(x + 1, bottom - chin + 1, w - 2, 1, bezel.hi);
    } else {
      screen(p, x + 1, top + 1, w - 2, h - 1 - chin);
      p.rect(x + 1, bottom - chin + 1, w - 2, chin, bezel.light);
    }
    if (opts.led) p.px(cx, bottom, opts.led);
  });
}

type KeyStyle = 'light' | 'dark' | 'rgb' | 'white';

/** Teclado de `w × 5` px: três fileiras de teclas de 1 px e a barra de espaço. */
export function keyboardPiece(s: Sprite, x: number, y: number, w: number, style: KeyStyle, caseColor?: string): void {
  const body = style === 'light' ? PAL.plasticWhite.dark : style === 'white' ? PAL.plasticWhite.base : PAL.plasticBlack.base;
  const c = caseColor ?? body;
  s.piece((p) => {
    p.rrect(x, y, w, 5, c, 1);
    for (let row = 0; row < 3; row++) {
      for (let i = 1; i < w - 1; i++) {
        if ((i + row) % 4 === 3) continue; // vão entre grupos de teclas
        let key: string;
        if (style === 'rgb') key = RGB[Math.floor(((i - 1) / (w - 2)) * RGB.length) % RGB.length];
        else if (style === 'dark') key = PAL.plasticBlack.hi;
        else key = style === 'white' ? PAL.plasticWhite.hi : PAL.plasticWhite.light;
        p.px(x + i, y + 1 + row, key);
      }
    }
    const space = Math.max(4, Math.floor(w / 3));
    const sx = x + Math.floor((w - space) / 2);
    p.rect(sx, y + 3, space, 1, style === 'rgb' ? '#e9ecf2' : style === 'dark' ? PAL.metal.base : PAL.paper.hi);
    p.rect(x + 1, y + 4, w - 2, 1, mix(c, '#000000', 0.25));
  });
}

/** Mouse de 5 × 7 px, visto de cima. */
export function mousePiece(s: Sprite, x: number, y: number, m: Mat, wheel: string): void {
  s.piece((p) => {
    p.rrect(x, y, 5, 7, m.base, 1);
    p.rect(x + 1, y, 3, 1, m.hi);
    p.rect(x + 1, y + 1, 1, 2, m.light);
    p.px(x + 2, y + 1, wheel);
    p.px(x + 2, y + 2, wheel);
    p.rect(x + 1, y + 3, 3, 1, m.dark);
  });
}

/** Gabinete com lateral de vidro e três fans RGB. 11 × 21 px; `y` é a linha de cima. */
function tower(s: Sprite, x: number, y: number): void {
  const B = PAL.plasticBlack;
  s.piece((p) => {
    p.rrect(x, y, 11, 21, B.base, 1);
    p.rect(x + 1, y, 9, 1, B.hi);
    p.rect(x + 1, y + 2, 9, 17, B.dark);
    p.rect(x + 1, y + 19, 9, 1, B.light);
    const fans = [RGB[6], RGB[4], RGB[6]];
    fans.forEach((c, i) => {
      const fy = y + 3 + i * 5;
      p.ellipse(x + 3, fy, 5, 5, c);
      p.px(x + 5, fy + 2, B.dark);
      p.px(x + 4, fy + 2, mix(c, '#ffffff', 0.45));
      p.px(x + 6, fy + 2, mix(c, '#000000', 0.3));
    });
    p.px(x + 8, y + 1, '#f4f6fb');
    p.px(x + 2, y + 1, RGB[0]);
  });
}

/** Notebook aberto, de frente: tampa com a tela e a base com teclado e touchpad. */
function laptop(s: Sprite, cx: number, y: number, m: Mat, screen: ScreenPainter, keys: string): void {
  const x = cx - 11;
  s.piece((p) => {
    // base (trapézio: mais larga na frente)
    p.poly(
      [
        [x, y + 7],
        [x + 21, y + 7],
        [x + 23, y + 13],
        [x - 2, y + 13],
      ],
      m.light,
    );
    p.rect(x - 2, y + 13, 26, 1, m.dark);
    p.rect(x + 2, y + 8, 18, 3, keys);
    for (let i = 0; i < 18; i += 3) p.rect(x + 2 + i, y + 8, 1, 3, mix(keys, m.light, 0.35));
    p.rect(x + 8, y + 12, 6, 1, m.base);
  });
  s.piece((p) => {
    p.rrect(x, y - 7, 22, 14, m.base, 1);
    p.rect(x + 1, y - 7, 20, 1, m.hi);
    screen(p, x + 1, y - 6, 20, 11);
    p.rect(x + 1, y + 5, 20, 1, m.light);
    p.rect(x + 1, y + 6, 20, 1, m.dark);
  });
}

// ---------- setups ----------

type SetupPainter = (s: Sprite, spot: SetupSpot) => void;

const SETUPS: Record<string, SetupPainter> = {
  /** Padrão: o monitor, o teclado claro e o mouse da mesa de antes do visual v2. */
  monitor(s, spot) {
    const x = fit(spot, 26, 2);
    monitor(s, x, spot.y, 26, 17, screenWork);
    keyboardPiece(s, x + 2, spot.y + 7, 18, 'light');
    mousePiece(s, x + 22, spot.y + 6, PAL.plasticWhite, PAL.metal.dark);
  },
  /** PC gamer: ultrawide, gabinete com fans RGB e teclado RGB. */
  gamer(s, spot) {
    const total = 40 + 2 + 11;
    const x = fit(spot, total, 1);
    monitor(s, x, spot.y, 40, 16, screenGame, { baseW: 16, led: RGB[0] });
    tower(s, x + 42, spot.y - 9);
    keyboardPiece(s, x + 7, spot.y + 7, 20, 'rgb');
    mousePiece(s, x + 30, spot.y + 6, PAL.plasticBlack, RGB[4]);
  },
  /** Dois monitores lado a lado. */
  dual(s, spot) {
    const x = fit(spot, 45, 1);
    monitor(s, x, spot.y, 22, 15, screenWork, { baseW: 10 });
    monitor(s, x + 23, spot.y, 22, 15, screenChart, { baseW: 10 });
    keyboardPiece(s, x + 11, spot.y + 7, 18, 'dark');
    mousePiece(s, x + 32, spot.y + 6, PAL.plasticBlack, PAL.metal.base);
  },
  /** Notebook prata genérico (sem logo). */
  laptop_silver(s, spot) {
    const x = fit(spot, 28, 2);
    laptop(s, x + 14, spot.y + 1, { dark: PAL.metal.base, base: PAL.metal.light, light: PAL.metal.hi, hi: '#f1f3f5' }, screenWindow, PAL.metalDark.light);
  },
  /** All-in-one genérico: tela grande com queixo de alumínio, teclado e mouse brancos. */
  aio(s, spot) {
    const x = fit(spot, 28, 2);
    monitor(s, x, spot.y, 28, 20, screenWallpaper, { bezel: { dark: PAL.metal.base, base: PAL.metal.light, light: PAL.metal.hi, hi: '#f1f3f5' }, chin: 4, stand: PAL.metal, baseW: 12, neckW: 6 });
    keyboardPiece(s, x + 3, spot.y + 8, 16, 'white');
    mousePiece(s, x + 22, spot.y + 6, PAL.plasticWhite, PAL.metal.base);
  },
  /** Notebook comum, de plástico escuro, com mouse. */
  laptop(s, spot) {
    const x = fit(spot, 34, 2);
    laptop(s, x + 14, spot.y + 1, { dark: PAL.plasticBlack.base, base: PAL.metalDark.light, light: PAL.metalDark.hi, hi: '#6b6e75' }, screenTerminal, PAL.plasticBlack.base);
    mousePiece(s, x + 29, spot.y + 7, PAL.plasticBlack, PAL.metal.base);
  },
  none() {},
};

/** Ids de setup que têm desenho (devem ser os mesmos de `DESK_SETUPS`; há teste). */
export const SETUP_IDS = Object.keys(SETUPS);

/** Desenha o setup `id` sobre o tampo descrito por `spot`. Id desconhecido não desenha nada. */
export function paintSetup(s: Sprite, id: string | undefined, spot: SetupSpot): void {
  SETUPS[id ?? '']?.(s, spot);
}
