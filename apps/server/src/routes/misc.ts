import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { can, canAdminOffice, isAdminRole, isValidTimezone } from '@office-imp/shared';
import { config } from '../config';
import { db, schema } from '../db';
import { actorOf, canEnterOffice, requireSubject, requireUser } from '../lib/auth';
import { randomToken } from '../lib/crypto';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { parse, z } from '../lib/validate';
import { hub } from '../realtime/hub';
import { calendarStatus, connectUrl, createEvent, disconnect, eventsBetween, handleCallback } from '../services/calendar';
import { createLkToken, lkRoomName } from '../services/livekit';
import { activeMeetingFor, startMeeting, stopMeeting } from '../services/meetings';
import { getOffice } from '../services/offices';

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

export async function miscRoutes(app: FastifyInstance) {
  // ---- token do LiveKit: só para quem está online e, em área privada, só se o servidor confirmar a posição ----
  app.post('/api/livekit/token', async (req) => {
    const s = requireSubject(req);
    const body = parse(z.object({ officeId: z.string(), room: z.string().max(80), aux: z.boolean().optional() }), req.body);
    const room = hub.room(body.officeId);
    const player = room?.players.get(s.id);
    if (!room || !player) throw forbidden('Entre no escritório antes de conectar áudio e vídeo.');
    if (player.state.status === 'DND') throw forbidden('Em "Não incomodar" nenhuma conexão de áudio e vídeo é criada.', 'dnd');
    if (body.room === 'open') {
      if (player.state.areaId && !body.aux) throw forbidden('Você está em uma área privada.');
    } else {
      if (body.aux) throw badRequest('Conexão auxiliar só existe para a área aberta.');
      if (player.state.areaId !== body.room) throw forbidden('Você não está nesta área privada.', 'not_in_area');
    }
    const token = await createLkToken({ identity: s.id, name: s.name, room: lkRoomName(body.officeId, body.room), canPublish: !body.aux });
    return { token, url: config.livekit.url, room: body.room };
  });

  // ---- notas de reunião: iniciar / parar ----
  app.post('/api/meetings/start', async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ officeId: z.string(), areaId: z.string() }), req.body);
    const room = hub.room(body.officeId);
    if (!room) throw forbidden('Entre no escritório primeiro.');
    const meetingId = await startMeeting(room, body.areaId, u);
    return { meetingId };
  });

  app.post('/api/meetings/stop', async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ officeId: z.string(), areaId: z.string() }), req.body);
    const room = hub.room(body.officeId);
    const rec = room?.recordings.get(body.areaId);
    const meetingId = rec?.meetingId ?? activeMeetingFor(body.officeId, body.areaId);
    if (!meetingId) throw notFound('Não há notas em gravação nesta sala.');
    const inArea = room?.playersInArea(body.areaId).some((p) => p.id === u.id);
    if (!inArea && !(isAdminRole(u.role) && canAdminOffice(actorOf(u), body.officeId))) throw forbidden('Só quem está na sala (ou um administrador) pode parar as notas.');
    await stopMeeting(meetingId);
    return { ok: true };
  });

  // ---- uploads de imagem (pôsteres) ----
  app.post('/api/uploads', async (req) => {
    const u = requireUser(req);
    if (!can(u.role, 'build.ownDesk')) throw forbidden();
    const file = await (req as any).file();
    if (!file) throw badRequest('Envie um arquivo.');
    const ext = IMAGE_TYPES[file.mimetype];
    if (!ext) throw badRequest('Envie uma imagem PNG, JPG, GIF ou WebP.');
    const buf: Buffer = await file.toBuffer();
    const magicOk =
      (ext === 'png' && buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) ||
      (ext === 'jpg' && buf[0] === 0xff && buf[1] === 0xd8) ||
      (ext === 'gif' && buf.subarray(0, 3).toString() === 'GIF') ||
      (ext === 'webp' && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP');
    if (!magicOk) throw badRequest('O arquivo não parece ser uma imagem válida.');
    await fsp.mkdir(config.uploadsDir, { recursive: true });
    const name = `${randomToken(16)}.${ext}`;
    await fsp.writeFile(path.join(config.uploadsDir, name), buf);
    return { url: `/api/uploads/${name}` };
  });

  app.get('/api/uploads/:name', async (req, reply) => {
    requireSubject(req);
    const { name } = req.params as { name: string };
    if (!/^[A-Za-z0-9_-]{10,40}\.(png|jpg|gif|webp)$/.test(name)) throw notFound();
    const file = path.join(config.uploadsDir, name);
    if (!fs.existsSync(file)) throw notFound();
    const ext = name.split('.').pop()!;
    reply.header('content-type', ext === 'jpg' ? 'image/jpeg' : `image/${ext}`).header('cache-control', 'private, max-age=31536000, immutable').header('x-content-type-options', 'nosniff');
    return reply.send(fs.createReadStream(file));
  });

  // ---- Google Calendar ----
  app.get('/api/calendar/status', async (req) => calendarStatus(requireUser(req).id));

  app.get('/api/calendar/connect-url', async (req) => {
    const u = requireUser(req);
    if (!can(u.role, 'calendar.use')) throw forbidden();
    return { url: await connectUrl(u.id) };
  });

  app.get('/api/calendar/callback', async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    let ok = false;
    let message = 'Agenda conectada! Você já pode fechar esta aba e voltar ao escritório.';
    try {
      if (q.error || !q.code || !q.state) throw badRequest('A conexão foi cancelada.');
      await handleCallback(q.code, q.state);
      ok = true;
    } catch (e) {
      message = (e as Error).message;
    }
    reply.header('content-type', 'text/html; charset=utf-8');
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>office-imp — Google Calendar</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0b0d;color:#f5f5f4;font-family:Montserrat,system-ui,sans-serif"><div style="text-align:center;max-width:420px;padding:24px"><div style="font-size:42px">${ok ? '✅' : '⚠️'}</div><h1 style="color:#d7b870;font-size:20px">${ok ? 'Tudo certo' : 'Não deu certo'}</h1><p>${message.replace(/[<>&]/g, '')}</p><p><a href="${config.publicUrl}" style="color:#d7b870">Voltar ao escritório</a></p></div></body></html>`;
  });

  app.post('/api/calendar/disconnect', async (req) => {
    await disconnect(requireUser(req).id);
    return { ok: true };
  });

  app.get('/api/calendar/today', async (req) => {
    const u = requireUser(req);
    const now = Date.now();
    const q = req.query as { from?: string; to?: string };
    const from = Number(q.from) || now - 3600_000;
    const to = Number(q.to) || now + 24 * 3600_000;
    return eventsBetween(u.id, from, Math.min(to, from + 8 * 86400_000));
  });

  app.post('/api/calendar/schedule', async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ officeId: z.string(), areaId: z.string(), title: z.string().trim().min(1).max(120), start: z.string(), end: z.string(), timezone: z.string().max(60) }), req.body);
    if (!canEnterOffice(u, body.officeId).ok) throw forbidden();
    if (!isValidTimezone(body.timezone)) throw badRequest('Fuso horário inválido.');
    if (!(Date.parse(body.end) > Date.parse(body.start))) throw badRequest('O fim precisa ser depois do início.');
    const office = await getOffice(body.officeId);
    const [version] = await db()
      .select()
      .from(schema.mapVersions)
      .where(and(eq(schema.mapVersions.id, office.mapVersionId ?? ''), eq(schema.mapVersions.officeId, office.id)));
    const area = version?.json.areas.find((a) => a.id === body.areaId && a.kind === 'private');
    if (!area) throw notFound('Sala não encontrada.');
    const link = `${config.publicUrl}/o/${office.slug}/sala/${area.id}`;
    return createEvent(u.id, { title: body.title, start: body.start, end: body.end, timezone: body.timezone, link, roomName: area.name });
  });
}
