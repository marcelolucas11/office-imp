import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { aggregateAnalytics, dayRange, localDate, type PersonRow } from '@office-imp/shared';
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
  const rows = aggregateAnalytics({ from, to, now, presence, statuses, calls });
  const live = hub.room(officeId)?.liveState();
  for (const r of rows) r.current = live?.get(r.id) ?? null;
  return { from: fromD, to: toD, timezone: office.timezone, now, rows };
}

export async function personTimeline(officeId: string, subjectId: string, date?: string) {
  const office = await getOffice(officeId);
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate(Date.now(), office.timezone);
  const [from, to] = dayRange(day, day, office.timezone);
  const d = db();
  const presence = (await d.select().from(schema.presenceSessions).where(overlapping(schema.presenceSessions, officeId, from, to))).filter((p) => p.subjectId === subjectId);
  const statuses = (await d.select().from(schema.statusIntervals).where(overlapping(schema.statusIntervals, officeId, from, to))).filter((p) => p.subjectId === subjectId);
  const allCalls = await d.select().from(schema.callSegments).where(overlapping(schema.callSegments, officeId, from, to));
  const names = new Map((await d.select().from(schema.presenceSessions).where(overlapping(schema.presenceSessions, officeId, from, to))).map((p) => [p.subjectId, p.subjectName]));
  const calls = allCalls
    .filter((c) => c.a === subjectId || c.b === subjectId)
    .map((c) => {
      const other = c.a === subjectId ? c.b : c.a;
      return { with: names.get(other) ?? other, area: c.areaName ?? 'Área aberta', start: c.start, end: c.end };
    });
  return {
    date: day,
    from,
    to,
    now: Date.now(),
    timezone: office.timezone,
    name: presence[0]?.subjectName ?? names.get(subjectId) ?? subjectId,
    presence: presence.map((p) => ({ start: p.start, end: p.end })),
    statuses: statuses.map((s) => ({ status: s.status, start: s.start, end: s.end })),
    calls,
  };
}

const hm = (ms: number) => {
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

export function analyticsCsv(rows: PersonRow[]): string {
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ['Pessoa', 'Papel', 'Online (h:mm)', 'Ativo (h:mm)', 'Disponível', 'Ocupado', 'Não incomodar', 'Ausente', 'Em call', 'Com quem', 'Onde'];
  const lines = rows.map((r) =>
    [
      r.name,
      r.role,
      hm(r.onlineMs),
      hm(r.activeMs),
      hm(r.status.AVAILABLE),
      hm(r.status.BUSY),
      hm(r.status.DND),
      hm(r.status.AWAY),
      hm(r.callMs),
      r.callWith.map((c) => `${c.name} (${hm(c.ms)})`).join(' | '),
      r.callAreas.map((c) => `${c.name} (${hm(c.ms)})`).join(' | '),
    ]
      .map(esc)
      .join(';'),
  );
  return `﻿${head.join(';')}\n${lines.join('\n')}\n`;
}
