// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import {
  ACTIVITIES,
  SLEEP_REASONS,
  activitySegments,
  addDays,
  aggregateAnalytics,
  bucketActivity,
  dayRange,
  localDate,
  localHour,
  sumActivity,
  unionMs,
  workedMs,
  type Activity,
  type ActivitySegment,
  type EndReason,
  type PersonRow,
} from '@office-imp/shared';
import { db, schema } from '../db';
import { hub } from '../realtime/hub';
import { getOffice } from './offices';

function overlapping(table: { officeId: any; start: any; end: any }, officeId: string, from: number, to: number) {
  return and(eq(table.officeId, officeId), lt(table.start, to), or(isNull(table.end), gt(table.end, from)));
}

export async function officeAnalytics(officeId: string, fromDate?: string, toDate?: string): Promise<{ from: string; to: string; timezone: string; now: number; rows: PersonRow[] }> {
  const office = await getOffice(officeId);
  const today = localDate(Date.now(), office.timezone);
  const ok = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today);
  let fromD = ok(fromDate);
  let toD = ok(toDate ?? fromDate);
  if (toD < fromD) [fromD, toD] = [toD, fromD];
  const [from, to] = dayRange(fromD, toD, office.timezone);
  const now = Date.now();
  const d = db();
  const presence = await d.select().from(schema.presenceSessions).where(overlapping(schema.presenceSessions, officeId, from, to));
  const statuses = await d.select().from(schema.statusIntervals).where(overlapping(schema.statusIntervals, officeId, from, to));
  const calls = await d.select().from(schema.callSegments).where(overlapping(schema.callSegments, officeId, from, to));
  const idles = await d.select().from(schema.idleIntervals).where(overlapping(schema.idleIntervals, officeId, from, to));
  const rows = aggregateAnalytics({ from, to, now, presence, statuses, calls, idles });
  const live = hub.room(officeId)?.liveState();
  for (const r of rows) r.current = live?.get(r.id) ?? null;
  return { from: fromD, to: toD, timezone: office.timezone, now, rows };
}

const validDate = (d?: string) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
/** Segunda-feira da semana de `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export interface PersonSession {
  start: number;
  end: number | null;
  startReason: string;
  endReason: string | null;
  client: string | null;
}

export interface PersonStats {
  span: 'day' | 'week';
  date: string;
  from: number;
  to: number;
  now: number;
  timezone: string;
  name: string;
  role: string;
  online: boolean;
  totals: Record<Activity, number>;
  onlineMs: number;
  workMs: number;
  callMs: number;
  sleepExits: number;
  /** Uma faixa por hora (dia) ou por dia (semana). */
  buckets: { start: number; end: number; label: string; date?: string; ms: Record<Activity, number> }[];
  /** Linha do tempo por categoria (contínua). */
  segments: ActivitySegment[];
  /** Entradas e saídas, com o motivo. */
  sessions: PersonSession[];
  calls: { with: string; area: string; start: number; end: number | null }[];
  /** Semana: resumo de cada dia. */
  days: { date: string; first: number | null; last: number | null; stillOnline: boolean; onlineMs: number; workMs: number; ms: Record<Activity, number>; sleepExits: number }[];
}

