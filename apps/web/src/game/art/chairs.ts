// SPDX-License-Identifier: AGPL-3.0-only
// Assentos da Fase C1 do visual v2: cadeira gamer, cadeira executiva de couro, banqueta,
// poltrona e pufe. A cadeira de escritório e o sofá (Fase A) estão em `seating.ts`.
// Todos ocupam um bloco (32×32, sem `tall`), como a cadeira de escritório: a proporção com o
// avatar (32×48) e com as mesas é a mesma. Cor = variante de estofado, couro ou destaque.
import { PAL, ramp, type Mat } from './palette';
import { Sprite } from './prim';
import { swivelBase } from './seating';
import type { PaintInfo, SpritePainter } from './sprites';

const B = PAL.plasticBlack;

/** Desenha a vista de lado virada para a esquerda e espelha quando a direção é `right`. */
function sideView(s: Sprite, info: PaintInfo, draw: (side: Sprite) => void): void {
  const side = new Sprite(s.w, s.h);
  draw(side);
  s.paste(info.o.dir === 'right' ? side.flipX() : side);
}

/**
 * Escolhe a vista pela direção. `initial` é a vista de quem não tem `dir` gravado: as cadeiras de
 * mesa ficam de costas (`up`, como a cadeira de escritório); a poltrona fica de frente, como era.
 */
function byDir(back: (s: Sprite, m: Mat) => void, front: (s: Sprite, m: Mat) => void, side: (s: Sprite, m: Mat) => void, fallback: string, initial: 'up' | 'down' = 'up'): SpritePainter {
  return (s, info) => {
    const m = ramp(info.color?.hex ?? fallback);
    const dir = info.o.dir ?? initial;
    if (dir === 'up') back(s, m);
    else if (dir === 'down') front(s, m);
    else sideView(s, info, (p) => side(p, m));
  };
}

// ---------- cadeira gamer: concha na cor de destaque, miolo preto, apoio de cabeça com vazados ----------

function armPads(s: Sprite, y: number, h: number): void {
  s.piece((p) => {
    for (const x of [4, 25]) {
      p.rect(x, y, 3, h, B.light);
      p.rect(x, y, 3, 1, B.hi);
    }
  });
}

/** Contorno da concha de corrida: apoio de cabeça estreito, ombros largos, cintura reta. */
function racingShell(p: Sprite, a: Mat, bottom: number): void {
  p.rrect(10, 1, 12, 6, a.base, 2);
  p.rrect(7, 5, 18, 10, a.base, 2);
  p.rect(8, 14, 16, bottom - 13, a.base);
  p.rect(12, 1, 8, 1, a.hi);
  p.rect(8, 6, 1, 7, a.light);
}

function gamerBack(s: Sprite, a: Mat): void {
  swivelBase(s, 16, 23, PAL.metalDark);
  armPads(s, 15, 5);
  s.piece((p) => {
    racingShell(p, a, 23);
    p.rect(8, 21, 16, 3, a.dark);
    // miolo preto e os dois vazados do apoio de cabeça
    p.rrect(11, 7, 10, 15, B.base, 1);
    p.rect(12, 8, 1, 12, B.light);
    p.rect(12, 13, 8, 1, B.dark);
    p.rect(12, 3, 3, 2, B.dark);
    p.rect(17, 3, 3, 2, B.dark);
  });
}

function gamerFront(s: Sprite, a: Mat): void {
  swivelBase(s, 16, 23, PAL.metalDark);
  s.piece((p) => {
    racingShell(p, a, 15);
    p.rrect(11, 6, 10, 10, B.base, 1);
    // almofadas: a da cabeça e a lombar
    p.rrect(12, 2, 8, 4, B.light, 1);
    p.rect(13, 2, 6, 1, B.hi);
    p.rrect(12, 11, 8, 3, a.light, 1);
  });
  s.piece((p) => {
    p.rrect(7, 14, 18, 10, B.dark, 1);
    p.rrect(7, 14, 18, 7, B.base, 1);
    p.rect(10, 14, 12, 1, B.hi);
    // abas laterais do assento na cor de destaque
    p.rect(7, 15, 3, 6, a.base);
    p.rect(22, 15, 3, 6, a.base);
    p.rect(7, 21, 3, 2, a.dark);
    p.rect(22, 21, 3, 2, a.dark);
  });
  armPads(s, 12, 8);
}

function gamerSide(s: Sprite, a: Mat): void {
  swivelBase(s, 15, 23, PAL.metalDark);
  s.piece((p) => {
    p.rrect(6, 16, 17, 8, B.dark, 1);
    p.rrect(6, 16, 17, 5, B.base, 1);
    p.rect(8, 16, 13, 1, B.hi);
    p.rect(6, 18, 4, 3, a.base);
  });
  s.piece((p) => {
    p.rrect(19, 1, 7, 21, a.base, 2);
    p.rect(21, 1, 3, 1, a.hi);
    p.rect(19, 4, 2, 17, B.base);
    p.rect(24, 3, 2, 18, a.dark);
    p.rect(21, 3, 2, 2, B.dark);
    // aba do ombro avançando para a frente
    p.rect(17, 7, 2, 5, a.base);
    p.rect(17, 7, 2, 1, a.light);
  });
  s.piece((p) => {
    p.rect(9, 12, 10, 2, B.light);
    p.rect(9, 12, 10, 1, B.hi);
    p.rect(11, 14, 2, 3, B.base);
  });
}

