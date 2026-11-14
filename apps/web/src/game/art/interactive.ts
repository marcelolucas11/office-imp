// SPDX-License-Identifier: AGPL-3.0-only
// Objetos interativos do visual v2 (Fase C3): quadro branco, TV, quiosque (site incorporado),
// fliperama (jogo), pôster e nota. Só o desenho mudou: `interact` e `props` continuam iguais,
// e nada aqui depende do conteúdo do objeto (vídeo, site, imagem, texto). Sem marcas: o botão de
// "play" da TV é genérico e o fliperama mostra um jogo inventado.
import { GOLD, PAL, ramp, type Mat } from './palette';
import { mix } from './prim';
import { drawText } from './pixfont';
import type { PaintInfo, SpritePainter } from './sprites';

const matOf = (info: PaintInfo, fallback: string): Mat => ramp(info.color?.hex ?? fallback);
const B = PAL.plasticBlack;
const M = PAL.metal;
const MD = PAL.metalDark;
const INK = '#2a2f3a';

// ---------- quadro branco com cavalete e rodinhas (2×1) ----------

const whiteboard: SpritePainter = (s, info) => {
  const { w, top } = info;
  const y0 = top - 27;
  s.piece((p) => {
    // pés com rodinhas e a barra de baixo
    for (const x of [8, w - 11]) {
      p.rect(x, y0 + 36, 3, 21, M.base);
      p.rect(x, y0 + 36, 1, 21, M.hi);
      p.rect(x + 2, y0 + 36, 1, 21, M.dark);
      p.rect(x - 4, y0 + 56, 11, 2, M.dark);
      p.rect(x - 4, y0 + 58, 3, 2, B.base);
      p.rect(x + 4, y0 + 58, 3, 2, B.base);
    }
    p.rect(11, y0 + 48, w - 22, 2, M.light);
    p.rect(11, y0 + 49, w - 22, 1, M.dark);
  });
  s.piece((p) => {
    // moldura de alumínio e a superfície branca
    p.rect(2, y0, w - 4, 35, M.light);
    p.rect(2, y0, w - 4, 1, M.hi);
    p.rect(2, y0 + 34, w - 4, 1, M.dark);
    p.rect(w - 3, y0 + 1, 1, 33, M.dark);
    p.rect(4, y0 + 2, w - 8, 31, '#f7f8fa');
    p.rect(4, y0 + 2, w - 8, 1, '#e3e6eb');
    // rabiscos: título azul, tópicos, um gráfico e dois post-its
    p.rect(7, y0 + 5, 16, 2, '#3a6fc0');
    for (const [y, len] of [
      [y0 + 10, 20],
      [y0 + 14, 15],
      [y0 + 18, 18],
    ]) {
      p.px(7, y, INK);
      p.rect(9, y, len, 1, INK);
    }
    p.rect(7, y0 + 23, 12, 1, '#c8383c');
    p.rect(7, y0 + 25, 9, 1, INK);
    // gráfico de barras
    const gx = w - 26;
    p.rect(gx, y0 + 5, 1, 15, INK);
    p.rect(gx, y0 + 19, 16, 1, INK);
    for (const [i, h, c] of [
      [0, 5, '#3a6fc0'],
      [1, 9, '#3a6fc0'],
      [2, 7, '#3a6fc0'],
      [3, 12, GOLD],
    ] as const)
      p.rect(gx + 2 + i * 4, y0 + 19 - h, 3, h, c);
    p.rect(gx - 1, y0 + 24, 7, 6, '#f2d95c');
    p.rect(gx, y0 + 26, 4, 1, '#a68a2a');
    p.rect(gx + 8, y0 + 23, 7, 7, '#f08fb4');
    p.rect(gx + 9, y0 + 25, 4, 1, '#b0507a');
    // bandeja com os pincéis
    p.rect(6, y0 + 35, w - 12, 2, M.base);
    p.rect(12, y0 + 34, 5, 1, '#c8383c');
    p.rect(19, y0 + 34, 5, 1, '#3a6fc0');
    p.rect(26, y0 + 34, 5, 1, INK);
    p.rect(w - 16, y0 + 34, 6, 1, PAL.paper.base);
  });
};

// ---------- TV no rack (2×1) ----------

