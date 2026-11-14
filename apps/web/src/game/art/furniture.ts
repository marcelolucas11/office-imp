// SPDX-License-Identifier: AGPL-3.0-only
// Móveis e decoração do visual v2 (Fase C3): mesa de reunião (redimensionável), mesa redonda,
// balcão (redimensionável), estante, armário, luminária de chão, púlpito, tapetes e quadro.
// Todos são os tipos de antes do visual v2, com o mesmo tamanho e a mesma colisão; só o desenho
// mudou e ganharam variantes de cor (a primeira é a mais próxima da cor antiga).
import { GOLD, PAL, ramp, type Mat } from './palette';
import { Sprite, mix, noise, shade } from './prim';
import { leg, woodTop } from './desks';
import type { PaintInfo, SpritePainter } from './sprites';

const matOf = (info: PaintInfo, fallback: string): Mat => ramp(info.color?.hex ?? fallback);
const B = PAL.plasticBlack;
const M = PAL.metal;
const MD = PAL.metalDark;

// ---------- mesa de reunião (redimensionável) ----------

/**
 * Tampo de madeira em qualquer tamanho: a face de cima ocupa até 10 px antes do fim do footprint,
 * depois a borda da frente (3 px) e os pés. No meio, a caixa de tomadas embutida.
 */
const table: SpritePainter = (s, info) => {
  const m = matOf(info, PAL.woodLight.base);
  const { w, h, top } = info;
  const depth = Math.max(8, h - 13);
  s.piece((p) => {
    // pés em cavalete nas pontas, com a travessa
    const legH = h - depth - 6;
    for (const x of [4, w - 7]) {
      leg(p, x, top + depth + 4, legH, MD);
      p.rect(x - 2, top + h - 3, 7, 2, MD.base);
      p.rect(x - 2, top + h - 3, 7, 1, MD.light);
    }
    if (w > 40) {
      p.rect(7, top + depth + 7, w - 14, 2, MD.base);
      p.rect(7, top + depth + 7, w - 14, 1, MD.light);
    }
  });
  s.piece((p) => {
    woodTop(p, 1, top + 3, w - 2, depth, 3, m, w * 7 + h);
    // filete escuro em volta do tampo, a 3 px da borda
    const inlay = mix(m.base, m.dark, 0.35);
    if (w >= 48 && depth >= 14) {
      p.rect(4, top + 6, w - 8, 1, inlay);
      p.rect(4, top + depth - 1, w - 8, 1, inlay);
      p.rect(4, top + 6, 1, depth - 6, inlay);
      p.rect(w - 5, top + 6, 1, depth - 6, inlay);
    }
    // caixa de tomadas no centro (mesa de reunião de escritório)
    if (w >= 48) {
      const cx = Math.floor(w / 2);
      const cy = top + 3 + Math.floor(depth / 2) - 2;
      p.rect(cx - 6, cy, 12, 5, MD.base);
      p.rect(cx - 6, cy, 12, 1, MD.hi);
      p.rect(cx - 4, cy + 2, 2, 2, B.dark);
      p.rect(cx - 1, cy + 2, 2, 2, B.dark);
      p.rect(cx + 2, cy + 2, 3, 1, GOLD);
    }
  });
};

// ---------- mesa redonda (1×1) ----------

const tableRound: SpritePainter = (s, info) => {
  const m = matOf(info, PAL.woodLight.base);
  s.piece((p) => {
    // coluna central e base em disco
    p.rect(14, 20, 4, 7, MD.base);
    p.rect(14, 20, 1, 7, MD.light);
    p.ellipse(8, 26, 16, 5, MD.base);
    p.rect(11, 26, 8, 1, MD.hi);
  });
  s.piece((p) => {
    // tampo chapado: a espessura embaixo, a face de cima e o filete de luz na borda de trás
    p.ellipse(2, 5, 28, 17, m.dark);
    p.ellipse(2, 3, 28, 17, m.base);
    p.ellipse(5, 3, 22, 3, m.light);
    p.ellipse(4, 4, 24, 15, m.base);
    p.rect(10, 3, 12, 1, m.hi);
    for (let i = 0; i < 4; i++) p.rect(7 + Math.floor(noise(i, 2, 51) * 14), 8 + i * 2, 3 + Math.floor(noise(i, 3, 52) * 3), 1, mix(m.base, m.dark, 0.4));
  });
  s.piece((p) => {
    // xícara de café no pires
    p.rect(16, 11, 8, 3, PAL.paper.dark);
    p.rect(17, 11, 6, 2, PAL.paper.base);
    p.rect(18, 8, 4, 4, PAL.paper.hi);
    p.rect(18, 8, 4, 1, '#5a3523');
    p.rect(22, 9, 1, 2, PAL.paper.base);
  });
};