// ---------- cadeira executiva: encosto alto de couro com gomos e botões, braços e base cromados ----------

const CHROME: Mat = { dark: PAL.metal.base, base: PAL.metal.light, light: PAL.metal.hi, hi: '#f1f3f5' };

function chromeArms(s: Sprite, m: Mat, y: number, h: number): void {
  s.piece((p) => {
    for (const x of [4, 25]) {
      p.rect(x + 1, y + 2, 2, h - 2, CHROME.base);
      p.rect(x + 1, y + 2, 1, h - 2, CHROME.light);
      p.rect(x, y, 4, 2, m.light);
      p.rect(x, y, 4, 1, m.hi);
    }
  });
}

function execBack(s: Sprite, m: Mat): void {
  swivelBase(s, 16, 23, CHROME);
  chromeArms(s, m, 13, 7);
  s.piece((p) => {
    p.rrect(7, 1, 18, 23, m.dark, 3);
    p.rrect(7, 1, 18, 20, m.base, 3);
    p.rect(10, 1, 12, 1, m.hi);
    p.rect(9, 2, 14, 1, m.light);
    p.rect(8, 4, 1, 15, m.light);
    // gomos horizontais com um botão em cada
    for (const y of [7, 12, 17]) {
      p.rect(9, y, 14, 1, m.dark);
      p.px(12, y, m.hi);
      p.px(16, y, m.hi);
      p.px(20, y, m.hi);
    }
  });
}

function execFront(s: Sprite, m: Mat): void {
  swivelBase(s, 16, 23, CHROME);
  s.piece((p) => {
    p.rrect(7, 1, 18, 16, m.base, 3);
    p.rect(10, 1, 12, 1, m.hi);
    p.rect(9, 2, 14, 1, m.light);
    p.rect(8, 4, 1, 10, m.light);
    // capitonê: botões em losango
    for (const [bx, by] of [
      [12, 5],
      [16, 5],
      [20, 5],
      [14, 8],
      [18, 8],
      [12, 11],
      [16, 11],
      [20, 11],
    ]) {
      p.px(bx, by, m.dark);
      p.px(bx, by - 1, m.light);
    }
  });
  s.piece((p) => {
    p.rrect(6, 14, 20, 10, m.dark, 2);
    p.rrect(6, 14, 20, 7, m.light, 2);
    p.rect(9, 14, 14, 1, m.hi);
    p.rect(16, 16, 1, 4, m.base);
  });
  chromeArms(s, m, 11, 9);
}

function execSide(s: Sprite, m: Mat): void {
  swivelBase(s, 15, 23, CHROME);
  s.piece((p) => {
    p.rrect(5, 16, 18, 8, m.dark, 2);
    p.rrect(5, 16, 18, 5, m.light, 2);
    p.rect(8, 16, 13, 1, m.hi);
  });
  s.piece((p) => {
    p.rrect(18, 1, 8, 21, m.base, 2);
    p.rect(20, 1, 4, 1, m.hi);
    p.rect(18, 4, 1, 15, m.light);
    p.rect(24, 3, 2, 18, m.dark);
    for (const y of [7, 12, 17]) p.rect(19, y, 5, 1, m.dark);
  });
  s.piece((p) => {
    p.rect(8, 11, 11, 2, m.light);
    p.rect(8, 11, 11, 1, m.hi);
    p.rect(10, 13, 2, 4, CHROME.base);
    p.rect(16, 13, 2, 4, CHROME.base);
  });
}

// ---------- banqueta: assento redondo estofado, quatro pés de madeira e aro de apoio ----------

const stool: SpritePainter = (s, info) => {
  const m = ramp(info.color?.hex ?? PAL.fabric.base);
  const W = PAL.woodLight;
  s.piece((p) => {
    // pés de trás (mais escuros e curtos) e da frente, abrindo para fora
    p.line(13, 14, 12, 26, W.dark);
    p.line(18, 14, 19, 26, W.dark);
    for (const dx of [0, 1]) {
      p.line(10 + dx, 13, 7 + dx, 29, dx ? W.base : W.light);
      p.line(20 + dx, 13, 23 + dx, 29, dx ? W.dark : W.base);
    }
    p.rect(9, 22, 14, 1, PAL.metal.base);
    p.rect(9, 22, 14, 1, PAL.metal.light);
    p.rect(10, 23, 12, 1, PAL.metal.dark);
  });
  s.piece((p) => {
    p.ellipse(7, 8, 18, 8, m.dark);
    p.ellipse(7, 6, 18, 8, m.base);
    p.ellipse(8, 6, 16, 6, m.light);
    p.rect(12, 7, 8, 1, m.hi);
    p.px(16, 9, m.dark);
  });
};

