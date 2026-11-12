import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { FORCE_UPDATE_SECONDS, canAdminOffice } from '@office-imp/shared';
import { config } from '../config';
import { db, schema } from '../db';
import { audit } from '../lib/audit';
import { actorOf, requireOfficeAdmin, requirePerm } from '../lib/auth';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { sendMail, verifySmtp } from '../lib/mailer';
import { getGlobalSettings, getGoogle, getSmtp, setGlobalSettings, setGoogle, setSmtp } from '../lib/settings';
import { parse, z } from '../lib/validate';
import { hub } from '../realtime/hub';
import { analyticsCsv, officeAnalytics, personTimeline } from '../services/analytics';
import { deleteMeeting } from '../services/meetings';
import { compareVersions, latestRelease, triggerServerUpdate, updaterAvailable, updaterStatus } from '../services/updates';

export async function adminRoutes(app: FastifyInstance) {
  // ---- analytics ----
  app.get('/api/offices/:id/analytics', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'analytics.view');
    const q = req.query as { from?: string; to?: string };
    return officeAnalytics(id, q.from, q.to);
  });

  app.get('/api/offices/:id/analytics.csv', async (req, reply) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'analytics.view');
    const q = req.query as { from?: string; to?: string };
    const data = await officeAnalytics(id, q.from, q.to);
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="analytics-${data.from}_${data.to}.csv"`);
    return analyticsCsv(data.rows);
  });

  app.get('/api/offices/:id/analytics/person/:subjectId', async (req) => {
    const { id, subjectId } = req.params as { id: string; subjectId: string };
    requireOfficeAdmin(req, id, 'analytics.view');
    return personTimeline(id, subjectId, (req.query as { date?: string }).date);
  });

  /** Ao vivo: Server-Sent Events com o painel de hoje a cada 3 s. */
  app.get('/api/offices/:id/analytics/live', async (req, reply) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'analytics.view');
    reply.hijack();
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    let closed = false;
    const push = async () => {
      if (closed) return;
      try {
        reply.raw.write(`data: ${JSON.stringify(await officeAnalytics(id))}\n\n`);
      } catch {}
    };
    const timer = setInterval(push, 3000);
    req.raw.on('close', () => {
      closed = true;
      clearInterval(timer);
    });
    await push();
  });

  // ---- auditoria ----
  app.get('/api/audit', async (req) => {
    const u = requirePerm(req, 'audit.view');
    const rows = await db().select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(500);
    return rows.filter((r) => u.role === 'OWNER' || r.actorId === u.id || (r.officeId && canAdminOffice(actorOf(u), r.officeId)));
  });

  // ---- configurações globais (SMTP, Google, atualizações) ----
  app.get('/api/admin/settings', async (req) => {
    const u = requirePerm(req, 'settings.manage');
    const smtp = await getSmtp();
    const google = await getGoogle({ clientId: '', clientSecret: '' });
    return {
      global: await getGlobalSettings(),
      smtp: smtp ? { ...smtp, pass: smtp.pass ? '********' : '' } : null,
      google: { configured: Boolean(google || (config.google.clientId && config.google.clientSecret)), clientId: google?.clientId ?? config.google.clientId, fromEnv: !google && Boolean(config.google.clientId), redirectUri: `${config.publicUrl}/api/calendar/callback` },
      whisperConfigured: Boolean(config.whisperUrl),
      summaryConfigured: Boolean(config.summary.url),
      isOwner: u.role === 'OWNER',
    };
  });

  app.put('/api/admin/settings/smtp', async (req) => {
    const u = requirePerm(req, 'settings.manage');
    const body = parse(
      z.object({ host: z.string().trim().min(1).max(200), port: z.number().int().min(1).max(65535), secure: z.boolean(), user: z.string().trim().max(200), pass: z.string().max(500), from: z.string().trim().max(200) }).nullable(),
      req.body,
    );
    if (body && body.pass === '********') body.pass = (await getSmtp())?.pass ?? '';
    await setSmtp(body);
    await audit(u, 'settings.smtp', { meta: { host: body?.host ?? null } });
    return { ok: true };
  });

  app.post('/api/admin/settings/smtp/test', async (req) => {
    requirePerm(req, 'settings.manage');
    const body = parse(z.object({ to: z.string().trim().email() }), req.body);
    const smtp = await getSmtp();
    if (!smtp) throw badRequest('Salve as configurações de SMTP antes de testar.');
    try {
      await verifySmtp(smtp);
      await sendMail({ to: [body.to], subject: 'office-imp — teste de envio', text: 'Se você recebeu esta mensagem, o envio de notas de reunião por e-mail está funcionando.' }, smtp);
    } catch (e) {
      throw badRequest(`O servidor de e-mail recusou: ${(e as Error).message}`);
    }
    return { ok: true };
  });

  app.put('/api/admin/settings/google', async (req) => {
    const u = requirePerm(req, 'settings.manage');
    const body = parse(z.object({ clientId: z.string().trim().min(10).max(300), clientSecret: z.string().trim().min(6).max(300) }).nullable(), req.body);
    await setGoogle(body);
    await audit(u, 'settings.google', { meta: { configured: Boolean(body) } });
    return { ok: true };
  });

  app.patch('/api/admin/settings/global', async (req) => {
    const u = requirePerm(req, 'clients.update');
    const body = parse(z.object({ autoUpdateOnOpen: z.boolean().optional(), autoUpdateServer: z.boolean().optional() }), req.body);
    if (body.autoUpdateServer !== undefined && u.role !== 'OWNER') throw forbidden('Só o Dono pode mudar a atualização do servidor.');
    const next = await setGlobalSettings(body);
    await audit(u, 'settings.updates', { meta: body });
    return next;
  });

  // ---- atualizações ----
  app.get('/api/admin/update/status', async (req) => {
    const u = requirePerm(req, 'clients.update');
    const latest = await latestRelease((req.query as any)?.refresh === '1');
    let updater: any = null;
    if (u.role === 'OWNER' && updaterAvailable()) updater = await updaterStatus().catch((e) => ({ error: (e as Error).message }));
    return {
      current: config.version,
      latest,
      updateAvailable: latest ? compareVersions(latest.version, config.version) > 0 : false,
      updaterAvailable: updaterAvailable(),
      updater,
      global: await getGlobalSettings(),
      canUpdateServer: u.role === 'OWNER',
    };
  });

  app.post('/api/admin/update/server', async (req) => {
    const u = requirePerm(req, 'server.update');
    const latest = await latestRelease(true);
    if (!latest) throw badRequest('Não foi possível consultar a última versão no GitHub.');
    if (compareVersions(latest.version, config.version) <= 0) throw badRequest('O servidor já está na versão mais recente.');
    await audit(u, 'server.update', { meta: { from: config.version, to: latest.version } });
    hub.broadcastAll('notice', { code: 'server_updating' });
    return triggerServerUpdate(latest.version);
  });

  app.post('/api/admin/update/clients', async (req) => {
    const u = requirePerm(req, 'clients.update');
    hub.broadcastAll('forceUpdate', { seconds: FORCE_UPDATE_SECONDS });
    await audit(u, 'clients.force_update');
    return { ok: true, seconds: FORCE_UPDATE_SECONDS, online: hub.all().reduce((n, r) => n + r.players.size, 0) };
  });

  // ---- notas de reunião ----
  app.get('/api/offices/:id/meetings', async (req) => {
    const { id } = req.params as { id: string };
    requireOfficeAdmin(req, id, 'notes.view');
    const q = String((req.query as any)?.q ?? '').trim();
    let ids: string[] | null = null;
    if (q) {
      const hits = await db()
        .select({ id: schema.meetings.id })
        .from(schema.meetings)
        .leftJoin(schema.meetingNotes, eq(schema.meetingNotes.meetingId, schema.meetings.id))
        .where(and(eq(schema.meetings.officeId, id), or(ilike(schema.meetingNotes.transcript, `%${q}%`), ilike(schema.meetings.areaName, `%${q}%`))));
      ids = hits.map((h) => h.id);
      if (!ids.length) return [];
    }
    const rows = await db()
      .select()
      .from(schema.meetings)
      .where(ids ? and(eq(schema.meetings.officeId, id), inArray(schema.meetings.id, ids)) : eq(schema.meetings.officeId, id))
      .orderBy(desc(schema.meetings.start))
      .limit(200);
    return rows;
  });

  async function meetingFor(req: any) {
    const { meetingId } = req.params as { meetingId: string };
    const [m] = await db().select().from(schema.meetings).where(eq(schema.meetings.id, meetingId));
    if (!m) throw notFound('Reunião não encontrada.');
    const u = requireOfficeAdmin(req, m.officeId, 'notes.view');
    return { m, u };
  }

  app.get('/api/meetings/:meetingId', async (req) => {
    const { m } = await meetingFor(req);
    const [note] = await db().select().from(schema.meetingNotes).where(eq(schema.meetingNotes.meetingId, m.id));
    const tracks = await db().select().from(schema.meetingTracks).where(eq(schema.meetingTracks.meetingId, m.id));
    return {
      meeting: m,
      note: note ?? null,
      tracks: tracks.map((t) => ({ id: t.id, subjectName: t.subjectName, startedAt: t.startedAt, available: !t.deletedAt && fs.existsSync(path.join(config.meetingsDir, t.file)) })),
    };
  });

  app.get('/api/meetings/:meetingId/transcript', async (req, reply) => {
    const { m } = await meetingFor(req);
    const [note] = await db().select().from(schema.meetingNotes).where(eq(schema.meetingNotes.meetingId, m.id));
    if (!note) throw notFound('A transcrição ainda não está pronta.');
    reply.header('content-type', 'text/markdown; charset=utf-8').header('content-disposition', `attachment; filename="notas-${new Date(m.start).toISOString().slice(0, 10)}-${m.id}.md"`);
    return note.transcript;
  });

  app.get('/api/meetings/:meetingId/audio/:trackId', async (req, reply) => {
    const { m } = await meetingFor(req);
    const { trackId } = req.params as { trackId: string };
    const [t] = await db()
      .select()
      .from(schema.meetingTracks)
      .where(and(eq(schema.meetingTracks.id, trackId), eq(schema.meetingTracks.meetingId, m.id)));
    const file = t ? path.join(config.meetingsDir, t.file) : '';
    if (!t || t.deletedAt || !file.startsWith(config.meetingsDir) || !fs.existsSync(file)) throw notFound('Áudio indisponível (pode ter passado do prazo de retenção).');
    reply.header('content-type', 'audio/ogg').header('content-length', fs.statSync(file).size).header('content-disposition', `inline; filename="${t.subjectName.replace(/[^A-Za-z0-9]+/g, '-')}.ogg"`);
    return reply.send(fs.createReadStream(file));
  });

  app.delete('/api/meetings/:meetingId', async (req) => {
    const { m, u } = await meetingFor(req);
    if (m.status === 'recording') throw badRequest('Pare a gravação antes de excluir.');
    await deleteMeeting(m.id);
    await audit(u, 'meeting.delete', { officeId: m.officeId, target: m.id });
    return { ok: true };
  });
}
