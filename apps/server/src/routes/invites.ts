import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DEFAULT_AVATAR } from '@office-imp/shared';
import { config } from '../config';
import { db, schema } from '../db';
import { audit } from '../lib/audit';
import { createSession, inviteUsable, requireOfficeAdmin, requireUser } from '../lib/auth';
import { newId, randomToken, sha256 } from '../lib/crypto';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { parse, z, zName } from '../lib/validate';
import { hub } from '../realtime/hub';
import { getOffice } from '../services/offices';

function inviteUrl(token: string) {
  return `${config.publicUrl}/convite/${token}`;
}

async function findInvite(token: string) {
  const [inv] = await db().select().from(schema.invites).where(eq(schema.invites.tokenHash, sha256(token)));
  return inv ?? null;
}

function state(inv: typeof schema.invites.$inferSelect): 'active' | 'revoked' | 'expired' | 'exhausted' {
  if (inv.revokedAt) return 'revoked';
  if (inv.expiresAt && inv.expiresAt <= Date.now()) return 'expired';
  if (inv.maxUses != null && inv.uses >= inv.maxUses) return 'exhausted';
  return 'active';
}

export async function inviteRoutes(app: FastifyInstance) {
  app.get('/api/offices/:id/invites', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'invite.manage');
    const rows = await db().select().from(schema.invites).where(eq(schema.invites.officeId, id)).orderBy(desc(schema.invites.createdAt));
    const room = hub.room(id);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      expiresAt: r.expiresAt,
      maxUses: r.maxUses,
      uses: r.uses,
      revokedAt: r.revokedAt,
      createdByName: r.createdByName,
      createdAt: r.createdAt,
      state: state(r),
      onlineNow: room ? [...room.players.values()].filter((p) => p.inviteId === r.id).length : 0,
    }));
  });

  app.post('/api/offices/:id/invites', async (req) => {
    const { id } = req.params as { id: string };
    const u = requireOfficeAdmin(req, id, 'invite.manage');
    await getOffice(id);
    const body = parse(
      z.object({
        kind: z.enum(['EMPLOYEE', 'GUEST']),
        label: z.string().trim().max(60).optional(),
        expiresAt: z.number().int().nullable().optional(),
        maxUses: z.number().int().min(1).max(10000).nullable().optional(),
      }),
      req.body,
    );
    if (body.kind === 'GUEST' && body.expiresAt != null && body.expiresAt <= Date.now()) throw badRequest('A data de expiração precisa estar no futuro.');
    if (body.kind === 'EMPLOYEE') {
      // um link permanente por escritório: gerar de novo revoga o anterior
      await db()
        .update(schema.invites)
        .set({ revokedAt: Date.now() })
        .where(and(eq(schema.invites.officeId, id), eq(schema.invites.kind, 'EMPLOYEE'), sql`${schema.invites.revokedAt} is null`));
    }
    const token = randomToken(32);
    const inviteId = newId();
    await db().insert(schema.invites).values({
      id: inviteId,
      officeId: id,
      kind: body.kind,
      tokenHash: sha256(token),
      label: body.label || null,
      expiresAt: body.kind === 'GUEST' ? (body.expiresAt ?? null) : null,
      maxUses: body.kind === 'GUEST' ? (body.maxUses ?? null) : null,
      createdBy: u.id,
      createdByName: u.name,
      createdAt: Date.now(),
    });
    await audit(u, 'invite.create', { officeId: id, target: inviteId, meta: { kind: body.kind, expiresAt: body.expiresAt ?? null, maxUses: body.maxUses ?? null } });
    // o link só é mostrado agora: no banco fica apenas o hash
    return { id: inviteId, url: inviteUrl(token), token };
  });

  app.post('/api/offices/:id/invites/:inviteId/revoke', async (req) => {
    const { id, inviteId } = req.params as { id: string; inviteId: string };
    const u = requireOfficeAdmin(req, id, 'invite.manage');
    const [inv] = await db()
      .select()
      .from(schema.invites)
      .where(and(eq(schema.invites.id, inviteId), eq(schema.invites.officeId, id)));
    if (!inv) throw notFound('Convite não encontrado.');
    await db().update(schema.invites).set({ revokedAt: Date.now() }).where(eq(schema.invites.id, inviteId));
    if (inv.kind === 'GUEST') {
      // encerra na hora as sessões de convidados que entraram por este link
      const gs = await db().select().from(schema.guests).where(eq(schema.guests.inviteId, inviteId));
      for (const g of gs) await db().delete(schema.sessions).where(eq(schema.sessions.guestId, g.id));
      await db().update(schema.guests).set({ endedAt: Date.now() }).where(eq(schema.guests.inviteId, inviteId));
      hub.kickInvite(inviteId, 'invite_revoked');
    }
    await audit(u, 'invite.revoke', { officeId: id, target: inviteId, meta: { kind: inv.kind } });
    return { ok: true };
  });

  // ---- público: o que é este link? ----
  app.get('/api/invites/:token', { config: { rateLimit: { max: 60, timeWindow: '5 minutes' } } }, async (req) => {
    const inv = await findInvite((req.params as { token: string }).token);
    if (!inv) throw notFound('Este link de convite não existe.');
    const st = state(inv);
    const office = await getOffice(inv.officeId);
    return { kind: inv.kind, state: st, office: { name: office.name, slug: office.slug }, expiresAt: inv.expiresAt, notice: st === 'active' ? (await import('../lib/settings')).officeSettings(office.settings).monitoringNotice : null };
  });

  // ---- funcionário: ativa o acesso ao escritório depois de logar ----
  app.post('/api/invites/:token/accept', async (req) => {
    const u = requireUser(req);
    const inv = await findInvite((req.params as { token: string }).token);
    if (!inv || inv.kind !== 'EMPLOYEE') throw notFound('Este link de convite não existe.');
    if (!inviteUsable(inv)) throw forbidden('Este link de convite não é mais válido. Peça um novo ao administrador.', 'invite_invalid');
    const office = await getOffice(inv.officeId);
    if (u.role === 'OWNER') return { slug: office.slug };
    if (!u.officeIds.includes(inv.officeId)) throw forbidden('A sua conta não foi atribuída a este escritório. Fale com o administrador.', 'not_member');
    if (!u.activatedOfficeIds.includes(inv.officeId)) {
      await db()
        .update(schema.officeMembers)
        .set({ activated: true })
        .where(and(eq(schema.officeMembers.officeId, inv.officeId), eq(schema.officeMembers.userId, u.id)));
      await db().update(schema.invites).set({ uses: sql`${schema.invites.uses} + 1` }).where(eq(schema.invites.id, inv.id));
    }
    return { slug: office.slug };
  });

  // ---- convidado: entra só com um nome ----
  app.post('/api/invites/:token/guest', { config: { rateLimit: { max: 30, timeWindow: '5 minutes' } } }, async (req, reply) => {
    const body = parse(z.object({ displayName: zName, acceptNotice: z.literal(true) }), req.body);
    const inv = await findInvite((req.params as { token: string }).token);
    if (!inv || inv.kind !== 'GUEST') throw notFound('Este link de convite não existe.');
    const st = state(inv);
    if (st !== 'active') throw forbidden(st === 'expired' ? 'Este link de convite expirou.' : st === 'exhausted' ? 'Este link já atingiu o limite de usos.' : 'Este link de convite foi revogado.', 'invite_invalid');
    const upd = await db()
      .update(schema.invites)
      .set({ uses: sql`${schema.invites.uses} + 1` })
      .where(and(eq(schema.invites.id, inv.id), inv.maxUses != null ? sql`${schema.invites.uses} < ${inv.maxUses}` : sql`true`))
      .returning();
    if (!upd.length) throw forbidden('Este link já atingiu o limite de usos.', 'invite_invalid');
    const office = await getOffice(inv.officeId);
    const guestId = `g_${newId()}`;
    await db().insert(schema.guests).values({ id: guestId, inviteId: inv.id, officeId: inv.officeId, displayName: body.displayName, avatar: DEFAULT_AVATAR, createdAt: Date.now() });
    const ttl = inv.expiresAt ? Math.max(60_000, inv.expiresAt - Date.now()) : 12 * 3600_000;
    await createSession(reply, { guestId }, Math.min(ttl, 7 * 86400_000));
    return { slug: office.slug };
  });
}
