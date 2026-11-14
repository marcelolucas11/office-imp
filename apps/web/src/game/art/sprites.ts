// SPDX-License-Identifier: AGPL-3.0-only
// Contrato dos desenhos de objeto do visual v2. Cada tipo redesenhado registra um
// `SpritePainter` (ver `seating.ts`); `objects.ts` cuida do tamanho, do cache e da cor.
import type { DeskSetup, MapObject, ObjectColor } from '@office-imp/shared';
import type { Sprite } from './prim';

export interface PaintInfo {
  /** Objeto do mapa (direção, props, tamanho por instância). */
  o: MapObject;
  /** Largura do sprite em pixels (largura do objeto em blocos × 32). */
  w: number;
  /** Altura do footprint em pixels (altura do objeto em blocos × 32). */
  h: number;
  /** Pixels acima do footprint (`tall` × 32): o footprint começa em `y = top`. */
  top: number;
  /** Variante de cor em uso (a pedida ou a padrão); `null` se o tipo não tem cores. */
  color: ObjectColor | null;
  /** Setup da mesa (o pedido ou o padrão); `null` se o tipo não é mesa de trabalho. */
  setup: DeskSetup | null;
  /** Texto a desenhar (letreiro neon); `null` se o tipo não desenha texto. */
  text: string | null;
  /**
   * Quadro da animação de contexto (Fase F), de 0 a `objectFrames(o) - 1`. Ausente = 0, e o
   * quadro 0 é sempre o desenho estático (o da folha, do Mapmaker e dos ícones).
   */
  frame?: number;
  /** Hora mostrada pelo relógio de parede (só a cena passa); ausente = 10h10, o desenho estático. */
  time?: { hour: number; minute: number } | null;
}

/** Desenha o objeto num sprite de `w × (top + h)` pixels. Deixe 1 px livre nas bordas para o contorno. */
export type SpritePainter = (s: Sprite, info: PaintInfo) => void;
