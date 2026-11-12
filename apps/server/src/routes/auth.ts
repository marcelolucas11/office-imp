import type { FastifyInstance } from 'fastify';
import { eq, inArray, sql } from 'drizzle-orm';
import { DEFAULT_AVATAR, can, sanitizeAvatar, type OfficeSummary } from '@office-imp/shared';
import { config } from '../config';
import { db, schema } from '../db';
import { audit } from '../lib/audit';
import { createSession, destroySession, requireSubject, requireUser, type Subject } from '../lib/auth';
import { decrypt, encrypt, hashPassword, newId, newRecoveryCodes, newTotpSecret, otpauthUrl, sha256, verifyPassword, verifyTotp } from '../lib/crypto';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors';
import { getGlobalSettings, officeSettings } from '../lib/settings';
import { parse, z, zName, zPassword, zUsername } from '../lib/validate';
import { hub } from '../realtime/hub';
import { calendarStatus } from '../services/calendar';
import { desksUsed } from '../services/offices';

async function userCount(): Promise<number> {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.users);
  return r?.n ?? 0;
}

export async function officesFor(s: Subject): Promise<OfficeSummary[]> {
  let rows: (typeof schema.offices.$inferSelect)[];
  if (s.kind === 'guest') rows = await db().select().from(schema.offices).where(eq(schema.offices.id, s.officeId));
  else if (s.role === 'OWNER') rows = await db().select().from(schema.offices);
  else rows = s.officeIds.length ? await db().select().from(schema.offices).where(inArray(schema.offices.id, s.officeIds)) : [];
  const out: OfficeSummary[] = [];
  for (const o of rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) {
    out.push({
      id: o.id,
      slug: o.slug,
      name: o.name,
      timezone: o.timezone,
      deskCapacity: o.deskCapacity,
      desksUsed: await desksUsed(o.id),
      online: hub.onlineCount(o.id),
      activated: s.kind === 'guest' || s.role !== 'EMPLOYEE' || s.activatedOfficeIds.includes(o.id),
    });
  }
  return out;
}

