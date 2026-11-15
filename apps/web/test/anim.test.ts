// SPDX-License-Identifier: AGPL-3.0-only
// Animações de contexto do visual v2 (Fase F): quadros pré-gerados, relógio único e "Reduzir animações".
import { createCanvas } from '@napi-rs/canvas';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DAY_PERIODS, OBJECT_DEFS, OBJECT_TYPES, Wall, deskSetups, emptyMap, isDeskType, objectColors, type Dir, type MapObject } from '@office-imp/shared';
import { Animator } from '../src/game/animator';
import {
  ANIM_CLOUDS,
  ANIM_NEON,
  ANIM_TREE,
  BREEZE_RADIUS,
  SWAY_TYPES,
  animFrame,
  animPhase,
  clockFrame,
  clockFrameSecond,
  objectAnim,
  plantsInBreeze,
  type AnimDef,
} from '../src/game/art/anim';
import { setCanvasFactory } from '../src/game/art/canvas';
import { DECOR_KINDS, TREE_FOLIAGE, decorFrames, decorSprite, decorStrip, viewFrames, windowView } from '../src/game/art/exterior';
import { handEnd } from '../src/game/art/extras';
import { objectFrames, objectSprite, objectStrip } from '../src/game/art/objects';
import { Sprite } from '../src/game/art/prim';
import { wallCanvas, wallKey, type WallTile } from '../src/game/art/walls';
import { MOTION_KEY, loadMotion, resolveReduceMotion, setReduceMotion, useMotion } from '../src/game/motion';

beforeAll(() => setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement));
afterAll(() => setCanvasFactory());

const obj = (type: string, extra: Partial<MapObject> = {}): MapObject => ({ id: 't', type, x: 0, y: 0, ...extra });
const px = (c: HTMLCanvasElement) => Sprite.fromCanvas(c);
const same = (a: Sprite, b: Sprite) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);

/** Hash dos pixels (o alfa intermediário só conta como "translúcido", como no teste do avatar). */
function hash(s: Sprite, h = 2166136261): number {
  for (let i = 0; i < s.data.length; i += 4) {
    const a = s.data[i + 3];
    const vals = a === 255 ? [s.data[i], s.data[i + 1], s.data[i + 2], 255] : [a === 0 ? 0 : 1];
    for (const v of vals) h = Math.imul(h ^ v, 16777619);
  }
  return h >>> 0;
}

/**
 * Todas as variantes de objeto que animam: tipo × cor × setup (e texto/tamanho do neon, e a brisa
 * nas plantas), sem direção e com `dir: 'right'` (a única direção que muda um animado: a mesa em L).
 */
let variants: { o: MapObject; breeze: boolean }[] | null = null;
function animatedVariants(): { o: MapObject; breeze: boolean }[] {
  if (variants) return variants;
  const out: { o: MapObject; breeze: boolean }[] = [];
  for (const type of OBJECT_TYPES) {
    const def = OBJECT_DEFS[type];
    const colors = objectColors(type).length ? objectColors(type).map((c) => c.id) : [undefined];
    const setups = [undefined, ...deskSetups(type).map((st) => st.id)];
    const extras: Partial<MapObject>[] = [{}];
    if (def.text) extras.push({ w: def.w + 1, props: { text: 'Bom dia, time!' } });
    for (const color of colors)
      for (const dir of [undefined, 'right'] as (Dir | undefined)[])
        for (const setup of setups)
          for (const extra of extras)
            for (const breeze of [false, true]) {
              const o = obj(type, { color, dir, setup, ...extra });
              if (objectFrames(o, { breeze }) > 1 && !(breeze && !SWAY_TYPES.has(type))) out.push({ o, breeze });
            }
  }
  variants = out;
  return out;
}

/** Recorte do quadro `f` de uma tira. */
function frameOf(strip: { canvas: HTMLCanvasElement; w: number; h: number }, f: number): Sprite {
  const c = createCanvas(strip.w, strip.h);
  c.getContext('2d').drawImage(strip.canvas as unknown as Parameters<ReturnType<typeof c.getContext>['drawImage']>[0], f * strip.w, 0, strip.w, strip.h, 0, 0, strip.w, strip.h);
  return Sprite.fromCanvas(c as unknown as HTMLCanvasElement);
}

