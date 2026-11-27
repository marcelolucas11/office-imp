// SPDX-License-Identifier: AGPL-3.0-only
import type { TrackedStatus } from './types';

export interface Interval {
  start: number;
  end: number | null;
}

/** Duração (ms) da sobreposição de um intervalo com a janela [from, to). Intervalos abertos usam `now`. */
export function overlapMs(iv: Interval, from: number, to: number, now: number): number {
  const s = Math.max(iv.start, from);
  const e = Math.min(iv.end ?? now, to, now);
  return Math.max(0, e - s);
}

/**
 * O que a pessoa estava fazendo em cada instante em que estava no escritório. Exclusivo (um por
 * instante), na prioridade: em call > ausente (manual) > inativo (sem usar o computador) > status.
 */
export type Activity = 'AVAILABLE' | 'CALL' | 'BUSY' | 'IDLE' | 'DND' | 'AWAY';
/** Ordem fixa das categorias (empilhamento dos gráficos e legendas). */
export const ACTIVITIES: Activity[] = ['AVAILABLE', 'CALL', 'BUSY', 'IDLE', 'DND', 'AWAY'];
export const ACTIVITY_LABEL: Record<Activity, string> = {
  AVAILABLE: 'Disponível',
  CALL: 'Em call',
  BUSY: 'Ocupado',
  IDLE: 'Inativo',
  DND: 'Não incomodar',
  AWAY: 'Ausente',
};
/** Cores dos gráficos (tema escuro), validadas para daltonismo na ordem de `ACTIVITIES`. */
export const ACTIVITY_COLOR: Record<Activity, string> = {
  AVAILABLE: '#0aac23',
  CALL: '#338ced',
  BUSY: '#d28e05',
  IDLE: '#9887ef',
  DND: '#eb6263',
  AWAY: '#8b8b98',
};
/** Sem mexer no mouse nem no teclado por este tempo (fora de call) = inativo. */
export const IDLE_AFTER_MS = 5 * 60_000;

export const emptyActivity = (): Record<Activity, number> => ({ AVAILABLE: 0, CALL: 0, BUSY: 0, IDLE: 0, DND: 0, AWAY: 0 });

/** Por que a pessoa saiu do escritório (o avatar sumiu do mapa). */
export type EndReason = 'left' | 'closed' | 'lid' | 'sleep_idle' | 'sleep' | 'sleep_detected' | 'shutdown' | 'connection_lost' | 'other_session' | 'kicked' | 'server_restart';
export const END_REASONS: EndReason[] = ['left', 'closed', 'lid', 'sleep_idle', 'sleep', 'sleep_detected', 'shutdown', 'connection_lost', 'other_session', 'kicked', 'server_restart'];
/** Saídas causadas pelo computador (tampa, suspensão, desligar) — não pela pessoa. */
export const SLEEP_REASONS: EndReason[] = ['lid', 'sleep_idle', 'sleep', 'sleep_detected', 'shutdown'];
export const END_REASON_LABEL: Record<EndReason, string> = {
  left: 'Saiu do escritório (botão Sair)',
  closed: 'Fechou o app ou a aba',
  lid: 'Fechou a tampa do notebook',
  sleep_idle: 'Computador entrou em suspensão por inatividade',
  sleep: 'Computador foi suspenso (menu ou botão de energia)',
  sleep_detected: 'Computador entrou em suspensão (detectado ao voltar)',
  shutdown: 'Computador desligado ou reiniciado',
  connection_lost: 'Perdeu a conexão com a internet',
  other_session: 'Entrou em outro aparelho',
  kicked: 'Removido pela administração',
  server_restart: 'O servidor reiniciou',
};
export const END_REASON_ICON: Record<EndReason, string> = {
  left: '🚪',
  closed: '✖️',
  lid: '💻',
  sleep_idle: '💤',
  sleep: '🌙',
  sleep_detected: '💤',
  shutdown: '⏻',
  connection_lost: '📶',
  other_session: '🔁',
  kicked: '⛔',
  server_restart: '🛠️',
};
export type StartReason = 'open' | 'resume' | 'reconnect';
export const START_REASONS: StartReason[] = ['open', 'resume', 'reconnect'];
export const START_REASON_LABEL: Record<StartReason, string> = {
  open: 'Entrou no escritório',
  resume: 'Voltou: o computador acordou',
  reconnect: 'Voltou: a conexão voltou',
};
export const CLIENT_LABEL: Record<string, string> = { mac: 'app do Mac', win: 'app do Windows', linux: 'app do Linux', web: 'navegador' };

