// SPDX-License-Identifier: AGPL-3.0-only
// Mesas de trabalho do visual v2 (Fase C1): reta 2×1 e 3×1, em L, de pé, de vidro, executiva,
// gamer e bancada compartilhada. Todas têm `desk: true` em `@office-imp/shared` e recebem o
// setup (monitor, PC gamer, notebook…) por cima do tampo, desenhado por `setups.ts`.
// Medidas comuns: o tampo ocupa as linhas `top + 3 … top + 20` do footprint (18 px de fundo),
// a borda da frente `top + 21 … top + 23` e os pés até `top + 30`. Os objetos pequenos de mesa
// (`deskitems.ts`) são desenhados para cair em cima dessa faixa.
import { GOLD, PAL, ramp, type Mat } from './palette';
import { Sprite, mix, noise, shade } from './prim';
import { paintSetup, type SetupSpot } from './setups';
import type { PaintInfo, SpritePainter } from './sprites';

/** Primeira linha do tampo e fundo dele, relativos a `info.top`. */
const SURF = 3;
const DEPTH = 18;
const EDGE = 3;

const topMat = (info: PaintInfo, fallback: string): Mat => ramp(info.color?.hex ?? fallback);

/** Centro (x) do assento padrão do tipo: é ali que o setup fica. */
function seatCx(info: PaintInfo, seatCol: number): number {
  return seatCol * 32 + 16;
}

/** Tampo de madeira (ou laminado): face de cima com veios, filete de luz no fundo e borda da frente. */
function woodTop(p: Sprite, x: number, y: number, w: number, depth: number, edge: number, m: Mat, seed: number): void {
  p.rect(x, y, w, depth, m.base);
  p.rect(x, y, w, 1, m.hi);
  p.rect(x, y + 1, w, 1, m.light);
  const vein = mix(m.base, m.dark, 0.4);
  const n = Math.max(2, Math.round((w * depth) / 150));
  for (let i = 0; i < n; i++) {
    const len = 3 + Math.floor(noise(i, seed, 3) * 6);
    const gx = x + 2 + Math.floor(noise(i, seed, 1) * Math.max(1, w - len - 4));
    const gy = y + 3 + Math.floor(noise(i, seed, 2) * Math.max(1, depth - 5));
    p.rect(gx, gy, len, 1, i % 3 === 0 ? m.light : vein);
  }
  p.rect(x, y + depth, w, edge, m.dark);
  p.rect(x, y + depth, w, 1, mix(m.base, m.dark, 0.5));
}

/** Pé de metal reto, de 3 px. */
function leg(p: Sprite, x: number, y: number, h: number, m: Mat = PAL.metal): void {
  p.rect(x, y, 3, h, m.base);
  p.rect(x, y, 1, h, m.light);
  p.rect(x + 2, y, 1, h, m.dark);
}

/** Gaveteiro sob o tampo: caixa com uma divisão e dois puxadores. */
function pedestal(p: Sprite, x: number, y: number, w: number, m: Mat, handle: string): void {
  p.rect(x, y, w, 7, shade(m.dark, -0.12));
  p.rect(x + 1, y, w - 2, 3, m.dark);
  p.rect(x + 1, y + 4, w - 2, 3, m.dark);
  p.rect(x + Math.floor(w / 2) - 2, y + 1, 4, 1, handle);
  p.rect(x + Math.floor(w / 2) - 2, y + 5, 4, 1, handle);
}

function spotOf(info: PaintInfo, seatCol: number, y = info.top + SURF): SetupSpot {
  return { cx: seatCx(info, seatCol), y, x0: 1, x1: info.w - 2 };
}

/** Mesa reta (2×1 e 3×1): tampo de madeira, pé de metal à esquerda e gaveteiro à direita. */
function straight(seatCol: number): SpritePainter {
  return (s, info) => {
    const m = topMat(info, PAL.woodLight.base);
    const { w, top } = info;
    s.piece((p) => {
      leg(p, 3, top + 24, 7);
      if (w > 64) leg(p, w - 20, top + 24, 7);
      pedestal(p, w - 16, top + 24, 13, m, PAL.metal.hi);
    });
    s.piece((p) => woodTop(p, 1, top + SURF, w - 2, DEPTH, EDGE, m, w));
    paintSetup(s, info.setup?.id, spotOf(info, seatCol));
  };
}

/**
 * Mesa em L (3×2): tampo de 3 blocos em cima e um retorno de 1 bloco descendo pela esquerda
 * (pela direita com `dir: 'right'`). Quem senta fica no vão, de frente para o tampo de cima.
 */