describe('quadros pré-gerados dos objetos', () => {
  it('quadro 0 é idêntico ao desenho estático em todo objeto animado, e a tira começa por ele', () => {
    const list = animatedVariants();
    expect(list.length).toBeGreaterThan(100);
    for (const { o, breeze } of list) {
      const still = px(objectSprite(o));
      expect(same(px(objectSprite(o, 0, { breeze })), still), `${o.type}/${o.color}/${o.setup}`).toBe(true);
      const strip = objectStrip(o, { breeze });
      expect(same(frameOf(strip, 0), still), `${o.type} tira`).toBe(true);
      expect(same(frameOf(strip, strip.frames - 1), px(objectSprite(o, strip.frames - 1, { breeze }))), `${o.type} último quadro`).toBe(true);
      expect(strip.canvas.width).toBe(strip.w * strip.frames);
    }
  }, 60_000);

  it('o quadro 0 de todos os animados continua com os pixels de antes da Fase F', () => {
    // hash combinado do desenho estático das 622 variantes animadas, conferido com o código de antes da Fase F (dd90131)
    let h = 2166136261;
    for (const { o } of animatedVariants()) h = hash(px(objectSprite(o)), h);
    expect(h.toString(16)).toBe('bd28567a');
  }, 30_000);

  it('número de quadros por tipo (de 4 a 8) e quem é estático', () => {
    for (const type of OBJECT_TYPES) {
      if (!isDeskType(type)) continue;
      for (const st of deskSetups(type)) expect([type, st.id, objectFrames(obj(type, { setup: st.id }))]).toEqual([type, st.id, st.id === 'none' ? 1 : 7]);
      expect(objectFrames(obj(type))).toBe(7);
    }
    expect(objectFrames(obj('keyboard'))).toBe(7);
    expect(objectFrames(obj('keyboard', { color: 'white' }))).toBe(1);
    expect(objectFrames(obj('keyboard', { color: 'pink' }))).toBe(1);
    for (const t of ['mug', 'coffee', 'espresso']) expect([t, objectFrames(obj(t))]).toEqual([t, 6]);
    expect(objectFrames(obj('aquarium'))).toBe(8);
    expect(objectFrames(obj('neon'))).toBe(4);
    expect(objectFrames(obj('wall_clock'))).toBe(8);
    for (const t of SWAY_TYPES) {
      expect([t, objectFrames(obj(t))]).toEqual([t, 1]);
      expect([t, objectFrames(obj(t), { breeze: true })]).toEqual([t, 4]);
    }
    // a brisa só vale para as plantas que balançam
    expect(objectFrames(obj('cactus'), { breeze: true })).toBe(1);
    // tudo o que não está acima é estático
    const animated = new Set(['keyboard', 'mug', 'coffee', 'espresso', 'aquarium', 'neon', 'wall_clock']);
    for (const type of OBJECT_TYPES) if (!animated.has(type) && !isDeskType(type)) expect([type, objectFrames(obj(type))]).toEqual([type, 1]);
    for (const { o, breeze } of animatedVariants()) {
      const n = objectFrames(o, { breeze });
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(8);
    }
  });

  it('todo quadro tem o tamanho do estático e a animação muda alguma coisa', { timeout: 60_000 }, () => {
    for (const { o, breeze } of animatedVariants()) {
      const still = px(objectSprite(o));
      const n = objectFrames(o, { breeze });
      let changes = 0;
      for (let f = 1; f < n; f++) {
        const s = px(objectSprite(o, f, { breeze }));
        expect([s.w, s.h]).toEqual([still.w, still.h]);
        if (!same(s, still)) changes++;
      }
      // pelo menos metade dos quadros difere do estático
      expect(changes, `${o.type}/${o.color}/${o.setup}`).toBeGreaterThanOrEqual(Math.floor((n - 1) / 2));
    }
  });

  it('os quadros ficam em cache: pedir de novo não redesenha', () => {
    const o = obj('desk', { setup: 'gamer' });
    expect(objectSprite(o, 3)).toBe(objectSprite(o, 3));
    expect(objectSprite(o, 10)).toBe(objectSprite(o, 3));
    expect(objectStrip(o).canvas).toBe(objectStrip(o).canvas);
    // objeto estático: qualquer quadro é o próprio estático
    expect(objectSprite(obj('sofa'), 5)).toBe(objectSprite(obj('sofa')));
  });
});

