// SPDX-License-Identifier: AGPL-3.0-only
// Relógio único das animações de contexto (Fase F do visual v2). A cena registra cada sprite
// animado (objetos, árvores, janelas, relógios) com a sua animação e a sua fase; a cada passo
// (`tick`, chamado pela cena umas 10 vezes por segundo) o animador calcula o quadro de cada um
// pelo horário e só troca o quadro de quem mudou. Não desenha nada: os quadros já existem como
// texturas. Não depende do Phaser (o alvo só precisa de `setFrame`), então é testável em Node.
import { animFrame, type AnimDef } from './art/anim';

/** O que o animador mexe: um sprite com quadros (no Phaser, `Image` ou `Sprite`). */
export interface FrameTarget {
  setFrame(frame: number): unknown;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Entry {
  group: string;
  def: AnimDef;
  phase: number;
  /** Retângulo do sprite no mundo (para pular quem está fora da tela). */
  box: Rect;
  frame: number;
  /** Quadro calculado de outro jeito (relógio: pelos segundos de verdade). */
  pick?: (now: number) => number;
}

export interface TickOptions {
  /** Aba oculta (`document.hidden`): nada muda. */
  hidden?: boolean;
  /** "Reduzir animações": tudo no quadro 0. */
  reduce?: boolean;
  /** O que a câmera mostra; quem está fora (com uma folga) fica parado. Ausente = tudo. */
  view?: Rect | null;
}

/** Folga (px do mundo) em volta da tela: o que está para entrar já chega animado. */
const MARGIN = 64;

export class Animator {
  private entries = new Map<FrameTarget, Entry>();

  /** Quantos sprites estão registrados. */
  get size(): number {
    return this.entries.size;
  }

  /** Registra um sprite (substitui o registro anterior do mesmo sprite). Ele começa no quadro 0. */
  add(group: string, target: FrameTarget, def: AnimDef, phase: number, box: Rect, pick?: (now: number) => number): void {
    this.entries.set(target, { group, def, phase, box, frame: 0, pick });
  }

  /** Esquece um sprite. */
  remove(target: FrameTarget): void {
    this.entries.delete(target);
  }

  /** Esquece todos os sprites de um grupo (ex.: `obj` ao remontar o mapa). */
  clear(group: string): void {
    for (const [t, e] of this.entries) if (e.group === group) this.entries.delete(t);
  }

  /** Quadro que o sprite está mostrando (0 se não está registrado). */
  frameOf(target: FrameTarget): number {
    return this.entries.get(target)?.frame ?? 0;
  }

  /** Avança as animações para o instante `now` (ms). Devolve quantos sprites trocaram de quadro. */
  tick(now: number, opts: TickOptions = {}): number {
    if (opts.hidden) return 0;
    let changed = 0;
    const v = opts.view;
    for (const [target, e] of this.entries) {
      let f = 0;
      if (!opts.reduce) {
        if (v && (e.box.x + e.box.width < v.x - MARGIN || e.box.y + e.box.height < v.y - MARGIN || e.box.x > v.x + v.width + MARGIN || e.box.y > v.y + v.height + MARGIN)) continue;
        f = e.pick ? e.pick(now) : animFrame(e.def, now, e.phase);
      }
      if (f === e.frame) continue;
      e.frame = f;
      target.setFrame(f);
      changed++;
    }
    return changed;
  }
}
