// SPDX-License-Identifier: AGPL-3.0-only
// Fonte de pixels 3×5 (maiúsculas, dígitos e alguns sinais), desenhada com as primitivas.
// Usada nos rótulos da folha de conferência (`pnpm art:sheet`): não depende de fontes do
// sistema, então a folha sai idêntica em qualquer máquina.
import type { Color, Sprite } from './prim';

const GLYPHS: Record<string, string> = {
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '110001010100111',
  '3': '110001010001110',
  '4': '101101111001001',
  '5': '111100110001110',
  '6': '011100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001110',
  _: '000000000000111',
  '-': '000000111000000',
  '+': '000010111010000',
  '.': '000000000000010',
  ',': '000000000010100',
  ':': '000010000010000',
  '/': '001001010100100',
  '(': '001010010010001',
  ')': '100010010010100',
  '#': '101111101111101',
  '=': '000111000111000',
  ' ': '000000000000000',
};
const UNKNOWN = '111101101101111';

export const FONT_W = 3;
export const FONT_H = 5;
/** Avanço por caractere (3 px do glifo + 1 px de espaço). */
export const FONT_ADVANCE = FONT_W + 1;

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

/** Largura em pixels de um texto de uma linha. */
export function textWidth(text: string): number {
  return Math.max(0, [...plain(text)].length * FONT_ADVANCE - 1);
}

/** Escreve o texto (sem acentos, em maiúsculas) com o canto superior esquerdo em (x, y). */
export function drawText(s: Sprite, text: string, x: number, y: number, c: Color): void {
  [...plain(text)].forEach((ch, i) => {
    const g = GLYPHS[ch] ?? UNKNOWN;
    for (let k = 0; k < g.length; k++) if (g[k] === '1') s.px(x + i * FONT_ADVANCE + (k % FONT_W), y + Math.floor(k / FONT_W), c);
  });
}