const tv: SpritePainter = (s, info) => {
  const { w, top } = info;
  const W = PAL.woodDark;
  s.piece((p) => {
    // rack baixo com duas portas e o aparelho no meio
    p.rect(3, top + 9, w - 6, 20, W.base);
    p.rect(3, top + 9, w - 6, 1, W.hi);
    p.rect(3, top + 10, w - 6, 1, W.light);
    p.rect(4, top + 13, 18, 13, W.dark);
    p.rect(5, top + 14, 16, 11, W.base);
    p.rect(w - 22, top + 13, 18, 13, W.dark);
    p.rect(w - 21, top + 14, 16, 11, W.base);
    p.rect(18, top + 19, 2, 1, GOLD);
    p.rect(w - 20, top + 19, 2, 1, GOLD);
    p.rect(24, top + 15, w - 48, 6, B.base);
    p.rect(25, top + 16, 3, 1, '#58d27a');
    p.rect(3, top + 28, w - 6, 1, W.dark);
    p.rect(5, top + 29, 2, 2, W.dark);
    p.rect(w - 7, top + 29, 2, 2, W.dark);
  });
  s.piece((p) => {
    // pé central e a barra de som em cima do rack
    p.rect(w / 2 - 6, top + 6, 12, 3, B.light);
    p.rect(w / 2 - 2, top + 3, 4, 3, B.base);
    p.rect(10, top + 7, 13, 2, B.base);
    p.rect(w - 23, top + 7, 13, 2, B.base);
  });
  s.piece((p) => {
    // tela fina, com moldura preta: um vídeo pausado (paisagem) e o botão de play genérico
    const y0 = top - 27;
    p.rect(2, y0, w - 4, 31, B.base);
    p.rect(2, y0, w - 4, 1, B.hi);
    const sx = 4;
    const sy = y0 + 2;
    const sw = w - 8;
    const sh = 26;
    p.rect(sx, sy, sw, sh, '#2b3c5c');
    p.rect(sx, sy + 15, sw, sh - 15, '#2d5244');
    for (let x = 0; x < sw; x++) {
      const hh = Math.round(4 + 3 * Math.sin(x / 6) + 2 * Math.sin(x / 2.7));
      p.rect(sx + x, sy + 15 - hh, 1, hh, '#3a4f73');
    }
    p.rect(sx + 6, sy + 4, 4, 4, '#e6cf95');
    p.ellipse(w / 2 - 6, sy + 7, 12, 12, '#14161b');
    p.poly(
      [
        [w / 2 - 2, sy + 10],
        [w / 2 + 3, sy + 13],
        [w / 2 - 2, sy + 16],
      ],
      '#f4f6fb',
    );
    // barra de progresso dourada
    p.rect(sx + 2, sy + sh - 3, sw - 4, 1, '#55607f');
    p.rect(sx + 2, sy + sh - 3, Math.round((sw - 4) * 0.4), 1, GOLD);
    p.px(sx + 2 + Math.round((sw - 4) * 0.4), sy + sh - 3, '#f4f6fb');
    p.px(w - 6, y0 + 29, '#e0525a');
  });
};

// ---------- quiosque (site incorporado) ----------

const kiosk: SpritePainter = (s, info) => {
  const { top } = info;
  s.piece((p) => {
    // coluna e base
    p.rect(12, top - 6, 8, 31, MD.base);
    p.rect(12, top - 6, 1, 31, MD.light);
    p.rect(19, top - 6, 1, 31, MD.dark);
    p.rect(14, top + 4, 4, 2, GOLD);
    p.rect(6, top + 24, 20, 5, MD.light);
    p.rect(6, top + 24, 20, 1, MD.hi);
    p.rect(6, top + 28, 20, 1, MD.dark);
  });
  s.piece((p) => {
    // tela de toque com uma página aberta: barra do navegador, cabeçalho, texto e botão
    const y0 = top - 29;
    p.rrect(4, y0, 24, 25, MD.base, 1);
    p.rect(5, y0, 22, 1, MD.hi);
    p.rect(6, y0 + 2, 20, 20, PAL.paper.hi);
    p.rect(6, y0 + 2, 20, 3, '#c9ced8');
    for (const [x, c] of [
      [7, '#e0525a'],
      [9, '#f2c94c'],
      [11, '#58b97a'],
    ] as const)
      p.px(x, y0 + 3, c);
    p.rect(14, y0 + 3, 10, 1, PAL.paper.hi);
    p.rect(6, y0 + 5, 20, 5, '#2b3c5c');
    p.rect(8, y0 + 7, 8, 1, GOLD);
    p.rect(8, y0 + 12, 9, 6, '#9fc4e8');
    p.rect(8, y0 + 15, 9, 3, '#7cb36a');
    for (const y of [y0 + 12, y0 + 14, y0 + 16]) p.rect(19, y, 5, 1, '#9aa3b5');
    p.rect(8, y0 + 19, 6, 2, '#3a6fc0');
    p.px(15, y0 + 23, MD.hi);
  });
};

// ---------- fliperama (jogo) ----------

