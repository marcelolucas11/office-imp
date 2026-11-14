// SPDX-License-Identifier: AGPL-3.0-only
// Objetos pequenos de mesa do visual v2 (Fase C2): teclado mecânico, mousepad, mouse, caneca,
// garrafa, fone, luminária de mesa, porta-retrato, post-its, livros, troféu, suculenta e cacto.
// São decoração 1×1 que não bloqueia, desenhada para ficar em cima do tampo de uma mesa de
// trabalho: o tampo ocupa as linhas 3 a 20 do bloco (ver `desks.ts`), então cada objeto "pisa"
// entre as linhas 14 e 19 e sobe a partir daí. O microfone de podcast (alto) está em `extras.ts`.
import { GOLD, PAL, ramp, type Mat } from './palette';
import { Sprite, mix } from './prim';
import { RGB } from './setups';
import type { PaintInfo, SpritePainter } from './sprites';

const B = PAL.plasticBlack;
const matOf = (info: PaintInfo, fallback: string): Mat => ramp(info.color?.hex ?? fallback);

// ---------- teclado mecânico: teclas altas, separadas, com luz por baixo na versão RGB ----------

const keyboard: SpritePainter = (s, info) => {
  const id = info.color?.id ?? 'rgb';
  const m = matOf(info, '#2a2b30');
  const rgb = id === 'rgb';
  const caseMat: Mat = rgb ? { dark: B.dark, base: B.base, light: B.light, hi: B.hi } : m;
  const cap = rgb ? '#3a3c45' : id === 'white' ? PAL.plasticWhite.hi : mix(m.light, '#ffffff', 0.45);
  const capTop = rgb ? '#4b4e58' : '#ffffff';
  // cabo enrolado indo para trás
  s.piece((p) => {
    p.line(16, 2, 16, 5, B.light);
    p.px(15, 6, B.light);
    p.px(16, 7, B.light);
  });
  s.piece((p) => {
    p.rrect(3, 8, 26, 11, caseMat.dark, 1);
    p.rrect(3, 8, 26, 9, caseMat.base, 1);
    p.rect(4, 8, 24, 1, caseMat.hi);
    // quatro fileiras de teclas 2×1 com vão de 1 px; a luz aparece nos vãos (RGB)
    for (let row = 0; row < 4; row++) {
      const y = 10 + row * 2;
      if (rgb) for (let x = 4; x < 28; x++) p.px(x, y + 1, RGB[Math.floor(((x - 4) / 24) * RGB.length + row) % RGB.length]);
      if (row === 3) {
        p.rect(6, y, 3, 1, cap);
        p.rect(10, y, 12, 1, capTop);
        p.rect(23, y, 3, 1, cap);
        continue;
      }
      for (let x = 5 + (row % 2); x < 27; x += 3) {
        p.px(x, y, capTop);
        p.px(x + 1, y, cap);
      }
    }
    // tecla de destaque (Esc) na cor da marca
    p.px(5, 10, rgb ? RGB[0] : GOLD);
  });
};

// ---------- mousepad grande (desk mat): tapete fino com borda costurada ----------

const mousepad: SpritePainter = (s, info) => {
  const m = matOf(info, '#2a2b30');
  const stitch = info.color?.id === 'black' ? '#5a5d66' : m.hi;
  s.piece((p) => {
    p.rrect(1, 5, 30, 15, m.dark, 2);
    p.rrect(1, 5, 30, 14, m.base, 2);
    // costura da borda
    p.rect(3, 6, 26, 1, stitch);
    p.rect(3, 17, 26, 1, stitch);
    p.rect(2, 7, 1, 10, stitch);
    p.rect(29, 7, 1, 10, stitch);
    // faixa diagonal discreta no canto
    for (let i = 0; i < 7; i++) {
      p.px(21 + i, 15 - i, m.light);
      p.px(22 + i, 15 - i, m.light);
    }
  });
};

// ---------- mouse: sem fio, com roda e divisão dos botões ----------

const mouse: SpritePainter = (s, info) => {
  const m = matOf(info, '#2a2b30');
  const white = info.color?.id === 'white';
  s.piece((p) => {
    p.rrect(13, 8, 7, 11, m.dark, 2);
    p.rrect(13, 8, 7, 10, m.base, 2);
    p.rect(15, 8, 3, 1, m.hi);
    p.rect(14, 10, 1, 5, m.light);
    p.rect(16, 9, 1, 4, white ? PAL.metal.dark : PAL.metal.base);
    p.px(16, 10, white ? PAL.metal.base : PAL.metal.hi);
    p.rect(14, 13, 5, 1, m.dark);
  });
};

