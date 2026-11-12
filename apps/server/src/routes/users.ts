import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { DEFAULT_AVATAR, canAssignOffice, canAssignRole, canManageUser, mapDesks, type OfficeMap } from '@office-imp/shared';
import { db, schema } from '../db';
import { audit } from '../lib/audit';
import { actorOf, requirePerm } from '../lib/auth';
import { hashPassword, newId } from '../lib/crypto';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { parse, z, zName, zPassword, zUsername } from '../lib/validate';
import { hub } from '../realtime/hub';
import { currentMap, getOffice, patchCurrentMap } from '../services/offices';

const zRole = z.enum(['OWNER', 'ADMIN', 'EMPLOYEE']);

async function targetInfo(id: string) {
  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, id));
  if (!user) throw notFound('Usuário não encontrado.');
  const members = await db().select().from(schema.officeMembers).where(eq(schema.officeMembers.userId, id));
  return { user, officeIds: members.map((m) => m.officeId) };
}

/** Libera a mesa de alguém e manda a decoração dela para os achados e perdidos. */
export async function releaseDesksOf(userId: string, userName: string, officeIds?: string[]) {
  const rows = await db()
    .select()
    .from(schema.desks)
    .where(officeIds ? and(eq(schema.desks.userId, userId), inArray(schema.desks.officeId, officeIds.length ? officeIds : ['-'])) : eq(schema.desks.userId, userId));
  for (const d of rows) {
    await db().update(schema.desks).set({ userId: null }).where(and(eq(schema.desks.officeId, d.officeId), eq(schema.desks.id, d.id)));
    try {
      const office = await getOffice(d.officeId);
      const room = hub.room(d.officeId);
      const map: OfficeMap = room?.map ?? (await currentMap(office)).map;
      const mine = map.objects.filter((o) => o.ownerDeskId === d.id);
      if (mine.length && mapDesks(map).some((x) => x.id === d.id)) {
        map.objects = map.objects.filter((o) => o.ownerDeskId !== d.id);
        await patchCurrentMap(office, map);
        await db().insert(schema.lostFound).values({ id: newId(), officeId: d.officeId, formerOwner: userName, deskId: d.id, items: mine, createdAt: Date.now() });
        if (room) await room.reloadMap();
      }
      await room?.reloadDesks();
    } catch (e) {
      console.error('[mesas] falha ao liberar mesa', e);
    }
  }
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/users', async (req) => {
    const u = requirePerm(req, 'user.manage');
    const actor = actorOf(u);
    const users = await db().select().from(schema.users);
    const members = await db().select().from(schema.officeMembers);
    const desks = await db().select().from(schema.desks);
    return users
      .map((x) => {
        const officeIds = members.filter((m) => m.userId === x.id).map((m) => m.officeId);
        return {
          id: x.id,
          username: x.username,
          displayName: x.displayName,
          role: x.role,
          officeIds,
          activatedOfficeIds: members.filter((m) => m.userId === x.id && m.activated).map((m) => m.officeId),
          totpEnabled: x.totpEnabled,
          mustChangePassword: x.mustChangePassword,
          createdAt: x.createdAt,
          deskIds: desks.filter((d) => d.userId === x.id).map((d) => `${d.officeId}:${d.id}`),
          manageable: canManageUser(actor, { id: x.id, role: x.role, officeIds }),
        };
      })
      .filter((x) => u.role === 'OWNER' || x.manageable || x.id === u.id)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
  });

  app.post('/api/users', async (req) => {
    const u = requirePerm(req, 'user.manage');
    const actor = actorOf(u);
    const body = parse(z.object({ username: zUsername, displayName: zName, password: zPassword, role: zRole, officeIds: z.array(z.string()).max(50).default([]) }), req.body);
    if (!canAssignRole(actor, body.role)) throw forbidden('Você não pode criar usuários com esse papel.');
    for (const o of body.officeIds) if (!canAssignOffice(actor, o)) throw forbidden('Você só pode atribuir escritórios que administra.');
    if (u.role === 'ADMIN' && body.officeIds.length === 0) throw badRequest('Escolha pelo menos um escritório para o funcionário.');
    const [dupe] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, body.username));
    if (dupe) throw conflict('Já existe um usuário com esse nome de usuário.', 'username_taken');
    const id = newId();
    await db().insert(schema.users).values({ id, username: body.username, displayName: body.displayName, passwordHash: await hashPassword(body.password), role: body.role, mustChangePassword: true, createdBy: u.id, createdAt: Date.now(), avatar: DEFAULT_AVATAR });
    if (body.officeIds.length) await db().insert(schema.officeMembers).values(body.officeIds.map((officeId) => ({ officeId, userId: id, activated: body.role !== 'EMPLOYEE' })));
    await audit(u, 'user.create', { target: body.username, meta: { role: body.role, officeIds: body.officeIds } });
    return { id };
  });

  app.patch('/api/users/:id', async (req) => {
    const u = requirePerm(req, 'user.manage');
    const actor = actorOf(u);
    const { id } = req.params as { id: string };
    const t = await targetInfo(id);
    if (!canManageUser(actor, { id, role: t.user.role, officeIds: t.officeIds })) throw forbidden('Você não pode gerenciar este usuário.');
    const body = parse(z.object({ displayName: zName.optional(), role: zRole.optional(), officeIds: z.array(z.string()).max(50).optional(), password: zPassword.optional(), resetTotp: z.boolean().optional() }), req.body);
    const set: Partial<typeof schema.users.$inferInsert> = {};
    if (body.displayName) set.displayName = body.displayName;
    if (body.role && body.role !== t.user.role) {
      if (u.role !== 'OWNER' || !canAssignRole(actor, body.role)) throw forbidden('Só o Dono pode mudar papéis.');
      if (id === u.id) throw badRequest('Você não pode mudar o seu próprio papel.');
      set.role = body.role;
      await audit(u, 'user.role', { target: t.user.username, meta: { from: t.user.role, to: body.role } });
    }
    if (body.password) {
      set.passwordHash = await hashPassword(body.password);
      set.mustChangePassword = true;
      await db().delete(schema.sessions).where(eq(schema.sessions.userId, id));
      await audit(u, 'user.password_reset', { target: t.user.username });
    }
    if (body.resetTotp) {
      set.totpEnabled = false;
      set.totpSecretEnc = null;
      set.recoveryCodes = [];
      await db().delete(schema.sessions).where(eq(schema.sessions.userId, id));
      await audit(u, 'user.totp_reset', { target: t.user.username });
    }
    if (Object.keys(set).length) await db().update(schema.users).set(set).where(eq(schema.users.id, id));
    if (body.officeIds) {
      const add = body.officeIds.filter((o) => !t.officeIds.includes(o));
      const remove = t.officeIds.filter((o) => !body.officeIds!.includes(o));
      for (const o of [...add, ...remove]) if (!canAssignOffice(actor, o)) throw forbidden('Você só pode alterar escritórios que administra.');
      const role = set.role ?? t.user.role;
      if (add.length) await db().insert(schema.officeMembers).values(add.map((officeId) => ({ officeId, userId: id, activated: role !== 'EMPLOYEE' }))).onConflictDoNothing();
      if (remove.length) {
        await db().delete(schema.officeMembers).where(and(eq(schema.officeMembers.userId, id), inArray(schema.officeMembers.officeId, remove)));
        await releaseDesksOf(id, t.user.displayName, remove);
        for (const o of remove) hub.kick(id, 'removed', o);
      }
      if (add.length || remove.length) await audit(u, 'user.offices', { target: t.user.username, meta: { add, remove } });
    }
    return { ok: true };
  });

  app.delete('/api/users/:id', async (req) => {
    const u = requirePerm(req, 'user.manage');
    const { id } = req.params as { id: string };
    if (id === u.id) throw badRequest('Você não pode remover a si mesmo.');
    const t = await targetInfo(id);
    if (!canManageUser(actorOf(u), { id, role: t.user.role, officeIds: t.officeIds })) throw forbidden('Você não pode remover este usuário.');
    if (t.user.role === 'OWNER') {
      const owners = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, 'OWNER'));
      if (owners.length <= 1) throw badRequest('É preciso manter pelo menos um Dono.');
    }
    hub.kick(id, 'removed');
    await releaseDesksOf(id, t.user.displayName);
    await db().delete(schema.sessions).where(eq(schema.sessions.userId, id));
    await db().delete(schema.officeMembers).where(eq(schema.officeMembers.userId, id));
    await db().delete(schema.calendarLinks).where(eq(schema.calendarLinks.userId, id));
    await db().delete(schema.users).where(eq(schema.users.id, id));
    await audit(u, 'user.delete', { target: t.user.username });
    return { ok: true };
  });
}