// ---------- poltrona: braços roliços, encosto alto arredondado e pés de madeira ----------

function armRoll(p: Sprite, x: number, y: number, h: number, m: Mat): void {
  p.rrect(x, y, 7, h, m.base, 2);
  p.rect(x + 2, y, 3, 1, m.hi);
  p.rect(x + 1, y + 2, 1, h - 7, m.light);
  p.rect(x, y + h - 4, 7, 2, m.dark);
  p.rect(x + 1, y + h - 2, 5, 1, m.dark);
  p.rect(x + 2, y + h - 1, 3, 1, m.dark);
}

function armchairFeet(s: Sprite, xs: number[]): void {
  s.piece((p) => {
    for (const x of xs) {
      p.rect(x, 28, 3, 3, PAL.woodDark.base);
      p.rect(x, 28, 1, 3, PAL.woodDark.light);
    }
  });
}

function armchairFront(s: Sprite, m: Mat): void {
  armchairFeet(s, [4, 25]);
  s.piece((p) => {
    p.rrect(4, 1, 24, 16, m.base, 4);
    p.rect(8, 1, 16, 1, m.hi);
    p.rect(6, 2, 20, 1, m.light);
    p.rect(5, 5, 1, 9, m.light);
    p.rect(9, 7, 14, 1, m.dark);
    p.px(16, 4, m.dark);
  });
  s.piece((p) => {
    p.rect(8, 14, 16, 15, m.dark);
    p.rect(8, 14, 16, 11, m.light);
    p.rect(9, 14, 14, 1, m.hi);
  });
  s.piece((p) => {
    armRoll(p, 2, 9, 20, m);
    armRoll(p, 23, 9, 20, m);
  });
}

function armchairBack(s: Sprite, m: Mat): void {
  armchairFeet(s, [4, 25]);
  s.piece((p) => {
    armRoll(p, 2, 8, 21, m);
    armRoll(p, 23, 8, 21, m);
  });
  s.piece((p) => {
    p.rrect(4, 3, 24, 26, m.dark, 4);
    p.rrect(4, 3, 24, 22, m.base, 4);
    p.rect(8, 3, 16, 1, m.hi);
    p.rect(6, 4, 20, 1, m.light);
    p.rect(5, 7, 1, 15, m.light);
    p.rect(8, 9, 16, 1, m.dark);
    p.rect(16, 10, 1, 14, m.dark);
  });
}

function armchairSide(s: Sprite, m: Mat): void {
  armchairFeet(s, [5, 23]);
  s.piece((p) => {
    // encosto (atrás, à direita) levemente inclinado
    p.rrect(19, 2, 9, 26, m.base, 3);
    p.rect(22, 2, 4, 1, m.hi);
    p.rect(20, 5, 1, 12, m.light);
    p.rect(26, 5, 2, 21, m.dark);
  });
  s.piece((p) => {
    // almofada do assento aparecendo na frente do braço
    p.rrect(3, 15, 18, 6, m.light, 2);
    p.rect(5, 15, 14, 1, m.hi);
  });
  s.piece((p) => {
    // lateral e braço roliço
    p.rect(4, 17, 21, 12, m.base);
    p.rect(4, 26, 21, 3, m.dark);
    p.rrect(3, 11, 22, 8, m.base, 3);
    p.rect(6, 11, 16, 1, m.hi);
    p.rect(5, 12, 18, 1, m.light);
    p.rect(4, 17, 20, 1, m.dark);
    p.rect(3, 13, 2, 4, m.light);
  });
}

// ---------- pufe: cilindro baixo com tampo redondo e botão ----------

const pouf: SpritePainter = (s, info) => {
  const m = ramp(info.color?.hex ?? PAL.fabric.base);
  s.piece((p) => {
    p.rect(8, 28, 2, 2, PAL.woodDark.base);
    p.rect(22, 28, 2, 2, PAL.woodDark.base);
  });
  s.piece((p) => {
    p.rrect(4, 14, 24, 15, m.dark, 4);
    p.rrect(4, 14, 24, 12, m.base, 4);
    p.ellipse(4, 9, 24, 11, m.light);
    p.rect(10, 10, 12, 1, m.hi);
    // costuras do corpo e botão do tampo
    for (const x of [9, 16, 22]) p.rect(x, 21, 1, 5, m.dark);
    p.rect(5, 19, 1, 4, m.light);
    p.rect(15, 14, 2, 1, m.dark);
    p.rect(15, 13, 2, 1, m.base);
  });
};

export const CHAIRS: Record<string, SpritePainter> = {
  chair_gamer: byDir(gamerBack, gamerFront, gamerSide, '#c8383c'),
  chair_exec: byDir(execBack, execFront, execSide, PAL.leather.base),
  stool,
  armchair: byDir(armchairBack, armchairFront, armchairSide, PAL.fabric.base, 'down'),
  pouf,
};