// ---------- caneca: café por cima, alça à direita ----------

const mug: SpritePainter = (s, info) => {
  const m = matOf(info, '#e9ecf2');
  s.piece((p) => {
    // alça
    p.rect(19, 10, 3, 6, m.base);
    p.rect(20, 11, 1, 4, null);
    p.px(21, 10, m.dark);
    p.px(21, 15, m.dark);
  });
  s.piece((p) => {
    p.rect(11, 9, 9, 10, m.base);
    p.rect(11, 9, 2, 10, m.light);
    p.rect(18, 9, 2, 10, m.dark);
    p.rect(11, 18, 9, 1, m.dark);
    // boca: borda clara e o café
    p.rect(11, 8, 9, 2, m.hi);
    p.rect(12, 8, 7, 2, '#4a2c1c');
    p.rect(13, 8, 3, 1, '#6b4128');
    // faixa dourada (detalhe Impera) nas canecas claras
    if (info.color?.id === 'white' || !info.color) p.rect(11, 12, 9, 1, GOLD);
  });
};

// ---------- garrafa: squeeze com tampa e alça ----------

const bottle: SpritePainter = (s, info) => {
  const m = matOf(info, '#4a86c9');
  const steel = info.color?.id === 'steel';
  s.piece((p) => {
    p.rrect(13, 5, 7, 14, m.base, 2);
    p.rect(13, 7, 2, 10, m.light);
    p.rect(18, 7, 2, 11, m.dark);
    p.rect(14, 5, 5, 1, m.hi);
    p.rect(13, 18, 7, 1, m.dark);
    // rótulo / faixa
    p.rect(13, 11, 7, 3, steel ? PAL.metal.hi : mix(m.base, '#ffffff', 0.55));
    p.rect(15, 12, 3, 1, steel ? GOLD : m.dark);
  });
  s.piece((p) => {
    // tampa com bico e alça
    p.rect(14, 2, 5, 3, B.base);
    p.rect(14, 2, 5, 1, B.hi);
    p.rect(19, 2, 2, 1, B.light);
    p.px(20, 3, B.light);
    p.rect(15, 1, 2, 1, B.light);
  });
};

// ---------- fone de ouvido (over-ear), deitado no tampo ----------

const headphones: SpritePainter = (s, info) => {
  const m = matOf(info, '#2a2b30');
  const cushion = info.color?.id === 'white' ? PAL.metal.base : B.base;
  s.piece((p) => {
    // arco de 2 px com a almofada de cima
    p.rect(11, 3, 10, 2, m.base);
    p.rect(12, 3, 8, 1, m.hi);
    p.rect(13, 5, 6, 1, cushion);
    p.rect(9, 4, 2, 2, m.base);
    p.rect(21, 4, 2, 2, m.base);
    p.rect(8, 5, 2, 5, m.base);
    p.rect(22, 5, 2, 5, m.base);
    p.px(8, 6, m.light);
  });
  s.piece((p) => {
    // conchas, com a espuma virada para dentro
    for (const left of [true, false]) {
      const x = left ? 5 : 20;
      p.rrect(x, 9, 7, 10, m.base, 2);
      p.rect(x + 1, 11, 1, 6, m.light);
      p.rect(x + 1, 18, 5, 1, m.dark);
      p.rrect(left ? x + 4 : x, 10, 3, 8, cushion, 1);
      p.px(left ? x + 5 : x + 1, 12, mix(cushion, '#ffffff', 0.2));
    }
  });
};

// ---------- luminária de mesa articulada ----------

const deskLamp: SpritePainter = (s, info) => {
  const m = matOf(info, '#2a2b30');
  s.piece((p) => {
    // base
    p.ellipse(6, 15, 12, 5, m.dark);
    p.ellipse(6, 14, 12, 4, m.base);
    p.rect(9, 14, 5, 1, m.hi);
  });
  s.piece((p) => {
    // braços (2 px) e a articulação
    for (let i = 0; i <= 9; i++) {
      p.px(11 + Math.round(i * 0.5), 15 - i, m.base);
      p.px(12 + Math.round(i * 0.5), 15 - i, m.light);
    }
    for (let i = 0; i <= 6; i++) {
      p.px(16 + i, 5 + Math.round(i * 0.5), m.base);
      p.px(16 + i, 6 + Math.round(i * 0.5), m.dark);
    }
    p.rect(15, 4, 3, 3, m.dark);
    p.px(16, 5, m.hi);
  });
  s.piece((p) => {
    // cúpula virada para baixo e a lâmpada acesa
    p.poly(
      [
        [20, 6],
        [24, 6],
        [28, 12],
        [18, 12],
      ],
      m.base,
    );
    p.rect(21, 6, 3, 1, m.hi);
    p.rect(20, 7, 2, 4, m.light);
    p.rect(19, 12, 9, 1, m.dark);
    p.rect(21, 13, 5, 1, '#fff2b8');
  });
};

