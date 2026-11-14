// SPDX-License-Identifier: AGPL-3.0-only
// Animações de contexto do visual v2 (Fase F): quais objetos animam, quantos quadros cada um tem
// e em que ritmo. Tudo é troca de quadros PRÉ-GERADOS: o mesmo `SpritePainter` desenha cada
// quadro uma vez (com `info.frame`) e o resultado fica em cache; a cena só escolhe qual quadro
// mostrar, por um relógio único (`animFrame`). O quadro 0 é sempre o desenho estático.
import { OBJECT_DEFS, isDeskType, objColor, objSetup, objSize, type MapObject, type OfficeMap } from '@office-imp/shared';
import { Sprite, noise } from './prim';

export type AnimKind = 'screen' | 'rgb' | 'steam' | 'fish' | 'neon' | 'clock' | 'sway' | 'tree' | 'clouds';

export interface AnimDef {
  kind: AnimKind;
  /** Quantos quadros pré-gerados (de 4 a 8). */
  frames: number;
  /** Duração de um passo do relógio da animação (ms). */
  ms: number;
  /** Quadro de cada passo, repetido em ciclo; ausente = 0, 1, …, frames − 1. */
  seq?: readonly number[];
  /** Pisca raro (neon): fica no quadro 0 e, de vez em quando, dá uma piscada curta. */
  flicker?: boolean;
}

/** Tela dos setups (cursor piscando, linha sendo digitada) e, no PC gamer, as luzes RGB e o LED. */
export const ANIM_SCREEN: AnimDef = { kind: 'screen', frames: 7, ms: 700 };
/** Teclado mecânico RGB: as cores andam uma tecla por passo (mesmo ritmo do PC gamer). */
export const ANIM_RGB: AnimDef = { kind: 'rgb', frames: 7, ms: 700 };
/** Vapor do café: um fio que sobe e some, e uma pausa sem vapor. */
export const ANIM_STEAM: AnimDef = { kind: 'steam', frames: 6, ms: 280, seq: [0, 1, 2, 3, 4, 5, 0, 0] };
/** Peixes do aquário indo e voltando, e as bolhas subindo. */
export const ANIM_FISH: AnimDef = { kind: 'fish', frames: 8, ms: 450 };
/** Neon: aceso quase sempre; uma piscada de ~0,7 s a cada 20 s, em média. */
export const ANIM_NEON: AnimDef = { kind: 'neon', frames: 4, ms: 140, flicker: true };
/** Relógio de parede: 8 posições do ponteiro de segundos; o quadro vem do relógio de verdade (`clockFrame`). */
export const ANIM_CLOCK: AnimDef = { kind: 'clock', frames: 8, ms: 7500 };
/** Planta perto do ar-condicionado: folhas balançando de leve. */
export const ANIM_SWAY: AnimDef = { kind: 'sway', frames: 4, ms: 380, seq: [0, 1, 2, 1, 0, 3] };
/** Árvores do exterior: paradas a maior parte do tempo, com uma rajada que dobra a copa e volta. */
export const ANIM_TREE: AnimDef = { kind: 'tree', frames: 4, ms: 450, seq: [0, 0, 0, 1, 2, 2, 1, 0, 3, 0, 0, 0] };
/** Nuvens na vista das janelas: andam 7 px para um lado e voltam, bem devagar. */
export const ANIM_CLOUDS: AnimDef = { kind: 'clouds', frames: 8, ms: 2500, seq: [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1] };

/** Plantas que balançam quando estão perto de um ar-condicionado split. */
export const SWAY_TYPES = new Set(['plant', 'monstera', 'palm', 'tall_vase']);
/** Distância (em blocos, contando a diagonal) do split até a planta para ela balançar. */
export const BREEZE_RADIUS = 2;

export interface AnimOptions {
  /** A planta está perto de um ar-condicionado (ver `plantsInBreeze`). */
  breeze?: boolean;
}

