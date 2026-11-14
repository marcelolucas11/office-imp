// SPDX-License-Identifier: AGPL-3.0-only
// Copa do visual v2 (Fase C3): máquina de café automática, bebedouro e geladeira (os tipos de
// antes, redesenhados, com cores). A cafeteira expresso com moedor é um extra da C2 (`extras.ts`).
// Todos têm `tall: 1`: a base fica no fim do bloco e o corpo sobe para o bloco de cima.
import { GOLD, PAL, ramp, type Mat } from './palette';
import { mix } from './prim';
import type { PaintInfo, SpritePainter } from './sprites';

const matOf = (info: PaintInfo, fallback: string): Mat => ramp(info.color?.hex ?? fallback);
const M = PAL.metal;
const W = PAL.woodLight;

// ---------- máquina de café automática sobre o armarinho ----------

const coffee: SpritePainter = (s, info) => {
  const m = matOf(info, '#2a2b30');
  const { top } = info;
  const light = info.color?.id === 'white' || info.color?.id === 'steel';
  const trim = light ? mix(m.dark, '#000000', 0.3) : M.base;
  s.piece((p) => {
    // armarinho branco com tampo de madeira
    const C = PAL.plasticWhite;
    p.rect(1, top + 7, 30, 23, C.base);
    p.rect(15, top + 8, 1, 21, C.dark);
    p.rect(2, top + 8, 1, 21, C.hi);
    p.rect(12, top + 16, 1, 4, M.dark);
    p.rect(18, top + 16, 1, 4, M.dark);
    p.rect(1, top + 29, 30, 1, C.dark);
    p.rect(1, top + 2, 30, 5, W.base);
    p.rect(1, top + 2, 30, 1, W.hi);
    p.rect(1, top + 6, 30, 1, W.dark);
  });
  s.piece((p) => {
    // corpo da máquina
    p.rrect(5, top - 22, 18, 27, m.base, 1);
    p.rect(6, top - 22, 16, 1, m.hi);
    p.rect(5, top - 20, 1, 24, m.light);
    p.rect(21, top - 20, 2, 25, m.dark);
    // tampa do reservatório de grãos
    p.rect(7, top - 21, 9, 2, m.light);
    p.rect(17, top - 21, 3, 2, m.dark);
    // visor com os ícones das bebidas
    p.rect(7, top - 17, 13, 6, trim);
    p.rect(8, top - 16, 11, 4, '#1f2a36');
    p.px(9, top - 15, '#e9ecf2');
    p.px(11, top - 15, '#e9ecf2');
    p.rect(13, top - 15, 3, 1, '#6aa5ec');
    p.px(17, top - 14, '#58d27a');
    // vão do bico com a xícara e a bandeja
    p.rect(8, top - 9, 11, 11, mix(m.dark, '#000000', 0.45));
    p.rect(11, top - 9, 5, 2, M.light);
    p.rect(12, top - 2, 4, 4, PAL.paper.hi);
    p.rect(12, top - 2, 4, 1, '#6b4128');
    p.px(16, top - 1, PAL.paper.hi);
    p.rect(8, top + 2, 11, 1, M.hi);
    p.rect(5, top + 4, 18, 1, m.dark);
  });
  s.piece((p) => {
    // pote de açúcar e copinhos ao lado
    p.rect(24, top - 4, 5, 6, PAL.ceramic.base);
    p.rect(24, top - 5, 5, 1, PAL.ceramic.hi);
    p.rect(26, top - 6, 1, 1, GOLD);
    p.rect(27, top - 1, 1, 2, PAL.ceramic.dark);
  });
};

// ---------- bebedouro de galão ----------

const WATER = { dark: '#4f93c4', base: '#78b6e0', light: '#a6d4f0', hi: '#d6eefa' };