// ---------- porta-retrato (redesenho de `photo`) ----------

const photo: SpritePainter = (s, info) => {
  const m = matOf(info, '#8f6340');
  s.piece((p) => {
    // apoio de trás
    p.rect(17, 16, 3, 3, mix(m.dark, '#000000', 0.2));
  });
  s.piece((p) => {
    p.rect(10, 4, 12, 14, m.base);
    p.rect(10, 4, 12, 1, m.hi);
    p.rect(10, 5, 1, 12, m.light);
    p.rect(21, 5, 1, 13, m.dark);
    p.rect(10, 17, 12, 1, m.dark);
    // foto: céu, duas pessoas e grama
    p.rect(12, 6, 8, 10, '#bcd9ef');
    p.rect(12, 14, 8, 2, '#7cb36a');
    p.rect(13, 8, 3, 3, '#e8b88f');
    p.rect(13, 7, 3, 1, '#4a3024');
    p.rect(12, 11, 5, 4, '#3a6fc0');
    p.rect(17, 9, 2, 2, '#c99070');
    p.rect(17, 8, 2, 1, '#9c5a2a');
    p.rect(16, 11, 4, 4, '#c8383c');
  });
};

// ---------- post-its: bloco com folhas soltas e uma caneta ----------

const postits: SpritePainter = (s, info) => {
  const m = matOf(info, '#f2d95c');
  s.piece((p) => {
    // folha solta, meio torta
    p.poly(
      [
        [19, 9],
        [26, 8],
        [27, 15],
        [20, 16],
      ],
      mix(m.base, '#ffffff', 0.25),
    );
    p.rect(21, 11, 4, 1, m.dark);
  });
  s.piece((p) => {
    // bloco: espessura na frente e a folha de cima com rabisco
    p.rect(7, 7, 11, 11, m.base);
    p.rect(7, 16, 11, 1, m.light);
    p.rect(7, 17, 11, 1, m.dark);
    p.rect(7, 7, 11, 2, m.dark);
    p.rect(9, 11, 7, 1, '#5b6170');
    p.rect(9, 13, 5, 1, '#5b6170');
  });
  s.piece((p) => {
    // caneta
    p.line(9, 21, 16, 19, '#2f4f9a');
    p.line(9, 20, 16, 18, '#4a6fc0');
    p.px(17, 18, PAL.metal.hi);
  });
};

// ---------- livros: pilha de três, lombadas para a frente ----------

const BOOK_SETS: Record<string, string[]> = {
  classic: ['#b23a3a', '#2f5d9a', '#3a8a55'],
  sober: ['#4a5568', '#2f3a4f', '#6e5040'],
  pastel: ['#e3a4c0', '#9fd6c2', '#b9a6e3'],
};

const books: SpritePainter = (s, info) => {
  const set = BOOK_SETS[info.color?.id ?? 'classic'] ?? BOOK_SETS.classic;
  const stack: [number, number, number][] = [
    [6, 14, 20],
    [8, 10, 17],
    [7, 6, 18],
  ];
  stack.forEach(([x, y, w], i) => {
    const c = ramp(set[i]);
    s.piece((p) => {
      p.rect(x, y, w, 4, c.base);
      p.rect(x, y, w, 1, c.light);
      p.rect(x, y + 3, w, 1, c.dark);
      // páginas na ponta direita e a faixa da lombada
      p.rect(x + w - 2, y + 1, 2, 2, PAL.paper.base);
      p.rect(x + 3, y + 1, 1, 2, i === 1 ? GOLD : c.hi);
      p.rect(x + 5, y + 2, Math.max(3, w - 10), 1, c.hi);
    });
  });
};

// ---------- troféu (redesenho de `trophy`) ----------

