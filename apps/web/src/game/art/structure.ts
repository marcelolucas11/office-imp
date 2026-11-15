// SPDX-License-Identifier: AGPL-3.0-only
// Estrutura do visual v2 (Fase C3): porta (aberta e fechada) e portal.
// A porta fica no vão da parede e tem 2 blocos em pé (a altura da parede alta). Aberta, é desenhada no chão (os avatares passam por cima):
// batentes, verga, a folha encostada no batente esquerdo e a soleira. Fechada, a folha inteira
// ocupa o vão na altura dos avatares, como uma parede. As duas usam a cor da variante.
import { GOLD, PAL, ramp, type Mat } from './palette';
import { mix } from './prim';
import type { PaintInfo, SpritePainter } from './sprites';

const matOf = (info: PaintInfo, fallback: string): Mat => ramp(info.color?.hex ?? fallback);
const M = PAL.metal;

/** Cor do batente: madeira um pouco mais escura que a folha (na porta preta, grafite). */
const frameOf = (m: Mat): Mat => ramp(mix(m.dark, '#2a1d16', 0.35));

/** Onde o vão começa no sprite da porta (2 blocos em pé): acima fica a verga da parede (`DOOR_HEAD`). */
const HEAD = 14;
/** Pé do sprite (64 px). */
const FOOT = 64;

/** Batentes (3 px de cada lado) e a guarnição no alto do vão. */
function doorFrame(s: Parameters<SpritePainter>[0], f: Mat): void {
  s.piece((p) => {
    p.rect(1, HEAD, 30, 3, f.base);
    p.rect(1, HEAD, 30, 1, f.light);
    p.rect(1, HEAD + 2, 30, 1, f.dark);
    p.rect(1, HEAD + 3, 3, FOOT - HEAD - 4, f.base);
    p.rect(1, HEAD + 3, 1, FOOT - HEAD - 4, f.light);
    p.rect(28, HEAD + 3, 3, FOOT - HEAD - 4, f.base);
    p.rect(30, HEAD + 3, 1, FOOT - HEAD - 4, f.dark);
  });
}

/** Porta aberta (o sprite do tipo `door`, 2 blocos em pé: o vão da parede alta). */
const door: SpritePainter = (s, info) => {
  const m = matOf(info, '#8a5a3a');
  doorFrame(s, frameOf(m));
  s.piece((p) => {
    // soleira de metal no chão
    p.rect(4, FOOT - 4, 24, 3, M.base);
    p.rect(4, FOOT - 4, 24, 1, M.hi);
    p.rect(4, FOOT - 2, 24, 1, M.dark);
  });
  s.piece((p) => {
    // folha aberta, vista de quina, encostada no batente esquerdo
    const y0 = HEAD + 3;
    const h = FOOT - 4 - y0;
    p.rect(4, y0, 4, h, m.base);
    p.rect(4, y0, 1, h, m.light);
    p.rect(7, y0, 1, h, m.dark);
    p.rect(6, y0 + Math.floor(h / 2), 1, 2, GOLD);
  });
};

/** Porta fechada: folha com dois painéis rebaixados, maçaneta dourada e chapa de proteção embaixo. */
export const paintDoorClosed: SpritePainter = (s, info) => {
  const m = matOf(info, '#8a5a3a');
  doorFrame(s, frameOf(m));
  s.piece((p) => {
    const y0 = HEAD + 3;
    p.rect(4, y0, 24, FOOT - 1 - y0, m.base);
    p.rect(4, y0, 24, 1, m.hi);
    p.rect(4, y0 + 1, 1, FOOT - 2 - y0, m.light);
    p.rect(27, y0 + 1, 1, FOOT - 2 - y0, m.dark);
    for (const [y, h] of [
      [y0 + 3, 16],
      [y0 + 22, 15],
    ]) {
      p.rect(7, y, 18, h, m.dark);
      p.rect(8, y + 1, 17, h - 1, m.base);
      p.rect(8, y + 1, 16, 1, m.light);
    }
    p.rect(4, FOOT - 4, 24, 3, mix(m.dark, '#000000', 0.2));
    p.rect(4, FOOT - 4, 24, 1, M.light);
    // maçaneta
    p.rect(22, y0 + 20, 3, 2, GOLD);
    p.px(22, y0 + 20, PAL.gold.hi);
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