export interface ActivitySegment {
  start: number;
  end: number;
  act: Activity;
}

/**
 * Linha do tempo de uma pessoa por categoria (`Activity`), recortada em [from, to) e até `now`.
 * Só conta os instantes em que ela estava no escritório. Varredura por eventos (O(n log n)).
 */
export function activitySegments(
  input: { presence: Interval[]; statuses: { status: TrackedStatus; start: number; end: number | null }[]; calls: Interval[]; idles: Interval[] },
  from: number,
  to: number,
  now: number,
): ActivitySegment[] {
  const lim = Math.min(to, now);
  type Ev = [number, number, number];
  // tipo: 0 presença, 1 call, 2 inativo, 3.. status
  const ST: TrackedStatus[] = ['AWAY', 'DND', 'BUSY', 'AVAILABLE'];
  const evs: Ev[] = [];
  const push = (iv: Interval, kind: number) => {
    const s = Math.max(iv.start, from);
    const e = Math.min(iv.end ?? now, lim);
    if (e <= s) return;
    evs.push([s, kind, 1], [e, kind, -1]);
  };
  for (const p of input.presence) push(p, 0);
  for (const c of input.calls) push(c, 1);
  for (const i of input.idles) push(i, 2);
  for (const s of input.statuses) push(s, 3 + ST.indexOf(s.status));
  evs.sort((a, b) => a[0] - b[0]);
  const cnt = new Array(3 + ST.length).fill(0);
  const out: ActivitySegment[] = [];
  for (let i = 0; i < evs.length; ) {
    const t = evs[i][0];
    while (i < evs.length && evs[i][0] === t) {
      cnt[evs[i][1]] += evs[i][2];
      i++;
    }
    if (i >= evs.length) break;
    const next = evs[i][0];
    if (cnt[0] <= 0 || next <= t) continue;
    let act: Activity;
    if (cnt[1] > 0) act = 'CALL';
    else if (cnt[3] > 0) act = 'AWAY';
    else if (cnt[2] > 0) act = 'IDLE';
    else act = cnt[4] > 0 ? 'DND' : cnt[5] > 0 ? 'BUSY' : 'AVAILABLE';
    const last = out[out.length - 1];
    if (last && last.act === act && last.end === t) last.end = next;
    else out.push({ start: t, end: next, act });
  }
  return out;
}

/** Soma (ms) de cada categoria dentro de cada faixa [b[i], b[i+1]). */
export function bucketActivity(segs: ActivitySegment[], bounds: number[]): Record<Activity, number>[] {
  const out = bounds.slice(0, -1).map(() => emptyActivity());
  for (const sg of segs) {
    for (let i = 0; i < bounds.length - 1; i++) {
      const s = Math.max(sg.start, bounds[i]);
      const e = Math.min(sg.end, bounds[i + 1]);
      if (e > s) out[i][sg.act] += e - s;
    }
  }
  return out;
}

export function sumActivity(segs: ActivitySegment[]): Record<Activity, number> {
  const out = emptyActivity();
  for (const s of segs) out[s.act] += s.end - s.start;
  return out;
}

/** Tempo trabalhado: online menos ausente e inativo. */
export const workedMs = (a: Record<Activity, number>) => a.AVAILABLE + a.CALL + a.BUSY + a.DND;

export interface PersonRow {
  id: string;
  name: string;
  role: string;
  onlineMs: number;
  /** Trabalhado: online menos ausente e inativo. */
  activeMs: number;
  /** Sem usar o computador por 5 min ou mais, fora de call. */
  idleMs: number;
  /** Tempo por categoria exclusiva (soma = online). */
  activity: Record<Activity, number>;
  /** Quantas vezes saiu por tampa fechada, suspensão ou computador desligado. */
  sleepExits: number;
  status: Record<TrackedStatus, number>;
  callMs: number;
  callWith: { id: string; name: string; ms: number }[];
  callAreas: { name: string; ms: number }[];
  current?: { status: TrackedStatus; area: string | null; inCall: boolean; idle?: boolean } | null;
}

export interface AnalyticsInput {
  from: number;
  to: number;
  now: number;
  presence: { subjectId: string; subjectName: string; role: string; start: number; end: number | null; endReason?: string | null }[];
  statuses: { subjectId: string; status: TrackedStatus; start: number; end: number | null }[];
  calls: { a: string; b: string; areaName: string | null; start: number; end: number | null }[];
  idles?: { subjectId: string; start: number; end: number | null }[];
}

