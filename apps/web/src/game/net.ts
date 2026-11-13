// SPDX-License-Identifier: AGPL-3.0-only
import { Client, type Room } from 'colyseus.js';
import { DIRS, type AvView, type ChatMessage, type DeskItem, type MapObject, type PlayerState, type Status } from '@office-imp/shared';
import { api, ApiError, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { desktop, toast } from '../lib/session';
import { bus } from './bus';
import { resetGame, useGame } from './store';

const NOTICES: Record<string, (d: any) => string> = {
  area_full: () => t('notice.areaFull', 'Esta sala está cheia.'),
  area_staff_only: () => t('notice.staffOnly', 'Área somente para a equipe.'),
  teleport_blocked: () => t('notice.teleportBlocked', 'Não foi possível ir até lá.'),
  wave_dnd: (d) => t('notice.waveDnd', '{{name}} está em "Não incomodar".', { name: d.name }),
  wave_sent: (d) => t('notice.waveSent', 'Você acenou para {{name}}.', { name: d.name }),
  door_blocked: () => t('notice.doorBlocked', 'Tem alguém na porta. Espere a pessoa passar para fechar.'),
  door_closed: () => t('notice.doorClosed', 'A porta está fechada. Aperte X perto dela para abrir.'),
  desk_taken: () => t('notice.deskTaken', 'Esta mesa já tem dono.'),
  desk_item_sent: (d) => t('notice.deskItemSent', 'Entregue na mesa de {{name}}.', { name: d.name }),
  decor_invalid: () => t('notice.decorInvalid', 'Não dá para colocar isso aí. Use a área da sua mesa.'),
  music_invalid: () => t('notice.musicInvalid', 'Link do YouTube inválido.'),
  music_locked: () => t('notice.musicLocked', 'O DJ bloqueou a fila.'),
  server_updating: () => t('notice.serverUpdating', 'O servidor será atualizado agora. A conexão volta em instantes.'),
};

class OfficeNet {
  private room: Room | null = null;
  private slug = '';
  private wanted = false;
  private retry = 0;
  private pingTimer: number | null = null;
  private retryTimer: number | null = null;
  private posBuf = new Map<string, [number, number, number]>();
  private posTimer: number | null = null;

  private flushPos() {
    this.posTimer = null;
    if (!this.posBuf.size) return;
    const players = { ...useGame.getState().players };
    for (const [id, [x, y, di]] of this.posBuf) {
      const p = players[id];
      if (p) players[id] = { ...p, x, y, dir: DIRS[di] ?? p.dir };
    }
    this.posBuf.clear();
    useGame.setState({ players });
  }

  async connect(slug: string) {
    this.wanted = true;
    this.slug = slug;
    resetGame();
    useGame.setState({ phase: 'connecting' });
    await this.open();
  }

  private async open() {
    if (!this.wanted) return;
    const g = useGame.getState();
    try {
      const enter = await api.post(`/api/offices/${this.slug}/enter`);
      useGame.setState({ office: enter.office, map: enter.map, mapRev: g.mapRev + 1, canAdmin: enter.canAdmin, livekitUrl: enter.livekitUrl });
      const client = new Client(`${location.protocol}//${location.host}/rt`);
      const room = await client.joinOrCreate('office', { officeId: enter.office.id, ticket: enter.ticket });
      if (!this.wanted) {
        void room.leave(true);
        return;
      }
      this.room = room;
      this.retry = 0;
      this.bind(room);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
        this.wanted = false;
        useGame.setState({ phase: 'error', error: e.message, errorCode: e.code });
        return;
      }
      this.scheduleRetry(errMsg(e));
    }
  }

  private scheduleRetry(_reason: string) {
    if (!this.wanted) return;
    this.retry++;
    useGame.setState({ phase: 'reconnecting' });
    this.retryTimer = window.setTimeout(() => void this.open(), Math.min(15000, 1000 * 2 ** Math.min(this.retry, 4)));
  }

  private bind(room: Room) {
    const set = useGame.setState;
    const get = useGame.getState;

    room.onMessage('init', (d) => {
      this.posBuf.clear();
      const players: Record<string, PlayerState> = {};
      for (const p of d.players as PlayerState[]) players[p.id] = p;
      const recordings: Record<string, string> = {};
      for (const r of d.recordings) recordings[r.areaId] = r.meetingId;
      const doors: Record<string, true> = {};
      for (const id of (d.doors ?? []) as string[]) doors[id] = true;
      set({ phase: 'online', meId: d.me, players, desks: d.desks, music: d.music, recordings, doors, deskItems: d.myDeskItems ?? [], timeOffset: d.now - Date.now() });
      bus.emit('players:reset');
      void this.loadHistory();
      const unseen = (d.myDeskItems ?? []).filter((i: DeskItem) => !i.seen).length;
      if (unseen) toast(t('desk.unseen', 'Você tem {{n}} recado(s) novo(s) na sua mesa.', { n: unseen }), 'info', { label: t('desk.open', 'Ver'), run: () => useGame.setState({ modal: { kind: 'myDesk' } }) }, 9000);
    });
    room.onMessage('pong', (d) => {
      const rtt = Date.now() - d.t;
      set({ timeOffset: d.now + rtt / 2 - Date.now() });
    });
    room.onMessage('join', (p: PlayerState) => {
      set({ players: { ...get().players, [p.id]: p } });
      bus.emit('player:join', p);
    });
    room.onMessage('leave', (d) => {
      const players = { ...get().players };
      delete players[d.id];
      set({ players, ...(get().following === d.id ? { following: null } : {}) });
      bus.emit('player:leave', d.id);
    });
    room.onMessage('moves', (list: [string, number, number, number][]) => {
      // a cena anda na hora; o estado do React (painéis, mini-mapa, áudio) só a cada 200 ms,
      // para não re-renderizar a interface 20 vezes por segundo enquanto alguém anda
      for (const [id, x, y, di] of list) this.posBuf.set(id, [x, y, di]);
      if (!this.posTimer) this.posTimer = window.setTimeout(() => this.flushPos(), 200);
      bus.emit('moves', list);
    });
    room.onMessage('tp', (d) => {
      this.posBuf.delete(d.id);
      const p = get().players[d.id];
      if (p) set({ players: { ...get().players, [d.id]: { ...p, x: d.x, y: d.y } } });
      bus.emit('tp', d);
    });
    room.onMessage('correct', (d) => {
      this.posBuf.delete(get().meId);
      const p = get().players[get().meId];
      if (p) set({ players: { ...get().players, [p.id]: { ...p, x: d.x, y: d.y } } });
      bus.emit('correct', d);
    });
    room.onMessage('update', (d) => {
      const p = get().players[d.id];
      if (!p) return;
      set({ players: { ...get().players, [d.id]: { ...p, ...d.patch } } });
      bus.emit('player:update', { id: d.id, patch: d.patch });
    });
    room.onMessage('av', (v: AvView) => {
      set({ av: v });
      bus.emit('av', v);
    });
    room.onMessage('desks', (desks) => {
      set({ desks });
      bus.emit('desks', desks);
    });
    room.onMessage('deskitem', (item: DeskItem) => {
      set({ deskItems: [item, ...get().deskItems] });
      toast(item.kind === 'gift' ? t('desk.gotGift', '{{name}} deixou um presente na sua mesa {{emoji}}', { name: item.authorName, emoji: item.emoji ?? '🎁' }) : t('desk.gotNote', '{{name}} deixou um recado na sua mesa.', { name: item.authorName }), 'info', {
        label: t('desk.open', 'Ver'),
        run: () => useGame.setState({ modal: { kind: 'myDesk' } }),
      });
    });
    room.onMessage('deskitems', (items: DeskItem[]) => set({ deskItems: items }));
    room.onMessage('chat', (m: ChatMessage) => {
      const g = get();
      const visible = g.panel === 'chat';
      set({ chat: [...g.chat.slice(-300), m], unread: visible || m.fromId === g.meId ? g.unread : g.unread + 1 });
      const me = g.players[g.meId];
      if (m.fromId !== g.meId && m.scope === 'dm' && me?.status !== 'DND') {
        if (!visible) toast(`${m.fromName}: ${m.text.slice(0, 80)}`, 'info', { label: t('chat.reply', 'Responder'), run: () => useGame.setState({ panel: 'chat', chatTab: 'dm', dmWith: m.fromId, unread: 0 }) });
        if (document.hidden) notify(m.fromName, m.text);
      }
    });
    room.onMessage('emote', (d) => bus.emit('emote', d));
    room.onMessage('door', (d: { id: string; open: boolean }) => {
      const doors = { ...get().doors };
      if (d.open) doors[d.id] = true;
      else delete doors[d.id];
      set({ doors });
      bus.emit('doors', d);
    });
    room.onMessage('wave', (d) => {
      const me = get().players[get().meId];
      if (me?.status === 'DND') return;
      bus.emit('sound', 'wave');
      toast(t('wave.got', '👋 {{name}} acenou para você.', { name: d.name }), 'info', { label: t('wave.goto', 'Ir até lá'), run: () => this.gotoPlayer(d.from) }, 9000);
      if (document.hidden) notify(t('wave.title', 'Aceno'), t('wave.got', '👋 {{name}} acenou para você.', { name: d.name }));
    });
    room.onMessage('lead', (d) => {
      toast(t('lead.ask', '{{name}} pediu para você segui-lo(a).', { name: d.name }), 'info', { label: t('lead.follow', 'Seguir'), run: () => useGame.setState({ following: d.from }) }, 10000);
    });
    room.onMessage('notice', (d) => {
      const f = NOTICES[d.code];
      if (f) toast(f(d), d.code.endsWith('_sent') ? 'ok' : 'info');
    });
    room.onMessage('rec', (d) => {
      const recordings = { ...get().recordings };
      if (d.active) recordings[d.areaId] = d.meetingId;
      else delete recordings[d.areaId];
      set({ recordings });
      const me = get().players[get().meId];
      if (me?.areaId === d.areaId) {
        bus.emit('sound', 'rec');
        toast(d.active ? t('rec.started', '🔴 O áudio desta sala está sendo gravado para as notas de reunião.') : t('rec.stopped', 'A gravação terminou. As notas serão enviadas à administração.'), 'info', undefined, 7000);
      }
    });
    room.onMessage('music', (music) => {
      set({ music });
      bus.emit('music', music);
    });
    room.onMessage('map', (d) => {
      this.posBuf.clear();
      const players: Record<string, PlayerState> = {};
      for (const p of d.players as PlayerState[]) players[p.id] = p;
      set({ map: d.map, mapRev: get().mapRev + 1, players });
      bus.emit('map');
      bus.emit('players:reset');
    });
    room.onMessage('map:patch', (d: { add: MapObject[]; remove: string[] }) => {
      const map = get().map;
      if (!map) return;
      const objects = map.objects.filter((o) => !d.remove.includes(o.id)).concat(d.add);
      set({ map: { ...map, objects }, mapRev: get().mapRev + 1 });
      bus.emit('map');
    });
    room.onMessage('office', (d) => {
      const o = get().office;
      if (o) set({ office: { ...o, name: d.name, settings: d.settings } });
    });
    room.onMessage('wb:scene', (d) => bus.emit('wb:scene', d));
    room.onMessage('wb:update', (d) => bus.emit('wb:update', d));
    room.onMessage('wb:file', (d) => bus.emit('wb:file', d));
    room.onMessage('forceUpdate', (d) => set({ forceUpdateAt: Date.now() + d.seconds * 1000 }));
    room.onMessage('kick', (d) => {
      this.wanted = false;
      set({ phase: 'kicked', kickReason: d.reason });
    });
    room.onMessage('*', () => {});

    room.onLeave(() => {
      this.stopPing();
      this.room = null;
      bus.emit('net:down');
      if (this.wanted) this.scheduleRetry('queda');
    });
    room.onError((code, message) => console.warn('[rede] erro', code, message));

    this.pingTimer = window.setInterval(() => this.send('ping', { t: Date.now() }), 10000);
    this.send('ping', { t: Date.now() });
  }

  private async loadHistory() {
    const office = useGame.getState().office;
    if (!office) return;
    try {
      const chat = await api.get<ChatMessage[]>(`/api/offices/${office.id}/chat`);
      useGame.setState({ chat });
    } catch {}
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  disconnect() {
    this.wanted = false;
    this.stopPing();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    void this.room?.leave(true);
    this.room = null;
    resetGame();
  }

  get online() {
    return Boolean(this.room);
  }

  send(type: string, data: unknown = {}) {
    try {
      this.room?.send(type, data);
    } catch {}
  }

  setStatus(status: Status) {
    this.send('status', { status });
    desktop?.setStatus(status);
  }

  gotoPlayer(id: string) {
    const p = useGame.getState().players[id];
    if (p) this.send('teleport', { x: p.x, y: p.y + 1 });
  }
}

function notify(title: string, body: string) {
  try {
    if (desktop) desktop.notify(title, body);
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: '/favicon.svg' });
  } catch {}
}

export const net = new OfficeNet();

bus.on('notice', (code: string) => {
  const f = NOTICES[code];
  if (f) toast(f({}), 'info');
});