export async function mePayload(s: Subject) {
  const global = await getGlobalSettings();
  const offices = await officesFor(s);
  if (s.kind === 'guest') {
    const [office] = await db().select().from(schema.offices).where(eq(schema.offices.id, s.officeId));
    return {
      kind: 'guest' as const,
      id: s.id,
      name: s.name,
      role: s.role,
      username: null,
      mustChangePassword: false,
      mustSetupTotp: false,
      monitoringAccepted: true,
      monitoringNotice: officeSettings(office?.settings).monitoringNotice,
      profile: {},
      avatar: sanitizeAvatar(s.guest.avatar ?? DEFAULT_AVATAR),
      interactionDistance: 5,
      offices,
      version: config.version,
      autoUpdateOnOpen: global.autoUpdateOnOpen,
      calendar: { available: false, connected: false },
    };
  }
  const first = offices[0] ? (await db().select().from(schema.offices).where(eq(schema.offices.id, offices[0].id)))[0] : null;
  return {
    kind: 'user' as const,
    id: s.id,
    name: s.name,
    role: s.role,
    username: s.user.username,
    mustChangePassword: s.mustChangePassword,
    mustSetupTotp: s.mustSetupTotp,
    monitoringAccepted: Boolean(s.user.monitoringAcceptedAt),
    monitoringNotice: officeSettings(first?.settings).monitoringNotice,
    profile: s.user.profile ?? {},
    avatar: sanitizeAvatar(s.user.avatar ?? DEFAULT_AVATAR),
    interactionDistance: s.user.interactionDistance,
    offices,
    version: config.version,
    autoUpdateOnOpen: global.autoUpdateOnOpen,
    calendar: s.restricted || !can(s.role, 'calendar.use') ? { available: false, connected: false } : await calendarStatus(s.id),
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/version', async () => {
    const g = await getGlobalSettings();
    return { version: config.version, autoUpdateOnOpen: g.autoUpdateOnOpen, minClientVersion: g.minClientVersion, needsSetup: (await userCount()) === 0, livekitUrl: config.livekit.url };
  });

  // ---- configuração inicial: cria as duas contas de Dono ----
  app.post('/api/setup', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    if ((await userCount()) > 0) throw conflict('A configuração inicial já foi feita.', 'setup_done');
    const body = parse(
      z.object({
        token: z.string(),
        owners: z.array(z.object({ username: zUsername, displayName: zName, password: zPassword })).min(1).max(2),
      }),
      req.body,
    );
    if (body.token !== config.setupToken) throw forbidden('Token de configuração inválido.');
    if (new Set(body.owners.map((o) => o.username)).size !== body.owners.length) throw badRequest('Os nomes de usuário precisam ser diferentes.');
    const ids: string[] = [];
    for (const o of body.owners) {
      const id = newId();
      ids.push(id);
      await db().insert(schema.users).values({ id, username: o.username, displayName: o.displayName, passwordHash: await hashPassword(o.password), role: 'OWNER', mustChangePassword: false, createdAt: Date.now(), avatar: DEFAULT_AVATAR });
    }
    await audit({ id: ids[0], name: body.owners[0].displayName }, 'setup.owners', { meta: { owners: body.owners.map((o) => o.username) } });
    await createSession(reply, { userId: ids[0] });
    return { ok: true };
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const body = parse(z.object({ username: z.string().trim().toLowerCase().max(64), password: z.string().max(200), code: z.string().max(20).optional() }), req.body);
    const key = `${body.username}|${req.ip}`;
    if (tooManyAttempts(key)) throw new (await import('../lib/errors')).HttpError(429, 'too_many_attempts', 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
    const [user] = await db().select().from(schema.users).where(eq(schema.users.username, body.username));
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : (await verifyPassword(body.password, DUMMY_HASH), false);
    if (!user || !ok) {
      registerFailure(key);
      throw unauthorized('Usuário ou senha incorretos.');
    }
    if (user.totpEnabled && user.totpSecretEnc) {
      if (!body.code) return { needTotp: true };
      const code = body.code.trim().toLowerCase();
      let valid = verifyTotp(decrypt(user.totpSecretEnc), code);
      if (!valid && user.recoveryCodes.includes(sha256(code))) {
        valid = true;
        await db().update(schema.users).set({ recoveryCodes: user.recoveryCodes.filter((c) => c !== sha256(code)) }).where(eq(schema.users.id, user.id));
        await audit({ id: user.id, name: user.displayName }, 'auth.recovery_code_used');
      }
      if (!valid) {
        registerFailure(key);
        throw unauthorized('Código de verificação incorreto.');
      }
    }
    failures.delete(key);
    await createSession(reply, { userId: user.id });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    if (!req.subject) throw unauthorized();
    return mePayload(req.subject);
  });

  app.post('/api/auth/change-password', async (req) => {
    const u = requireUser(req, { allowRestricted: true });
    const body = parse(z.object({ current: z.string().max(200), next: zPassword }), req.body);
    if (!(await verifyPassword(body.current, u.user.passwordHash))) throw forbidden('A senha atual está incorreta.');
    if (body.current === body.next) throw badRequest('A nova senha precisa ser diferente da atual.');
    await db().update(schema.users).set({ passwordHash: await hashPassword(body.next), mustChangePassword: false }).where(eq(schema.users.id, u.id));
    // encerra as outras sessões
    const others = await db().select().from(schema.sessions).where(eq(schema.sessions.userId, u.id));
    for (const s of others) if (s.id !== req.sessionId) await db().delete(schema.sessions).where(eq(schema.sessions.id, s.id));
    return { ok: true };
  });

  app.post('/api/auth/totp/begin', async (req) => {
    const u = requireUser(req, { allowRestricted: true });
    if (u.user.totpEnabled) throw conflict('A verificação em duas etapas já está ativa.');
    const secret = newTotpSecret();
    await db().update(schema.users).set({ totpSecretEnc: encrypt(secret) }).where(eq(schema.users.id, u.id));
    return { secret, otpauthUrl: otpauthUrl(secret, u.user.username) };
  });

  app.post('/api/auth/totp/enable', async (req) => {
    const u = requireUser(req, { allowRestricted: true });
    const body = parse(z.object({ code: z.string().max(10) }), req.body);
    if (u.user.totpEnabled || !u.user.totpSecretEnc) throw badRequest('Comece a configuração de novo.');
    if (!verifyTotp(decrypt(u.user.totpSecretEnc), body.code)) throw badRequest('Código incorreto. Confira o horário do celular e tente de novo.');
    const codes = newRecoveryCodes();
    await db().update(schema.users).set({ totpEnabled: true, recoveryCodes: codes.map(sha256) }).where(eq(schema.users.id, u.id));
    await audit({ id: u.id, name: u.name }, 'auth.totp_enabled');
    return { recoveryCodes: codes };
  });

  app.post('/api/auth/totp/disable', async (req) => {
    const u = requireUser(req);
    if (u.role !== 'EMPLOYEE') throw forbidden('Donos e Admins precisam manter a verificação em duas etapas.');
    const body = parse(z.object({ password: z.string().max(200) }), req.body);
    if (!(await verifyPassword(body.password, u.user.passwordHash))) throw forbidden('Senha incorreta.');
    await db().update(schema.users).set({ totpEnabled: false, totpSecretEnc: null, recoveryCodes: [] }).where(eq(schema.users.id, u.id));
    return { ok: true };
  });

  app.post('/api/auth/accept-monitoring', async (req) => {
    const s = requireSubject(req);
    if (s.kind === 'user') await db().update(schema.users).set({ monitoringAcceptedAt: Date.now() }).where(eq(schema.users.id, s.id));
    return { ok: true };
  });
}

// ---- limite de tentativas de login: 5 falhas a cada 15 min por usuário+IP ----
const failures = new Map<string, { n: number; first: number }>();
const WINDOW = 15 * 60_000;
function tooManyAttempts(key: string): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW) {
    failures.delete(key);
    return false;
  }
  return f.n >= 5;
}
function registerFailure(key: string) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW) failures.set(key, { n: 1, first: Date.now() });
  else f.n++;
  if (failures.size > 5000) for (const [k, v] of failures) if (Date.now() - v.first > WINDOW) failures.delete(k);
}
export function resetLoginLimiter() {
  failures.clear();
}
// hash fixo para gastar o mesmo tempo quando o usuário não existe
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm8';
