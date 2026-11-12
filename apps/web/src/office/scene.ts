// SPDX-License-Identifier: AGPL-3.0-only
import * as Phaser from 'phaser';
import {
  DIRS,
  DIR_VEC,
  EMOTE_MS,
  OBJECT_DEFS,
  STATUS_COLOR,
  STEP_MS,
  buildCollision,
  deskSeat,
  deskZone,
  findPath,
  mapDesks,
  nearestFree,
  objSize,
  rectContains,
  type AvatarConfig,
  type Dir,
  type MapObject,
  type OfficeMap,
  type PlayerState,
  type Point,
} from '@office-imp/shared';
import { AV_FRAMES, AV_H, AV_W, avatarKey, avatarSheet } from '../game/art/avatar';
import { objectKey, objectSprite, objectTall } from '../game/art/objects';
import { T, drawStatic, makeCanvas } from '../game/art/tiles';
import { bus } from '../game/bus';
import { net } from '../game/net';
import { useGame } from '../game/store';
import { t } from '../lib/i18n';

const CHUNK = 24;
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
  emote?: Phaser.GameObjects.Text;
  tx: number;
  ty: number;
  dir: Dir;
  moving: boolean;
  foot: number;
  idleAt: number;
  queue: [number, number, Dir][];
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
  private deskLabels: Phaser.GameObjects.Text[] = [];
  private dim!: Phaser.GameObjects.Graphics;
  private zone!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private path: Point[] | null = null;
  private followGoal = '';
  private offs: (() => void)[] = [];
  private lastClick = { at: 0, x: -1, y: -1 };
  private zoomIdx = 2;
  private rev = 0;
  private cleaned = false;

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
    cam.setBackgroundColor('#0b0b0d');
    cam.setRoundPixels(true);
    this.zoomIdx = window.innerWidth >= 1500 ? 2 : 1;
    cam.setZoom(this.effZoom);
    this.dim = this.add.graphics().setDepth(D_DIM);
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
    on('tp', (d) => this.snap(d.id, d.x, d.y));
    on('correct', (d) => {
      this.path = null;
      this.snap(useGame.getState().meId, d.x, d.y);
    });
    on('player:update', (d) => this.onPatch(d.id, d.patch));
    on('emote', (d) => this.showEmote(d.id, d.emoji));
    on('map', () => this.buildMap());
    on('desks', () => this.refreshDeskLabels());
    on('goto', (pt: Point) => this.goTo(pt.x, pt.y));
    on('zoom', (dir: number) => this.zoom(dir));
    this.offs.push(
      useGame.subscribe((s, prev) => {
        if (s.buildMode !== prev.buildMode) this.drawZone();
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
    this.rev++;
    for (const i of this.statics) i.destroy();
    for (const k of this.staticKeys) this.textures.remove(k);
    this.statics = [];
    this.staticKeys = [];
    for (let cy = 0; cy < map.height; cy += CHUNK) {
      for (let cx = 0; cx < map.width; cx += CHUNK) {
        const w = Math.min(CHUNK, map.width - cx);
        const h = Math.min(CHUNK, map.height - cy);
        const c = makeCanvas(w * T, h * T);
        drawStatic(c.getContext('2d')!, map, cx, cy, w, h);
        const key = `st:${this.rev}:${cx}:${cy}`;
        this.textures.addCanvas(key, c);
        this.staticKeys.push(key);
        this.statics.push(this.add.image(cx * T, cy * T, key).setOrigin(0).setDepth(D_FLOOR));
      }
    }
    for (const o of this.objs) o.destroy();
    this.objs = [];
    for (const o of map.objects) {
      const def = OBJECT_DEFS[o.type];
      if (!def) continue;
      const key = `obj:${objectKey(o)}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, objectSprite(o));
      const { h } = objSize(o);
      const img = this.add.image(o.x * T, (o.y - objectTall(o.type)) * T, key).setOrigin(0);
      if (FLOOR_TYPES.has(o.type)) img.setDepth(D_RUG);
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

  private drawDim() {
    this.dim.clear();
    const g = useGame.getState();
    const me = g.players[g.meId];
    const area = me?.areaId ? this.map.areas.find((a) => a.id === me.areaId) : null;
    if (!area || !area.rects.length) return;
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
    // inclui a parede em volta para não escurecer as bordas da sala
    const bx0 = (x0 - 1) * T;
    const by0 = (y0 - 1) * T;
    const bx1 = (x1 + 1) * T;
    const by1 = (y1 + 1) * T;
    const W = this.map.width * T;
    const H = this.map.height * T;
    const pad = 4000;
    this.dim.fillStyle(0x000000, 0.5);
    this.dim.fillRect(-pad, -pad, W + pad * 2, by0 + pad);
    this.dim.fillRect(-pad, by1, W + pad * 2, H - by1 + pad);
    this.dim.fillRect(-pad, by0, bx0 + pad, by1 - by0);
    this.dim.fillRect(bx1, by0, W - bx1 + pad, by1 - by0);
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
    return `${p.customStatus?.emoji ? `${p.customStatus.emoji} ` : ''}${p.spotlight ? '★ ' : ''}${p.name}${p.hand ? ' ✋' : ''}${p.screen ? ' 🖥' : ''}`;
  }

  private resetPlayers() {
    for (const id of [...this.avas.keys()]) this.removeAva(id);
    const g = useGame.getState();
    for (const p of Object.values(g.players)) this.addAva(p);
    const me = this.avas.get(g.meId);
    if (me) {
      const cam = this.cameras.main;
      cam.startFollow(me.sprite, true, 0.18, 0.18, 0, 20);
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
    const a: Ava = { id: p.id, sprite, label, dot, tx: p.x, ty: p.y, dir: p.dir, moving: false, foot: 1, idleAt: 0, queue: [] };
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
    a.emote?.destroy();
    this.avas.delete(id);
  }

  private applyLook(a: Ava, p: PlayerState) {
    a.label.setText(this.labelText(p));
    a.dot.setFillStyle(Phaser.Display.Color.HexStringToColor(STATUS_COLOR[p.away ? 'AWAY' : p.status]).color);
    a.sprite.setAlpha(p.away ? 0.6 : 1);
  }

  private place(a: Ava) {
    const { x, y } = a.sprite;
    a.sprite.setDepth(D_WORLD + y);
    a.label.setPosition(x + 5, y - AV_H + 3);
    a.dot.setPosition(x + 5 - a.label.width / 2 - 7, y - AV_H + 3 - a.label.height / 2);
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
    const e = this.add.text(a.sprite.x, a.sprite.y - AV_H - 12, emoji, { fontSize: '22px', resolution: this.effZoom }).setOrigin(0.5, 1).setDepth(D_LABEL + 1);
    a.emote = e;
    this.tweens.add({ targets: e, scale: { from: 0.4, to: 1 }, duration: 180, ease: 'Back.easeOut' });
    this.time.delayedCall(EMOTE_MS, () => {
      if (a.emote === e) a.emote = undefined;
      e.destroy();
    });
  }

  private snap(id: string, x: number, y: number) {
    const a = this.avas.get(id);
    if (!a) return;
    this.tweens.killTweensOf(a.sprite);
    a.queue = [];
    a.moving = false;
    a.tx = x;
    a.ty = y;
    a.sprite.setPosition(px(x), py(y));
    a.sprite.setFrame(frame(a.dir, 0));
    this.place(a);
    if (id === useGame.getState().meId) {
      this.cameras.main.centerOn(a.sprite.x, a.sprite.y - 20);
      this.afterOwnStep();
    }
  }

  private step(a: Ava, x: number, y: number, dir: Dir, done?: () => void) {
    a.tx = x;
    a.ty = y;
    a.dir = dir;
    a.moving = true;
    a.idleAt = 0;
    a.foot = a.foot === 1 ? 2 : 1;
    a.sprite.setFrame(frame(dir, a.foot));
    this.tweens.add({
      targets: a.sprite,
      x: px(x),
      y: py(y),
      duration: STEP_MS,
      onUpdate: () => this.place(a),
      onComplete: () => {
        a.moving = false;
        a.idleAt = this.time.now + 70;
        this.place(a);
        done?.();
      },
    });
  }

  private onMoves(list: [string, number, number, number][]) {
    const meId = useGame.getState().meId;
    for (const [id, x, y, di] of list) {
      if (id === meId) continue;
      const a = this.avas.get(id);
      if (!a) continue;
      a.queue.push([x, y, DIRS[di] ?? a.dir]);
      if (a.queue.length > 5) {
        const last = a.queue[a.queue.length - 1];
        a.dir = last[2];
        this.snap(id, last[0], last[1]);
      } else if (!a.moving) this.nextQueued(a);
      if (id === useGame.getState().following) this.followGoal = '';
    }
  }

  private nextQueued(a: Ava) {
    const n = a.queue.shift();
    if (!n) return;
    const [x, y, dir] = n;
    const dist = Math.abs(x - a.tx) + Math.abs(y - a.ty);
    if (dist === 0) {
      a.dir = dir;
      a.sprite.setFrame(frame(dir, 0));
      this.nextQueued(a);
    } else if (dist > 1) {
      a.dir = dir;
      const rest = a.queue;
      this.snap(a.id, x, y);
      a.queue = rest;
      this.nextQueued(a);
    } else this.step(a, x, y, dir, () => this.nextQueued(a));
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
    return this.grid[y * this.map.width + x] === 1;
  }

  update(time: number) {
    for (const a of this.avas.values()) {
      if (!a.moving && a.idleAt && time > a.idleAt) {
        a.sprite.setFrame(frame(a.dir, 0));
        a.idleAt = 0;
      }
    }
    const g = useGame.getState();
    const me = this.avas.get(g.meId);
    if (!me || me.moving || g.phase !== 'online') return;
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
    if (this.blocked(nx, ny)) {
      this.path = null;
      if (me.dir !== dir) {
        me.dir = dir;
        me.sprite.setFrame(frame(dir, 0));
        net.send('face', { dir });
      }
      return;
    }
    if (fromPath) this.path!.shift();
    net.send('step', { x: nx, y: ny });
    this.step(me, nx, ny, dir, () => this.afterOwnStep());
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
