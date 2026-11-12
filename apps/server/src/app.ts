// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { config } from './config';
import { loadSubject } from './lib/auth';
import { HttpError } from './lib/errors';
import { OfficeRoom } from './realtime/office-room';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { inviteRoutes } from './routes/invites';
import { miscRoutes } from './routes/misc';
import { officeRoutes } from './routes/offices';
import { userRoutes } from './routes/users';

/** Política de conteúdo: YouTube (rádio/TV), iframes https da Build Tool e o LiveKit. */
export function cspDirectives() {
  let lk = '';
  try {
    const u = new URL(config.livekit.url);
    lk = `${u.protocol === 'wss:' ? 'wss:' : 'ws:'}//${u.host} ${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
  } catch {}
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com', "'wasm-unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    mediaSrc: ["'self'", 'blob:', 'data:'],
    connectSrc: ["'self'", 'ws:', 'wss:', ...(lk ? lk.split(' ') : []), 'https://api.github.com'],
    frameSrc: ["'self'", 'https:'],
    workerSrc: ["'self'", 'blob:'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'self'"],
    upgradeInsecureRequests: null,
  };
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    trustProxy: true,
    bodyLimit: 12 * 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: { useDefaults: false, directives: cspDirectives() as any }, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  app.decorateRequest('subject', null);
  app.decorateRequest('sessionId', null);
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/')) await loadSubject(req);
  });

  // proteção simples contra CSRF: requisições que mudam estado precisam vir da própria origem
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.method === 'GET' || req.method === 'HEAD') return;
    const origin = req.headers.origin;
    if (!origin) return;
    const allowed = new Set([config.publicUrl, `${req.protocol}://${req.headers.host}`]);
    if (!allowed.has(origin) && !(config.isProd === false && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
      reply.code(403).send({ error: 'bad_origin', message: 'Origem não permitida.' });
    }
  });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: err.message });
    if (err?.statusCode === 429) return reply.code(429).send({ error: 'rate_limited', message: 'Muitas requisições. Tente de novo em alguns minutos.' });
    if (err?.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: 'bad_request', message: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Erro interno do servidor.' });
  });

  app.get('/api/health', async () => ({ ok: true, version: config.version }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(officeRoutes);
  await app.register(inviteRoutes);
  await app.register(adminRoutes);
  await app.register(miscRoutes);

  // opcional: servir o cliente web pelo próprio servidor (dev/E2E ou instalação de um container só)
  if (config.webDist && fs.existsSync(path.join(config.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: path.resolve(config.webDist), wildcard: false, maxAge: '1h' });
    app.setNotFoundHandler((req, reply) => {
      const pathname = req.url.split('?')[0];
      // API, tempo real e arquivos (com extensão) que não existem respondem 404; o resto é rota do app (SPA)
      if (pathname.startsWith('/api/') || pathname.startsWith('/rt/') || /\.[a-z0-9]{2,5}$/i.test(pathname)) return reply.code(404).send({ error: 'not_found', message: 'Não encontrado.' });
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found', message: 'Não encontrado.' }));
  }

  return app;
}

/** Anexa o tempo real (Colyseus) ao mesmo servidor HTTP. O cliente usa o prefixo /rt. */
export async function attachRealtime(app: FastifyInstance, opts: { gracefullyShutdown?: boolean } = {}): Promise<Server> {
  const transport = new WebSocketTransport({ server: app.server, maxPayload: 2 * 1024 * 1024, pingInterval: 5000, pingMaxRetries: 3 });
  const gameServer = new Server({ transport, greet: false, gracefullyShutdown: opts.gracefullyShutdown ?? false });
  gameServer.define('office', OfficeRoom).filterBy(['officeId']);
  await matchMaker.accept();
  return gameServer;
}