// ---------- balcão (redimensionável) ----------

const STONE = { dark: '#bdb8af', base: '#e1ddd5', light: '#ece9e3', hi: '#f8f6f2' };

const counter: SpritePainter = (s, info) => {
  const m = matOf(info, '#46423e');
  const { w, h, top } = info;
  const face = 16;
  const depth = h - face - 4;
  const fy = top + 2 + depth;
  s.piece((p) => {
    // corpo: portas de ~1 bloco com puxador dourado e rodapé recuado
    p.rect(2, fy, w - 4, face, m.base);
    p.rect(2, fy, w - 4, 1, m.dark);
    const doors = Math.max(1, Math.round((w - 4) / 30));
    for (let i = 0; i < doors; i++) {
      const x0 = 3 + Math.round(((w - 6) * i) / doors);
      const x1 = 3 + Math.round(((w - 6) * (i + 1)) / doors) - 1;
      p.rect(x0, fy + 2, x1 - x0, face - 6, m.light);
      p.rect(x0 + 1, fy + 3, x1 - x0 - 2, face - 8, m.base);
      p.rect(x1 - 4, fy + 4, 2, 1, GOLD);
    }
    p.rect(3, fy + face - 3, w - 6, 3, shade(m.dark, -0.3));
    p.rect(w - 3, fy, 1, face - 3, m.dark);
  });
  s.piece((p) => {
    // tampo de pedra clara com pintinhas e a borda arredondada na frente
    p.rect(1, top + 2, w - 2, depth, STONE.base);
    p.rect(1, top + 2, w - 2, 1, STONE.hi);
    p.rect(1, top + 3, 1, depth - 2, STONE.light);
    for (let y = top + 4; y < top + depth; y += 2) {
      for (let x = 3; x < w - 3; x += 3) {
        const n = noise(x, y, 71);
        if (n > 0.82) p.px(x, y, STONE.dark);
        else if (n < 0.1) p.px(x + 1, y, STONE.hi);
      }
    }
    p.rect(1, top + 1 + depth, w - 2, 2, STONE.light);
    p.rect(1, top + 2 + depth, w - 2, 1, STONE.dark);
    // filete dourado sob o tampo
    p.rect(2, top + 3 + depth, w - 4, 1, GOLD);
  });
};

// ---------- estante (1×1, alta) ----------

const BOOKS = ['#8a3b3b', '#3b5a8a', '#4a7a52', '#c9a45a', '#6b4a7a', '#d9d3c7', '#2f3a4f', '#a8643a'];

/** Fileira de livros em pé numa prateleira; alguns deitados ou inclinados. `y` = linha da prateleira. */
function bookRow(p: Sprite, x0: number, x1: number, y: number, seed: number): void {
  let x = x0;
  let i = 0;
  while (x < x1) {
    const n = noise(i, seed, 81);
    const bw = 2 + Math.floor(noise(i, seed, 82) * 2);
    const bh = 7 + Math.floor(noise(i, seed, 83) * 4);
    if (x + bw > x1) break;
    const c = BOOKS[Math.floor(n * BOOKS.length)];
    if (n > 0.9 && x + 7 < x1) {
      // pilha deitada
      for (let k = 0; k < 3; k++) {
        const cc = BOOKS[(Math.floor(n * 10) + k) % BOOKS.length];
        p.rect(x, y - 2 - k * 2, 7, 2, cc);
        p.rect(x, y - 2 - k * 2, 7, 1, mix(cc, '#ffffff', 0.25));
      }
      x += 8;
    } else {
      p.rect(x, y - bh, bw, bh, c);
      p.rect(x, y - bh, bw, 1, mix(c, '#ffffff', 0.3));
      p.rect(x + bw - 1, y - bh + 1, 1, bh - 1, mix(c, '#000000', 0.25));
      if (bh > 8) p.rect(x, y - bh + 3, bw - 1, 1, mix(c, GOLD, 0.5));
      x += bw;
    }
    i++;
  }
}

