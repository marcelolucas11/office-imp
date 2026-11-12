// SPDX-License-Identifier: AGPL-3.0-only
import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { EXPANSION_THRESHOLD, can, canAdminOffice, isValidTimezone, mapDesks, validateMapShape, type OfficeMap } from '@office-imp/shared';
import { expandOffice, generateOffice, reserveBlankWing, toTiled, validateOffice } from '@office-imp/map-engine';
import { config } from '../config';
import { db, schema } from '../db';
import { audit } from '../lib/audit';
import { actorOf, canEnterOffice, requireOfficeAdmin, requirePerm, requireSubject } from '../lib/auth';
import { newId, signTicket } from '../lib/crypto';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { officeSettings } from '../lib/settings';
import { parse, z } from '../lib/validate';
import { hub } from '../realtime/hub';
import { publicSettings } from '../realtime/office-room';
import { currentMap, desksUsed, getOffice, getOfficeBySlug, listDesks, memberCount, publishMap, uniqueSlug } from '../services/offices';
import { officesFor } from './auth';

const zWizard = z.object({
  name: z.string().trim().min(2).max(60),
  size: z.enum(['small', 'medium', 'custom']),
  customCount: z.number().int().min(1).max(100).optional(),
  partners: z.number().int().min(0).max(10),
  partnersShareRoom: z.boolean(),
});

async function expansionStatus(officeId: string) {
  const office = await getOffice(officeId);
  const used = await desksUsed(officeId);
  const members = await memberCount(officeId);
  const capacity = office.deskCapacity;
  const byUsage = capacity > 0 && used >= Math.ceil(capacity * EXPANSION_THRESHOLD);
  const byPlan = office.plannedHeadcount > capacity;
  const extra = byPlan ? office.plannedHeadcount - capacity : 6;
  const dismissed = office.expansionDismissedAt >= capacity && !byPlan;
  return { capacity, used, members, planned: office.plannedHeadcount, suggested: (byUsage || byPlan) && !dismissed, reason: byPlan ? 'planned' : byUsage ? 'usage' : null, extra };
}

