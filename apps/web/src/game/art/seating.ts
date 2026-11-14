// SPDX-License-Identifier: AGPL-3.0-only
// Assentos no estilo do visual v2 (traço de 1 px, contorno por peça, cor por variante).
// Cadeira de escritório e sofá (Fase A). As outras cadeiras, a poltrona e o pufe estão em `chairs.ts`.
import { PAL, ramp, type Mat } from './palette';
import { Sprite } from './prim';
import type { SpritePainter } from './sprites';

/** Base giratória da cadeira: coluna, estrela e rodinhas. `cx` é o centro; `m` é o metal (cromado na executiva). */
export function swivelBase(s: Sprite, cx: number, y: number, m: Mat = { dark: PAL.metal.dark, base: PAL.metal.base, light: PAL.metal.light, hi: PAL.metal.hi }): void {
  s.piece((p) => {
    p.rect(cx - 1, y, 2, 4, m.dark);
    p.rect(cx - 7, y + 4, 14, 1, m.base);
    p.rect(cx - 1, y + 4, 2, 1, m.light);
    p.rect(cx - 8, y + 5, 3, 2, PAL.plasticBlack.base);
    p.rect(cx - 1, y + 5, 2, 2, PAL.plasticBlack.base);
    p.rect(cx + 5, y + 5, 3, 2, PAL.plasticBlack.base);
  });
}

function chairBack(s: Sprite, fab: ReturnType<typeof ramp>): void {
  // de costas para a câmera: o encosto cobre o assento
  swivelBase(s, 16, 23);
  s.piece((p) => {
    p.rect(5, 15, 3, 5, PAL.plasticBlack.light);
    p.rect(24, 15, 3, 5, PAL.plasticBlack.light);
    p.rect(5, 15, 3, 1, PAL.plasticBlack.hi);
    p.rect(24, 15, 3, 1, PAL.plasticBlack.hi);
  });
  s.piece((p) => {
    p.rrect(8, 3, 16, 21, fab.dark, 2);
    p.rrect(8, 3, 16, 18, fab.base, 2);
    p.rect(10, 3, 12, 1, fab.hi);
    p.rect(9, 5, 1, 14, fab.light);
    p.rect(11, 9, 10, 1, fab.dark);
    p.rect(11, 15, 10, 1, fab.dark);
  });
}

function chairFront(s: Sprite, fab: ReturnType<typeof ramp>): void {
  swivelBase(s, 16, 23);
  s.piece((p) => {
    p.rrect(8, 2, 16, 14, fab.base, 2);
    p.rect(10, 2, 12, 1, fab.hi);
    p.rect(9, 4, 1, 10, fab.light);
    p.rrect(11, 5, 10, 8, fab.dark, 1);
    p.rrect(11, 6, 10, 7, fab.base, 1);
  });
  s.piece((p) => {
    p.rrect(7, 14, 18, 10, fab.dark, 1);
    p.rrect(7, 14, 18, 7, fab.light, 1);
    p.rect(9, 14, 14, 1, fab.hi);
  });
  s.piece((p) => {
    p.rect(4, 12, 3, 8, PAL.plasticBlack.light);
    p.rect(25, 12, 3, 8, PAL.plasticBlack.light);
    p.rect(4, 12, 3, 1, PAL.plasticBlack.hi);
    p.rect(25, 12, 3, 1, PAL.plasticBlack.hi);
  });
}

function chairSide(s: Sprite, fab: ReturnType<typeof ramp>): void {
  // virada para a esquerda (encosto à direita); a versão "direita" é o espelho
  swivelBase(s, 15, 23);
  s.piece((p) => {
    p.rrect(6, 16, 17, 8, fab.dark, 1);
    p.rrect(6, 16, 17, 5, fab.light, 1);
    p.rect(8, 16, 13, 1, fab.hi);
  });
  s.piece((p) => {
    p.rrect(19, 2, 6, 20, fab.base, 1);
    p.rect(19, 4, 1, 16, fab.light);
    p.rect(23, 3, 2, 18, fab.dark);
    p.rect(20, 2, 3, 1, fab.hi);
  });
  s.piece((p) => {
    p.rect(9, 12, 11, 2, PAL.plasticBlack.light);
    p.rect(9, 12, 11, 1, PAL.plasticBlack.hi);
    p.rect(11, 14, 2, 3, PAL.plasticBlack.base);
  });
}

