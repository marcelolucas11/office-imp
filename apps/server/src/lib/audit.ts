import { db, schema } from '../db';
import { newId } from './crypto';

export async function audit(actor: { id: string; name: string }, action: string, opts: { officeId?: string | null; target?: string; meta?: Record<string, unknown> } = {}) {
  try {
    await db().insert(schema.auditLogs).values({
      id: newId(),
      officeId: opts.officeId ?? null,
      actorId: actor.id,
      actorName: actor.name,
      action,
      target: opts.target ?? null,
      meta: opts.meta ?? null,
      createdAt: Date.now(),
    });
  } catch (e) {
    console.error('[audit] falha ao registrar', e);
  }
}