const bookshelf: SpritePainter = (s, info) => {
  const m = matOf(info, PAL.woodDark.base);
  const { top } = info;
  const y0 = top - 29;
  const back = mix(m.dark, '#000000', 0.35);
  s.piece((p) => {
    // caixa da estante
    p.rect(3, y0, 26, 59, m.base);
    p.rect(3, y0, 26, 1, m.hi);
    p.rect(3, y0 + 1, 1, 58, m.light);
    p.rect(28, y0 + 1, 1, 58, m.dark);
    // três nichos com fundo escuro
    const shelves = [y0 + 3, y0 + 16, y0 + 29];
    for (const sy of shelves) {
      p.rect(5, sy, 22, 11, back);
      p.rect(5, sy, 22, 1, mix(back, '#000000', 0.3));
      p.rect(4, sy + 11, 24, 2, m.light);
      p.rect(4, sy + 12, 24, 1, m.base);
    }
    // portas embaixo
    const dy = y0 + 42;
    p.rect(5, dy, 22, 15, m.dark);
    p.rect(5, dy, 10, 15, m.base);
    p.rect(17, dy, 10, 15, m.base);
    p.rect(6, dy + 1, 1, 13, m.light);
    p.rect(18, dy + 1, 1, 13, m.light);
    p.rect(13, dy + 6, 1, 3, GOLD);
    p.rect(18, dy + 6, 1, 3, GOLD);
    p.rect(3, y0 + 58, 26, 1, m.dark);
    // livros e enfeites
    bookRow(p, 5, 21, y0 + 14, 1);
    bookRow(p, 5, 27, y0 + 27, 2);
    bookRow(p, 12, 27, y0 + 40, 3);
    // vasinho na prateleira de cima
    p.rect(22, y0 + 10, 4, 4, PAL.terracotta.base);
    p.rect(22, y0 + 10, 4, 1, PAL.terracotta.light);
    p.rect(22, y0 + 7, 2, 3, PAL.plant.light);
    p.rect(24, y0 + 6, 2, 4, PAL.plant.base);
    p.px(21, y0 + 8, PAL.plant.base);
    // caixa organizadora embaixo à esquerda
    p.rect(6, y0 + 34, 6, 6, '#c9b48a');
    p.rect(6, y0 + 34, 6, 1, '#ddcca6');
    p.rect(8, y0 + 36, 2, 1, '#8a7650');
  });
};

// ---------- armário (gaveteiro) ----------

const cabinet: SpritePainter = (s, info) => {
  const m = matOf(info, '#57534e');
  const handle = info.color?.id === 'wood' ? GOLD : M.hi;
  s.piece((p) => {
    // tampo
    p.rect(3, 3, 26, 5, m.light);
    p.rect(3, 3, 26, 1, m.hi);
    p.rect(3, 7, 26, 1, m.dark);
    // frente com três gavetas, puxador e etiqueta
    p.rect(3, 8, 26, 21, m.base);
    p.rect(28, 8, 1, 21, m.dark);
    for (const y of [9, 16, 23]) {
      p.rect(5, y, 22, 6, m.light);
      p.rect(5, y + 5, 22, 1, m.dark);
      p.rect(6, y + 1, 1, 4, m.hi);
      p.rect(13, y + 2, 6, 1, handle);
      p.rect(13, y + 3, 6, 1, mix(handle, '#000000', 0.35));
      p.rect(8, y + 2, 3, 2, PAL.paper.base);
    }
    // rodinhas
    p.rect(5, 29, 3, 2, B.base);
    p.rect(24, 29, 3, 2, B.base);
  });
};

// ---------- luminária de chão ----------

