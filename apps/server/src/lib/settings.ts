import { eq } from 'drizzle-orm';
import { DEFAULT_OFFICE_SETTINGS, type OfficeSettings } from '@office-imp/shared';
import { db, schema } from '../db';
import { decrypt, encrypt } from './crypto';

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface GlobalSettings {
  autoUpdateOnOpen: boolean;
  autoUpdateServer: boolean;
  minClientVersion: string;
}

const DEFAULT_GLOBAL: GlobalSettings = { autoUpdateOnOpen: true, autoUpdateServer: false, minClientVersion: '' };

export async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await db().select().from(schema.appSettings).where(eq(schema.appSettings.key, key));
  return row ? (row.value as T) : null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db().insert(schema.appSettings).values({ key, value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  return { ...DEFAULT_GLOBAL, ...((await getSetting<Partial<GlobalSettings>>('global')) ?? {}) };
}

export async function setGlobalSettings(patch: Partial<GlobalSettings>): Promise<GlobalSettings> {
  const next = { ...(await getGlobalSettings()), ...patch };
  await setSetting('global', next);
  return next;
}

export async function getSmtp(): Promise<SmtpSettings | null> {
  const raw = await getSetting<{ enc: string }>('smtp');
  if (!raw?.enc) return null;
  try {
    return JSON.parse(decrypt(raw.enc));
  } catch {
    return null;
  }
}

export async function setSmtp(s: SmtpSettings | null): Promise<void> {
  if (!s) await db().delete(schema.appSettings).where(eq(schema.appSettings.key, 'smtp'));
  else await setSetting('smtp', { enc: encrypt(JSON.stringify(s)) });
}

export interface GoogleSettings {
  clientId: string;
  clientSecret: string;
}

export async function getGoogle(envFallback: GoogleSettings): Promise<GoogleSettings | null> {
  const raw = await getSetting<{ enc: string }>('google');
  if (raw?.enc) {
    try {
      const g = JSON.parse(decrypt(raw.enc)) as GoogleSettings;
      if (g.clientId && g.clientSecret) return g;
    } catch {}
  }
  return envFallback.clientId && envFallback.clientSecret ? envFallback : null;
}

export async function setGoogle(g: GoogleSettings | null): Promise<void> {
  if (!g) await db().delete(schema.appSettings).where(eq(schema.appSettings.key, 'google'));
  else await setSetting('google', { enc: encrypt(JSON.stringify(g)) });
}

export function officeSettings(raw: Partial<OfficeSettings> | null | undefined): OfficeSettings {
  return { ...DEFAULT_OFFICE_SETTINGS, ...(raw ?? {}) };
}
