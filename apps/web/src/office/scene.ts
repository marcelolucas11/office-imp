// SPDX-License-Identifier: AGPL-3.0-only
import * as Phaser from 'phaser';
import {
  DIRS,
  DIR_VEC,
  EMOTE_MS,
  OBJECT_DEFS,
  STATUS_COLOR,
  STEP_MS,
  WALL_FACE_ROWS,
  buildAreaIndex,
  buildCollision,
  can,
  dayPeriod,
  deskSeat,
  deskZone,
  doorDistance,
  doorTiles,
  findPath,
  isDesk,
  localClock,
  mapDesks,
  nearestFree,
  objDepthRows,
  objSize,
  privateAreaAt,
  rectContains,
  type AreaIndex,
  type AvatarConfig,
  type DayPeriod,
  type Dir,
  type MapObject,
  type OfficeMap,
  type PlayerState,
  type Point,
} from '@office-imp/shared';
import { Animator } from '../game/animator';
import { ANIM_CLOUDS, ANIM_TREE, animPhase, clockFrame, objectAnim, plantsInBreeze } from '../game/art/anim';
import { AV_FRAMES, AV_H, AV_W, avatarKey, avatarSheet } from '../game/art/avatar';
import { DECOR_SIZE, EXTERIOR, EXTERIOR_MARGIN, decorFrames, decorSprite, decorStrip, exteriorDecor, exteriorGrass, viewFrames, type DecorKind } from '../game/art/exterior';
import { FLOOR_PATTERN } from '../game/art/floors';
import { doorClosedKey, doorClosedSprite, objectKey, objectSprite, objectStrip, objectTall } from '../game/art/objects';
import { FLAT_ON_SURFACE, surfaceIndex } from '../game/art/render';
import { T, drawStatic, hasPeriodWalls, makeCanvas, wallTileAt } from '../game/art/tiles';
import { faceOf, wallCanvas, wallKey } from '../game/art/walls';
import { bus } from '../game/bus';
import { cameraBounds, exteriorMarginFor, grassStrips } from '../game/camera';
import { useMotion } from '../game/motion';
import { net } from '../game/net';
import { serverNow, useGame } from '../game/store';
import { t } from '../lib/i18n';
import { emojiCanvas, hasIcon } from '../lib/icons';

const BADGE = 13;
const EMOTE = 24;
const ICON_RES = 64;

const CHUNK = 24;
/**
 * Exterior (só fundo). A grama de fora do mapa fica embaixo de tudo, em faixas que não passam por
 * baixo do escritório; a dos vazios de dentro do mapa vem nos blocos estáticos (Fase G: sem pintar
 * a tela duas vezes). As árvores ficam logo acima dos blocos estáticos e abaixo de tapetes, objetos
 * e avatares: elas só existem em blocos vazios, então nunca cobrem chão nem parede.
 */
const D_GRASS = -20;
const D_DECOR = 1;
/** De quanto em quanto tempo o período do dia é reavaliado. */
const PERIOD_CHECK_MS = 60_000;
const D_FLOOR = 0;
/** Janelas com nuvens andando: por cima dos blocos estáticos, no mesmo lugar (Fase F). */
const D_WINDOW = 0.5;
/** De quanto em quanto tempo o relógio das animações de contexto anda (ms). */
const ANIM_TICK_MS = 100;
const D_RUG = 2;
const D_WORLD = 10;
const D_DIM = 500000;
const D_LABEL = 600000;
const FONT = '"Montserrat Variable", Montserrat, system-ui, sans-serif';
const ZOOMS = [1, 1.5, 2, 3];
const FLOOR_TYPES = new Set(['rug', 'rug_logo', 'door', 'portal']);

interface Ava {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  dot: Phaser.GameObjects.Arc;
  /** Ícones ao lado do nome (status personalizado, mão levantada, tela compartilhada). */
  badges: Phaser.GameObjects.Image[];
  emote?: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  tx: number;
  ty: number;
  dir: Dir;
  moving: boolean;
  foot: number;
  idleAt: number;
  queue: [number, number, Dir][];
  /** tile de onde o passo atual saiu */
  fx: number;
  fy: number;
  /** tempo decorrido e duração do passo atual (ms) */
  el: number;
  dur: number;
}

const px = (tx: number) => tx * T + T / 2;
const py = (ty: number) => ty * T + T - 3;
const frame = (dir: Dir, f: number) => DIRS.indexOf(dir) * AV_FRAMES + f;

/** Período forçado para conferência visual e testes; `null` = pelo relógio, no fuso do escritório. */
let forcedPeriod: DayPeriod | null = null;

/** Força o período do dia do exterior (ou volta ao automático com `null`). Vale para a cena aberta e para as próximas. */
export function forcePeriod(p: DayPeriod | null): void {
  forcedPeriod = p && p in EXTERIOR ? p : null;
  bus.emit('period:check');
}

