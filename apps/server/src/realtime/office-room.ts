import { Room, type Client } from '@colyseus/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  CHAT_MAX_LEN,
  DEFAULT_AVATAR,
  DEFAULT_INTERACTION_DISTANCE,
  DESK_DECOR_TYPES,
  DIRS,
  EMOTES,
  MAX_DESK_DECOR,
  MAX_INTERACTION_DISTANCE,
  MIN_INTERACTION_DISTANCE,
  MIN_STEP_INTERVAL_MS,
  OBJECT_DEFS,
  TICK_MS,
  avEdges,
  avViewEquals,
  buildAreaIndex,
  buildCollision,
  can,
  computeAv,
  deskSeat,
  deskZone,
  isAdminRole,
  isSpotlightAt,
  mapDesks,
  musicPosition,
  nearestFree,
  parseYouTubeUrl,
  privateAreaAt,
  rectContains,
  sanitizeAvatar,
  type AreaIndex,
  type AvView,
  type ChatMessage,
  type DeskInfo,
  type Dir,
  type MapArea,
  type MapObject,
  type MusicChannel,
  type OfficeMap,
  type PlayerState,
  type Role,
  type Status,
  type TrackedStatus,
} from '@office-imp/shared';
import { db, schema } from '../db';
import { loadGuestSubject, loadUserSubject, canEnterOffice, inviteUsable, type Subject } from '../lib/auth';
import { newId, verifyTicket } from '../lib/crypto';
import { officeSettings } from '../lib/settings';
import { currentMap, getOffice, listDesks, patchCurrentMap, type OfficeRow } from '../services/offices';
import { lkRoomName, removeFromLkRoom } from '../services/livekit';
import { hub } from './hub';
import { Tracker } from './tracker';

interface Runtime {
  state: PlayerState;
  client: Client;
  kind: 'user' | 'guest';
  inviteId?: string;
  lastStepAt: number;
  stepCredit: number;
  whiteboards: Set<string>;
}