/** Animação do objeto, ou `null` se ele é estático. */
export function objectAnim(o: MapObject, opts: AnimOptions = {}): AnimDef | null {
  if (!OBJECT_DEFS[o.type]) return null;
  if (isDeskType(o.type)) {
    const setup = objSetup(o);
    return setup && setup.id !== 'none' ? ANIM_SCREEN : null;
  }
  switch (o.type) {
    case 'keyboard':
      return objColor(o)?.id === 'rgb' ? ANIM_RGB : null;
    case 'mug':
    case 'coffee':
    case 'espresso':
      return ANIM_STEAM;
    case 'aquarium':
      return ANIM_FISH;
    case 'neon':
      return ANIM_NEON;
    case 'wall_clock':
      return ANIM_CLOCK;
    default:
      return opts.breeze && SWAY_TYPES.has(o.type) ? ANIM_SWAY : null;
  }
}

/** Número de quadros do objeto (1 = estático). */
export function objectFrameCount(o: MapObject, opts: AnimOptions = {}): number {
  return objectAnim(o, opts)?.frames ?? 1;
}

/** Duração (ms) de um ciclo inteiro da animação. */
export function animCycleMs(def: AnimDef): number {
  return (def.seq?.length ?? def.frames) * def.ms;
}

/** Piscada do neon: quadros mostrados em sequência, um por passo. */
const FLICKER = [1, 1, 0, 2, 0] as const;
/** Passos por janela de sorteio da piscada (140 ms × 70 ≈ 10 s) e chance de piscar em cada janela. */
const FLICKER_WINDOW = 70;
const FLICKER_CHANCE = 0.5;

/**
 * Quadro a mostrar no instante `now` (ms), com a fase do objeto (`phase`, ms). Função pura: o
 * mesmo instante dá o mesmo quadro em qualquer máquina, e objetos com fases diferentes não
 * piscam juntos.
 */
export function animFrame(def: AnimDef, now: number, phase = 0): number {
  const step = Math.floor((now + phase) / def.ms);
  if (def.flicker) {
    const win = Math.floor(step / FLICKER_WINDOW);
    const seed = 613 + (Math.abs(Math.round(phase)) % 9973);
    if (noise(win, 0, seed) >= FLICKER_CHANCE) return 0;
    const start = 5 + Math.floor(noise(win, 1, seed) * (FLICKER_WINDOW - 10 - FLICKER.length));
    const i = step - win * FLICKER_WINDOW - start;
    return i >= 0 && i < FLICKER.length ? FLICKER[i] : 0;
  }
  const seq = def.seq;
  const n = seq?.length ?? def.frames;
  const k = ((step % n) + n) % n;
  return seq ? seq[k] : k;
}

/** Fase (ms) de um objeto pela posição: determinística e diferente entre vizinhos. */
export function animPhase(def: AnimDef, x: number, y: number, salt = 0): number {
  const cycle = def.flicker ? 9973 * def.ms : animCycleMs(def);
  return Math.floor(noise(Math.round(x), Math.round(y), 517 + salt) * cycle);
}

/**
 * Quadro do relógio de parede para o segundo `second`: o ponteiro de segundos tem 8 posições
 * (de 7,5 em 7,5 s) e o quadro 0 é o ponteiro para baixo (30 s), o desenho estático.
 */
export function clockFrame(second: number): number {
  const s = ((Math.floor(second) % 60) + 60) % 60;
  return Math.floor(((s + 30) % 60) / 7.5) % ANIM_CLOCK.frames;
}

/** Segundo que o ponteiro mostra no quadro `frame` do relógio. */
export function clockFrameSecond(frame: number): number {
  return (30 + frame * 7.5) % 60;
}

/**
 * Ids das plantas que balançam: as de `SWAY_TYPES` a até `BREEZE_RADIUS` blocos (contando a
 * diagonal) de um ar-condicionado split. O split fica na parede; a planta, no chão perto dele.
 */