const trophy: SpritePainter = (s, info) => {
  const m = matOf(info, '#d7b870');
  s.piece((p) => {
    // pedestal escuro com a plaquinha
    p.rect(10, 15, 12, 4, PAL.woodDark.base);
    p.rect(10, 15, 12, 1, PAL.woodDark.hi);
    p.rect(10, 18, 12, 1, PAL.woodDark.dark);
    p.rect(13, 16, 6, 1, m.light);
  });
  s.piece((p) => {
    // alças
    for (const x of [7, 21]) {
      p.rect(x, 4, 4, 5, m.base);
      p.rect(x + 1, 5, 2, 3, null);
    }
    // taça, haste e base
    p.rect(10, 3, 12, 2, m.light);
    p.rrect(10, 3, 12, 8, m.base, 2);
    p.rect(10, 3, 12, 1, m.hi);
    p.rect(11, 4, 2, 5, m.light);
    p.rect(19, 4, 2, 6, m.dark);
    p.rect(13, 11, 6, 1, m.dark);
    p.rect(15, 12, 2, 2, m.base);
    p.rect(12, 14, 8, 1, m.light);
    p.px(14, 6, m.hi);
  });
};

// ---------- vasinhos: suculenta e cacto ----------

/** Vaso pequeno (trapézio) na cor da variante, com a terra por cima. `y` é a boca do vaso. */
function smallPot(p: Sprite, y: number, m: Mat): void {
  p.poly(
    [
      [10, y],
      [21, y],
      [20, y + 7],
      [11, y + 7],
    ],
    m.base,
  );
  p.rect(10, y, 12, 2, m.light);
  p.rect(10, y, 12, 1, m.hi);
  p.rect(19, y + 2, 1, 5, m.dark);
  p.rect(11, y + 7, 9, 1, m.dark);
  p.rect(11, y + 1, 10, 1, '#5a3f2c');
}

const SUCC: Mat = { dark: '#3f7f66', base: '#5fa384', light: '#86c2a3', hi: '#c9e6d4' };

/** Folha pontuda de suculenta (estilo babosa/haworthia): sai do centro do vaso até a ponta. */
function leaf(p: Sprite, tipX: number, tipY: number, c: string, stripe: string): void {
  p.poly(
    [
      [14, 12],
      [18, 12],
      [tipX, tipY],
    ],
    c,
  );
  const mx = Math.round((16 + tipX) / 2);
  const my = Math.round((12 + tipY) / 2);
  p.px(mx, my + 1, stripe);
}

const succulent: SpritePainter = (s, info) => {
  const pot = matOf(info, PAL.terracotta.base);
  s.piece((p) => {
    // folhas de trás (escuras) e da frente (claras), com listrinhas brancas
    leaf(p, 8, 4, SUCC.dark, SUCC.base);
    leaf(p, 24, 4, SUCC.dark, SUCC.base);
    leaf(p, 12, 2, SUCC.base, SUCC.hi);
    leaf(p, 20, 2, SUCC.base, SUCC.hi);
    leaf(p, 16, 1, SUCC.light, SUCC.hi);
    leaf(p, 9, 8, SUCC.base, SUCC.hi);
    leaf(p, 23, 8, SUCC.base, SUCC.hi);
    leaf(p, 14, 5, SUCC.light, SUCC.hi);
    leaf(p, 18, 5, SUCC.light, SUCC.hi);
  });
  s.piece((p) => smallPot(p, 11, pot));
};

const CACT: Mat = { dark: '#2f6b3a', base: '#3e8a4a', light: '#58a35c', hi: '#86c47c' };

const cactusSmall: SpritePainter = (s, info) => {
  const pot = matOf(info, PAL.terracotta.base);
  s.piece((p) => {
    // braço lateral
    p.rect(19, 5, 3, 5, CACT.base);
    p.rect(19, 5, 1, 4, CACT.light);
    p.rect(18, 8, 2, 2, CACT.base);
  });
  s.piece((p) => {
    // corpo com gomos e espinhos
    p.rrect(12, 2, 7, 11, CACT.base, 2);
    p.rect(13, 3, 1, 9, CACT.light);
    p.rect(15, 3, 1, 9, CACT.dark);
    p.rect(17, 3, 1, 9, CACT.dark);
    for (const [x, y] of [
      [12, 5],
      [18, 6],
      [12, 9],
      [18, 10],
      [14, 7],
      [16, 4],
    ])
      p.px(x, y, CACT.hi);
    // florzinha no topo
    p.rect(14, 1, 3, 2, '#e8608a');
    p.px(15, 1, '#f6c3d4');
  });
  s.piece((p) => smallPot(p, 12, pot));
};

export const DESK_ITEMS: Record<string, SpritePainter> = {
  keyboard,
  mousepad,
  mouse,
  mug,
  bottle,
  headphones,
  desk_lamp: deskLamp,
  photo,
  postits,
  books,
  trophy,
  succulent,
  cactus_small: cactusSmall,
};
