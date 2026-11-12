// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { GITHUB_REPO } from '@office-imp/shared';

const env = process.env;
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));
const isProd = env.NODE_ENV === 'production';

function secret(name: string): string {
  const v = env[name];
  if (v && v.length >= 16) return v;
  if (isProd) throw new Error(`Variável de ambiente obrigatória ausente ou curta demais: ${name}`);
  return `dev-${name}-inseguro-apenas-para-desenvolvimento`;
}

const dataDir = path.resolve(env.DATA_DIR ?? './data');

export const config = {
  isProd,
  role: (env.ROLE ?? 'all') as 'all' | 'api' | 'worker',
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  publicUrl: (env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  databaseUrl: env.DATABASE_URL ?? '',
  redisUrl: env.REDIS_URL ?? '',
  appSecret: secret('APP_SECRET'),
  encryptionKey: secret('APP_ENCRYPTION_KEY'),
  cookieSecure: bool(env.COOKIE_SECURE, isProd),
  setupToken: env.SETUP_TOKEN || randomBytes(18).toString('base64url'),
  setupTokenFromEnv: Boolean(env.SETUP_TOKEN),
  dataDir,
  meetingsDir: path.join(dataDir, 'meetings'),
  uploadsDir: path.join(dataDir, 'uploads'),
  /** Caminho da pasta de reuniões visto de dentro do container do LiveKit Egress. */
  egressOutDir: env.EGRESS_OUT_DIR ?? path.join(dataDir, 'meetings'),
  webDist: env.WEB_DIST ?? '',
  livekit: {
    /** URL pública (wss://) usada pelos navegadores. */
    url: env.LIVEKIT_URL ?? 'ws://localhost:7880',
    /** URL interna (http://) usada pelo servidor para a API do LiveKit. */
    apiUrl: env.LIVEKIT_API_URL ?? (env.LIVEKIT_URL ?? 'ws://localhost:7880').replace(/^ws/, 'http'),
    apiKey: env.LIVEKIT_API_KEY ?? 'devkey',
    apiSecret: env.LIVEKIT_API_SECRET ?? 'secret',
  },
  whisperUrl: env.WHISPER_URL ?? '',
  whisperLanguage: env.WHISPER_LANGUAGE ?? 'pt',
  summary: {
    url: env.SUMMARY_LLM_URL ?? '',
    model: env.SUMMARY_LLM_MODEL ?? 'llama3.1',
    key: env.SUMMARY_LLM_KEY ?? '',
  },
  google: {
    clientId: env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
  },
  updater: {
    url: env.UPDATER_URL ?? '',
    token: env.UPDATER_TOKEN ?? '',
  },
  version: env.APP_VERSION ?? '1.0.0',
  githubRepo: env.GITHUB_REPO ?? GITHUB_REPO,
  sessionDays: Number(env.SESSION_DAYS ?? 30),
  logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
};

export type Config = typeof config;