const chair: SpritePainter = (s, info) => {
  const fab = ramp(info.color?.hex ?? PAL.fabric.base);
  const dir = info.o.dir ?? 'up';
  if (dir === 'up') chairBack(s, fab);
  else if (dir === 'down') chairFront(s, fab);
  else {
    const side = new Sprite(s.w, s.h);
    chairSide(side, fab);
    s.paste(dir === 'left' ? side : side.flipX());
  }
};

function sofaFeet(s: Sprite, w: number, y: number): void {
  s.piece((p) => {
    p.rect(3, y, 3, 2, PAL.woodDark.base);
    p.rect(w - 6, y, 3, 2, PAL.woodDark.base);
  });
}

/** Costura entre as almofadas: uma a cada ~1 bloco de largura. */
function cushionSeams(w: number): number[] {
  const n = Math.max(1, Math.round((w - 16) / 24));
  const out: number[] = [];
  for (let i = 1; i < n; i++) out.push(8 + Math.round(((w - 16) * i) / n));
  return out;
}

const sofa: SpritePainter = (s, info) => {
  const fab = ramp(info.color?.hex ?? PAL.fabric.base);
  const { w, top: y } = info;
  const arm = (p: Sprite, x: number, ay: number, h: number) => {
    p.rrect(x, ay, 7, h, fab.base, 2);
    p.rect(x + 2, ay, 3, 1, fab.hi);
    p.rect(x + 1, ay + 2, 1, h - 6, fab.light);
    p.rect(x, ay + h - 4, 7, 2, fab.dark);
    p.rect(x + 1, ay + h - 2, 5, 1, fab.dark);
    p.rect(x + 2, ay + h - 1, 3, 1, fab.dark);
  };
  sofaFeet(s, w, y + 29);
  if (info.o.dir === 'up') {
    // de costas para a câmera: o encosto fica na frente
    s.piece((p) => {
      p.rect(8, y + 4, w - 16, 7, fab.light);
      p.rect(8, y + 4, w - 16, 1, fab.hi);
      for (const x of cushionSeams(w)) p.rect(x, y + 5, 1, 6, fab.dark);
    });
    s.piece((p) => {
      arm(p, 1, y + 5, 23);
      arm(p, w - 8, y + 5, 23);
    });
    s.piece((p) => {
      p.rrect(4, y + 9, w - 8, 20, fab.dark, 2);
      p.rrect(4, y + 9, w - 8, 16, fab.base, 2);
      p.rect(6, y + 9, w - 12, 1, fab.hi);
      p.rect(5, y + 11, 1, 12, fab.light);
      p.rect(7, y + 13, w - 14, 1, fab.dark);
    });
    return;
  }
  s.piece((p) => {
    p.rrect(3, y + 2, w - 6, 14, fab.base, 2);
    p.rect(5, y + 2, w - 10, 1, fab.hi);
    p.rect(4, y + 4, 1, 9, fab.light);
    p.rect(8, y + 6, w - 16, 1, fab.dark);
  });
  s.piece((p) => {
    p.rect(7, y + 13, w - 14, 16, fab.dark);
    p.rect(7, y + 13, w - 14, 12, fab.light);
    p.rect(8, y + 13, w - 16, 1, fab.hi);
    for (const x of cushionSeams(w)) {
      p.rect(x, y + 14, 1, 11, fab.base);
      p.rect(x, y + 25, 1, 4, fab.base);
    }
  });
  s.piece((p) => {
    arm(p, 1, y + 8, 20);
    arm(p, w - 8, y + 8, 20);
  });
};

export const SEATING: Record<string, SpritePainter> = { chair, sofa };