const STATUSES: Status[] = ['AVAILABLE', 'BUSY', 'DND'];
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export class OfficeRoom extends Room {
  officeId = '';
  office!: OfficeRow;
  map!: OfficeMap;
  mapVersionId = '';
  grid!: Uint8Array;
  areaIndex!: AreaIndex;
  players = new Map<string, Runtime>();
  tracker!: Tracker;
  music = new Map<string, MusicChannel>();
  /** areaId -> reunião em gravação */
  recordings = new Map<string, { meetingId: string; startedBy: string }>();
  private lastViews = new Map<string, AvView>();
  private pendingMoves = new Map<string, [string, number, number, number]>();
  private avDirty = true;
  private desks: DeskInfo[] = [];
  private wbCache = new Map<string, { elements: Map<string, any>; dirty: boolean }>();
  private slowTick = 0;

  // ---------- ciclo de vida ----------

  async onCreate(options: any) {
    this.officeId = String(options?.officeId ?? '');
    this.office = await getOffice(this.officeId);
    await this.loadMap();
    this.desks = await listDesks(this.officeId);
    this.tracker = new Tracker(this.officeId);
    this.maxClients = 200;
    hub.register(this);
    this.registerHandlers();
    this.setSimulationInterval(() => this.tick(), TICK_MS);
  }

  private async loadMap() {
    const cur = await currentMap(this.office);
    this.map = cur.map;
    this.mapVersionId = cur.id;
    this.rebuildIndexes();
  }

  private rebuildIndexes() {
    this.grid = buildCollision(this.map);
    this.areaIndex = buildAreaIndex(this.map);
  }

  async onAuth(_client: Client, options: any) {
    const t = verifyTicket<{ sub: string; kind: 'user' | 'guest'; officeId: string }>(options?.ticket);
    if (!t || t.officeId !== this.officeId) throw new Error('ticket inválido');
    const subject: Subject | null = t.kind === 'user' ? await loadUserSubject(t.sub) : await loadGuestSubject(t.sub);
    if (!subject) throw new Error('sessão inválida');
    if (subject.kind === 'user' && subject.restricted) throw new Error('conta restrita');
    if (!canEnterOffice(subject, this.officeId).ok) throw new Error('sem acesso');
    return subject;
  }

  async onJoin(client: Client, _options: any, subject: Subject) {
    const existing = this.players.get(subject.id);
    if (existing) {
      existing.client.send('kick', { reason: 'other_session' });
      this.removePlayer(subject.id, existing.client);
      existing.client.leave(4001);
    }
    let pos: { x: number; y: number } | null = null;
    let distance = DEFAULT_INTERACTION_DISTANCE;
    let deskId: string | null = null;
    if (subject.kind === 'user') {
      const [m] = await db()
        .select()
        .from(schema.officeMembers)
        .where(and(eq(schema.officeMembers.officeId, this.officeId), eq(schema.officeMembers.userId, subject.id)));
      if (m?.lastX != null && m?.lastY != null) pos = { x: m.lastX, y: m.lastY };
      distance = subject.user.interactionDistance;
      deskId = this.desks.find((d) => d.userId === subject.id)?.id ?? null;
    }
    const start = this.resolveSpawn(pos, subject.role);
    const area = privateAreaAt(this.map, this.areaIndex, start.x, start.y);
    const state: PlayerState = {
      id: subject.id,
      name: subject.name,
      role: subject.role,
      x: start.x,
      y: start.y,
      dir: 'down',
      status: 'AVAILABLE',
      away: false,
      customStatus: null,
      avatar: sanitizeAvatar((subject.kind === 'user' ? subject.user.avatar : subject.guest.avatar) ?? DEFAULT_AVATAR),
      hand: false,
      areaId: area?.id ?? null,
      spotlight: false,
      mic: false,
      cam: false,
      screen: false,
      deskId,
      distance,
      profile: subject.kind === 'user' ? (subject.user.profile ?? {}) : {},
    };
    this.players.set(subject.id, {
      state,
      client,
      kind: subject.kind,
      inviteId: subject.kind === 'guest' ? subject.inviteId : undefined,
      lastStepAt: 0,
      stepCredit: 3,
      whiteboards: new Set(),
    });
    this.tracker.join({ id: subject.id, name: subject.name, role: subject.role }, 'AVAILABLE');

    let myDeskItems: any[] = [];
    if (deskId) myDeskItems = await this.deskItemsFor(deskId);
    client.send('init', {
      me: subject.id,
      players: [...this.players.values()].map((p) => p.state),
      desks: this.desksWithOnline(),
      music: [...this.music.values()],
      recordings: [...this.recordings.entries()].map(([areaId, r]) => ({ areaId, meetingId: r.meetingId })),
      mapVersionId: this.mapVersionId,
      myDeskItems,
      now: Date.now(),
    });
    this.broadcast('join', state, { except: client });
    this.broadcastDesks();
    this.avDirty = true;
  }

  async onLeave(client: Client) {
    for (const [id, p] of this.players) {
      if (p.client === client) {
        this.removePlayer(id, client);
        break;
      }
    }
  }

  onDispose() {
    this.tracker?.closeAll();
    this.flushWhiteboards();
    hub.unregister(this);
  }

  private removePlayer(id: string, client: Client) {
    const p = this.players.get(id);
    if (!p || p.client !== client) return;
    this.players.delete(id);
    this.lastViews.delete(id);
    this.tracker.leave(id);
    if (p.kind === 'user') {
      db()
        .update(schema.officeMembers)
        .set({ lastX: p.state.x, lastY: p.state.y })
        .where(and(eq(schema.officeMembers.officeId, this.officeId), eq(schema.officeMembers.userId, id)))
        .catch(() => {});
    }
    if (p.state.areaId) void removeFromLkRoom(lkRoomName(this.officeId, p.state.areaId), id);
    this.musicLeave(id, true);
    this.broadcast('leave', { id });
    this.broadcastDesks();
    this.avDirty = true;
  }

  // ---------- utilidades ----------

  private resolveSpawn(pos: { x: number; y: number } | null, role: Role): { x: number; y: number } {
    const ok = (p: { x: number; y: number }) => {
      if (p.x < 0 || p.y < 0 || p.x >= this.map.width || p.y >= this.map.height) return false;
      if (this.grid[p.y * this.map.width + p.x] === 1) return false;
      const a = privateAreaAt(this.map, this.areaIndex, p.x, p.y);
      if (a && (a.staffOnly ? !can(role, 'area.staffOnly') : false)) return false;
      // não reaparece dentro de área privada: evita entrar em reunião sem querer
      return !a;
    };
    if (pos && ok(pos)) return pos;
    const spawns = this.map.spawns.filter(ok);
    if (spawns.length) return spawns[this.players.size % spawns.length];
    return nearestFree(this.grid, this.map.width, this.map.height, this.map.spawns[0] ?? { x: 1, y: 1 }, 30) ?? { x: 1, y: 1 };
  }

  private areaById(id: string | null): MapArea | undefined {
    return id ? this.map.areas.find((a) => a.id === id) : undefined;
  }

  private areaCount(areaId: string): number {
    let n = 0;
    for (const p of this.players.values()) if (p.state.areaId === areaId) n++;
    return n;
  }

  private canEnterTile(p: Runtime, x: number, y: number): { ok: boolean; notice?: string } {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return { ok: false };
    if (this.grid[y * this.map.width + x] === 1) return { ok: false };
    const area = privateAreaAt(this.map, this.areaIndex, x, y);
    if (area && area.id !== p.state.areaId) {
      if (area.staffOnly && !can(p.state.role, 'area.staffOnly')) return { ok: false, notice: 'area_staff_only' };
      if (this.areaCount(area.id) >= area.capacity) return { ok: false, notice: 'area_full' };
    }
    return { ok: true };
  }

  private applyPosition(p: Runtime, x: number, y: number, dir: Dir) {
    const prevArea = p.state.areaId;
    p.state.x = x;
    p.state.y = y;
    p.state.dir = dir;
    const area = privateAreaAt(this.map, this.areaIndex, x, y);
    const spotlight = isSpotlightAt(this.map, this.areaIndex, x, y) && can(p.state.role, 'spotlight.use');
    const newArea = area?.id ?? null;
    if (newArea !== prevArea || spotlight !== p.state.spotlight) {
      p.state.areaId = newArea;
      p.state.spotlight = spotlight;
      this.broadcast('update', { id: p.state.id, patch: { areaId: newArea, spotlight } });
      if (prevArea && prevArea !== newArea) void removeFromLkRoom(lkRoomName(this.officeId, prevArea), p.state.id);
    }
    this.avDirty = true;
  }

  private patch(p: Runtime, patch: Partial<PlayerState>) {
    Object.assign(p.state, patch);
    this.broadcast('update', { id: p.state.id, patch });
  }

  private tracked(p: Runtime): TrackedStatus {
    return p.state.away ? 'AWAY' : p.state.status;
  }

  private desksWithOnline(): DeskInfo[] {
    return this.desks.map((d) => ({ ...d, online: d.userId ? this.players.has(d.userId) : false }));
  }

  private broadcastDesks() {
    this.broadcast('desks', this.desksWithOnline());
  }

  private async deskItemsFor(deskId: string) {
    const rows = await db()
      .select()
      .from(schema.deskItems)
      .where(and(eq(schema.deskItems.officeId, this.officeId), eq(schema.deskItems.deskId, deskId)));
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100)
      .map((r) => ({ id: r.id, deskId: r.deskId, kind: r.kind, authorName: r.authorName, content: r.content, emoji: r.emoji, at: r.createdAt, seen: Boolean(r.seenAt) }));
  }

  // ---------- chamados pela API ----------

  kick(subjectId: string, reason: string) {
    const p = this.players.get(subjectId);
    if (!p) return;
    p.client.send('kick', { reason });
    this.removePlayer(subjectId, p.client);
    p.client.leave(4002);
  }

  kickInvite(inviteId: string, reason: string) {
    for (const [id, p] of this.players) if (p.inviteId === inviteId) this.kick(id, reason);
  }

  async refreshOffice() {
    this.office = await getOffice(this.officeId);
    this.broadcast('office', { name: this.office.name, settings: publicSettings(this.office) });
  }

  /** Mapa publicado mudou: recarrega e reposiciona quem ficou em tile bloqueado. */
  async reloadMap() {
    this.office = await getOffice(this.officeId);
    await this.loadMap();
    this.desks = await listDesks(this.officeId);
    for (const p of this.players.values()) {
      if (p.state.deskId && !this.desks.some((d) => d.id === p.state.deskId && d.userId === p.state.id)) p.state.deskId = null;
      if (this.grid[p.state.y * this.map.width + p.state.x] === 1 || p.state.x >= this.map.width || p.state.y >= this.map.height) {
        const free = nearestFree(this.grid, this.map.width, this.map.height, { x: Math.min(p.state.x, this.map.width - 1), y: Math.min(p.state.y, this.map.height - 1) }, 40) ?? this.resolveSpawn(null, p.state.role);
        p.state.x = free.x;
        p.state.y = free.y;
      }
      const area = privateAreaAt(this.map, this.areaIndex, p.state.x, p.state.y);
      p.state.areaId = area?.id ?? null;
      p.state.spotlight = isSpotlightAt(this.map, this.areaIndex, p.state.x, p.state.y) && can(p.state.role, 'spotlight.use');
    }
    this.broadcast('map', { map: this.map, mapVersionId: this.mapVersionId, players: [...this.players.values()].map((p) => p.state) });
    this.broadcastDesks();
    this.avDirty = true;
  }

  async reloadDesks() {
    this.desks = await listDesks(this.officeId);
    for (const p of this.players.values()) {
      const mine = this.desks.find((d) => d.userId === p.state.id)?.id ?? null;
      if (mine !== p.state.deskId) this.patch(p, { deskId: mine });
    }
    this.broadcastDesks();
  }

  setRecording(areaId: string, rec: { meetingId: string; startedBy: string } | null) {
    if (rec) this.recordings.set(areaId, rec);
    else this.recordings.delete(areaId);
    this.broadcast('rec', { areaId, active: Boolean(rec), meetingId: rec?.meetingId ?? null });
  }

  playersInArea(areaId: string): PlayerState[] {
    return [...this.players.values()].filter((p) => p.state.areaId === areaId).map((p) => p.state);
  }

  liveState(): Map<string, { status: TrackedStatus; area: string | null; inCall: boolean }> {
    const out = new Map<string, { status: TrackedStatus; area: string | null; inCall: boolean }>();
    for (const p of this.players.values()) {
      out.set(p.state.id, { status: this.tracked(p), area: this.areaById(p.state.areaId)?.name ?? null, inCall: this.tracker.inCall(p.state.id) });
    }
    return out;
  }

  // ---------- loop ----------

  private tick() {
    if (this.pendingMoves.size) {
      this.broadcast('moves', [...this.pendingMoves.values()]);
      this.pendingMoves.clear();
    }
    if (this.avDirty) {
      this.avDirty = false;
      const views = computeAv([...this.players.values()].map((p) => ({ id: p.state.id, x: p.state.x, y: p.state.y, status: p.state.status, distance: p.state.distance, areaId: p.state.areaId, spotlight: p.state.spotlight })));
      for (const [id, v] of views) {
        if (!avViewEquals(this.lastViews.get(id), v)) this.players.get(id)?.client.send('av', v);
      }
      this.lastViews = views;
      this.tracker.setEdges(avEdges(views), (room) => {
        const a = room === 'open' ? undefined : this.areaById(room);
        return { id: a?.id ?? null, name: a?.name ?? null };
      });
    }
    if (++this.slowTick >= 20 * 20) {
      this.slowTick = 0;
      this.everyTwentySeconds();
    }
  }

  private everyTwentySeconds() {
    const now = Date.now();
    for (const p of this.players.values()) {
      if (p.state.customStatus?.until && p.state.customStatus.until < now) this.patch(p, { customStatus: null });
    }
    this.flushWhiteboards();
    void this.checkGuests();
  }

  private async checkGuests() {
    const inviteIds = [...new Set([...this.players.values()].map((p) => p.inviteId).filter(Boolean) as string[])];
    if (!inviteIds.length) return;
    const rows = await db().select().from(schema.invites).where(inArray(schema.invites.id, inviteIds));
    for (const inv of rows) if (!inviteUsable(inv)) this.kickInvite(inv.id, 'invite_expired');
  }

  private queueMove(p: Runtime) {
    this.pendingMoves.set(p.state.id, [p.state.id, p.state.x, p.state.y, DIRS.indexOf(p.state.dir)]);
  }

  // ---------- mensagens ----------

  private on(type: string, fn: (p: Runtime, data: any, client: Client) => void | Promise<void>) {
    this.onMessage(type, (client, data) => {
      let p: Runtime | undefined;
      for (const r of this.players.values()) {
        if (r.client === client) {
          p = r;
          break;
        }
      }
      if (!p) return;
      try {
        const r = fn(p, data ?? {}, client);
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch((e) => console.error(`[sala] erro em ${type}:`, e));
      } catch (e) {
        console.error(`[sala] erro em ${type}:`, e);
      }
    });
  }

  private registerHandlers() {
    this.on('ping', (p, d) => p.client.send('pong', { t: d.t, now: Date.now() }));

    this.on('step', (p, d) => {
      const x = Number(d.x);
      const y = Number(d.y);
      const now = Date.now();
      // crédito de passos: recupera 1 a cada MIN_STEP_INTERVAL_MS, com rajada máxima de 3
      p.stepCredit = Math.min(3, p.stepCredit + (now - (p.lastStepAt || now)) / MIN_STEP_INTERVAL_MS);
      p.lastStepAt = now;
      const adjacent = Number.isInteger(x) && Number.isInteger(y) && Math.abs(x - p.state.x) + Math.abs(y - p.state.y) === 1;
      const check = adjacent && p.stepCredit >= 1 ? this.canEnterTile(p, x, y) : { ok: false };
      if (!check.ok) {
        p.client.send('correct', { x: p.state.x, y: p.state.y });
        if ('notice' in check && check.notice) p.client.send('notice', { code: check.notice });
        return;
      }
      p.stepCredit -= 1;
      const dir: Dir = x > p.state.x ? 'right' : x < p.state.x ? 'left' : y > p.state.y ? 'down' : 'up';
      this.applyPosition(p, x, y, dir);
      this.queueMove(p);
    });

    this.on('face', (p, d) => {
      if (!DIRS.includes(d.dir)) return;
      p.state.dir = d.dir;
      this.queueMove(p);
    });

    this.on('teleport', (p, d) => {
      const tx = Math.floor(Number(d.x));
      const ty = Math.floor(Number(d.y));
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
      let target: { x: number; y: number } | null = null;
      for (let r = 0; r <= 8 && !target; r++) {
        for (let dy = -r; dy <= r && !target; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (this.canEnterTile(p, tx + dx, ty + dy).ok) {
              target = { x: tx + dx, y: ty + dy };
              break;
            }
          }
        }
      }
      if (!target) {
        p.client.send('notice', { code: 'teleport_blocked' });
        return;
      }
      this.applyPosition(p, target.x, target.y, p.state.dir);
      this.pendingMoves.delete(p.state.id);
      this.broadcast('tp', { id: p.state.id, x: target.x, y: target.y });
    });

    this.on('status', (p, d) => {
      if (!STATUSES.includes(d.status)) return;
      this.patch(p, { status: d.status });
      this.tracker.setStatus(p.state.id, this.tracked(p));
      this.avDirty = true;
    });

    this.on('away', (p, d) => {
      const away = Boolean(d.away);
      if (away === p.state.away) return;
      this.patch(p, { away });
      this.tracker.setStatus(p.state.id, this.tracked(p));
    });

    this.on('customStatus', (p, d) => {
      const text = str(d?.text, 80);
      const emoji = str(d?.emoji, 8);
      if (!text && !emoji) {
        this.patch(p, { customStatus: null });
        return;
      }
      const until = Number.isFinite(d?.until) && d.until > Date.now() ? Number(d.until) : null;
      this.patch(p, { customStatus: { emoji, text, until } });
    });

    this.on('distance', (p, d) => {
      const v = Math.max(MIN_INTERACTION_DISTANCE, Math.min(MAX_INTERACTION_DISTANCE, Math.round(Number(d.value) || DEFAULT_INTERACTION_DISTANCE)));
      this.patch(p, { distance: v });
      if (p.kind === 'user') db().update(schema.users).set({ interactionDistance: v }).where(eq(schema.users.id, p.state.id)).catch(() => {});
      this.avDirty = true;
    });

    this.on('media', (p, d) => this.patch(p, { mic: Boolean(d.mic), cam: Boolean(d.cam), screen: Boolean(d.screen) }));
    this.on('hand', (p, d) => this.patch(p, { hand: Boolean(d.raised) }));

    this.on('emote', (p, d) => {
      if (!EMOTES.includes(d.emoji)) return;
      this.broadcast('emote', { id: p.state.id, emoji: d.emoji });
    });

    this.on('wave', (p, d) => {
      const target = this.players.get(String(d.to));
      if (!target || target === p) return;
      if (target.state.status === 'DND') {
        p.client.send('notice', { code: 'wave_dnd', name: target.state.name });
        return;
      }
      target.client.send('wave', { from: p.state.id, name: p.state.name });
      p.client.send('notice', { code: 'wave_sent', name: target.state.name });
    });

    this.on('lead', (p) => {
      const view = this.lastViews.get(p.state.id);
      for (const peer of view?.peers ?? []) this.players.get(peer.id)?.client.send('lead', { from: p.state.id, name: p.state.name });
    });

    this.on('chat', (p, d) => {
      const text = str(d.text, CHAT_MAX_LEN);
      if (!text) return;
      const scope = d.scope === 'near' || d.scope === 'dm' ? d.scope : 'all';
      const msg: ChatMessage = { id: newId(), scope, fromId: p.state.id, fromName: p.state.name, toId: null, text, at: Date.now() };
      let recipients: string[] | null = null;
      if (scope === 'dm') {
        const to = String(d.to ?? '');
        if (!to || to === p.state.id) return;
        msg.toId = to;
        recipients = [p.state.id, to];
      } else if (scope === 'near') {
        recipients = [p.state.id, ...(this.lastViews.get(p.state.id)?.peers.map((x) => x.id) ?? [])];
      }
      db()
        .insert(schema.chatMessages)
        .values({ id: msg.id, officeId: this.officeId, scope, fromId: msg.fromId, fromName: msg.fromName, toId: msg.toId ?? null, recipients, text, createdAt: msg.at })
        .catch(() => {});
      if (!recipients) this.broadcast('chat', msg);
      else for (const id of recipients) this.players.get(id)?.client.send('chat', msg);
    });

    this.on('avatar', (p, d) => {
      const avatar = sanitizeAvatar(d);
      this.patch(p, { avatar });
      if (p.kind === 'user') db().update(schema.users).set({ avatar }).where(eq(schema.users.id, p.state.id)).catch(() => {});
      else db().update(schema.guests).set({ avatar }).where(eq(schema.guests.id, p.state.id)).catch(() => {});
    });

    this.on('profile', (p, d) => {
      if (p.kind !== 'user') return;
      const profile = { title: str(d.title, 60), about: str(d.about, 300), timezone: str(d.timezone, 60) };
      this.patch(p, { profile });
      db().update(schema.users).set({ profile }).where(eq(schema.users.id, p.state.id)).catch(() => {});
    });

    // ----- mesas -----
    this.on('desk:claim', async (p, d) => {
      if (p.kind !== 'user' || !can(p.state.role, 'desk.claim')) return;
      const deskId = String(d.deskId ?? '');
      const desk = this.desks.find((x) => x.id === deskId);
      if (!desk || (desk.userId && desk.userId !== p.state.id)) {
        p.client.send('notice', { code: 'desk_taken' });
        return;
      }
      await db()
        .update(schema.desks)
        .set({ userId: null })
        .where(and(eq(schema.desks.officeId, this.officeId), eq(schema.desks.userId, p.state.id)));
      const res = await db()
        .update(schema.desks)
        .set({ userId: p.state.id })
        .where(and(eq(schema.desks.officeId, this.officeId), eq(schema.desks.id, deskId), isNull(schema.desks.userId)))
        .returning();
      if (!res.length) {
        p.client.send('notice', { code: 'desk_taken' });
      }
      await this.reloadDesks();
    });

    this.on('desk:release', async (p) => {
      if (p.kind !== 'user') return;
      await db()
        .update(schema.desks)
        .set({ userId: null })
        .where(and(eq(schema.desks.officeId, this.officeId), eq(schema.desks.userId, p.state.id)));
      await this.reloadDesks();
    });

    this.on('desk:item', async (p, d) => {
      const deskId = String(d.deskId ?? '');
      const desk = this.desks.find((x) => x.id === deskId);
      const content = str(d.content, 500);
      if (!desk?.userId || !content) return;
      const kind = d.kind === 'gift' ? 'gift' : 'note';
      const item = { id: newId(), officeId: this.officeId, deskId, kind: kind as 'note' | 'gift', authorId: p.state.id, authorName: p.state.name, content, emoji: kind === 'gift' ? str(d.emoji, 8) || '🎁' : null, createdAt: Date.now(), seenAt: null };
      await db().insert(schema.deskItems).values(item);
      p.client.send('notice', { code: 'desk_item_sent', name: desk.userName });
      const owner = this.players.get(desk.userId);
      owner?.client.send('deskitem', { id: item.id, deskId, kind, authorName: item.authorName, content, emoji: item.emoji, at: item.createdAt, seen: false });
    });

    this.on('desk:items', async (p) => {
      if (!p.state.deskId) return;
      p.client.send('deskitems', await this.deskItemsFor(p.state.deskId));
    });

    this.on('desk:seen', async (p) => {
      if (!p.state.deskId) return;
      await db()
        .update(schema.deskItems)
        .set({ seenAt: Date.now() })
        .where(and(eq(schema.deskItems.officeId, this.officeId), eq(schema.deskItems.deskId, p.state.deskId), isNull(schema.deskItems.seenAt)));
    });

    this.on('desk:item:delete', async (p, d) => {
      if (!p.state.deskId) return;
      await db()
        .delete(schema.deskItems)
        .where(and(eq(schema.deskItems.officeId, this.officeId), eq(schema.deskItems.deskId, p.state.deskId), eq(schema.deskItems.id, String(d.id ?? ''))));
      p.client.send('deskitems', await this.deskItemsFor(p.state.deskId));
    });

    // ----- Build Tool: decoração da própria mesa -----
    this.on('decor:add', async (p, d) => {
      if (!can(p.state.role, 'build.ownDesk') || !p.state.deskId) return;
      const desk = mapDesks(this.map).find((o) => o.id === p.state.deskId);
      const type = String(d.type ?? '');
      const def = OBJECT_DEFS[type];
      const x = Number(d.x);
      const y = Number(d.y);
      if (!desk || !def || !DESK_DECOR_TYPES.includes(type) || !Number.isInteger(x) || !Number.isInteger(y)) return;
      const zone = deskZone(desk);
      const seat = deskSeat(desk);
      const mine = this.map.objects.filter((o) => o.ownerDeskId === desk.id);
      const onDesk = y === desk.y && x >= desk.x && x < desk.x + 2;
      if (!rectContains(zone, x, y) || (x === seat.x && y === seat.y) || mine.length >= MAX_DESK_DECOR || mine.some((o) => o.x === x && o.y === y) || (def.solid && onDesk)) {
        p.client.send('notice', { code: 'decor_invalid' });
        return;
      }
      const props: Record<string, any> = {};
      if (type === 'note') props.text = str(d.props?.text, 500);
      if (type === 'poster') {
        const url = str(d.props?.url, 300);
        if (url && !url.startsWith('/api/uploads/') && !/^https:\/\//.test(url)) return;
        props.url = url;
        props.title = str(d.props?.title, 80);
      }
      const obj: MapObject = { id: `decor_${newId()}`, type, x, y, ownerDeskId: desk.id, ...(Object.keys(props).length ? { props } : {}) };
      this.map.objects.push(obj);
      this.rebuildIndexes();
      await patchCurrentMap(this.office, this.map);
      this.broadcast('map:patch', { add: [obj], remove: [] });
    });

    this.on('decor:remove', async (p, d) => {
      if (!p.state.deskId) return;
      const id = String(d.id ?? '');
      const obj = this.map.objects.find((o) => o.id === id);
      if (!obj || obj.ownerDeskId !== p.state.deskId) return;
      this.map.objects = this.map.objects.filter((o) => o.id !== id);
      this.rebuildIndexes();
      await patchCurrentMap(this.office, this.map);
      this.broadcast('map:patch', { add: [], remove: [id] });
    });

    // ----- quadro branco -----
    this.on('wb:open', async (p, d) => {
      const objectId = String(d.objectId ?? '');
      const obj = this.map.objects.find((o) => o.id === objectId && OBJECT_DEFS[o.type]?.interact === 'whiteboard');
      if (!obj) return;
      const wb = await this.whiteboard(objectId);
      p.whiteboards.add(objectId);
      p.client.send('wb:scene', { objectId, elements: [...wb.elements.values()] });
    });

    this.on('wb:update', async (p, d) => {
      const objectId = String(d.objectId ?? '');
      if (!p.whiteboards.has(objectId) || !Array.isArray(d.elements) || d.elements.length > 5000) return;
      const wb = await this.whiteboard(objectId);
      const accepted: any[] = [];
      for (const el of d.elements) {
        if (!el || typeof el.id !== 'string') continue;
        const cur = wb.elements.get(el.id);
        if (!cur || (el.version ?? 0) > (cur.version ?? 0) || ((el.version ?? 0) === (cur.version ?? 0) && (el.versionNonce ?? 0) < (cur.versionNonce ?? 0))) {
          wb.elements.set(el.id, el);
          accepted.push(el);
        }
      }
      if (!accepted.length) return;
      wb.dirty = true;
      for (const o of this.players.values()) if (o !== p && o.whiteboards.has(objectId)) o.client.send('wb:update', { objectId, elements: accepted });
    });

    this.on('wb:close', (p, d) => {
      p.whiteboards.delete(String(d.objectId ?? ''));
    });

    // ----- rádio -----
    this.on('music:open', (p, d) => {
      if (!can(p.state.role, 'music.dj')) return;
      const ids = this.videoIds(d);
      if (!ids.length) {
        p.client.send('notice', { code: 'music_invalid' });
        return;
      }
      this.musicLeave(p.state.id, false);
      const ch: MusicChannel = {
        id: newId(),
        name: str(d.name, 40) || `Rádio de ${p.state.name}`,
        djId: p.state.id,
        djName: p.state.name,
        queue: ids.map((videoId, i) => ({ videoId, addedBy: p.state.name, ...(i === 0 && str(d.title, 120) ? { title: str(d.title, 120) } : {}) })),
        index: 0,
        playing: true,
        position: 0,
        updatedAt: Date.now(),
        locked: false,
        listeners: [p.state.id],
      };
      this.music.set(ch.id, ch);
      this.broadcastMusic();
    });

    this.on('music:join', (p, d) => {
      const ch = this.music.get(String(d.id ?? ''));
      if (!ch) return;
      this.musicLeave(p.state.id, false);
      if (!ch.listeners.includes(p.state.id)) ch.listeners.push(p.state.id);
      this.broadcastMusic();
    });

    this.on('music:leave', (p) => {
      this.musicLeave(p.state.id, false);
      this.broadcastMusic();
    });

    this.on('music:add', (p, d) => {
      const ch = this.music.get(String(d.id ?? ''));
      if (!ch || !ch.listeners.includes(p.state.id)) return;
      if (ch.locked && ch.djId !== p.state.id && !isAdminRole(p.state.role)) {
        p.client.send('notice', { code: 'music_locked' });
        return;
      }
      const ids = this.videoIds(d);
      if (!ids.length) {
        p.client.send('notice', { code: 'music_invalid' });
        return;
      }
      for (const videoId of ids) if (ch.queue.length < 300) ch.queue.push({ videoId, addedBy: p.state.name });
      this.broadcastMusic();
    });

    this.on('music:meta', (p, d) => {
      const ch = this.music.get(String(d.id ?? ''));
      const title = str(d.title, 120);
      if (!ch || !title || !ch.listeners.includes(p.state.id)) return;
      let changed = false;
      for (const t of ch.queue) {
        if (t.videoId === d.videoId && !t.title) {
          t.title = title;
          changed = true;
        }
      }
      if (changed) this.broadcastMusic();
    });

    this.on('music:ended', (p, d) => {
      const ch = this.music.get(String(d.id ?? ''));
      if (!ch || !ch.listeners.includes(p.state.id)) return;
      const cur = ch.queue[ch.index];
      // evita avanço duplo: só aceita se for a faixa atual e já tiver tocado algum tempo
      if (!cur || cur.videoId !== d.videoId || musicPosition(ch, Date.now()) < 5) return;
      this.musicGoto(ch, ch.index + 1);
      this.broadcastMusic();
    });

    this.on('music:control', (p, d) => {
      const ch = this.music.get(String(d.id ?? ''));
      if (!ch) return;
      if (ch.djId !== p.state.id && !isAdminRole(p.state.role)) return;
      const now = Date.now();
      switch (d.action) {
        case 'play':
          if (!ch.playing) {
            ch.playing = true;
            ch.updatedAt = now;
          }
          break;
        case 'pause':
          if (ch.playing) {
            ch.position = musicPosition(ch, now);
            ch.playing = false;
            ch.updatedAt = now;
          }
          break;
        case 'seek':
          ch.position = Math.max(0, Number(d.value) || 0);
          ch.updatedAt = now;
          break;
        case 'next':
          this.musicGoto(ch, ch.index + 1);
          break;
        case 'prev':
          this.musicGoto(ch, ch.index - 1);
          break;
        case 'jump':
          this.musicGoto(ch, Math.floor(Number(d.value) || 0));
          break;
        case 'remove': {
          const i = Math.floor(Number(d.value));
          if (i >= 0 && i < ch.queue.length && i !== ch.index && ch.queue.length > 1) {
            ch.queue.splice(i, 1);
            if (i < ch.index) ch.index--;
          }
          break;
        }
        case 'lock':
          ch.locked = true;
          break;
        case 'unlock':
          ch.locked = false;
          break;
        case 'close':
          this.music.delete(ch.id);
          break;
        default:
          return;
      }
      this.broadcastMusic();
    });
  }

  private videoIds(d: any): string[] {
    const out: string[] = [];
    const ref = typeof d.url === 'string' ? parseYouTubeUrl(d.url) : null;
    if (ref?.videoId) out.push(ref.videoId);
    if (Array.isArray(d.videoIds)) {
      for (const v of d.videoIds.slice(0, 200)) if (typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v) && !out.includes(v)) out.push(v);
    }
    return out;
  }

  private musicGoto(ch: MusicChannel, index: number) {
    const n = ch.queue.length;
    ch.index = ((index % n) + n) % n;
    ch.position = 0;
    ch.playing = true;
    ch.updatedAt = Date.now();
  }

  private musicLeave(id: string, leftOffice: boolean) {
    let changed = false;
    for (const ch of [...this.music.values()]) {
      const i = ch.listeners.indexOf(id);
      if (i >= 0) {
        ch.listeners.splice(i, 1);
        changed = true;
      }
      if (ch.djId === id && (leftOffice || i >= 0)) {
        const next = ch.listeners.map((l) => this.players.get(l)).find((l) => l && can(l.state.role, 'music.dj'));
        if (next) {
          ch.djId = next.state.id;
          ch.djName = next.state.name;
        } else if (leftOffice || ch.listeners.length === 0) {
          this.music.delete(ch.id);
        }
        changed = true;
      }
    }
    if (changed && leftOffice) this.broadcastMusic();
  }

  private broadcastMusic() {
    this.broadcast('music', [...this.music.values()]);
  }

  private async whiteboard(objectId: string) {
    let wb = this.wbCache.get(objectId);
    if (!wb) {
      const [row] = await db()
        .select()
        .from(schema.whiteboards)
        .where(and(eq(schema.whiteboards.officeId, this.officeId), eq(schema.whiteboards.objectId, objectId)));
      wb = { elements: new Map((row?.elements ?? []).map((e: any) => [e.id, e])), dirty: false };
      this.wbCache.set(objectId, wb);
    }
    return wb;
  }

  private flushWhiteboards() {
    for (const [objectId, wb] of this.wbCache) {
      if (!wb.dirty) continue;
      wb.dirty = false;
      // elementos apagados há muito tempo não precisam ser guardados
      const elements = [...wb.elements.values()].filter((e) => !e.isDeleted);
      db()
        .insert(schema.whiteboards)
        .values({ officeId: this.officeId, objectId, elements, updatedAt: Date.now() })
        .onConflictDoUpdate({ target: [schema.whiteboards.officeId, schema.whiteboards.objectId], set: { elements, updatedAt: Date.now() } })
        .catch((e) => console.error('[quadro] falha ao salvar', e));
    }
  }
}

export function publicSettings(office: OfficeRow) {
  const s = officeSettings(office.settings);
  return { awayMinutes: s.awayMinutes, notesRestrictedToAdmins: s.notesRestrictedToAdmins, monitoringNotice: s.monitoringNotice };
}