describe('relógio de parede', () => {
  it('sem hora mostra 10h10; com 10h10 no quadro 0 é o mesmo desenho', () => {
    const o = obj('wall_clock');
    const still = px(objectSprite(o));
    const strip = objectStrip(o, { time: { hour: 10, minute: 10 } });
    const all = Sprite.fromCanvas(strip.canvas);
    expect(same(frameOf(strip, 0), still)).toBe(true);
    // outra hora, outro desenho; a tira com hora não entra no cache (a cena guarda só o minuto atual)
    const other = objectStrip(o, { time: { hour: 3, minute: 45 } });
    expect(same(Sprite.fromCanvas(other.canvas), all)).toBe(false);
    expect(objectStrip(o, { time: { hour: 3, minute: 45 } }).canvas).not.toBe(other.canvas);
  });

  it('ponteiros: ponta pelo ângulo; às 10h10 são os mesmos traços do desenho estático', () => {
    expect(handEnd(305, 3.6)).toEqual([-3, -2]); // horas no 10
    expect(handEnd(60, 5.1)).toEqual([4, -3]); // minutos no 2
    expect(handEnd(180, 4)).toEqual([0, 4]); // segundos para baixo
    expect(handEnd(0, 5.1)).toEqual([0, -5]);
    expect(handEnd(90, 5.1)).toEqual([5, 0]);
  });

  it('o quadro segue os segundos: 8 posições, o 0 é o ponteiro para baixo (30 s)', () => {
    expect(clockFrame(30)).toBe(0);
    expect(clockFrame(37)).toBe(0);
    expect(clockFrame(38)).toBe(1);
    expect(clockFrame(0)).toBe(4);
    expect(clockFrame(59)).toBe(3);
    expect(clockFrame(29)).toBe(7);
    for (let f = 0; f < 8; f++) expect(clockFrame(Math.ceil(clockFrameSecond(f)))).toBe(f);
  });
});

describe('exterior: árvores e nuvens', () => {
  it('árvores têm 4 quadros (quadro 0 = estático, tronco parado); arbustos, flores e pedras são estáticos', () => {
    for (const kind of DECOR_KINDS) {
      const n = decorFrames(kind);
      const foliage = TREE_FOLIAGE[kind];
      expect([kind, n]).toEqual([kind, foliage === undefined ? 1 : ANIM_TREE.frames]);
      for (const period of DAY_PERIODS) {
        const still = px(decorSprite(kind, period));
        expect(decorSprite(kind, period, 0)).toBe(decorSprite(kind, period));
        expect(Sprite.fromCanvas(decorStrip(kind, period)).w).toBe(still.w * n);
        for (let f = 1; f < n; f++) {
          const s = px(decorSprite(kind, period, f));
          expect(same(s, still), `${kind} ${period} ${f}`).toBe(false);
          // do fim da copa para baixo (tronco) nada muda
          for (let y = foliage! + 1; y < s.h; y++) for (let x = 0; x < s.w; x++) expect(s.get(x, y)).toBe(still.get(x, y));
        }
      }
    }
  });

  it('nuvens das janelas: 8 quadros onde há nuvem, nenhum à noite; quadro 0 = vista estática', () => {
    for (const period of DAY_PERIODS) {
      const n = viewFrames(period);
      expect([period, n]).toEqual([period, period === 'night' ? 1 : ANIM_CLOUDS.frames]);
      let moved = 0;
      for (let v = 0; v < 4; v++) {
        expect(same(windowView(period, v, 0), windowView(period, v))).toBe(true);
        if (!same(windowView(period, v, 4), windowView(period, v))) moved++;
      }
      // as nuvens ficam em 3 dos 4 trechos da paisagem
      expect([period, moved]).toEqual([period, n > 1 ? 3 : 0]);
    }
    // a paisagem continua de uma janela para a outra em todo quadro (o mesmo quadro em todas)
    const strip = (f: number) => [0, 1, 2, 3].map((v) => windowView('day', v, f));
    const a = strip(3);
    const b = strip(3);
    for (let v = 0; v < 4; v++) expect(same(a[v], b[v])).toBe(true);
    const tile: WallTile = { style: Wall.Wall, n: { below: false, above: false, left: true, right: true }, window: 'view', variant: 1, period: 'day' };
    expect(wallKey({ ...tile, frame: 2 })).not.toBe(wallKey(tile));
    expect(wallKey({ ...tile, frame: 0 })).toBe(wallKey(tile));
    // parede sem vista não muda com o quadro
    expect(wallKey({ ...tile, window: 'inner', frame: 2 })).toBe(wallKey({ ...tile, window: 'inner' }));
    expect(same(px(wallCanvas({ ...tile, frame: 0 })), px(wallCanvas(tile)))).toBe(true);
  });
});