const lamp: SpritePainter = (s, info) => {
  const m = matOf(info, '#f1e2b8');
  const { top } = info;
  const pole = info.color?.id === 'gold' ? PAL.gold : { dark: MD.dark, base: MD.base, light: MD.light, hi: MD.hi };
  s.piece((p) => {
    // base pesada e haste
    p.ellipse(9, top + 25, 14, 5, pole.base);
    p.rect(12, top + 25, 6, 1, pole.hi);
    p.rect(15, top - 14, 2, 40, pole.base);
    p.rect(15, top - 14, 1, 40, pole.light);
    // interruptor de pé
    p.rect(21, top + 27, 3, 2, B.base);
    p.line(17, top + 26, 21, top + 28, B.light);
  });
  s.piece((p) => {
    // cúpula em tronco de cone
    const y = top - 28;
    p.poly(
      [
        [10, y],
        [21, y],
        [25, y + 14],
        [6, y + 14],
      ],
      m.base,
    );
    p.rect(10, y, 12, 1, m.hi);
    p.line(9, y + 3, 7, y + 12, m.light);
    p.line(22, y + 1, 24, y + 13, m.dark);
    p.line(21, y + 1, 23, y + 13, mix(m.base, m.dark, 0.5));
    // borda de baixo e a lâmpada aparecendo
    p.rect(6, y + 14, 20, 1, m.dark);
    p.rect(13, y + 15, 6, 1, '#fff2b8');
  });
};

// ---------- púlpito ----------

const podium: SpritePainter = (s, info) => {
  const m = matOf(info, PAL.woodDark.base);
  s.piece((p) => {
    // corpo afunilando para baixo, com o painel e o emblema dourado
    p.poly(
      [
        [7, 10],
        [24, 10],
        [22, 28],
        [9, 28],
      ],
      m.base,
    );
    p.line(8, 11, 10, 27, m.light);
    p.line(23, 11, 21, 27, m.dark);
    p.rect(11, 13, 10, 11, m.dark);
    p.rect(12, 14, 8, 9, m.base);
    // coroa pequena (Impera)
    p.rect(13, 19, 6, 2, GOLD);
    p.px(13, 17, GOLD);
    p.px(13, 18, GOLD);
    p.px(16, 16, GOLD);
    p.rect(15, 17, 2, 2, GOLD);
    p.px(18, 17, GOLD);
    p.px(18, 18, GOLD);
    p.rect(14, 20, 4, 1, PAL.gold.dark);
    p.rect(7, 28, 18, 2, m.dark);
  });
  s.piece((p) => {
    // tampo inclinado para ler, com a folha
    p.poly(
      [
        [6, 6],
        [25, 6],
        [26, 10],
        [5, 10],
      ],
      m.light,
    );
    p.rect(6, 6, 20, 1, m.hi);
    p.rect(5, 10, 22, 1, m.dark);
    p.rect(10, 7, 8, 3, PAL.paper.hi);
    p.rect(11, 8, 5, 1, PAL.paper.dark);
  });
  s.piece((p) => {
    // microfone de haste flexível
    p.line(22, 7, 22, 4, MD.light);
    p.line(22, 4, 19, 2, MD.light);
    p.rect(18, 1, 2, 2, B.base);
  });
};

// ---------- tapetes ----------

/** Tapete de qualquer tamanho: barra com filete, campo com losangos e franjas nas pontas. */
function rugBody(p: Sprite, w: number, h: number, top: number, m: Mat, accent: string): void {
  const x0 = 4;
  const x1 = w - 5;
  const y0 = top + 3;
  const y1 = top + h - 4;
  p.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, m.dark);
  // campo com losangos de 1 px
  p.rect(x0 + 4, y0 + 4, x1 - x0 - 7, y1 - y0 - 7, m.base);
  for (let y = y0 + 6; y <= y1 - 6; y++) {
    for (let x = x0 + 6; x <= x1 - 6; x++) {
      const u = (x - x0) % 8;
      const v = (y - y0) % 8;
      if (Math.abs(u - 4) + Math.abs(v - 4) === 3) p.px(x, y, m.light);
      else if (u === 4 && v === 4) p.px(x, y, accent);
    }
  }
  // filetes da barra
  p.rect(x0 + 2, y0 + 2, x1 - x0 - 3, 1, accent);
  p.rect(x0 + 2, y1 - 2, x1 - x0 - 3, 1, accent);
  p.rect(x0 + 2, y0 + 2, 1, y1 - y0 - 3, accent);
  p.rect(x1 - 2, y0 + 2, 1, y1 - y0 - 3, accent);
  p.rect(x0, y0, x1 - x0 + 1, 1, m.light);
  // franjas nas pontas
  const fringe = mix(PAL.paper.dark, m.base, 0.15);
  for (let y = y0 + 1; y < y1; y += 2) {
    p.rect(x0 - 2, y, 2, 1, fringe);
    p.rect(x1 + 1, y, 2, 1, fringe);
  }
}