export function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export class OfficeScene extends Phaser.Scene {
  private map!: OfficeMap;
  private grid!: Uint8Array;
  private avas = new Map<string, Ava>();
  private statics: Phaser.GameObjects.Image[] = [];
  private staticKeys: string[] = [];
  private objs: Phaser.GameObjects.Image[] = [];
  /** id da porta → sprite (troca entre aberta e fechada) */
  private doorImgs = new Map<string, Phaser.GameObjects.Image>();
  /** tile → id da porta */
  private doorAt = new Map<number, string>();
  private lastDoorAsk = 0;
  private deskLabels: Phaser.GameObjects.Text[] = [];
  private dim!: Phaser.GameObjects.Graphics;
  private areaLine!: Phaser.GameObjects.Graphics;
  private zone!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private path: Point[] | null = null;
  private followGoal = '';
  private offs: (() => void)[] = [];
  private lastClick = { at: 0, x: -1, y: -1 };
  private zoomIdx = 2;
  private rev = 0;
  private cleaned = false;
  private areaIndex: AreaIndex | null = null;
  private lastAreaWarn = 0;
  /** Época de movimento: muda a cada correção do servidor; passos de épocas antigas são ignorados lá. */
  private epoch = 0;
  /** Período do dia no fuso do escritório: muda só o exterior e a vista das janelas. */
  private period: DayPeriod = 'day';
  private periodCheckedAt = 0;
  /** Grama de fora do mapa: 4 faixas (cima, baixo, esquerda, direita), ver `grassStrips`. */
  private grass: Phaser.GameObjects.TileSprite[] = [];
  private decor: { img: Phaser.GameObjects.Image; kind: DecorKind }[] = [];
  private extMargin = EXTERIOR_MARGIN;
  /** Animações de contexto (Fase F): um relógio só para todos os sprites animados. */
  private anim = new Animator();
  private animAt = 0;
  /** Janelas com vista animada (por cima dos blocos estáticos). */
  private windows: Phaser.GameObjects.Image[] = [];
  /** Relógios de parede: a textura é a do minuto atual, no fuso do escritório. */
  private clocks: { img: Phaser.GameObjects.Image; o: MapObject }[] = [];
  private clockKeys = new Set<string>();
  private clockStamp = '';

  constructor() {
    super('office');
  }

  private get dpr() {
    return Math.min(3, window.devicePixelRatio || 1);
  }
  private get effZoom() {
    return Math.max(1, Math.round(ZOOMS[this.zoomIdx] * this.dpr * 2) / 2);
  }

  create() {
    const cam = this.cameras.main;
    this.period = this.currentPeriod();
    this.periodCheckedAt = Date.now();
    // o fundo da câmera tem a cor da grama: é o que aparece se a grama ainda não cobriu um canto
    cam.setBackgroundColor(EXTERIOR[this.period].grass.base);
    cam.setRoundPixels(true);
    this.zoomIdx = window.innerWidth >= 1500 ? 2 : 1;
    cam.setZoom(this.effZoom);
    this.dim = this.add.graphics().setDepth(D_DIM);
    this.areaLine = this.add.graphics().setDepth(D_RUG + 1);
    this.zone = this.add.graphics().setDepth(D_DIM + 1);
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-X', () => {
      if (!isTyping() && !useGame.getState().modal) this.interact();
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoom(dy > 0 ? -1 : 1));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));

    const on = (ev: string, fn: (d: any) => void) => this.offs.push(bus.on(ev, fn));
    on('players:reset', () => this.resetPlayers());
    on('player:join', (p: PlayerState) => this.addAva(p));
    on('player:leave', (id: string) => this.removeAva(id));
    on('moves', (list: [string, number, number, number][]) => this.onMoves(list));
    on('tp', (d) => {
      if (d.id === useGame.getState().meId) {
        this.path = null;
        if (Number.isInteger(d.e)) this.epoch = d.e;
      }
      this.snap(d.id, d.x, d.y);
    });
    on('correct', (d) => {
      this.path = null;
      if (Number.isInteger(d.e)) this.epoch = d.e;
      this.snap(useGame.getState().meId, d.x, d.y);
    });
    on('player:update', (d) => this.onPatch(d.id, d.patch));
    on('emote', (d) => this.showEmote(d.id, d.emoji));
    on('map', () => this.buildMap());
    on('desks', () => this.refreshDeskLabels());
    on('doors', (d: { id: string }) => {
      this.applyDoor(d.id);
      this.updateHint();
    });
    on('goto', (pt: Point) => this.goTo(pt.x, pt.y));
    on('zoom', (dir: number) => this.zoom(dir));
    // conferência visual e testes: window.__oi.bus.emit('period', 'night'); null volta ao automático
    on('period', (p: DayPeriod | null) => forcePeriod(p));
    on('period:check', () => this.checkPeriod());
    this.offs.push(
      useGame.subscribe((s, prev) => {
        if (s.buildMode !== prev.buildMode) this.drawZone();
        if (s.office?.timezone !== prev.office?.timezone || s.phase !== prev.phase) this.checkPeriod();
        if (s.following !== prev.following) {
          this.path = null;
          this.followGoal = '';
        }
      }),
    );
    const cleanup = () => {
      if (this.cleaned) return;
      this.cleaned = true;
      for (const off of this.offs) off();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    this.buildMap();
    this.resetPlayers();
  }

  // ---------- mapa ----------

  private buildMap() {
    const map = useGame.getState().map;
    if (!map) return;
    this.map = map;
    this.grid = buildCollision(map);
    this.areaIndex = buildAreaIndex(map);
    this.buildStatics();
    this.buildExterior();
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.anim.clear('obj');
    this.clocks = [];
    this.doorImgs.clear();
    this.doorAt.clear();
    const surfaces = surfaceIndex(map);
    const breeze = plantsInBreeze(map);
    const now = serverNow();
    for (const o of map.objects) {
      const def = OBJECT_DEFS[o.type];
      if (!def) continue;
      const opts = { breeze: breeze.has(o.id) };
      const anim = objectAnim(o, opts);
      let key = `obj:${objectKey(o)}`;
      if (o.type === 'wall_clock') key = this.clockTexture(o, now);
      else if (anim) key = this.stripTexture(`objA:${objectKey(o)}${opts.breeze ? ':b' : ''}`, () => objectStrip(o, opts));
      else if (!this.textures.exists(key)) this.textures.addCanvas(key, objectSprite(o));
      const img = this.add.image(o.x * T, (o.y - objectTall(o.type)) * T, key, anim ? 0 : undefined).setOrigin(0);
      if (anim) {
        // fase pela posição: vizinhos não piscam juntos; o relógio segue os segundos de verdade
        const box = { x: img.x, y: img.y, width: img.width, height: img.height };
        if (o.type === 'wall_clock') {
          this.clocks.push({ img, o });
          this.anim.add('obj', img, anim, 0, box, (t) => clockFrame(Math.floor(t / 1000) % 60));
        } else this.anim.add('obj', img, anim, animPhase(anim, o.x, o.y), box);
      }
      if (o.type === 'door') {
        // porta fechada: textura própria, uma por cor de porta
        const closed = doorClosedKey(o);
        if (!this.textures.exists(closed)) this.textures.addCanvas(closed, doorClosedSprite(o));
        this.doorImgs.set(o.id, img);
        for (const t of doorTiles(map, o)) this.doorAt.set(t.y * map.width + t.x, o.id);
        // fechada fica na altura dos avatares (bloqueia, como uma parede); aberta fica no chão
        this.applyDoor(o.id);
      } else if (FLOOR_TYPES.has(o.type)) img.setDepth(D_RUG);
      else if (def.above || o.props?.above) img.setDepth(D_DIM - 1);
      else if (def.solid) img.setDepth(D_WORLD + (o.y + objDepthRows(o)) * T - 1);
      else {
        // objeto solto em cima de um móvel (caneca na mesa): logo acima do móvel, abaixo de quem está na frente
        const under = surfaces.get(o.y * map.width + o.x);
        const lift = FLAT_ON_SURFACE.has(o.type) ? 0.75 : 0.5;
        img.setDepth(under ? D_WORLD + (under.y + objDepthRows(under)) * T - lift : D_WORLD + o.y * T + 1);
      }
      this.objs.push(img);
    }
    this.refreshDeskLabels();
    this.drawDim();
    this.drawZone();
    this.updateHint();
  }

  /** Chão e paredes pré-renderizados em blocos de CHUNK×CHUNK tiles (o vazio fica transparente). */
  private buildStatics() {
    const map = this.map;
    for (const i of this.statics) i.destroy();
    for (const k of this.staticKeys) this.textures.remove(k);
    this.statics = [];
    this.staticKeys = [];
    this.rev++;
    for (let cy = 0; cy < map.height; cy += CHUNK) {
      for (let cx = 0; cx < map.width; cx += CHUNK) {
        const w = Math.min(CHUNK, map.width - cx);
        const h = Math.min(CHUNK, map.height - cy);
        const c = makeCanvas(w * T, h * T);
        drawStatic(c.getContext('2d')!, map, cx, cy, w, h, this.period, exteriorGrass(this.period));
        const key = `st:${this.rev}:${cx}:${cy}`;
        this.textures.addCanvas(key, c);
        this.staticKeys.push(key);
        this.statics.push(this.add.image(cx * T, cy * T, key).setOrigin(0).setDepth(D_FLOOR));
      }
    }
    this.buildWindows();
  }

  /**
   * Janelas com vista para fora, no período com nuvens: um sprite por janela, por cima do bloco
   * estático, com as nuvens andando (Fase F). Todas na mesma fase, porque a paisagem continua de
   * uma janela para a outra. À noite (sem nuvens) não há nada a animar.
   */
  private buildWindows() {
    for (const w of this.windows) {
      this.anim.remove(w);
      w.destroy();
    }
    this.windows = [];
    const map = this.map;
    const frames = viewFrames(this.period);
    if (frames < 2 || !hasPeriodWalls(map)) return;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const tile = wallTileAt(map, tx, ty, this.period);
        if (tile?.window !== 'view' || faceOf(tile).level < 0) continue;
        const key = this.stripTexture(`win:${wallKey(tile)}`, () => {
          const c = makeCanvas(T * frames, T);
          const ctx = c.getContext('2d')!;
          for (let f = 0; f < frames; f++) ctx.drawImage(wallCanvas({ ...tile, frame: f }), f * T, 0);
          return { canvas: c, frames, w: T, h: T };
        });
        const img = this.add.image(tx * T, ty * T, key, 0).setOrigin(0).setDepth(D_WINDOW);
        this.windows.push(img);
        this.anim.add('win', img, ANIM_CLOUDS, 0, { x: tx * T, y: ty * T, width: T, height: T });
      }
    }
  }

  /** Textura com quadros (tira horizontal) criada uma vez por chave; os quadros se chamam 0, 1, 2… */
  private stripTexture(key: string, make: () => { canvas: HTMLCanvasElement; frames: number; w: number; h: number }): string {
    if (this.textures.exists(key)) return key;
    const strip = make();
    const tex = this.textures.addCanvas(key, strip.canvas)!;
    for (let f = 0; f < strip.frames; f++) tex.add(f, 0, f * strip.w, 0, strip.w, strip.h);
    return key;
  }

  /** Textura do relógio de parede na hora do escritório (minuto atual), com os 8 quadros do ponteiro de segundos. */
  private clockTexture(o: MapObject, now: number): string {
    const t = localClock(now, useGame.getState().office?.timezone ?? '');
    const key = `clock:${objectKey(o)}:${t.hour}:${t.minute}`;
    this.clockKeys.add(key);
    return this.stripTexture(key, () => objectStrip(o, { time: t }));
  }

  /**
   * A cada minuto (e quando muda o fuso), troca a textura dos relógios pela do minuto novo e
   * apaga as texturas que ninguém usa mais (fica só o minuto atual de cada cor).
   */
  private syncClocks(now: number) {
    const stamp = `${Math.floor(now / 60_000)}:${useGame.getState().office?.timezone ?? ''}`;
    if (stamp === this.clockStamp) return;
    this.clockStamp = stamp;
    if (!this.clocks.length) return;
    const used = new Set<string>();
    for (const c of this.clocks) {
      const key = this.clockTexture(c.o, now);
      used.add(key);
      if (c.img.texture.key !== key) c.img.setTexture(key, this.anim.frameOf(c.img));
    }
    for (const key of this.clockKeys) {
      if (used.has(key)) continue;
      this.clockKeys.delete(key);
      if (this.textures.exists(key)) this.textures.remove(key);
    }
  }

  /** Um passo das animações de contexto: quadros pelo horário, só no que a câmera vê, nada com a aba oculta. */
  private tickAnims() {
    const now = serverNow();
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (hidden) return;
    this.syncClocks(now);
    this.anim.tick(now, { reduce: useMotion.getState().reduce, view: this.cameras.main.worldView });
  }

  // ---------- exterior e período do dia ----------

  private currentPeriod(): DayPeriod {
    return forcedPeriod ?? dayPeriod(serverNow(), useGame.getState().office?.timezone ?? '');
  }

  private grassTexture(period: DayPeriod): string {
    const key = `ext:grass:${period}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, exteriorGrass(period));
    return key;
  }

  private decorTexture(kind: DecorKind, period: DayPeriod): string {
    const n = decorFrames(kind);
    // árvores: tira com os quadros do balanço (Fase F); o resto, um sprite só
    if (n > 1) {
      const { w, h } = DECOR_SIZE[kind];
      return this.stripTexture(`extA:${kind}:${period}`, () => ({ canvas: decorStrip(kind, period), frames: n, w, h }));
    }
    const key = `ext:${kind}:${period}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, decorSprite(kind, period));
    return key;
  }

  /**
   * Exterior em volta do escritório e nos vazios do mapa: faixas de grama fora do retângulo do
   * mapa (TileSprites de um padrão de 256 px repetido, sem textura gigante; a grama dos vazios de
   * dentro vem nos blocos estáticos) e um sprite por árvore ou arbusto.
   * É só fundo: não entra no mapa nem na colisão.
   */
  private buildExterior() {
    while (this.grass.length < 4) this.grass.push(this.add.tileSprite(0, 0, FLOOR_PATTERN, FLOOR_PATTERN, this.grassTexture(this.period)).setOrigin(0).setDepth(D_GRASS).setVisible(false));
    for (const d of this.decor) d.img.destroy();
    this.decor = [];
    this.anim.clear('ext');
    this.extMargin = this.neededExteriorMargin();
    for (const d of exteriorDecor(this.map, this.extMargin)) {
      // mesma camada para todos; a fração da profundidade mantém a ordem de cima para baixo
      const depth = D_DECOR + (d.y + DECOR_SIZE[d.kind].h) * 1e-4;
      const animated = decorFrames(d.kind) > 1;
      const img = this.add.image(d.x, d.y, this.decorTexture(d.kind, this.period), animated ? 0 : undefined).setOrigin(0).setDepth(depth);
      this.decor.push({ img, kind: d.kind });
      if (!animated) continue;
      // a rajada de vento atravessa o bosque de oeste para leste (fase pela posição), com um pouco de acaso
      const { w, h } = DECOR_SIZE[d.kind];
      const phase = -Math.round(d.x * 4 + d.y * 1.5) + animPhase(ANIM_TREE, d.x, d.y) / 12;
      this.anim.add('ext', img, ANIM_TREE, phase, { x: d.x, y: d.y, width: w, height: h });
    }
    this.syncGrass();
  }

  /**
   * Faixa de exterior (em blocos) que precisa de árvores: a de sempre, ou mais quando o escritório
   * é pequeno e fica centralizado numa tela grande (medido no zoom mínimo, para não refazer ao dar zoom).
   */
  private neededExteriorMargin(): number {
    const cam = this.cameras.main;
    const minZoom = Math.max(1, Math.round(ZOOMS[0] * this.dpr * 2) / 2);
    return exteriorMarginFor(this.map.width, this.map.height, cam.width / minZoom, cam.height / minZoom, EXTERIOR_MARGIN);
  }

  /** Mantém as faixas de grama cobrindo a parte da tela fora do mapa, alinhadas ao padrão de 256 px do mundo. */
  private syncGrass() {
    if (!this.grass.length || !this.map) return;
    const cam = this.cameras.main;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    const strips = grassStrips(this.map.width, this.map.height, cx - vw / 2, cy - vh / 2, vw, vh, FLOOR_PATTERN);
    this.grass.forEach((g, i) => {
      const s = strips[i];
      if (!s) {
        if (g.visible) g.setVisible(false);
        return;
      }
      if (!g.visible) g.setVisible(true);
      if (g.x !== s.x || g.y !== s.y) g.setPosition(s.x, s.y);
      if (g.width !== s.w || g.height !== s.h) g.setSize(s.w, s.h);
      if (g.tilePositionX !== s.tx) g.tilePositionX = s.tx;
      if (g.tilePositionY !== s.ty) g.tilePositionY = s.ty;
    });
  }

  /** Reavalia o período; se mudou, troca as texturas do exterior e refaz os blocos estáticos (grama dos vazios e janelas). */
  private checkPeriod() {
    const next = this.currentPeriod();
    if (next === this.period || !this.map) return;
    this.period = next;
    this.cameras.main.setBackgroundColor(EXTERIOR[next].grass.base);
    // grama, árvores e janelas trocam juntas, na hora
    for (const g of this.grass) g.setTexture(this.grassTexture(next));
    for (const d of this.decor) d.img.setTexture(this.decorTexture(d.kind, next), decorFrames(d.kind) > 1 ? this.anim.frameOf(d.img) : undefined);
    this.buildStatics();
  }

  private applyDoor(id: string) {
    const img = this.doorImgs.get(id);
    const o = this.map.objects.find((x) => x.id === id);
    if (!img || !o) return;
    const open = Boolean(useGame.getState().doors[id]);
    img.setTexture(open ? `obj:${objectKey(o)}` : doorClosedKey(o));
    img.setDepth(open ? D_RUG : D_WORLD + (o.y + 1) * T - 1);
  }

  private closedDoorAt(x: number, y: number): string | null {
    if (!this.map) return null;
    const id = this.doorAt.get(y * this.map.width + x);
    return id && !useGame.getState().doors[id] ? id : null;
  }

  private text(x: number, y: number, s: string, color: string, size = 10) {
    const tx = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '600', color, stroke: '#0b0b0d', strokeThickness: 3, resolution: this.effZoom }).setOrigin(0.5, 1);
    return tx;
  }

  private refreshDeskLabels() {
    for (const l of this.deskLabels) l.destroy();
    this.deskLabels = [];
    if (!this.map) return;
    const desks = useGame.getState().desks;
    for (const d of mapDesks(this.map)) {
      const info = desks.find((x) => x.id === d.id);
      if (!info?.userName) continue;
      const { w } = objSize(d);
      const label = this.text((d.x + w / 2) * T, (d.y - objectTall(d.type)) * T + 8, info.userName, info.online ? '#e6d2a0' : '#77778a', 9).setDepth(D_LABEL - 1);
      this.deskLabels.push(label);
    }
  }

  /**
   * Escurece o que está fora da área privada atual. O recorte claro é exatamente a área
   * (mais a parede em volta, só nos lados que são parede): antes ele sobrava um tile para fora
   * e, nas bordas das mesas de café, a pessoa parecia dentro mas já estava fora da conversa.
   */
  private drawDim() {
    this.dim.clear();
    this.areaLine.clear();
    const g = useGame.getState();
    const me = g.players[g.meId];
    const area = me?.areaId ? this.map.areas.find((a) => a.id === me.areaId) : null;
    if (!area || !area.rects.length) return;
    const inArea = (x: number, y: number) => area.rects.some((r) => rectContains(r, x, y));
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const r of area.rects) {
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    // contorno dourado tile a tile: mostra o limite real da conversa
    this.areaLine.lineStyle(2, 0xd7b870, 0.75);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!inArea(x, y)) continue;
        const X = x * T;
        const Y = y * T;
        if (!inArea(x, y - 1)) this.areaLine.lineBetween(X, Y + 1, X + T, Y + 1);
        if (!inArea(x, y + 1)) this.areaLine.lineBetween(X, Y + T - 1, X + T, Y + T - 1);
        if (!inArea(x - 1, y)) this.areaLine.lineBetween(X + 1, Y, X + 1, Y + T);
        if (!inArea(x + 1, y)) this.areaLine.lineBetween(X + T - 1, Y, X + T - 1, Y + T);
      }
    }
    // mesa de trabalho: só o contorno, sem escurecer o escritório inteiro
    if (area.desk) return;
    const wallish = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
      if (this.map.layers.walls[y * this.map.width + x] !== 0) return true;
      return this.map.objects.some((o) => o.type === 'door' && doorTiles(this.map, o).some((t) => t.x === x && t.y === y));
    };
    const sideIsWall = (xs: number, xe: number, ys: number, ye: number) => {
      let n = 0;
      let w = 0;
      for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) {
        n++;
        if (wallish(x, y)) w++;
      }
      return n > 0 && w === n;
    };
    // em cima e embaixo, a parede alta tem 2 fileiras: o recorte claro pega a parede inteira
    let pT = 0;
    while (pT < WALL_FACE_ROWS && sideIsWall(x0, x1, y0 - pT - 1, y0 - pT)) pT++;
    let pB = 0;
    while (pB < WALL_FACE_ROWS && sideIsWall(x0, x1, y1 + pB, y1 + pB + 1)) pB++;
    const pL = sideIsWall(x0 - 1, x0, y0, y1) ? 1 : 0;
    const pR = sideIsWall(x1, x1 + 1, y0, y1) ? 1 : 0;
    const bx0 = (x0 - pL) * T;
    const by0 = (y0 - pT) * T;
    const bx1 = (x1 + pR) * T;
    const by1 = (y1 + pB) * T;
    const W = this.map.width * T;
    const H = this.map.height * T;
    const pad = 4000;
    this.dim.fillStyle(0x000000, 0.5);
    this.dim.fillRect(-pad, -pad, W + pad * 2, by0 + pad);
    this.dim.fillRect(-pad, by1, W + pad * 2, H - by1 + pad);
    this.dim.fillRect(-pad, by0, bx0 + pad, by1 - by0);
    this.dim.fillRect(bx1, by0, W - bx1 + pad, by1 - by0);
    // áreas que não são retangulares: escurece os buracos dentro do retângulo envolvente
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!inArea(x, y)) this.dim.fillRect(x * T, y * T, T, T);
  }

  private drawZone() {
    this.zone.clear();
    const g = useGame.getState();
    if (!g.buildMode || !this.map) return;
    const me = g.players[g.meId];
    const desk = mapDesks(this.map).find((d) => d.id === me?.deskId);
    if (!desk) return;
    const z = deskZone(desk);
    this.zone.fillStyle(0x34d399, 0.16);
    this.zone.fillRect(z.x * T, z.y * T, z.w * T, z.h * T);
    this.zone.lineStyle(2, 0x34d399, 0.95);
    this.zone.strokeRect(z.x * T + 1, z.y * T + 1, z.w * T - 2, z.h * T - 2);
  }

  // ---------- avatares ----------

  private avatarTexture(cfg: AvatarConfig): string {
    const key = avatarKey(cfg);
    if (!this.textures.exists(key)) {
      const tex = this.textures.addCanvas(key, avatarSheet(cfg))!;
      for (let row = 0; row < DIRS.length; row++) for (let f = 0; f < AV_FRAMES; f++) tex.add(row * AV_FRAMES + f, 0, f * AV_W, row * AV_H, AV_W, AV_H);
    }
    return key;
  }

  private labelText(p: PlayerState): string {
    const custom = p.customStatus?.emoji && !hasIcon(p.customStatus.emoji) ? `${p.customStatus.emoji} ` : '';
    return `${custom}${p.spotlight ? '★ ' : ''}${p.name}`;
  }

  private badgeList(p: PlayerState): string[] {
    const out: string[] = [];
    if (p.customStatus?.emoji && hasIcon(p.customStatus.emoji)) out.push(p.customStatus.emoji);
    if (p.hand) out.push('✋');
    if (p.screen) out.push('🖥');
    return out;
  }

  /** Textura do ícone 2D (traço branco, fundo preto) de um emoji. */
  private iconTexture(emoji: string): string | null {
    const key = `emo:${emoji}`;
    if (this.textures.exists(key)) return key;
    const c = emojiCanvas(emoji, ICON_RES);
    if (!c) return null;
    this.textures.addCanvas(key, c);
    return key;
  }

  private resetPlayers() {
    for (const id of [...this.avas.keys()]) this.removeAva(id);
    const g = useGame.getState();
    for (const p of Object.values(g.players)) this.addAva(p);
    const me = this.avas.get(g.meId);
    if (me) {
      const cam = this.cameras.main;
      cam.startFollow(me.sprite, true, 1, 1, 0, 20);
      cam.centerOn(me.sprite.x, me.sprite.y - 20);
    }
    this.path = null;
    this.drawDim();
    this.updateHint();
  }

  private addAva(p: PlayerState) {
    if (this.avas.has(p.id)) this.removeAva(p.id);
    const meId = useGame.getState().meId;
    const sprite = this.add.sprite(px(p.x), py(p.y), this.avatarTexture(p.avatar), frame(p.dir, 0)).setOrigin(0.5, 1);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      if (useGame.getState().buildMode) return;
      ev.stopPropagation();
      useGame.setState({ modal: { kind: 'profile', playerId: p.id } });
    });
    const label = this.text(0, 0, this.labelText(p), p.id === meId ? '#e6d2a0' : '#ffffff').setDepth(D_LABEL);
    const dot = this.add.circle(0, 0, 4, 0xffffff).setStrokeStyle(1.5, 0x0b0b0d).setDepth(D_LABEL);
    const a: Ava = { id: p.id, sprite, label, dot, badges: [], tx: p.x, ty: p.y, dir: p.dir, moving: false, foot: 1, idleAt: 0, queue: [], fx: p.x, fy: p.y, el: 0, dur: STEP_MS };
    this.avas.set(p.id, a);
    this.applyLook(a, p);
    this.place(a);
  }

  private removeAva(id: string) {
    const a = this.avas.get(id);
    if (!a) return;
    this.tweens.killTweensOf(a.sprite);
    a.sprite.destroy();
    a.label.destroy();
    a.dot.destroy();
    for (const b of a.badges) b.destroy();
    a.emote?.destroy();
    this.avas.delete(id);
  }

  private applyLook(a: Ava, p: PlayerState) {
    a.label.setText(this.labelText(p));
    for (const b of a.badges) b.destroy();
    a.badges = [];
    for (const e of this.badgeList(p)) {
      const key = this.iconTexture(e);
      if (key) a.badges.push(this.add.image(0, 0, key).setDisplaySize(BADGE, BADGE).setDepth(D_LABEL));
    }
    a.dot.setFillStyle(Phaser.Display.Color.HexStringToColor(STATUS_COLOR[p.away ? 'AWAY' : p.status]).color);
    a.sprite.setAlpha(p.away ? 0.6 : 1);
  }

  private place(a: Ava) {
    const { x, y } = a.sprite;
    a.sprite.setDepth(D_WORLD + y);
    a.label.setPosition(x + 5, y - AV_H + 3);
    a.dot.setPosition(x + 5 - a.label.width / 2 - 7, y - AV_H + 3 - a.label.height / 2);
    for (let i = 0; i < a.badges.length; i++) a.badges[i].setPosition(x + 5 + a.label.width / 2 + 2 + BADGE / 2 + i * (BADGE + 2), y - AV_H + 3 - a.label.height / 2);
    a.emote?.setPosition(x, y - AV_H - 12);
  }

  private onPatch(id: string, patch: Partial<PlayerState>) {
    const a = this.avas.get(id);
    const g = useGame.getState();
    const p = g.players[id];
    if (!a || !p) return;
    if (patch.avatar) a.sprite.setTexture(this.avatarTexture(p.avatar), frame(a.dir, 0));
    this.applyLook(a, p);
    this.place(a);
    if (id === g.meId && 'areaId' in patch) this.drawDim();
    if (id === g.meId && 'deskId' in patch) {
      this.drawZone();
      this.updateHint();
    }
  }

  private showEmote(id: string, emoji: string) {
    const a = this.avas.get(id);
    if (!a) return;
    a.emote?.destroy();
    const key = this.iconTexture(emoji);
    const e = key
      ? this.add.image(a.sprite.x, a.sprite.y - AV_H - 12, key).setOrigin(0.5, 1).setDisplaySize(EMOTE, EMOTE).setDepth(D_LABEL + 1)
      : this.add.text(a.sprite.x, a.sprite.y - AV_H - 12, emoji, { fontSize: '22px', resolution: this.effZoom }).setOrigin(0.5, 1).setDepth(D_LABEL + 1);
    a.emote = e;
    const sx = e.scaleX;
    this.tweens.add({ targets: e, scaleX: { from: sx * 0.4, to: sx }, scaleY: { from: e.scaleY * 0.4, to: e.scaleY }, duration: 180, ease: 'Back.easeOut' });
    this.time.delayedCall(EMOTE_MS, () => {
      if (a.emote === e) a.emote = undefined;
      e.destroy();
    });
  }

  private snap(id: string, x: number, y: number, keepQueue = false) {
    const a = this.avas.get(id);
    if (!a) return;
    if (!keepQueue) a.queue = [];
    a.moving = false;
    a.tx = a.fx = x;
    a.ty = a.fy = y;
    a.el = 0;
    a.sprite.setFrame(frame(a.dir, 0));
    this.render(a);
    if (id === useGame.getState().meId) this.afterOwnStep();
  }

  /** Começa um passo de um tile. `carry` é o tempo que sobrou do passo anterior (movimento contínuo, sem pausa entre tiles). */
  private beginStep(a: Ava, x: number, y: number, dir: Dir, dur: number, carry = 0) {
    a.fx = a.tx;
    a.fy = a.ty;
    a.tx = x;
    a.ty = y;
    a.dir = dir;
    a.moving = true;
    a.idleAt = 0;
    a.el = Math.min(carry, dur);
    a.dur = dur;
    a.foot = a.foot === 1 ? 2 : 1;
    a.sprite.setFrame(frame(dir, a.foot));
    this.render(a);
  }

  /** Avança o passo atual. Devolve o tempo que sobrou se o passo terminou, ou -1. */
  private advance(a: Ava, dt: number): number {
    if (!a.moving) return -1;
    a.el += dt;
    if (a.el < a.dur) {
      this.render(a);
      return -1;
    }
    const left = a.el - a.dur;
    a.moving = false;
    a.fx = a.tx;
    a.fy = a.ty;
    a.el = 0;
    a.idleAt = this.time.now + 90;
    this.render(a);
    return left;
  }

  /** Posição na tela: interpolação linear, arredondada ao pixel do mundo (sem tremer com a câmera). */
  private render(a: Ava) {
    const k = a.moving ? Math.min(1, a.el / a.dur) : 1;
    const x = px(a.fx) + (px(a.tx) - px(a.fx)) * k;
    const y = py(a.fy) + (py(a.ty) - py(a.fy)) * k;
    a.sprite.setPosition(Math.round(x), Math.round(y));
    this.place(a);
  }

  private onMoves(list: [string, number, number, number][]) {
    const g = useGame.getState();
    for (const [id, x, y, di] of list) {
      if (id === g.meId) continue;
      const a = this.avas.get(id);
      if (!a) continue;
      a.queue.push([x, y, DIRS[di] ?? a.dir]);
      if (a.queue.length > 12) {
        // muito atrasado (aba em segundo plano, rede travada): pula para o fim
        const last = a.queue[a.queue.length - 1];
        a.dir = last[2];
        this.snap(id, last[0], last[1]);
      } else if (!a.moving) this.nextQueued(a, 0);
      if (id === g.following) this.followGoal = '';
    }
  }

  private nextQueued(a: Ava, carry: number) {
    for (;;) {
      const n = a.queue.shift();
      if (!n) return;
      const [x, y, dir] = n;
      const dist = Math.abs(x - a.tx) + Math.abs(y - a.ty);
      if (dist === 0) {
        a.dir = dir;
        a.sprite.setFrame(frame(dir, 0));
        continue;
      }
      if (dist > 1) {
        a.dir = dir;
        this.snap(a.id, x, y, true);
        continue;
      }
      // com fila acumulada, anda um pouco mais rápido para alcançar sem "teleportar"
      const dur = STEP_MS / (1 + Math.min(1.2, 0.35 * a.queue.length));
      this.beginStep(a, x, y, dir, dur, carry);
      return;
    }
  }

  // ---------- o meu avatar ----------

  private keyDir(): Dir | null {
    const k = this.keys;
    if (k.UP.isDown || k.W.isDown) return 'up';
    if (k.DOWN.isDown || k.S.isDown) return 'down';
    if (k.LEFT.isDown || k.A.isDown) return 'left';
    if (k.RIGHT.isDown || k.D.isDown) return 'right';
    return null;
  }

  private blocked(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return true;
    return this.grid[y * this.map.width + x] === 1 || this.closedDoorAt(x, y) !== null;
  }

  /**
   * Limites da câmera: o avatar fica no centro e, perto da borda do escritório, a câmera ainda
   * anda `CAMERA_MARGIN` blocos para fora, mostrando o exterior (grama e árvores); só então ela
   * para e o avatar sai do centro. É só a câmera: colisão e movimento continuam nos limites do mapa.
   * Se o mapa com a margem for menor que a tela naquele eixo, ele fica centralizado.
   */
  private updateBounds() {
    if (!this.map) return;
    const cam = this.cameras.main;
    const b = cameraBounds(this.map.width, this.map.height, cam.width / cam.zoom, cam.height / cam.zoom);
    const cur = cam.getBounds();
    if (cam.useBounds && Math.abs(cur.x - b.x) < 0.5 && Math.abs(cur.y - b.y) < 0.5 && Math.abs(cur.width - b.w) < 0.5 && Math.abs(cur.height - b.h) < 0.5) return;
    cam.setBounds(b.x, b.y, b.w, b.h);
  }

  update(time: number, delta: number) {
    this.updateBounds();
    // a janela cresceu além da faixa com árvores (escritório pequeno em tela grande): refaz o exterior
    if (this.map && this.grass.length && this.neededExteriorMargin() > this.extMargin) this.buildExterior();
    this.syncGrass();
    // animações de contexto: um passo a cada 100 ms (trocar quadro não redesenha nada)
    if (time - this.animAt >= ANIM_TICK_MS) {
      this.animAt = time;
      this.tickAnims();
    }
    // pelo relógio de verdade (não o do jogo): ao voltar de uma aba em segundo plano, confere na hora
    if (Date.now() - this.periodCheckedAt > PERIOD_CHECK_MS) {
      this.periodCheckedAt = Date.now();
      this.checkPeriod();
    }
    const dt = Math.min(delta, 100);
    const g = useGame.getState();
    for (const a of this.avas.values()) {
      if (a.id !== g.meId && a.moving) {
        const left = this.advance(a, dt);
        if (left >= 0) this.nextQueued(a, left);
      }
      if (!a.moving && a.idleAt && time > a.idleAt) {
        a.sprite.setFrame(frame(a.dir, 0));
        a.idleAt = 0;
      }
    }
    const me = this.avas.get(g.meId);
    if (!me) return;
    let carry = 0;
    if (me.moving) {
      const left = this.advance(me, dt);
      if (left < 0) return;
      carry = left;
      this.afterOwnStep();
    }
    if (g.phase !== 'online') return;
    this.tryOwnStep(carry);
  }

  /** Decide o próximo passo do meu avatar (teclado, caminho ou seguir) e já começa a andar. */
  private tryOwnStep(carry: number) {
    const g = useGame.getState();
    const me = this.avas.get(g.meId);
    if (!me || me.moving) return;
    let dir: Dir | null = !isTyping() && !g.modal ? this.keyDir() : null;
    let fromPath = false;
    if (dir) {
      this.path = null;
      if (g.following) useGame.setState({ following: null });
    } else {
      if (g.following) this.followTick(me, g.following);
      const next = this.path?.[0];
      if (next) {
        const dx = next.x - me.tx;
        const dy = next.y - me.ty;
        if (Math.abs(dx) + Math.abs(dy) !== 1) this.path = null;
        else {
          dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
          fromPath = true;
        }
      }
    }
    if (!dir) return;
    const nx = me.tx + DIR_VEC[dir].x;
    const ny = me.ty + DIR_VEC[dir].y;
    const door = this.closedDoorAt(nx, ny);
    if (door) {
      const now = performance.now();
      if (fromPath) {
        // andando sozinho (clique duplo, seguir, ir até): abre a porta e continua
        if (now - this.lastDoorAsk > 600) {
          this.lastDoorAsk = now;
          net.send('door', { id: door, open: true });
        }
        return;
      }
      if (now - this.lastDoorAsk > 2500) {
        this.lastDoorAsk = now;
        bus.emit('notice', 'door_closed');
      }
    }
    if (this.blocked(nx, ny) || !this.canEnterArea(nx, ny)) {
      this.path = null;
      if (me.dir !== dir) {
        me.dir = dir;
        me.sprite.setFrame(frame(dir, 0));
        net.send('face', { dir, e: this.epoch });
      }
      return;
    }
    if (fromPath) this.path!.shift();
    net.send('step', { x: nx, y: ny, e: this.epoch });
    this.beginStep(me, nx, ny, dir, STEP_MS, carry);
  }

  /** Mesma regra do servidor para áreas privadas (somente equipe e lotação), para não andar e "voltar". */
  private canEnterArea(x: number, y: number): boolean {
    const g = useGame.getState();
    const me = g.players[g.meId];
    if (!me || !this.areaIndex) return true;
    const area = privateAreaAt(this.map, this.areaIndex, x, y);
    if (!area || area.id === me.areaId) return true;
    const now = performance.now();
    const warn = (code: string) => {
      if (now - this.lastAreaWarn < 2500) return;
      this.lastAreaWarn = now;
      bus.emit('notice', code);
    };
    if (area.staffOnly && !can(me.role, 'area.staffOnly')) {
      warn('area_staff_only');
      return false;
    }
    let n = 0;
    for (const p of Object.values(g.players)) if (p.areaId === area.id) n++;
    if (n >= area.capacity) {
      warn('area_full');
      return false;
    }
    return true;
  }

  private followTick(me: Ava, targetId: string) {
    const target = this.avas.get(targetId);
    if (!target) return;
    const dist = Math.abs(target.tx - me.tx) + Math.abs(target.ty - me.ty);
    if (dist <= 1) {
      this.path = null;
      return;
    }
    const goal = `${target.tx},${target.ty}`;
    if (this.path?.length && goal === this.followGoal) return;
    this.followGoal = goal;
    const p = findPath(this.grid, this.map.width, this.map.height, { x: me.tx, y: me.ty }, { x: target.tx, y: target.ty });
    this.path = p ? p.slice(0, -1) : null;
  }

  private afterOwnStep() {
    const g = useGame.getState();
    const me = this.avas.get(g.meId);
    if (!me) return;
    bus.emit('me:step', { x: me.tx, y: me.ty });
    const portal = this.map.objects.find((o) => o.type === 'portal' && o.x === me.tx && o.y === me.ty && Number.isInteger(o.props?.toX) && Number.isInteger(o.props?.toY));
    if (portal) {
      this.path = null;
      net.send('teleport', { x: portal.props!.toX, y: portal.props!.toY });
    }
    this.updateHint();
  }

  private updateHint() {
    const g = useGame.getState();
    const me = this.avas.get(g.meId);
    if (!me || !this.map) return;
    let hint: { text: string; object?: MapObject } | null = null;
    for (const d of mapDesks(this.map)) {
      const s = deskSeat(d);
      if (s.x !== me.tx || s.y !== me.ty) continue;
      const info = g.desks.find((x) => x.id === d.id);
      const text = !info?.userId ? t('hint.freeDesk', 'X — mesa livre') : info.userId === g.meId ? t('hint.myDesk', 'X — abrir a sua mesa') : t('hint.desk', 'X — mesa de {{name}}', { name: info.userName });
      hint = { text, object: d };
      break;
    }
    if (!hint) {
      // porta: na frente, ao lado ou em cima dela
      let best: MapObject | null = null;
      let bestD = Infinity;
      for (const o of this.map.objects) {
        if (o.type !== 'door') continue;
        // no vão de uma parede alta, a porta ocupa 2 blocos: vale o mais perto
        const d = Math.min(...doorTiles(this.map, o).map((t) => Math.abs(t.x - me.tx) + Math.abs(t.y - me.ty)));
        if (doorDistance(this.map, o, me.tx, me.ty) > 1 || d >= bestD) continue;
        best = o;
        bestD = d;
      }
      if (best) {
        const open = Boolean(g.doors[best.id]);
        hint = { text: open ? t('hint.doorClose', 'X — fechar a porta') : t('hint.doorOpen', 'X — abrir a porta'), object: best };
      }
    }
    if (!hint) {
      for (const o of this.map.objects) {
        const def = OBJECT_DEFS[o.type];
        if (!def?.interact) continue;
        const { w, h } = objSize(o);
        const dx = Math.max(o.x - me.tx, 0, me.tx - (o.x + w - 1));
        const dy = Math.max(o.y - me.ty, 0, me.ty - (o.y + h - 1));
        if (Math.max(dx, dy) > 1) continue;
        hint = { text: t('hint.object', 'X — {{label}}', { label: o.props?.title || def.label }), object: o };
        break;
      }
    }
    if (hint?.object?.id !== g.hint?.object?.id || hint?.text !== g.hint?.text) useGame.setState({ hint });
  }

  private interact() {
    const g = useGame.getState();
    const o = g.hint?.object;
    if (!o) return;
    if (o.type === 'door') {
      net.send('door', { id: o.id });
      return;
    }
    if (isDesk(o)) {
      const info = g.desks.find((x) => x.id === o.id);
      useGame.setState({ modal: info?.userId === g.meId ? { kind: 'myDesk' } : { kind: 'desk', deskId: o.id } });
    } else useGame.setState({ modal: { kind: 'object', object: o } });
  }

  private onPointer(p: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const tx = Math.floor(wp.x / T);
    const ty = Math.floor(wp.y / T);
    const g = useGame.getState();
    bus.emit('activity');
    if (g.buildMode) {
      const me = g.players[g.meId];
      const desk = mapDesks(this.map).find((d) => d.id === me?.deskId);
      if (desk && rectContains(deskZone(desk), tx, ty)) net.send('decor:add', { type: g.buildMode, x: tx, y: ty, props: g.buildProps ?? undefined, color: g.buildColor ?? undefined });
      useGame.setState({ buildMode: null, buildProps: null, buildColor: null });
      return;
    }
    const now = performance.now();
    if (now - this.lastClick.at < 350 && this.lastClick.x === tx && this.lastClick.y === ty) this.goTo(tx, ty);
    this.lastClick = { at: now, x: tx, y: ty };
  }

  goTo(x: number, y: number) {
    const me = this.avas.get(useGame.getState().meId);
    if (!me) return;
    let target: Point | null = { x, y };
    if (this.blocked(x, y)) target = nearestFree(this.grid, this.map.width, this.map.height, target, 3);
    if (!target) return;
    const p = findPath(this.grid, this.map.width, this.map.height, { x: me.tx, y: me.ty }, target);
    if (p) {
      if (useGame.getState().following) useGame.setState({ following: null });
      this.path = p;
    }
  }

  zoom(dir: number) {
    this.zoomIdx = Math.max(0, Math.min(ZOOMS.length - 1, this.zoomIdx + (dir > 0 ? 1 : -1)));
    // force: um passo de zoom durante a transição não é ignorado (a roda do mouse dispara vários)
    this.cameras.main.zoomTo(this.effZoom, 140, 'Linear', true);
  }
}

