// SPDX-License-Identifier: AGPL-3.0-only
import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { can, canAdminOffice, requiresTwoFactor, type Actor, type Permission, type Role } from '@office-imp/shared';
import { config } from '../config';
import { db, schema } from '../db';
import { randomToken, sha256 } from './crypto';
import { forbidden, unauthorized } from './errors';

export const COOKIE = 'oi_session';
export type UserRow = typeof schema.users.$inferSelect;
export type GuestRow = typeof schema.guests.$inferSelect;

export interface UserSubject {
  kind: 'user';
  id: string;
  name: string;
  role: Exclude<Role, 'GUEST'>;
  user: UserRow;
  officeIds: string[];
  activatedOfficeIds: string[];
  mustChangePassword: boolean;
  mustSetupTotp: boolean;
  restricted: boolean;
}
export interface GuestSubject {
  kind: 'guest';
  id: string;
  name: string;
  role: 'GUEST';
  officeId: string;
  inviteId: string;
  guest: GuestRow;
}
export type Subject = UserSubject | GuestSubject;

declare module 'fastify' {
  interface FastifyRequest {
    subject: Subject | null;
    sessionId: string | null;
  }
}

export async function createSession(reply: FastifyReply, who: { userId?: string; guestId?: string }, ttlMs?: number): Promise<void> {
  const token = randomToken(32);
  const ttl = ttlMs ?? config.sessionDays * 86400_000;
  await db()
    .insert(schema.sessions)
    .values({ id: sha256(token), userId: who.userId ?? null, guestId: who.guestId ?? null, createdAt: Date.now(), expiresAt: Date.now() + ttl });
  reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', maxAge: Math.floor(ttl / 1000) });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (req.sessionId) await db().delete(schema.sessions).where(eq(schema.sessions.id, req.sessionId));
  reply.clearCookie(COOKIE, { path: '/' });
}

export async function loadUserSubject(userId: string): Promise<UserSubject | null> {
  const [user] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return null;
  const members = await db().select().from(schema.officeMembers).where(eq(schema.officeMembers.userId, userId));
  const mustSetupTotp = requiresTwoFactor(user.role) && !user.totpEnabled;
  return {
    kind: 'user',
    id: user.id,
    name: user.displayName,
    role: user.role,
    user,
    officeIds: members.map((m) => m.officeId),
    activatedOfficeIds: members.filter((m) => m.activated).map((m) => m.officeId),
    mustChangePassword: user.mustChangePassword,
    mustSetupTotp,
    restricted: user.mustChangePassword || mustSetupTotp,
  };
}

/** Convite ainda válido? (não revogado, não expirado) */
export function inviteUsable(inv: typeof schema.invites.$inferSelect, now = Date.now()): boolean {
  if (inv.revokedAt) return false;
  if (inv.expiresAt && inv.expiresAt <= now) return false;
  return true;
}

export async function loadGuestSubject(guestId: string): Promise<GuestSubject | null> {
  const [guest] = await db().select().from(schema.guests).where(and(eq(schema.guests.id, guestId), isNull(schema.guests.endedAt)));
  if (!guest) return null;
  const [inv] = await db().select().from(schema.invites).where(eq(schema.invites.id, guest.inviteId));
  if (!inv || !inviteUsable(inv)) return null;
  return { kind: 'guest', id: guest.id, name: guest.displayName, role: 'GUEST', officeId: guest.officeId, inviteId: guest.inviteId, guest };
}

export async function loadSubject(req: FastifyRequest): Promise<void> {
  req.subject = null;
  req.sessionId = null;
  const token = req.cookies?.[COOKIE];
  if (!token) return;
  const id = sha256(token);
  const [s] = await db()
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, Date.now())));
  if (!s) return;
  req.sessionId = id;
  if (s.userId) req.subject = await loadUserSubject(s.userId);
  else if (s.guestId) req.subject = await loadGuestSubject(s.guestId);
  if (!req.subject) {
    await db().delete(schema.sessions).where(eq(schema.sessions.id, id));
    req.sessionId = null;
  }
}

export function requireSubject(req: FastifyRequest): Subject {
  if (!req.subject) throw unauthorized();
  if (req.subject.kind === 'user' && req.subject.restricted) throw forbidden('Conclua a troca de senha e a verificação em duas etapas antes de continuar.', 'restricted');
  return req.subject;
}

export function requireUser(req: FastifyRequest, opts: { allowRestricted?: boolean } = {}): UserSubject {
  if (!req.subject) throw unauthorized();
  if (req.subject.kind !== 'user') throw forbidden('Convidados não podem fazer isso.');
  if (req.subject.restricted && !opts.allowRestricted) throw forbidden('Conclua a troca de senha e a verificação em duas etapas antes de continuar.', 'restricted');
  return req.subject;
}

export function requirePerm(req: FastifyRequest, perm: Permission): UserSubject {
  const u = requireUser(req);
  if (!can(u.role, perm)) throw forbidden();
  return u;
}

export function actorOf(u: UserSubject): Actor {
  return { id: u.id, role: u.role, officeIds: u.officeIds };
}

/** Exige permissão e que o ator administre o escritório (Dono: todos; Admin: os dele). */
export function requireOfficeAdmin(req: FastifyRequest, officeId: string, perm: Permission): UserSubject {
  const u = requirePerm(req, perm);
  if (!canAdminOffice(actorOf(u), officeId)) throw forbidden('Você não administra este escritório.');
  return u;
}

/** O sujeito pode entrar no escritório? */
export function canEnterOffice(s: Subject, officeId: string): { ok: boolean; reason?: string } {
  if (s.kind === 'guest') return { ok: s.officeId === officeId };
  if (s.role === 'OWNER') return { ok: true };
  if (!s.officeIds.includes(officeId)) return { ok: false, reason: 'not_member' };
  if (s.role === 'ADMIN') return { ok: true };
  if (!s.activatedOfficeIds.includes(officeId)) return { ok: false, reason: 'invite_required' };
  return { ok: true };
}
