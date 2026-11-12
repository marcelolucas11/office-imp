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

export interface PersonRow {
  id: string;
  name: string;
  role: string;
  onlineMs: number;
  activeMs: number;
  status: Record<TrackedStatus, number>;
  callMs: number;
  callWith: { id: string; name: string; ms: number }[];
  callAreas: { name: string; ms: number }[];
  current?: { status: TrackedStatus; area: string | null; inCall: boolean } | null;
}

export interface AnalyticsInput {
  from: number;
  to: number;
  now: number;
  presence: { subjectId: string; subjectName: string; role: string; start: number; end: number | null }[];
  statuses: { subjectId: string; status: TrackedStatus; start: number; end: number | null }[];
  calls: { a: string; b: string; areaName: string | null; start: number; end: number | null }[];
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
      r = { id, name, role, onlineMs: 0, activeMs: 0, status: { AVAILABLE: 0, BUSY: 0, DND: 0, AWAY: 0 }, callMs: 0, callWith: [], callAreas: [] };
      rows.set(id, r);
    }
    return r;
  };
  for (const p of input.presence) {
    names.set(p.subjectId, p.subjectName);
    const ms = overlapMs(p, from, to, now);
    if (ms <= 0) continue;
    row(p.subjectId, p.subjectName, p.role).onlineMs += ms;
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
  for (const r of rows.values()) {
    r.activeMs = Math.max(0, r.onlineMs - r.status.AWAY);
    r.callMs = unionMs(callIv.get(r.id) ?? []);
    r.callWith = [...(withMap.get(r.id) ?? new Map()).entries()]
      .map(([id, ms]) => ({ id, name: names.get(id) ?? rows.get(id)?.name ?? id, ms }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5);
    r.callAreas = [...(areaMap.get(r.id) ?? new Map()).entries()].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