/** Estatísticas de uma pessoa: um dia (de hora em hora) ou a semana de segunda a domingo (dia a dia). */
export async function personStats(officeId: string, subjectId: string, date?: string, span: 'day' | 'week' = 'day'): Promise<PersonStats> {
  const office = await getOffice(officeId);
  const tz = office.timezone;
  const now = Date.now();
  const day = validDate(date) ? date! : localDate(now, tz);
  const firstDay = span === 'week' ? weekStart(day) : day;
  const lastDay = span === 'week' ? addDays(firstDay, 6) : day;
  const [from, to] = dayRange(firstDay, lastDay, tz);
  const d = db();
  const mine = <T extends { subjectId: string }>(rows: T[]) => rows.filter((r) => r.subjectId === subjectId);
  const allPresence = await d.select().from(schema.presenceSessions).where(overlapping(schema.presenceSessions, officeId, from, to));
  const presence = mine(allPresence).sort((a, b) => a.start - b.start);
  const statuses = mine(await d.select().from(schema.statusIntervals).where(overlapping(schema.statusIntervals, officeId, from, to)));
  const idles = mine(await d.select().from(schema.idleIntervals).where(overlapping(schema.idleIntervals, officeId, from, to)));
  const allCalls = (await d.select().from(schema.callSegments).where(overlapping(schema.callSegments, officeId, from, to))).filter((c) => c.a === subjectId || c.b === subjectId);
  const names = new Map(allPresence.map((p) => [p.subjectId, p.subjectName]));
  const segments = activitySegments({ presence, statuses, calls: allCalls, idles }, from, to, now);
  const totals = sumActivity(segments);
  const callMs = unionMs(allCalls.map((c) => ({ s: Math.max(c.start, from), e: Math.min(c.end ?? now, to, now) })));

  // faixas: horas do dia ou dias da semana (no fuso do escritório)
  const bounds: number[] = [];
  const labels: { label: string; date?: string }[] = [];
  if (span === 'day') {
    for (let t = from; t < to; t += 3600_000) {
      bounds.push(t);
      labels.push({ label: `${String(Math.floor(localHour(t, tz))).padStart(2, '0')}h` });
    }
  } else {
    const WD = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
    for (let i = 0; i < 7; i++) {
      const dd = addDays(firstDay, i);
      bounds.push(dayRange(dd, dd, tz)[0]);
      labels.push({ label: `${WD[i]} ${dd.slice(8, 10)}/${dd.slice(5, 7)}`, date: dd });
    }
  }
  bounds.push(to);
  const per = bucketActivity(segments, bounds);
  const buckets = per.map((ms, i) => ({ start: bounds[i], end: bounds[i + 1], ...labels[i], ms }));

  const sessions: PersonSession[] = presence.map((p) => ({ start: p.start, end: p.end, startReason: p.startReason ?? 'open', endReason: p.end === null ? null : (p.endReason ?? 'connection_lost'), client: p.client }));
  const isSleep = (r: string | null) => SLEEP_REASONS.includes(r as EndReason);
  const days =
    span === 'week'
      ? buckets.map((b) => {
          const inDay = presence.filter((p) => p.start < b.end && (p.end ?? now) > b.start);
          const onlineMs = ACTIVITIES.reduce((n, a) => n + b.ms[a], 0);
          return {
            date: b.date!,
            first: inDay.length ? Math.max(inDay[0].start, b.start) : null,
            last: inDay.length ? Math.min(inDay[inDay.length - 1].end ?? now, b.end) : null,
            stillOnline: inDay.some((p) => p.end === null),
            onlineMs,
            workMs: workedMs(b.ms),
            ms: b.ms,
            sleepExits: inDay.filter((p) => p.end !== null && p.end >= b.start && p.end < b.end && isSleep(p.endReason)).length,
          };
        })
      : [];
  const live = hub.room(officeId)?.liveState().get(subjectId);
  const userRow = presence[0] ?? allPresence.find((p) => p.subjectId === subjectId);
  return {
    span,
    date: day,
    from,
    to,
    now,
    timezone: tz,
    name: userRow?.subjectName ?? names.get(subjectId) ?? subjectId,
    role: userRow?.role ?? '',
    online: Boolean(live),
    totals,
    onlineMs: ACTIVITIES.reduce((n, a) => n + totals[a], 0),
    workMs: workedMs(totals),
    callMs,
    sleepExits: sessions.filter((p) => p.end !== null && p.end >= from && p.end < to && isSleep(p.endReason)).length,
    buckets,
    segments,
    sessions,
    calls:
      span === 'day'
        ? allCalls
            .map((c) => ({ with: names.get(c.a === subjectId ? c.b : c.a) ?? (c.a === subjectId ? c.b : c.a), area: c.areaName ?? 'Área aberta', start: c.start, end: c.end }))
            .sort((a, b) => a.start - b.start)
        : [],
    days,
  };
}

const hm = (ms: number) => {
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

export function analyticsCsv(rows: PersonRow[]): string {
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ['Pessoa', 'Papel', 'Online (h:mm)', 'Trabalhado (h:mm)', 'Disponível', 'Em call', 'Ocupado', 'Inativo', 'Não incomodar', 'Ausente', 'Saídas por tampa/suspensão', 'Com quem', 'Onde'];
  const lines = rows.map((r) =>
    [
      r.name,
      r.role,
      hm(r.onlineMs),
      hm(r.activeMs),
      hm(r.activity.AVAILABLE),
      hm(r.activity.CALL),
      hm(r.activity.BUSY),
      hm(r.activity.IDLE),
      hm(r.activity.DND),
      hm(r.activity.AWAY),
      String(r.sleepExits),
      r.callWith.map((c) => `${c.name} (${hm(c.ms)})`).join(' | '),
      r.callAreas.map((c) => `${c.name} (${hm(c.ms)})`).join(' | '),
    ]
      .map(esc)
      .join(';'),
  );
  return `\uFEFF${head.join(';')}\n${lines.join('\n')}\n`;
}