const cooler: SpritePainter = (s, info) => {
  const m = matOf(info, '#e3e5e9');
  const { top } = info;
  s.piece((p) => {
    // corpo com o vão das torneiras, a bandeja e a porta de baixo
    p.rect(7, top - 12, 18, 41, m.base);
    p.rect(7, top - 12, 18, 2, m.light);
    p.rect(7, top - 12, 18, 1, m.hi);
    p.rect(7, top - 10, 1, 39, m.light);
    p.rect(23, top - 10, 2, 39, m.dark);
    p.rect(9, top - 6, 13, 12, mix(m.dark, '#000000', 0.3));
    p.rect(9, top - 6, 13, 1, mix(m.dark, '#000000', 0.5));
    // torneiras: fria (azul) e quente (vermelha)
    p.rect(11, top - 5, 3, 3, '#3f7fd0');
    p.px(12, top - 2, '#3f7fd0');
    p.rect(17, top - 5, 3, 3, '#d04a4a');
    p.px(18, top - 2, '#d04a4a');
    // copo e a grade da bandeja
    p.rect(14, top + 1, 3, 4, '#e9f4fb');
    p.rect(9, top + 5, 13, 1, M.hi);
    p.rect(9, top + 6, 13, 1, M.dark);
    p.rect(9, top + 10, 13, 15, m.light);
    p.rect(10, top + 11, 11, 13, m.base);
    p.rect(18, top + 16, 2, 3, M.dark);
    // luzinhas
    p.px(10, top - 9, '#58d27a');
    p.px(12, top - 9, '#e0525a');
    p.rect(7, top + 28, 18, 1, m.dark);
  });
  s.piece((p) => {
    // galão de água (20 L), de cabeça para baixo no topo
    p.rrect(8, top - 31, 16, 18, WATER.base, 3);
    p.rect(8, top - 25, 16, 1, WATER.dark);
    p.rect(8, top - 19, 16, 1, WATER.dark);
    p.rect(10, top - 30, 1, 14, WATER.light);
    p.rect(11, top - 29, 1, 4, WATER.hi);
    p.rect(21, top - 29, 2, 14, WATER.dark);
    p.rect(13, top - 13, 6, 2, WATER.dark);
  });
};

// ---------- geladeira duplex ----------

const fridge: SpritePainter = (s, info) => {
  const m = matOf(info, '#c3cad3');
  const { top } = info;
  const retro = info.color?.id === 'red';
  const handle = info.color?.id === 'black' ? M.base : info.color?.id === 'red' ? PAL.metal.hi : M.dark;
  const y0 = top - 29;
  s.piece((p) => {
    p.rrect(4, y0, 24, 58, m.base, retro ? 3 : 1);
    p.rect(5, y0, 22, 1, m.hi);
    p.rect(4, y0 + 2, 1, 54, m.light);
    p.rect(26, y0 + 2, 2, 55, m.dark);
    // divisão entre congelador e refrigerador
    const split = y0 + 19;
    p.rect(4, split, 24, 1, mix(m.dark, '#000000', 0.35));
    p.rect(5, split + 1, 21, 1, m.light);
    // puxadores verticais à direita
    p.rect(22, y0 + 6, 2, 10, handle);
    p.rect(22, y0 + 6, 1, 10, mix(handle, '#ffffff', 0.35));
    p.rect(22, split + 4, 2, 16, handle);
    p.rect(22, split + 4, 1, 16, mix(handle, '#ffffff', 0.35));
    // ímãs e um bilhete na porta
    p.rect(8, split + 6, 6, 7, PAL.paper.hi);
    p.rect(9, split + 8, 4, 1, PAL.paper.dark);
    p.rect(9, split + 10, 3, 1, PAL.paper.dark);
    p.px(10, split + 5, '#e0525a');
    p.rect(15, split + 9, 3, 3, '#f2c94c');
    p.rect(7, split + 16, 3, 3, '#4a86c9');
    // logo genérico (sem marca): só um filete
    if (!retro) p.rect(8, y0 + 3, 5, 1, mix(m.base, m.dark, 0.6));
    // rodapé com a grade de ventilação
    p.rect(5, y0 + 55, 22, 2, mix(m.dark, '#000000', 0.35));
    for (let x = 7; x < 25; x += 2) p.px(x, y0 + 55, m.dark);
  });
  if (retro)
    s.piece((p) => {
      // geladeira retrô: frisos cromados
      p.rect(6, y0 + 21, 20, 1, M.hi);
      p.rect(6, y0 + 52, 20, 1, M.hi);
    });
};

export const APPLIANCES: Record<string, SpritePainter> = { coffee, cooler, fridge };