describe('ritmo das animações', () => {
  const def: AnimDef = { kind: 'steam', frames: 6, ms: 100, seq: [0, 1, 2, 3, 4, 5, 0, 0] };

  it('animFrame é puro: o quadro sai do horário, da sequência e da fase', () => {
    expect([0, 100, 250, 799, 800].map((t) => animFrame(def, t))).toEqual([0, 1, 2, 0, 0]);
    expect(animFrame(def, 1234, 0)).toBe(animFrame(def, 1234, 0));
    expect(animFrame(def, 0, 300)).toBe(3);
    expect(animFrame({ kind: 'fish', frames: 8, ms: 50 }, 50 * 13)).toBe(5);
    expect(animFrame({ kind: 'fish', frames: 8, ms: 50 }, -50)).toBe(7);
  });

  it('fases pela posição: determinísticas e diferentes entre vizinhos', () => {
    expect(animPhase(def, 3, 4)).toBe(animPhase(def, 3, 4));
    const phases = new Set([0, 1, 2, 3, 4, 5].map((x) => animPhase(def, x, 2)));
    expect(phases.size).toBeGreaterThan(3);
    for (const p of phases) expect(p).toBeLessThan(800);
  });

  it('o neon pisca raro e curto (não é estroboscópico)', () => {
    const phase = animPhase(ANIM_NEON, 4, 0);
    let lit = 0;
    let bursts = 0;
    let run = 0;
    let longest = 0;
    const steps = 20_000;
    for (let i = 0; i < steps; i++) {
      const f = animFrame(ANIM_NEON, i * ANIM_NEON.ms, phase);
      if (f === 0) lit++;
      if (f !== 0) {
        if (run === 0) bursts++;
        run++;
        longest = Math.max(longest, run);
      } else if (run > 0 && run < 3) run++;
      else run = 0;
    }
    // aceso em mais de 95% do tempo; cada piscada dura no máximo 5 passos (0,7 s)
    expect(lit / steps).toBeGreaterThan(0.95);
    expect(longest).toBeLessThanOrEqual(5);
    // no máximo uma piscada a cada ~10 s
    expect(bursts).toBeLessThanOrEqual(Math.ceil((steps * ANIM_NEON.ms) / 10_000) + 1);
    expect(bursts).toBeGreaterThan(0);
  });
});

describe('plantas perto do ar-condicionado', () => {
  it(`balançam as de SWAY_TYPES a até ${BREEZE_RADIUS} blocos de um split`, () => {
    const map = emptyMap(12, 6);
    map.objects.push(
      { id: 'ac', type: 'split_ac', x: 3, y: 0 },
      { id: 'perto', type: 'monstera', x: 3, y: 1 },
      { id: 'diagonal', type: 'palm', x: 5, y: 2 },
      { id: 'longe', type: 'plant', x: 6, y: 1 },
      { id: 'cacto', type: 'cactus', x: 2, y: 1 },
    );
    expect([...plantsInBreeze(map)].sort()).toEqual(['diagonal', 'perto']);
    expect(plantsInBreeze(emptyMap(4, 4)).size).toBe(0);
    expect(objectAnim(map.objects[1], { breeze: true })?.kind).toBe('sway');
  });
});