export function plantsInBreeze(map: OfficeMap): Set<string> {
  const out = new Set<string>();
  const acs = map.objects.filter((o) => o.type === 'split_ac');
  if (!acs.length) return out;
  for (const o of map.objects) {
    if (!SWAY_TYPES.has(o.type)) continue;
    const { w, h } = objSize(o);
    for (const ac of acs) {
      const a = objSize(ac);
      const dx = Math.max(ac.x - (o.x + w - 1), 0, o.x - (ac.x + a.w - 1));
      const dy = Math.max(ac.y - (o.y + h - 1), 0, o.y - (ac.y + a.h - 1));
      if (Math.max(dx, dy) <= BREEZE_RADIUS) {
        out.add(o.id);
        break;
      }
    }
  }
  return out;
}

/**
 * Balanço de folhagem (árvores do exterior e plantas perto do split), aplicado sobre o desenho
 * pronto, já contornado: as linhas de cima da copa andam 1 px para o lado e a base fica parada.
 * `y0`/`y1` = primeira e última linha da folhagem. Quadro 1: o terço de cima vai 1 px para a
 * direita; 2: a copa dobra mais (o topo vai 2 px, o meio 1 px); 3: o topo volta 1 px para a
 * esquerda. O quadro 0 não muda nada.
 */
export function swayFoliage(s: Sprite, frame: number, y0: number, y1: number): void {
  if (frame <= 0) return;
  const span = Math.max(1, y1 - y0 + 1);
  const shiftAt = (y: number): number => {
    const t = (y - y0) / span;
    if (frame === 1) return t < 0.34 ? 1 : 0;
    if (frame === 2) return t < 0.2 ? 2 : t < 0.55 ? 1 : 0;
    return t < 0.3 ? -1 : 0;
  };
  const row = new Uint8ClampedArray(s.w * 4);
  for (let y = Math.max(0, y0); y <= Math.min(s.h - 1, y1); y++) {
    const dx = shiftAt(y);
    if (!dx) continue;
    const off = y * s.w * 4;
    row.set(s.data.subarray(off, off + s.w * 4));
    s.data.fill(0, off, off + s.w * 4);
    for (let x = 0; x < s.w; x++) {
      const nx = x + dx;
      if (nx < 0 || nx >= s.w) continue;
      s.data.set(row.subarray(x * 4, x * 4 + 4), off + nx * 4);
    }
  }
  s.changed();
}

/** Caminho em S de um fio de vapor, de baixo para cima, a partir da boca da xícara. */
const WISP: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -1],
  [1, -2],
  [1, -3],
  [0, -4],
  [-1, -5],
  [-1, -6],
];

/**
 * Vapor saindo de uma xícara ou caneca: um fio de 3 px que sobe 1 px por quadro e vai sumindo,
 * e um segundo fio, mais fraco, na metade do ciclo. `cx` = coluna do meio, `y` = linha logo acima
 * da boca (e do contorno dela); `k` = quadro (0 = sem vapor, o desenho estático); `tall` = quantas
 * linhas acima de `y` o vapor pode subir. Branco translúcido composto por cima (sem contorno).
 */
export function paintSteam(s: Sprite, cx: number, y: number, k: number, tall = 6): void {
  if (k <= 0) return;
  const layer = new Sprite(s.w, s.h);
  const puff = (x0: number, first: number, len: number, strength: number, mirror: boolean) => {
    for (let i = 0; i < len; i++) {
      const j = first + i;
      if (j < 0 || j >= WISP.length || -WISP[j][1] > tall) continue;
      const [dx, dy] = WISP[j];
      // mais forte embaixo, some no alto
      const a = Math.round(strength * (1 - j / (tall + 2)));
      if (a < 24) continue;
      layer.px(x0 + (mirror ? -dx : dx), y + dy, `#f4f1ea${a.toString(16).padStart(2, '0')}`);
    }
  };
  puff(cx, k - 1, 3, 200, false);
  if (k >= 3) puff(cx + 2, k - 3, 2, 140, true);
  s.paste(layer);
}