export async function officeRoutes(app: FastifyInstance) {
  app.get('/api/offices', async (req) => officesFor(requireSubject(req)));

  app.post('/api/offices/preview', async (req) => {
    requirePerm(req, 'office.create');
    const input = parse(zWizard, req.body);
    const map = generateOffice(input);
    return { map, desks: mapDesks(map).length, meetingRooms: map.areas.filter((a) => a.meeting && !a.partners).length };
  });

  app.post('/api/offices', async (req) => {
    const u = requirePerm(req, 'office.create');
    const input = parse(zWizard.extend({ timezone: z.string().max(60).optional() }), req.body);
    const tz = input.timezone && isValidTimezone(input.timezone) ? input.timezone : 'America/Sao_Paulo';
    const id = newId();
    const slug = await uniqueSlug(input.name);
    const map = generateOffice(input);
    await db().insert(schema.offices).values({ id, slug, name: input.name, timezone: tz, settings: {}, createdBy: u.id, createdAt: Date.now() });
    await publishMap(id, map, u, 'Escritório criado pelo assistente');
    if (u.role !== 'OWNER') await db().insert(schema.officeMembers).values({ officeId: id, userId: u.id, activated: true }).onConflictDoNothing();
    await audit(u, 'office.create', { officeId: id, target: input.name, meta: { size: input.size, customCount: input.customCount, partners: input.partners, partnersShareRoom: input.partnersShareRoom } });
    return { id, slug };
  });

  app.patch('/api/offices/:id', async (req) => {
    const { id } = req.params as { id: string };
    const u = requireOfficeAdmin(req, id, 'settings.manage');
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(60).optional(),
        timezone: z.string().max(60).optional(),
        plannedHeadcount: z.number().int().min(0).max(400).optional(),
        settings: z
          .object({
            awayMinutes: z.number().int().min(1).max(240).optional(),
            chatRetentionDays: z.number().int().min(1).max(3650).optional(),
            audioRetentionDays: z.number().int().min(1).max(3650).optional(),
            notesRestrictedToAdmins: z.boolean().optional(),
            notesRecipients: z.array(z.string().trim().email().max(200)).max(30).optional(),
            monitoringNotice: z.string().trim().min(20).max(3000).optional(),
          })
          .optional(),
      }),
      req.body,
    );
    const office = await getOffice(id);
    if (body.settings?.monitoringNotice && u.role !== 'OWNER') throw forbidden('Só o Dono pode editar o aviso de monitoramento.');
    if (body.timezone && !isValidTimezone(body.timezone)) throw badRequest('Fuso horário inválido.');
    await db()
      .update(schema.offices)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.timezone ? { timezone: body.timezone } : {}),
        ...(body.plannedHeadcount !== undefined ? { plannedHeadcount: body.plannedHeadcount } : {}),
        ...(body.settings ? { settings: { ...office.settings, ...body.settings } } : {}),
      })
      .where(eq(schema.offices.id, id));
    await audit(u, 'office.update', { officeId: id, meta: { fields: Object.keys(body), settings: body.settings ? Object.keys(body.settings) : undefined } });
    await hub.room(id)?.refreshOffice();
    return { ok: true };
  });

  app.get('/api/offices/:id/admin', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'settings.manage');
    const office = await getOffice(id);
    return { id: office.id, slug: office.slug, name: office.name, timezone: office.timezone, plannedHeadcount: office.plannedHeadcount, settings: officeSettings(office.settings), expansion: await expansionStatus(id) };
  });

  app.delete('/api/offices/:id', async (req) => {
    const u = requirePerm(req, 'office.delete');
    const { id } = req.params as { id: string };
    const office = await getOffice(id);
    for (const p of [...(hub.room(id)?.players.keys() ?? [])]) hub.kick(p, 'office_deleted', id);
    const d = db();
    const ms = await d.select({ id: schema.meetings.id }).from(schema.meetings).where(eq(schema.meetings.officeId, id));
    const { deleteMeeting } = await import('../services/meetings');
    for (const m of ms) await deleteMeeting(m.id);
    for (const t of [schema.officeMembers, schema.mapVersions, schema.desks, schema.deskItems, schema.lostFound, schema.invites, schema.guests, schema.chatMessages, schema.presenceSessions, schema.statusIntervals, schema.callSegments, schema.whiteboards] as const) {
      await d.delete(t).where(eq((t as any).officeId, id));
    }
    await d.delete(schema.offices).where(eq(schema.offices.id, id));
    await audit(u, 'office.delete', { target: office.name });
    return { ok: true };
  });

  // ---- entrar no escritório: devolve o mapa e um ticket curto para o tempo real ----
  app.post('/api/offices/:slug/enter', async (req) => {
    const s = requireSubject(req);
    const office = await getOfficeBySlug((req.params as { slug: string }).slug);
    const access = canEnterOffice(s, office.id);
    if (!access.ok) {
      if (access.reason === 'invite_required') throw forbidden('Abra o link de convite deste escritório para entrar pela primeira vez.', 'invite_required');
      throw forbidden('Você não tem acesso a este escritório.', 'no_access');
    }
    const cur = await currentMap(office);
    return {
      office: { id: office.id, slug: office.slug, name: office.name, timezone: office.timezone, settings: publicSettings(office) },
      map: hub.room(office.id)?.map ?? cur.map,
      mapVersionId: cur.id,
      ticket: signTicket({ sub: s.id, kind: s.kind, officeId: office.id }, 60),
      livekitUrl: config.livekit.url,
      canAdmin: s.kind === 'user' && canAdminOffice(actorOf(s), office.id),
    };
  });

  // ---- mapa (Mapmaker) ----
  app.get('/api/offices/:id/map', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'map.edit');
    const office = await getOffice(id);
    const cur = await currentMap(office);
    return { map: hub.room(id)?.map ?? cur.map, mapVersionId: cur.id };
  });

  app.post('/api/offices/:id/map/validate', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'map.edit');
    const map = (req.body as any)?.map;
    const shape = validateMapShape(map);
    if (shape) return { ok: false, errors: [shape], warnings: [], desks: 0 };
    return validateOffice(map as OfficeMap);
  });

  app.post('/api/offices/:id/map', async (req) => {
    const { id } = req.params as { id: string };
    const u = requireOfficeAdmin(req, id, 'map.edit');
    const body = req.body as { map?: OfficeMap; note?: string };
    const shape = validateMapShape(body?.map);
    if (shape) throw badRequest(`Mapa inválido: ${shape}`);
    const versionId = await publishMap(id, body.map!, u, String(body.note ?? '').slice(0, 200) || 'Editado no Mapmaker');
    await audit(u, 'map.publish', { officeId: id, meta: { versionId } });
    await hub.room(id)?.reloadMap();
    return { mapVersionId: versionId };
  });

  app.get('/api/offices/:id/map/versions', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'map.edit');
    const rows = await db()
      .select({ id: schema.mapVersions.id, authorName: schema.mapVersions.authorName, note: schema.mapVersions.note, published: schema.mapVersions.published, createdAt: schema.mapVersions.createdAt })
      .from(schema.mapVersions)
      .where(eq(schema.mapVersions.officeId, id))
      .orderBy(desc(schema.mapVersions.createdAt));
    return rows;
  });

  app.post('/api/offices/:id/map/versions/:versionId/restore', async (req) => {
    const { id, versionId } = req.params as { id: string; versionId: string };
    const u = requireOfficeAdmin(req, id, 'map.edit');
    const [v] = await db()
      .select()
      .from(schema.mapVersions)
      .where(and(eq(schema.mapVersions.id, versionId), eq(schema.mapVersions.officeId, id)));
    if (!v) throw notFound('Versão não encontrada.');
    const when = new Date(v.createdAt).toISOString().slice(0, 16).replace('T', ' ');
    const newVersion = await publishMap(id, v.json, u, `Restaurado da versão de ${when} UTC`);
    await audit(u, 'map.restore', { officeId: id, meta: { from: versionId } });
    await hub.room(id)?.reloadMap();
    return { mapVersionId: newVersion };
  });

  app.get('/api/offices/:id/map/tiled', async (req, reply) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'map.edit');
    const office = await getOffice(id);
    const cur = await currentMap(office);
    reply.header('content-disposition', `attachment; filename="${office.slug}-tiled.json"`);
    return toTiled(cur.map);
  });

  // ---- mesas ----
  app.get('/api/offices/:id/desks', async (req) => {
    const { id } = req.params as { id: string };
    const s = requireSubject(req);
    if (!canEnterOffice(s, id).ok) throw forbidden();
    return listDesks(id);
  });

  app.post('/api/offices/:id/desks/:deskId/assign', async (req) => {
    const { id, deskId } = req.params as { id: string; deskId: string };
    const u = requireOfficeAdmin(req, id, 'user.manage');
    const body = parse(z.object({ userId: z.string().nullable() }), req.body);
    const [desk] = await db()
      .select()
      .from(schema.desks)
      .where(and(eq(schema.desks.officeId, id), eq(schema.desks.id, deskId)));
    if (!desk) throw notFound('Mesa não encontrada.');
    if (desk.userId && desk.userId !== body.userId) {
      const [prev] = await db().select().from(schema.users).where(eq(schema.users.id, desk.userId));
      const { releaseDesksOf } = await import('./users');
      await releaseDesksOf(desk.userId, prev?.displayName ?? 'Antigo ocupante', [id]);
    }
    if (body.userId) {
      const [member] = await db()
        .select()
        .from(schema.officeMembers)
        .where(and(eq(schema.officeMembers.officeId, id), eq(schema.officeMembers.userId, body.userId)));
      const [target] = await db().select().from(schema.users).where(eq(schema.users.id, body.userId));
      if (!target || (!member && target.role !== 'OWNER')) throw badRequest('Esta pessoa não pertence ao escritório.');
      await db()
        .update(schema.desks)
        .set({ userId: null })
        .where(and(eq(schema.desks.officeId, id), eq(schema.desks.userId, body.userId)));
    }
    await db()
      .update(schema.desks)
      .set({ userId: body.userId })
      .where(and(eq(schema.desks.officeId, id), eq(schema.desks.id, deskId)));
    await audit(u, 'desk.assign', { officeId: id, target: deskId, meta: { userId: body.userId } });
    await hub.room(id)?.reloadDesks();
    return { ok: true };
  });

  app.get('/api/offices/:id/lost-found', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'user.manage');
    return db().select().from(schema.lostFound).where(eq(schema.lostFound.officeId, id)).orderBy(desc(schema.lostFound.createdAt));
  });

  app.delete('/api/offices/:id/lost-found/:itemId', async (req) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    requireOfficeAdmin(req, id, 'user.manage');
    await db()
      .delete(schema.lostFound)
      .where(and(eq(schema.lostFound.officeId, id), eq(schema.lostFound.id, itemId)));
    return { ok: true };
  });

  // ---- expansão ----
  app.get('/api/offices/:id/expansion', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'expansion.approve');
    return expansionStatus(id);
  });

  app.post('/api/offices/:id/expansion/preview', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'expansion.approve');
    const body = parse(z.object({ extra: z.number().int().min(1).max(100) }), req.body);
    const cur = await currentMap(await getOffice(id));
    try {
      const plan = expandOffice(hub.room(id)?.map ?? cur.map, body.extra);
      return { map: plan.map, addedDesks: plan.addedDesks, addedMeetingRooms: plan.addedMeetingRooms, region: plan.region };
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  });

  app.post('/api/offices/:id/expansion/approve', async (req) => {
    const { id } = req.params as { id: string };
    const u = requireOfficeAdmin(req, id, 'expansion.approve');
    const body = parse(z.object({ extra: z.number().int().min(1).max(100), mode: z.enum(['auto', 'manual']).default('auto'), width: z.number().int().min(6).max(40).optional() }), req.body);
    const cur = await currentMap(await getOffice(id));
    const base = hub.room(id)?.map ?? cur.map;
    let plan;
    try {
      plan = body.mode === 'manual' ? reserveBlankWing(base, body.width ?? Math.max(12, Math.ceil(body.extra / 2) * 3 + 3)) : expandOffice(base, body.extra);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    const versionId = await publishMap(id, plan.map, u, body.mode === 'manual' ? 'Expansão: área em branco reservada para montagem manual' : `Expansão aprovada: +${plan.addedDesks} mesas`);
    await audit(u, 'office.expand', { officeId: id, meta: { mode: body.mode, extra: body.extra, addedDesks: plan.addedDesks } });
    await hub.room(id)?.reloadMap();
    return { mapVersionId: versionId, addedDesks: plan.addedDesks, region: plan.region };
  });

  app.post('/api/offices/:id/expansion/dismiss', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'expansion.approve');
    const office = await getOffice(id);
    await db().update(schema.offices).set({ expansionDismissedAt: office.deskCapacity }).where(eq(schema.offices.id, id));
    return { ok: true };
  });

  // ---- histórico do chat ----
  app.get('/api/offices/:id/chat', async (req) => {
    const { id } = req.params as { id: string };
    const s = requireSubject(req);
    if (!canEnterOffice(s, id).ok) throw forbidden();
    const rows = await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.officeId, id)).orderBy(desc(schema.chatMessages.createdAt)).limit(400);
    return rows
      .filter((m) => m.scope === 'all' || m.fromId === s.id || m.toId === s.id || (m.scope === 'near' && (m.recipients ?? []).includes(s.id)))
      .slice(0, 150)
      .reverse()
      .map((m) => ({ id: m.id, scope: m.scope, fromId: m.fromId, fromName: m.fromName, toId: m.toId, text: m.text, at: m.createdAt }));
  });

  app.get('/api/offices/:id/members', async (req) => {
    const { id } = req.params as { id: string };
    const s = requireSubject(req);
    if (!canEnterOffice(s, id).ok) throw forbidden();
    const rows = await db()
      .select({ id: schema.users.id, name: schema.users.displayName, role: schema.users.role, profile: schema.users.profile })
      .from(schema.officeMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.officeMembers.userId))
      .where(eq(schema.officeMembers.officeId, id));
    const owners = await db().select({ id: schema.users.id, name: schema.users.displayName, role: schema.users.role, profile: schema.users.profile }).from(schema.users).where(eq(schema.users.role, 'OWNER'));
    const all = new Map([...owners, ...rows].map((r) => [r.id, r]));
    return [...all.values()].map((r) => ({ ...r, canSeeAdmin: can(r.role, 'analytics.view') })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });
}
