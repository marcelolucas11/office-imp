// SPDX-License-Identifier: AGPL-3.0-only
import * as Phaser from 'phaser';
import {
  DIRS,
  DIR_VEC,
  EMOTE_MS,
  OBJECT_DEFS,
  STATUS_COLOR,
  STEP_MS,
  buildAreaIndex,
  buildCollision,
  can,
  dayPeriod,
  deskSeat,
  deskZone,
  findPath,
  mapDesks,
  nearestFree,
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
import { AV_FRAMES, AV_H, AV_W, avatarKey, avatarSheet } from '../game/art/avatar';
import { DECOR_SIZE, EXTERIOR, decorSprite, exteriorDecor, exteriorGrass, type DecorKind } from '../game/art/exterior';
import { FLOOR_PATTERN } from '../game/art/floors';
import { doorClosedSprite, objectKey, objectSprite, objectTall } from '../game/art/objects';
import { T, drawStatic, hasPeriodWalls, makeCanvas } from '../game/art/tiles';
import { bus } from '../game/bus';
import { net } from '../game/net';
import { serverNow, useGame } from '../game/store';
import { t } from '../lib/i18n';
import { emojiCanvas, hasIcon } from '../lib/icons';

const BADGE = 13;
const EMOTE = 24;
const ICON_RES = 64;

const CHUNK = 24;
/** Exterior (só fundo): a grama fica embaixo de tudo e as árvores logo acima dela, sempre atrás do chão. */
const D_GRASS = -20;
const D_DECOR = -10;
/** De quanto em quanto tempo o período do dia é reavaliado e quanto dura a troca da grama. */
const PERIOD_CHECK_MS = 60_000;
const PERIOD_FADE_MS = 1500;
const D_FLOOR = 0;
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
  /** Período forçado (conferência visual e testes, pelo evento `period` do barramento). */
  private forcedPeriod: DayPeriod | null = null;
  private periodCheckedAt = 0;
  private grass: Phaser.GameObjects.TileSprite | null = null;
  /** Grama do período anterior, enquanto a nova aparece por cima. */
  private grassOld: Phaser.GameObjects.TileSprite | null = null;
  private decor: { img: Phaser.GameObjects.Image; kind: DecorKind }[] = [];

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
    on('period', (p: DayPeriod | null) => {
      this.forcedPeriod = p && p in EXTERIOR ? p : null;
      this.checkPeriod();
    });
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
    this.doorImgs.clear();
    this.doorAt.clear();
    if (!this.textures.exists('door:closed')) this.textures.addCanvas('door:closed', doorClosedSprite());
    for (const o of map.objects) {
      const def = OBJECT_DEFS[o.type];
      if (!def) continue;
      const key = `obj:${objectKey(o)}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, objectSprite(o));
      const { h } = objSize(o);
      const img = this.add.image(o.x * T, (o.y - objectTall(o.type)) * T, key).setOrigin(0);
      if (o.type === 'door') {
        this.doorImgs.set(o.id, img);
        this.doorAt.set(o.y * map.width + o.x, o.id);
        // fechada fica na altura dos avatares (bloqueia, como uma parede); aberta fica no chão
        this.applyDoor(o.id);
      } else if (FLOOR_TYPES.has(o.type)) img.setDepth(D_RUG);
      else if (def.above || o.props?.above) img.setDepth(D_DIM - 1);
      else if (def.solid) img.setDepth(D_WORLD + (o.y + h) * T - 1);
      else img.setDepth(D_WORLD + o.y * T + 1);
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
        drawStatic(c.getContext('2d')!, map, cx, cy, w, h, this.period);
        const key = `st:${this.rev}:${cx}:${cy}`;
        this.textures.addCanvas(key, c);
        this.staticKeys.push(key);
        this.statics.push(this.add.image(cx * T, cy * T, key).setOrigin(0).setDepth(D_FLOOR));
      }
    }
  }

  // ---------- exterior e período do dia ----------

  private currentPeriod(): DayPeriod {
    return this.forcedPeriod ?? dayPeriod(serverNow(), useGame.getState().office?.timezone ?? '');
  }

  private grassTexture(period: DayPeriod): string {
    const key = `ext:grass:${period}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, exteriorGrass(period));
    return key;
  }

  private decorTexture(kind: DecorKind, period: DayPeriod): string {
    const key = `ext:${kind}:${period}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, decorSprite(kind, period));
    return key;
  }

  /**
   * Exterior em volta do escritório e nos vazios do mapa: um TileSprite de grama do tamanho da
   * tela (um padrão de 256 px repetido, sem textura gigante) e um sprite por árvore ou arbusto.
   * É só fundo: não entra no mapa nem na colisão.
   */
  private buildExterior() {
    if (!this.grass) this.grass = this.add.tileSprite(0, 0, FLOOR_PATTERN, FLOOR_PATTERN, this.grassTexture(this.period)).setOrigin(0).setDepth(D_GRASS);
    for (const d of this.decor) d.img.destroy();
    this.decor = [];
    for (const d of exteriorDecor(this.map)) {
      // mesma camada para todos; a fração da profundidade mantém a ordem de cima para baixo
      const depth = D_DECOR + (d.y + DECOR_SIZE[d.kind].h) * 1e-4;
      this.decor.push({ img: this.add.image(d.x, d.y, this.decorTexture(d.kind, this.period)).setOrigin(0).setDepth(depth), kind: d.kind });
    }
    this.syncGrass();
  }

  /** Mantém a grama cobrindo a tela, sempre alinhada ao padrão de 256 px do mundo. */
  private syncGrass() {
    if (!this.grass) return;
    const cam = this.cameras.main;
    const P = FLOOR_PATTERN;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    const x = (Math.floor((cx - vw / 2) / P) - 1) * P;
    const y = (Math.floor((cy - vh / 2) / P) - 1) * P;
    const w = (Math.ceil(vw / P) + 3) * P;
    const h = (Math.ceil(vh / P) + 3) * P;
    for (const g of [this.grass, this.grassOld]) {
      if (!g) continue;
      if (g.x !== x || g.y !== y) g.setPosition(x, y);
      if (g.width !== w || g.height !== h) g.setSize(w, h);
    }
  }

  /** Reavalia o período; se mudou, troca as texturas do exterior e refaz a vista das janelas. */
  private checkPeriod() {
    const next = this.currentPeriod();
    if (next === this.period || !this.map) return;
    this.period = next;
    this.cameras.main.setBackgroundColor(EXTERIOR[next].grass.base);
    // transição simples: a grama nova aparece por cima da antiga; árvores e janelas trocam na hora
    if (this.grass) {
      const old = this.grass;
      this.grassOld?.destroy();
      this.grassOld = old;
      const fresh = this.add.tileSprite(old.x, old.y, old.width, old.height, this.grassTexture(next)).setOrigin(0).setDepth(D_GRASS + 1).setAlpha(0);
      this.grass = fresh;
      this.tweens.add({
        targets: fresh,
        alpha: 1,
        duration: PERIOD_FADE_MS,
        onComplete: () => {
          if (this.grassOld === old) this.grassOld = null;
          old.destroy();
          fresh.setDepth(D_GRASS);
        },
      });
    }
    for (const d of this.decor) d.img.setTexture(this.decorTexture(d.kind, next));
    if (hasPeriodWalls(this.map)) this.buildStatics();
  }

  private applyDoor(id: string) {
    const img = this.doorImgs.get(id);
    const o = this.map.objects.find((x) => x.id === id);
    if (!img || !o) return;
    const open = Boolean(useGame.getState().doors[id]);
    img.setTexture(open ? `obj:${objectKey(o)}` : 'door:closed');
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
      const label = this.text((d.x + w / 2) * T, (d.y - objectTall('desk')) * T + 8, info.userName, info.online ? '#e6d2a0' : '#77778a', 9).setDepth(D_LABEL - 1);
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
      return this.map.objects.some((o) => o.type === 'door' && o.x === x && o.y === y);
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
    const pT = sideIsWall(x0, x1, y0 - 1, y0) ? 1 : 0;
    const pB = sideIsWall(x0, x1, y1, y1 + 1) ? 1 : 0;
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
   * Limites da câmera: o avatar fica no centro, mas perto da borda do escritório a câmera para
   * e o avatar sai do centro — assim a tela não mostra o vazio preto de fora do mapa.
   * Se o mapa for menor que a tela naquele eixo, ele fica centralizado.
   */
  private updateBounds() {
    if (!this.map) return;
    const cam = this.cameras.main;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    // folga só em cima: nome e reações de quem está encostado na parede de cima continuam visíveis
    const top = 28;
    const W = this.map.width * T;
    const H = this.map.height * T + top;
    const bx = W < vw ? (W - vw) / 2 : 0;
    const by = H < vh ? (H - vh) / 2 - top : -top;
    const bw = Math.max(W, vw);
    const bh = Math.max(H, vh);
    const b = cam.getBounds();
    if (cam.useBounds && Math.abs(b.x - bx) < 0.5 && Math.abs(b.y - by) < 0.5 && Math.abs(b.width - bw) < 0.5 && Math.abs(b.height - bh) < 0.5) return;
    cam.setBounds(bx, by, bw, bh);
  }

  update(time: number, delta: number) {
    this.updateBounds();
    this.syncGrass();
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
        const d = Math.abs(o.x - me.tx) + Math.abs(o.y - me.ty);
        if (Math.max(Math.abs(o.x - me.tx), Math.abs(o.y - me.ty)) > 1 || d >= bestD) continue;
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
    if (o.type === 'desk') {
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
      if (desk && rectContains(deskZone(desk), tx, ty)) net.send('decor:add', { type: g.buildMode, x: tx, y: ty, props: g.buildProps ?? undefined });
      useGame.setState({ buildMode: null, buildProps: null });
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
    this.cameras.main.zoomTo(this.effZoom, 140);
  }
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
  return {
    destroy: () => {
      ro.disconnect();
      game.destroy(true);
    },
  };
}
