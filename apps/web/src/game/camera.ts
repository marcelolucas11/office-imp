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

export interface GrassStrip {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Deslocamento do padrão (px) para a grama continuar alinhada ao mundo. */
  tx: number;
  ty: number;
}

/**
 * Grama de fora do escritório: até 4 faixas (cima, baixo, esquerda, direita) cobrindo só a parte
 * da tela que fica **fora do retângulo do mapa**. Dentro dele, a grama dos vazios vem desenhada
 * nos blocos estáticos, então nenhum pixel é pintado duas vezes (com WebGL por software, uma
 * camada de grama do tamanho da tela embaixo de tudo custava ~20% dos quadros).
 * A tela é alargada até a grade do padrão (`pattern` px, com um padrão de folga) para as faixas
 * só mudarem de tamanho quando a câmera cruza essa grade. `null` = faixa fora da tela.
 */
export function grassStrips(mapW: number, mapH: number, viewX: number, viewY: number, viewW: number, viewH: number, pattern = 256): (GrassStrip | null)[] {
  const P = pattern;
  const W = mapW * TILE;
  const H = mapH * TILE;
  const x0 = (Math.floor(viewX / P) - 1) * P;
  const y0 = (Math.floor(viewY / P) - 1) * P;
  const x1 = (Math.ceil((viewX + viewW) / P) + 1) * P;
  const y1 = (Math.ceil((viewY + viewH) / P) + 1) * P;
  const mod = (v: number) => ((v % P) + P) % P;
  const rect = (ax: number, ay: number, bx: number, by: number): GrassStrip | null => (bx > ax && by > ay ? { x: ax, y: ay, w: bx - ax, h: by - ay, tx: mod(ax), ty: mod(ay) } : null);
  return [
    rect(x0, y0, x1, Math.min(y1, 0)), // cima (toda a largura)
    rect(x0, Math.max(y0, H), x1, y1), // baixo (toda a largura)
    rect(x0, Math.max(y0, 0), Math.min(x1, 0), Math.min(y1, H)), // esquerda (só na altura do mapa)
    rect(Math.max(x0, W), Math.max(y0, 0), x1, Math.min(y1, H)), // direita
  ];
}