/** União de intervalos (para não contar em dobro o tempo em chamada com várias pessoas). */
export function unionMs(ivs: { s: number; e: number }[]): number {
  const sorted = ivs.filter((i) => i.e > i.s).sort((a, b) => a.s - b.s);
  let total = 0;
  let curS = -1;
  let curE = -1;
  for (const iv of sorted) {
    if (iv.s > curE) {
      if (curE > curS) total += curE - curS;
      curS = iv.s;
      curE = iv.e;
    } else if (iv.e > curE) curE = iv.e;
  }
  if (curE > curS) total += curE - curS;
  return total;
}

export function aggregateAnalytics(input: AnalyticsInput): PersonRow[] {
  const { from, to, now } = input;
  const rows = new Map<string, PersonRow>();
  const names = new Map<string, string>();
  const row = (id: string, name: string, role: string): PersonRow => {
    let r = rows.get(id);
    if (!r) {
      r = { id, name, role, onlineMs: 0, activeMs: 0, idleMs: 0, activity: emptyActivity(), sleepExits: 0, status: { AVAILABLE: 0, BUSY: 0, DND: 0, AWAY: 0 }, callMs: 0, callWith: [], callAreas: [] };
      rows.set(id, r);
    }
    return r;
  };
  for (const p of input.presence) {
    names.set(p.subjectId, p.subjectName);
    const ms = overlapMs(p, from, to, now);
    if (ms <= 0) continue;
    const r = row(p.subjectId, p.subjectName, p.role);
    r.onlineMs += ms;
    if (p.end !== null && p.end >= from && p.end < to && SLEEP_REASONS.includes(p.endReason as EndReason)) r.sleepExits++;
  }
  for (const s of input.statuses) {
    const r = rows.get(s.subjectId);
    if (!r) continue;
    r.status[s.status] += overlapMs(s, from, to, now);
  }
  const callIv = new Map<string, { s: number; e: number }[]>();
  const withMap = new Map<string, Map<string, number>>();
  const areaMap = new Map<string, Map<string, number>>();
  const clip = (c: Interval) => ({ s: Math.max(c.start, from), e: Math.min(c.end ?? now, to, now) });
  for (const c of input.calls) {
    const iv = clip(c);
    if (iv.e <= iv.s) continue;
    for (const [me, other] of [
      [c.a, c.b],
      [c.b, c.a],
    ]) {
      if (!rows.has(me)) continue;
      if (!callIv.has(me)) callIv.set(me, []);
      callIv.get(me)!.push(iv);
      if (!withMap.has(me)) withMap.set(me, new Map());
      withMap.get(me)!.set(other, (withMap.get(me)!.get(other) ?? 0) + (iv.e - iv.s));
      const an = c.areaName ?? 'Área aberta';
      if (!areaMap.has(me)) areaMap.set(me, new Map());
      areaMap.get(me)!.set(an, (areaMap.get(me)!.get(an) ?? 0) + (iv.e - iv.s));
    }
  }
  const by = <T extends { subjectId: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) {
      if (!m.has(x.subjectId)) m.set(x.subjectId, []);
      m.get(x.subjectId)!.push(x);
    }
    return m;
  };
  const presBy = by(input.presence);
  const statBy = by(input.statuses);
  const idleBy = by(input.idles ?? []);
  const callBy = new Map<string, Interval[]>();
  for (const c of input.calls) for (const id of [c.a, c.b]) (callBy.get(id) ?? callBy.set(id, []).get(id)!).push(c);
  for (const r of rows.values()) {
    const segs = activitySegments({ presence: presBy.get(r.id) ?? [], statuses: statBy.get(r.id) ?? [], calls: callBy.get(r.id) ?? [], idles: idleBy.get(r.id) ?? [] }, from, to, now);
    r.activity = sumActivity(segs);
    r.idleMs = r.activity.IDLE;
    r.activeMs = workedMs(r.activity);
    r.callMs = unionMs(callIv.get(r.id) ?? []);
    r.callWith = [...(withMap.get(r.id) ?? new Map()).entries()]
      .map(([id, ms]) => ({ id, name: names.get(id) ?? rows.get(id)?.name ?? id, ms }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5);
    r.callAreas = [...(areaMap.get(r.id) ?? new Map()).entries()].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