describe('animador (relógio único da cena)', () => {
  class Fake {
    frames: number[] = [];
    setFrame(f: number) {
      this.frames.push(f);
    }
  }
  const box = (x: number) => ({ x, y: 0, width: 32, height: 32 });
  const loop: AnimDef = { kind: 'fish', frames: 4, ms: 100 };

  it('troca só o quadro de quem mudou, pela hora e pela fase', () => {
    const a = new Animator();
    const s1 = new Fake();
    const s2 = new Fake();
    a.add('obj', s1, loop, 0, box(0));
    a.add('obj', s2, loop, 100, box(64));
    expect(a.tick(0)).toBe(1); // s2 já começa um passo à frente
    expect(s2.frames).toEqual([1]);
    expect(a.tick(50)).toBe(0); // nada mudou
    expect(a.tick(150)).toBe(2);
    expect([a.frameOf(s1), a.frameOf(s2)]).toEqual([1, 2]);
    a.clear('obj');
    expect(a.size).toBe(0);
  });

  it('aba oculta: nada muda; fora da câmera: fica parado', () => {
    const a = new Animator();
    const near = new Fake();
    const far = new Fake();
    a.add('obj', near, loop, 0, box(0));
    a.add('obj', far, loop, 0, box(5000));
    expect(a.tick(100, { hidden: true })).toBe(0);
    a.tick(100, { view: { x: 0, y: 0, width: 640, height: 360 } });
    expect(near.frames).toEqual([1]);
    expect(far.frames).toEqual([]);
  });

  it('"Reduzir animações": todos voltam e ficam no quadro 0 (também fora da câmera)', () => {
    const a = new Animator();
    const s = new Fake();
    const far = new Fake();
    a.add('obj', s, loop, 0, box(0));
    a.add('obj', far, loop, 0, box(5000));
    a.tick(200);
    expect(a.frameOf(far)).toBe(2);
    a.tick(300, { reduce: true, view: { x: 0, y: 0, width: 640, height: 360 } });
    expect([a.frameOf(s), a.frameOf(far)]).toEqual([0, 0]);
    expect(a.tick(900, { reduce: true })).toBe(0);
  });

  it('quadro calculado à parte (relógio: pelos segundos de verdade)', () => {
    const a = new Animator();
    const clock = new Fake();
    a.add('obj', clock, { kind: 'clock', frames: 8, ms: 7500 }, 0, box(0), (t) => clockFrame(Math.floor(t / 1000) % 60));
    a.tick(Date.UTC(2026, 10, 14, 12, 0, 0)); // 0 s: ponteiro para cima
    expect(a.frameOf(clock)).toBe(4);
    a.tick(Date.UTC(2026, 10, 14, 12, 0, 31), { reduce: true });
    expect(a.frameOf(clock)).toBe(0);
  });
});

describe('preferência "Reduzir animações"', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete g.localStorage;
    delete g.window;
  });

  it('sem escolha segue o sistema; com escolha, vale a escolha', () => {
    expect(resolveReduceMotion(null, false)).toBe(false);
    expect(resolveReduceMotion(null, true)).toBe(true);
    expect(resolveReduceMotion(undefined, true)).toBe(true);
    expect(resolveReduceMotion('1', false)).toBe(true);
    expect(resolveReduceMotion('0', true)).toBe(false);
    expect(resolveReduceMotion('talvez', true)).toBe(true);
  });

  it('lê o sistema (prefers-reduced-motion) e guarda a escolha no navegador', () => {
    const data = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    g.window = { matchMedia: (q: string) => ({ matches: q.includes('reduce') }) };
    expect(loadMotion()).toEqual({ reduce: true, explicit: false });
    setReduceMotion(false);
    expect(data.get(MOTION_KEY)).toBe('0');
    expect(useMotion.getState()).toEqual({ reduce: false, explicit: true });
    expect(loadMotion()).toEqual({ reduce: false, explicit: true });
    setReduceMotion(true);
    expect(loadMotion()).toEqual({ reduce: true, explicit: true });
  });

  it('sem navegador (Node) não quebra e anima', () => {
    expect(loadMotion()).toEqual({ reduce: false, explicit: false });
  });
});