const deskL: SpritePainter = (s, info) => {
  const m = topMat(info, PAL.woodLight.base);
  const { w, top } = info;
  const body = new Sprite(s.w, s.h);
  body.piece((p) => {
    leg(p, 3, top + 56, 7);
    leg(p, 26, top + 56, 7);
    leg(p, w - 6, top + 24, 7);
    leg(p, 33, top + 24, 5);
  });
  body.piece((p) => {
    woodTop(p, 1, top + SURF, w - 2, DEPTH, EDGE, m, 7);
    // retorno: continua o tampo para baixo, sem emenda
    p.rect(1, top + SURF + 2, 30, DEPTH + 32 - 2, m.base);
    const vein = mix(m.base, m.dark, 0.4);
    for (let i = 0; i < 5; i++) {
      const len = 3 + Math.floor(noise(i, 11, 3) * 5);
      p.rect(3 + Math.floor(noise(i, 11, 1) * (26 - len)), top + 24 + Math.floor(noise(i, 11, 2) * 24), len, 1, i % 2 ? m.light : vein);
    }
    p.rect(1, top + SURF + 2, 1, DEPTH + 30, m.light);
    p.rect(1, top + 32 + SURF + DEPTH, 30, EDGE, m.dark);
    p.rect(1, top + 32 + SURF + DEPTH, 30, 1, mix(m.base, m.dark, 0.5));
  });
  s.paste(info.o.dir === 'right' ? body.flipX() : body);
  paintSetup(s, info.setup?.id, spotOf(info, 1));
};

/** Mesa de pé: tampo mais alto e mais raso, colunas telescópicas, pés em T e o controle de altura. */
const standing: SpritePainter = (s, info) => {
  const m = topMat(info, PAL.woodLight.base);
  const { w, top } = info;
  const y = top - 3;
  s.piece((p) => {
    for (const x of [7, w - 11]) {
      p.rect(x, top + 17, 4, 6, PAL.metal.base);
      p.rect(x, top + 17, 1, 6, PAL.metal.light);
      p.rect(x + 1, top + 23, 2, 5, PAL.metal.hi);
      p.rect(x - 3, top + 28, 10, 3, PAL.metalDark.light);
      p.rect(x - 3, top + 28, 10, 1, PAL.metalDark.hi);
    }
    p.rect(9, top + 15, w - 18, 2, PAL.metalDark.base);
    p.rect(9, top + 15, w - 18, 1, PAL.metalDark.light);
  });
  s.piece((p) => {
    woodTop(p, 1, y, w - 2, 16, 2, m, 5);
    // controle de altura preso na borda da frente
    p.rect(w - 14, top + 13, 7, 3, PAL.plasticBlack.base);
    p.px(w - 13, top + 14, '#58d27a');
    p.px(w - 11, top + 14, PAL.metal.hi);
    p.px(w - 9, top + 14, PAL.metal.hi);
  });
  paintSetup(s, info.setup?.id, spotOf(info, 0, y));
};

/** Mesa de vidro: tampo claro com reflexos em diagonal, a estrutura cromada vista através dele e pés retos. */
const glass: SpritePainter = (s, info) => {
  const g = topMat(info, PAL.glass.base);
  const { w, top } = info;
  const y = top + SURF;
  const M = PAL.metal;
  s.piece((p) => {
    for (const x of [4, w - 7]) {
      p.rect(x, top + 22, 3, 8, M.base);
      p.rect(x, top + 22, 1, 8, M.hi);
      p.rect(x - 1, top + 30, 5, 1, M.dark);
    }
    p.rect(7, top + 25, w - 14, 2, M.light);
    p.rect(7, top + 26, w - 14, 1, M.dark);
  });
  s.piece((p) => {
    p.rrect(1, y, w - 2, DEPTH + 1, g.base, 1);
    p.rrect(2, y + 1, w - 4, DEPTH - 1, g.light, 1);
    // estrutura de metal por baixo do vidro
    const under = mix(g.light, g.dark, 0.3);
    p.rect(5, y + 4, w - 10, 1, under);
    p.rect(5, y + DEPTH - 4, w - 10, 1, under);
    p.rect(5, y + 4, 1, DEPTH - 7, under);
    p.rect(w - 6, y + 4, 1, DEPTH - 7, under);
    // reflexos em diagonal (2 px de espessura)
    const shine = mix(g.hi, '#ffffff', 0.5);
    for (const [rx, len] of [
      [9, 8],
      [14, 5],
      [w - 24, 7],
    ] as const) {
      for (let i = 0; i < len; i++) {
        p.px(rx + i, y + 4 + len - i, shine);
        p.px(rx + i + 1, y + 4 + len - i, shine);
      }
    }
    p.rect(2, y, w - 4, 1, g.hi);
    p.rect(1, y + DEPTH + 1, w - 2, 1, g.dark);
    p.rect(2, y + DEPTH + 2, w - 4, 1, shade(g.dark, -0.15));
  });
  paintSetup(s, info.setup?.id, spotOf(info, 0));
};