const rugAccent = (info: PaintInfo, m: Mat): string => (info.color?.id ?? 'graphite') === 'graphite' ? GOLD : info.color?.id === 'sand' ? m.dark : mix(m.hi, '#ffffff', 0.25);

const rug: SpritePainter = (s, info) => {
  const m = matOf(info, '#2b2c35');
  s.piece((p) => rugBody(p, info.w, info.h, info.top, m, rugAccent(info, m)));
};

/** Coroa da marca (Impera) em dourado, centrada em `cx`, com a base em `by`. */
function crown(p: Sprite, cx: number, by: number): void {
  const G = PAL.gold;
  // faixa da base com as pedras
  p.rect(cx - 12, by - 4, 24, 4, G.base);
  p.rect(cx - 12, by - 4, 24, 1, G.light);
  p.rect(cx - 12, by - 1, 24, 1, G.dark);
  for (const dx of [-8, 0, 8]) p.rect(cx + dx - 1, by - 3, 2, 2, dx === 0 ? '#c8383c' : '#3d5a8a');
  // pontas: duas laterais e a do meio, mais alta
  p.poly(
    [
      [cx - 12, by - 5],
      [cx - 12, by - 13],
      [cx - 6, by - 8],
      [cx, by - 15],
      [cx + 6, by - 8],
      [cx + 11, by - 13],
      [cx + 11, by - 5],
    ],
    G.base,
  );
  p.line(cx - 11, by - 12, cx - 11, by - 6, G.light);
  p.line(cx - 1, by - 13, cx - 5, by - 8, G.light);
  p.line(cx + 10, by - 12, cx + 10, by - 6, G.dark);
  // bolinhas no alto das pontas
  for (const [x, y] of [
    [cx - 13, by - 16],
    [cx - 2, by - 18],
    [cx + 10, by - 16],
  ]) {
    p.rect(x + 1, y, 2, 3, G.base);
    p.rect(x, y + 1, 4, 1, G.base);
    p.px(x + 1, y, G.hi);
  }
}

const rugLogo: SpritePainter = (s, info) => {
  const m = matOf(info, '#2b2c35');
  const { w, h, top } = info;
  s.piece((p) => {
    rugBody(p, w, h, top, m, rugAccent(info, m));
    // medalhão liso no centro, para a coroa
    const cx = Math.floor(w / 2);
    const cy = top + Math.floor(h / 2);
    p.ellipse(cx - 20, cy - 13, 40, 26, m.dark);
    p.ellipse(cx - 19, cy - 12, 38, 24, m.base);
    crown(p, cx, cy + 8);
  });
};

// ---------- quadro decorativo (parede) ----------

const frame: SpritePainter = (s, info) => {
  const m = matOf(info, '#8f6340');
  s.piece((p) => {
    p.rect(7, 12, 18, 16, m.base);
    p.rect(7, 12, 18, 1, m.hi);
    p.rect(7, 13, 1, 14, m.light);
    p.rect(24, 13, 1, 15, m.dark);
    p.rect(7, 27, 18, 1, m.dark);
    // passe-partout e a paisagem: céu, sol, montanhas e campo
    p.rect(9, 14, 14, 12, PAL.paper.base);
    p.rect(10, 15, 12, 10, '#a9d1ec');
    p.rect(18, 16, 2, 2, '#f2d95c');
    p.poly(
      [
        [10, 22],
        [13, 18],
        [16, 21],
        [18, 19],
        [21, 22],
      ],
      '#6f8fae',
    );
    p.px(13, 18, '#e9ecf2');
    p.rect(10, 22, 12, 3, '#6aa65a');
    p.rect(10, 23, 12, 2, '#548f48');
  });
};

export const FURNITURE: Record<string, SpritePainter> = {
  table,
  table_round: tableRound,
  counter,
  bookshelf,
  cabinet,
  lamp,
  podium,
  rug,
  rug_logo: rugLogo,
  frame,
};