const arcade: SpritePainter = (s, info) => {
  const m = matOf(info, '#4b1d7a');
  const { top } = info;
  const y0 = top - 30;
  s.piece((p) => {
    // gabinete: laterais na cor da variante com faixa, rodapé preto
    p.rect(4, y0 + 2, 24, 57, m.base);
    p.rect(4, y0 + 2, 2, 57, m.light);
    p.rect(26, y0 + 2, 2, 57, m.dark);
    p.rect(4, y0 + 2, 24, 1, m.hi);
    p.rect(5, y0 + 40, 1, 14, m.hi);
    p.rect(4, y0 + 56, 24, 3, B.base);
    // porta das fichas: entrada acesa e a bandeja de devolução
    p.rect(9, y0 + 43, 14, 11, mix(m.dark, '#000000', 0.35));
    p.rect(10, y0 + 44, 12, 1, mix(m.dark, '#000000', 0.1));
    p.rect(13, y0 + 46, 6, 3, B.light);
    p.rect(15, y0 + 47, 2, 1, '#f08a3c');
    p.rect(13, y0 + 50, 6, 2, B.dark);
    p.rect(13, y0 + 50, 6, 1, M.dark);
  });
  s.piece((p) => {
    // letreiro aceso com "PLAY"
    p.rect(3, y0, 26, 8, '#f2c94c');
    p.rect(3, y0, 26, 1, '#fbe7a1');
    p.rect(3, y0 + 7, 26, 1, '#c99a2c');
    drawText(p, 'PLAY', 9, y0 + 2, '#7a2a1a');
  });
  s.piece((p) => {
    // tela com um jogo de plataforma inventado
    const sy = y0 + 10;
    p.rect(6, sy, 20, 17, B.dark);
    p.rect(7, sy + 1, 18, 15, '#121a33');
    p.rect(8, sy + 2, 3, 1, '#f4f6fb');
    p.rect(19, sy + 2, 5, 1, '#f2c94c');
    p.rect(8, sy + 12, 6, 1, '#58b97a');
    p.rect(16, sy + 9, 7, 1, '#58b97a');
    p.rect(9, sy + 9, 2, 3, '#e0525a');
    p.px(9, sy + 9, '#f4c7a1');
    p.rect(19, sy + 7, 2, 2, '#f2c94c');
    p.rect(7, sy + 15, 18, 1, '#3a6fc0');
  });
  s.piece((p) => {
    // painel de controle: alavanca e botões
    const cy = y0 + 29;
    p.rect(3, cy, 26, 6, B.light);
    p.rect(3, cy, 26, 1, B.hi);
    p.rect(3, cy + 5, 26, 1, B.dark);
    p.rect(9, cy - 3, 1, 4, M.base);
    p.rect(8, cy - 4, 3, 2, '#e0525a');
    p.px(8, cy - 4, '#f08a8a');
    p.rect(15, cy + 2, 2, 2, '#4a86c9');
    p.rect(19, cy + 1, 2, 2, '#f2c94c');
    p.rect(23, cy + 2, 2, 2, '#58b97a');
  });
};

// ---------- pôster (imagem) ----------

const poster: SpritePainter = (s, info) => {
  const m = matOf(info, '#f08a3c');
  // cabe na face de uma parede (linhas 10 a 30), como os objetos de parede, e também no chão
  s.piece((p) => {
    // papel com a ilustração: céu, sol na cor da variante, montanhas e o título
    p.rect(8, 8, 16, 22, PAL.paper.base);
    p.rect(8, 29, 16, 1, PAL.paper.dark);
    p.rect(23, 9, 1, 20, PAL.paper.dark);
    p.rect(10, 10, 12, 12, '#2b3c5c');
    p.ellipse(13, 12, 6, 6, m.base);
    p.rect(14, 13, 2, 1, m.hi);
    p.poly(
      [
        [10, 21],
        [13, 16],
        [16, 19],
        [18, 15],
        [21, 21],
      ],
      '#1d2a40',
    );
    p.rect(10, 24, 10, 2, INK);
    p.rect(10, 27, 7, 1, '#9aa3b5');
    p.rect(19, 27, 3, 1, m.base);
  });
  s.piece((p) => {
    // fitas nos cantos
    p.rect(7, 7, 3, 2, '#e9e1c8');
    p.rect(22, 7, 3, 2, '#e9e1c8');
  });
};

// ---------- nota / placa ----------

const note: SpritePainter = (s, info) => {
  const m = matOf(info, '#f2d95c');
  const W = PAL.woodLight;
  s.piece((p) => {
    // estaca com o pezinho
    p.rect(15, 16, 2, 13, W.dark);
    p.rect(15, 16, 1, 13, W.base);
    p.rect(12, 28, 8, 2, W.dark);
    p.rect(12, 28, 8, 1, W.base);
  });
  s.piece((p) => {
    // plaquinha de madeira com o papel preso por uma tachinha
    p.rect(6, 4, 20, 14, W.base);
    p.rect(6, 4, 20, 1, W.hi);
    p.rect(6, 17, 20, 1, W.dark);
    p.rect(25, 5, 1, 12, W.dark);
    p.rect(8, 6, 16, 10, m.base);
    p.rect(8, 6, 16, 1, m.light);
    p.rect(23, 7, 1, 9, m.dark);
    for (const [y, len] of [
      [9, 11],
      [11, 13],
      [13, 8],
    ])
      p.rect(10, y, len, 1, mix(m.dark, INK, 0.6));
    p.px(16, 6, '#c8383c');
  });
};

export const INTERACTIVE: Record<string, SpritePainter> = { whiteboard, tv, kiosk, arcade, poster, note };

