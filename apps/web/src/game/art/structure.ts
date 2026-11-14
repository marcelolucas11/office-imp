// SPDX-License-Identifier: AGPL-3.0-only
// Estrutura do visual v2 (Fase C3): porta (aberta e fechada) e portal.
// A porta fica no vão da parede. Aberta, é desenhada no chão (os avatares passam por cima):
// batentes, verga, a folha encostada no batente esquerdo e a soleira. Fechada, a folha inteira
// ocupa o vão na altura dos avatares, como uma parede. As duas usam a cor da variante.
import { GOLD, PAL, ramp, type Mat } from './palette';
import { mix } from './prim';
import type { PaintInfo, SpritePainter } from './sprites';

const matOf = (info: PaintInfo, fallback: string): Mat => ramp(info.color?.hex ?? fallback);
const M = PAL.metal;

/** Cor do batente: madeira um pouco mais escura que a folha (na porta preta, grafite). */
const frameOf = (m: Mat): Mat => ramp(mix(m.dark, '#2a1d16', 0.35));

/** Batentes (2 px de cada lado) e a verga no alto. */
function doorFrame(s: Parameters<SpritePainter>[0], f: Mat): void {
  s.piece((p) => {
    p.rect(1, 1, 30, 5, f.base);
    p.rect(1, 1, 30, 1, f.light);
    p.rect(1, 5, 30, 1, f.dark);
    p.rect(1, 6, 3, 25, f.base);
    p.rect(1, 6, 1, 25, f.light);
    p.rect(28, 6, 3, 25, f.base);
    p.rect(30, 6, 1, 25, f.dark);
  });
}

/** Porta aberta (o sprite do tipo `door`). */
const door: SpritePainter = (s, info) => {
  const m = matOf(info, '#8a5a3a');
  doorFrame(s, frameOf(m));
  s.piece((p) => {
    // soleira de metal no chão
    p.rect(4, 28, 24, 3, M.base);
    p.rect(4, 28, 24, 1, M.hi);
    p.rect(4, 30, 24, 1, M.dark);
  });
  s.piece((p) => {
    // folha aberta, vista de quina, encostada no batente esquerdo
    p.rect(4, 6, 4, 23, m.base);
    p.rect(4, 6, 1, 23, m.light);
    p.rect(7, 6, 1, 23, m.dark);
    p.px(6, 17, GOLD);
  });
};

/** Porta fechada: folha com dois painéis rebaixados, maçaneta dourada e chapa de proteção embaixo. */
export const paintDoorClosed: SpritePainter = (s, info) => {
  const m = matOf(info, '#8a5a3a');
  doorFrame(s, frameOf(m));
  s.piece((p) => {
    p.rect(4, 6, 24, 25, m.base);
    p.rect(4, 6, 24, 1, m.hi);
    p.rect(4, 7, 1, 23, m.light);
    p.rect(27, 7, 1, 24, m.dark);
    for (const [y, h] of [
      [9, 8],
      [19, 7],
    ]) {
      p.rect(7, y, 18, h, m.dark);
      p.rect(8, y + 1, 17, h - 1, m.base);
      p.rect(8, y + 1, 16, 1, m.light);
    }
    p.rect(4, 28, 24, 3, mix(m.dark, '#000000', 0.2));
    p.rect(4, 28, 24, 1, M.light);
    // maçaneta
    p.rect(22, 17, 3, 2, GOLD);
    p.px(22, 17, PAL.gold.hi);
  });
};

/** Portal de teletransporte: plataforma de metal com anéis na cor da variante e luzinhas na borda. */
const portal: SpritePainter = (s, info) => {
  const m = matOf(info, '#22c3dd');
  s.piece((p) => {
    p.ellipse(2, 7, 28, 22, PAL.metalDark.base);
    p.ellipse(2, 6, 28, 21, PAL.metalDark.light);
    p.ellipse(5, 9, 22, 15, m.dark);
    p.ellipse(7, 10, 18, 13, m.base);
    p.ellipse(9, 12, 14, 9, m.light);
    p.ellipse(11, 13, 10, 7, m.dark);
    p.ellipse(13, 14, 6, 5, m.hi);
    p.rect(15, 15, 2, 2, '#ffffff');
    // luzinhas em volta
    for (const [x, y] of [
      [4, 16],
      [27, 16],
      [9, 8],
      [22, 8],
      [9, 25],
      [22, 25],
    ])
      p.px(x, y, m.hi);
  });
};

export const STRUCTURE: Record<string, SpritePainter> = { door, portal };
