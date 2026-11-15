// SPDX-License-Identifier: AGPL-3.0-only
// Limites da câmera da cena (função pura, sem Phaser, para poder ser testada em Node).
import { TILE } from '@office-imp/shared';

/** Quantos blocos de exterior a câmera mostra além da borda do escritório. */
export const CAMERA_MARGIN = 7;

export interface CameraBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Retângulo (em pixels do mundo) em que a câmera pode andar: o mapa mais `margin` blocos de
 * cada lado. Num eixo em que isso tudo cabe na tela, o mapa fica centralizado.
 * `mapW`/`mapH` em blocos; `viewW`/`viewH` em pixels do mundo (tela ÷ zoom).
 * Só a câmera muda: colisão e movimento continuam nos limites do mapa.
 */
export function cameraBounds(mapW: number, mapH: number, viewW: number, viewH: number, margin = CAMERA_MARGIN): CameraBounds {
  const m = Math.max(0, margin) * TILE;
  const axis = (size: number, view: number): [number, number] => {
    const full = size + 2 * m;
    return full <= view ? [(size - view) / 2, view] : [0 - m, full];
  };
  const [x, w] = axis(mapW * TILE, viewW);
  const [y, h] = axis(mapH * TILE, viewH);
  return { x, y, w, h };
}

/** Teto da faixa de exterior com árvores (blocos): limita a quantidade de sprites em telas enormes. */
export const EXTERIOR_MARGIN_MAX = 48;

/**
 * Quantos blocos de exterior precisam de árvores para cobrir a tela: a margem da câmera quando o
 * mapa é maior que a tela; quando o mapa fica centralizado (escritório pequeno em tela grande),
 * a metade do que sobra de cada lado. `viewW`/`viewH` em pixels do mundo, no zoom mínimo;
 * `min` é a faixa de sempre. Limitado a `EXTERIOR_MARGIN_MAX`.
 */
export function exteriorMarginFor(mapW: number, mapH: number, viewW: number, viewH: number, min: number, margin = CAMERA_MARGIN): number {
  const b = cameraBounds(mapW, mapH, viewW, viewH, margin);
  const need = Math.max(-b.x, -b.y, b.x + b.w - mapW * TILE, b.y + b.h - mapH * TILE) / TILE;
  return Math.min(EXTERIOR_MARGIN_MAX, Math.max(min, Math.ceil(need) + 1));
}
