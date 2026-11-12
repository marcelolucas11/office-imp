import { and, eq, isNull, sql } from 'drizzle-orm';
import type { TrackedStatus } from '@office-imp/shared';
import { db, schema } from '../db';
import { newId } from '../lib/crypto';
import { getSetting, setSetting } from '../lib/settings';

const log = (e: unknown) => console.error('[analytics] falha ao gravar', e);

/**
 * Registra, no servidor, presença, intervalos de status e segmentos de chamada
 * (um por par de pessoas). Os horários vêm sempre do relógio do servidor.
 */
export class Tracker {
  private presence = new Map<string, string>();
  private status = new Map<string, { id: string; status: TrackedStatus }>();
  private calls = new Map<string, { id: string; a: string; b: string; start: number; areaName: string | null }>();

  constructor(private officeId: string) {}

  join(subject: { id: string; name: string; role: string }, status: TrackedStatus) {
    const now = Date.now();
    const id = newId();
    this.presence.set(subject.id, id);
    db().insert(schema.presenceSessions).values({ id, officeId: this.officeId, subjectId: subject.id, subjectName: subject.name, role: subject.role, start: now, end: null }).catch(log);
    this.openStatus(subject.id, status, now);
  }

  private openStatus(subjectId: string, status: TrackedStatus, now: number) {
    const id = newId();
    this.status.set(subjectId, { id, status });
    db().insert(schema.statusIntervals).values({ id, officeId: this.officeId, subjectId, status, start: now, end: null }).catch(log);
  }

  setStatus(subjectId: string, status: TrackedStatus) {
    const cur = this.status.get(subjectId);
    if (!cur || cur.status === status) return;
    const now = Date.now();
    db().update(schema.statusIntervals).set({ end: now }).where(eq(schema.statusIntervals.id, cur.id)).catch(log);
    this.openStatus(subjectId, status, now);
  }

  currentStatus(subjectId: string): TrackedStatus | null {
    return this.status.get(subjectId)?.status ?? null;
  }

  /** Atualiza o grafo de chamadas: abre segmentos novos e fecha os que terminaram. */
  setEdges(edges: Map<string, { a: string; b: string; room: string }>, areaInfo: (room: string) => { id: string | null; name: string | null }) {
    const now = Date.now();
    for (const [key, seg] of this.calls) {
      if (!edges.has(key)) {
        this.calls.delete(key);
        db().update(schema.callSegments).set({ end: now }).where(eq(schema.callSegments.id, seg.id)).catch(log);
      }
    }
    for (const [key, e] of edges) {
      if (this.calls.has(key)) continue;
      const id = newId();
      const area = areaInfo(e.room);
      this.calls.set(key, { id, a: e.a, b: e.b, start: now, areaName: area.name });
      db().insert(schema.callSegments).values({ id, officeId: this.officeId, a: e.a, b: e.b, areaId: area.id, areaName: area.name, start: now, end: null }).catch(log);
    }
  }

  inCall(subjectId: string): boolean {
    for (const c of this.calls.values()) if (c.a === subjectId || c.b === subjectId) return true;
    return false;
  }

  leave(subjectId: string) {
    const now = Date.now();
    const p = this.presence.get(subjectId);
    if (p) {
      this.presence.delete(subjectId);
      db().update(schema.presenceSessions).set({ end: now }).where(eq(schema.presenceSessions.id, p)).catch(log);
    }
    const s = this.status.get(subjectId);
    if (s) {
      this.status.delete(subjectId);
      db().update(schema.statusIntervals).set({ end: now }).where(eq(schema.statusIntervals.id, s.id)).catch(log);
    }
    for (const [key, seg] of this.calls) {
      if (seg.a === subjectId || seg.b === subjectId) {
        this.calls.delete(key);
        db().update(schema.callSegments).set({ end: now }).where(eq(schema.callSegments.id, seg.id)).catch(log);
      }
    }
  }

  closeAll() {
    for (const id of [...this.presence.keys()]) this.leave(id);
  }
}

/** Batimento: grava periodicamente "o servidor estava vivo às X" para fechar intervalos após uma queda. */
export async function heartbeat() {
  await setSetting('heartbeat', { at: Date.now() }).catch(log);
}

/** Na inicialização, fecha intervalos que ficaram abertos por uma queda do servidor. */
export async function closeDanglingIntervals() {
  const hb = (await getSetting<{ at: number }>('heartbeat'))?.at ?? Date.now();
  const d = db();
  await d.update(schema.presenceSessions).set({ end: sql`GREATEST(${schema.presenceSessions.start}, ${hb})` }).where(isNull(schema.presenceSessions.end));
  await d.update(schema.statusIntervals).set({ end: sql`GREATEST(${schema.statusIntervals.start}, ${hb})` }).where(isNull(schema.statusIntervals.end));
  await d.update(schema.callSegments).set({ end: sql`GREATEST(${schema.callSegments.start}, ${hb})` }).where(isNull(schema.callSegments.end));
  await d
    .update(schema.meetings)
    .set({ status: 'failed', error: 'O servidor reiniciou durante a gravação.', end: hb })
    .where(and(eq(schema.meetings.status, 'recording'), isNull(schema.meetings.end)));
}