/** Mesa executiva: madeira escura, painel frontal com gaveteiros dos dois lados e puxadores dourados. */
const executive: SpritePainter = (s, info) => {
  const m = topMat(info, PAL.woodDark.base);
  const { w, top } = info;
  s.piece((p) => {
    p.rect(2, top + 24, w - 4, 7, shade(m.dark, -0.25));
    p.rect(18, top + 25, w - 36, 5, shade(m.dark, -0.1));
    for (const x of [2, w - 17]) {
      p.rect(x, top + 24, 15, 7, m.base);
      p.rect(x, top + 27, 15, 1, m.dark);
      p.rect(x, top + 30, 15, 1, m.dark);
      p.rect(x + 5, top + 25, 5, 1, GOLD);
      p.rect(x + 5, top + 28, 5, 1, GOLD);
    }
  });
  s.piece((p) => {
    woodTop(p, 1, top + SURF, w - 2, DEPTH, EDGE, m, 9);
    // filete embutido em volta do tampo
    const inlay = mix(m.base, GOLD, 0.45);
    p.rect(4, top + SURF + 3, w - 8, 1, inlay);
    p.rect(4, top + SURF + DEPTH - 3, w - 8, 1, inlay);
    p.rect(4, top + SURF + 3, 1, DEPTH - 5, inlay);
    p.rect(w - 5, top + SURF + 3, 1, DEPTH - 5, inlay);
  });
  paintSetup(s, info.setup?.id, spotOf(info, 0));
};

/** Mesa gamer: tampo preto de cantos arredondados, filete na cor de destaque e pés em T. */
const gamer: SpritePainter = (s, info) => {
  const a = ramp(info.color?.hex ?? '#c8383c');
  const { w, top } = info;
  const y = top + SURF;
  const B = PAL.metalDark;
  s.piece((p) => {
    for (const x of [5, w - 9]) {
      p.rect(x, top + 23, 4, 6, B.base);
      p.rect(x, top + 23, 1, 6, B.light);
      p.rect(x - 3, top + 29, 10, 2, B.base);
      p.rect(x - 3, top + 29, 2, 2, a.base);
      p.rect(x + 5, top + 29, 2, 2, a.base);
    }
    p.rect(9, top + 25, w - 18, 2, PAL.plasticBlack.base);
  });
  s.piece((p) => {
    p.rrect(1, y, w - 2, DEPTH + EDGE, PAL.plasticBlack.dark, 2);
    p.rrect(1, y, w - 2, DEPTH, B.base, 2);
    p.rect(3, y, w - 6, 1, B.hi);
    // textura de fibra de carbono: pontinhos discretos
    for (let ty = y + 3; ty < y + DEPTH - 2; ty += 3) for (let tx = 4 + (((ty - y) / 3) % 2) * 2; tx < w - 4; tx += 4) p.px(tx, ty, B.light);
    p.rect(2, y + DEPTH, w - 4, 1, a.base);
    p.rect(2, y + DEPTH - 1, 3, 1, a.light);
    p.rect(w - 5, y + DEPTH - 1, 3, 1, a.light);
    // passa-fios
    p.rect(w - 12, y + 2, 4, 2, PAL.plasticBlack.dark);
  });
  paintSetup(s, info.setup?.id, spotOf(info, 0));
};

/**
 * Bancada compartilhada: um módulo de 2 blocos por pessoa. O tampo vai de ponta a ponta e os
 * pés ficam nas pontas, então módulos encostados formam uma bancada contínua; atrás, uma
 * divisória baixa de feltro.
 */
const bench: SpritePainter = (s, info) => {
  const m = topMat(info, PAL.woodLight.base);
  const { w, top } = info;
  const y = top + SURF;
  const W = PAL.plasticWhite;
  s.piece((p) => {
    p.rect(1, top + 24, 2, 7, W.base);
    p.rect(w - 3, top + 24, 2, 7, W.base);
    p.rect(3, top + 25, w - 6, 2, W.dark);
    p.rect(3, top + 25, w - 6, 1, W.base);
  });
  s.piece((p) => woodTop(p, 1, y, w - 2, DEPTH, EDGE, m, 13));
  s.piece((p) => {
    const F = PAL.fabric;
    p.rect(3, y - 7, w - 6, 9, F.base);
    p.rect(3, y - 7, w - 6, 1, F.hi);
    p.rect(3, y - 6, w - 6, 1, F.light);
    p.rect(3, y + 1, w - 6, 1, F.dark);
    for (let x = 8; x < w - 8; x += 6) p.px(x, y - 3 + ((x / 6) % 2), F.light);
    p.rect(5, y + 1, 2, 2, PAL.metal.base);
    p.rect(w - 7, y + 1, 2, 2, PAL.metal.base);
  });
  paintSetup(s, info.setup?.id, spotOf(info, 0));
};

export const DESKS: Record<string, SpritePainter> = {
  desk: straight(0),
  desk_wide: straight(1),
  desk_l: deskL,
  desk_standing: standing,
  desk_glass: glass,
  desk_dark: executive,
  desk_gamer: gamer,
  desk_bench: bench,
};