let activeGame: Phaser.Game | null = null;

/**
 * Conferência (Fase G): quantas texturas a cena tem e quanto ocupam na GPU (largura × altura × 4
 * bytes, sem contar as internas do Phaser). Usado pelo `e2e/dev-fps.mjs` na prévia /dev/cena.
 */
export function textureStats(): { count: number; bytes: number; objects: number } | null {
  const game = activeGame;
  if (!game) return null;
  let count = 0;
  let bytes = 0;
  for (const key of game.textures.getTextureKeys()) {
    const src = game.textures.get(key).source[0];
    if (!src) continue;
    count++;
    bytes += src.width * src.height * 4;
  }
  const scene = game.scene.getScene('office');
  return { count, bytes, objects: scene ? scene.children.length : 0 };
}

export function createGame(parent: HTMLElement): { destroy: () => void } {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const size = () => ({ w: Math.max(320, Math.round(parent.clientWidth * dpr)), h: Math.max(240, Math.round(parent.clientHeight * dpr)) });
  const s = size();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b0b0d',
    pixelArt: true,
    banner: false,
    disableContextMenu: true,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.NONE, width: s.w, height: s.h, zoom: 1 / dpr },
    scene: [OfficeScene],
  });
  const ro = new ResizeObserver(() => {
    const n = size();
    game.scale.resize(n.w, n.h);
  });
  ro.observe(parent);
  activeGame = game;
  return {
    destroy: () => {
      ro.disconnect();
      if (activeGame === game) activeGame = null;
      game.destroy(true);
    },
  };
}
