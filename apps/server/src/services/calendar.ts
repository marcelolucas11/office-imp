// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm';
import { config } from '../config';
import { db, schema } from '../db';
import { decrypt, encrypt, signTicket, verifyTicket } from '../lib/crypto';
import { badRequest } from '../lib/errors';
import { getGoogle } from '../lib/settings';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const redirectUri = () => `${config.publicUrl}/api/calendar/callback`;

export async function googleConfig() {
  return getGoogle(config.google);
}

export async function calendarStatus(userId: string) {
  const g = await googleConfig();
  const [link] = await db().select({ userId: schema.calendarLinks.userId }).from(schema.calendarLinks).where(eq(schema.calendarLinks.userId, userId));
  return { available: Boolean(g), connected: Boolean(link) };
}

export async function connectUrl(userId: string): Promise<string> {
  const g = await googleConfig();
  if (!g) throw badRequest('A integração com o Google Calendar não está configurada.', 'calendar_unavailable');
  const q = new URLSearchParams({
    client_id: g.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: signTicket({ uid: userId, purpose: 'calendar' }, 900),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function handleCallback(code: string, state: string): Promise<void> {
  const t = verifyTicket<{ uid: string; purpose: string }>(state);
  if (!t || t.purpose !== 'calendar') throw badRequest('Pedido de conexão expirado. Tente de novo.');
  const g = await googleConfig();
  if (!g) throw badRequest('Integração não configurada.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
  });
  const json: any = await res.json();
  if (!res.ok || !json.refresh_token) throw badRequest('O Google não autorizou a conexão. Tente de novo.');
  const enc = encrypt(json.refresh_token);
  await db()
    .insert(schema.calendarLinks)
    .values({ userId: t.uid, refreshTokenEnc: enc, createdAt: Date.now() })
    .onConflictDoUpdate({ target: schema.calendarLinks.userId, set: { refreshTokenEnc: enc, createdAt: Date.now() } });
}

export async function disconnect(userId: string): Promise<void> {
  const [link] = await db().select().from(schema.calendarLinks).where(eq(schema.calendarLinks.userId, userId));
  if (link) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(link.refreshTokenEnc))}`, { method: 'POST' });
    } catch {}
  }
  await db().delete(schema.calendarLinks).where(eq(schema.calendarLinks.userId, userId));
}

async function accessToken(userId: string): Promise<string> {
  const g = await googleConfig();
  const [link] = await db().select().from(schema.calendarLinks).where(eq(schema.calendarLinks.userId, userId));
  if (!g || !link) throw badRequest('Conecte o seu Google Calendar primeiro.', 'calendar_not_connected');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: decrypt(link.refreshTokenEnc), grant_type: 'refresh_token' }),
  });
  const json: any = await res.json();
  if (!res.ok || !json.access_token) {
    if (json?.error === 'invalid_grant') await db().delete(schema.calendarLinks).where(eq(schema.calendarLinks.userId, userId));
    throw badRequest('A conexão com o Google expirou. Conecte de novo.', 'calendar_not_connected');
  }
  return json.access_token;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  officeLink: string | null;
  htmlLink: string | null;
}

/** Procura um link deste office-imp no evento (local ou descrição). */
export function findOfficeLink(text: string, publicUrl: string): string | null {
  const esc = publicUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(`${esc}/o/[A-Za-z0-9_-]+(?:/sala/[A-Za-z0-9_-]+)?`));
  return m ? m[0] : null;
}

export async function eventsBetween(userId: string, timeMin: number, timeMax: number): Promise<CalendarEvent[]> {
  const token = await accessToken(userId);
  const q = new URLSearchParams({ timeMin: new Date(timeMin).toISOString(), timeMax: new Date(timeMax).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50' });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { headers: { authorization: `Bearer ${token}` } });
  const json: any = await res.json();
  if (!res.ok) throw badRequest('Não foi possível ler a agenda do Google.');
  return (json.items ?? [])
    .filter((e: any) => e.status !== 'cancelled')
    .map((e: any) => ({
      id: e.id,
      title: e.summary ?? '(sem título)',
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      allDay: Boolean(e.start?.date),
      officeLink: findOfficeLink(`${e.location ?? ''} ${e.description ?? ''}`, config.publicUrl),
      htmlLink: e.htmlLink ?? null,
    }));
}

export async function createEvent(userId: string, input: { title: string; start: string; end: string; timezone: string; link: string; roomName: string }): Promise<CalendarEvent> {
  const token = await accessToken(userId);
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: input.title,
      location: input.link,
      description: `Reunião no escritório virtual — ${input.roomName}\nEntrar: ${input.link}`,
      start: { dateTime: input.start, timeZone: input.timezone },
      end: { dateTime: input.end, timeZone: input.timezone },
    }),
  });
  const e: any = await res.json();
  if (!res.ok) throw badRequest('O Google recusou a criação do evento.');
  return { id: e.id, title: e.summary, start: e.start?.dateTime, end: e.end?.dateTime, allDay: false, officeLink: input.link, htmlLink: e.htmlLink ?? null };
}
