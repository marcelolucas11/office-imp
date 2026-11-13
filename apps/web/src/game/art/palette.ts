// SPDX-License-Identifier: AGPL-3.0-only
// Paletas por material do visual v2: 4 tons por material (sombra, base, luz e brilho).
// Regra de arte: nada de arco-íris; use os tons do material e deixe cor forte só onde
// faz sentido (RGB do PC gamer, post-its, neon).
import { shade, type Color } from './prim';

/** Tons de um material, do mais escuro ao mais claro. */
export interface Mat {
  /** Sombra: faces de baixo, frente de assento, vãos. */
  dark: Color;
  /** Cor principal da peça. */
  base: Color;
  /** Faces de cima, almofadas, áreas iluminadas. */
  light: Color;
  /** Filete de brilho de 1 px (quina de cima, reflexo). */
  hi: Color;
}

/** Dourado da marca Impera. */
export const GOLD: Color = '#d7b870';

/** Deriva os 4 tons a partir de uma cor base (usado nas variantes de cor dos objetos). */
export function ramp(base: Color): Mat {
  return { dark: shade(base, -0.24), base, light: shade(base, 0.13), hi: shade(base, 0.28) };
}

export const PAL = {
  woodLight: { dark: '#8f6340', base: '#b9875a', light: '#c99a6c', hi: '#dcb489' },
  woodDark: { dark: '#3a261c', base: '#5c4130', light: '#7a5a44', hi: '#94705a' },
  metal: { dark: '#6b6e75', base: '#9da2aa', light: '#b8bcc4', hi: '#d9dce0' },
  metalDark: { dark: '#18191d', base: '#2a2b30', light: '#3a3b42', hi: '#55585f' },
  plasticBlack: { dark: '#15161a', base: '#1f2026', light: '#2c2d33', hi: '#3a3c45' },
  plasticWhite: { dark: '#b0b4ba', base: '#d9dce0', light: '#e9ecf2', hi: '#f6f7f9' },
  fabric: { dark: '#30343f', base: '#434957', light: '#555c6c', hi: '#6a7184' },
  leather: { dark: '#3a261c', base: '#4a3024', light: '#5e3e2f', hi: '#77523f' },
  glass: { dark: '#6fa9c9', base: '#9fd3ee', light: '#b8e0f2', hi: '#d6eef8' },
  plant: { dark: '#2f6b3a', base: '#3e8247', light: '#4f9a55', hi: '#6fb56f' },
  terracotta: { dark: '#8a4a2c', base: '#a85f3a', light: '#c0744a', hi: '#d58c62' },
  ceramic: { dark: '#cfc9bd', base: '#e8e3d9', light: '#f2eee6', hi: '#fbf9f4' },
  wall: { dark: '#c7c0b2', base: '#d9d3c7', light: '#e6e1d7', hi: '#f1ede5' },
  paper: { dark: '#cfcabd', base: '#f1ede2', light: '#f8f5ee', hi: '#ffffff' },
  screen: { dark: '#121317', base: '#253049', light: '#3b4566', hi: '#9fb4d9' },
  gold: { dark: '#a88c4c', base: GOLD, light: '#e6cf95', hi: '#f5e6b8' },
} satisfies Record<string, Mat>;

export type MatName = keyof typeof PAL;
