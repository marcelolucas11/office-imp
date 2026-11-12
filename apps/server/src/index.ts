// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { attachRealtime, buildApp } from './app';
import { config } from './config';
import { closeDb, db, initDb, schema } from './db';
import { enqueue, startQueue, stopQueue } from './lib/queue';
import { closeDanglingIntervals, heartbeat } from './realtime/tracker';
import { registerMeetingJobs } from './services/meetings';
import { autoUpdateServerIfEnabled } from './services/updates';

async function main() {
  fs.mkdirSync(config.meetingsDir, { recursive: true });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  await initDb({ databaseUrl: config.databaseUrl, pgliteDir: config.databaseUrl ? null : path.join(config.dataDir, 'pglite') });
  registerMeetingJobs();

  if (config.role === 'worker') {
    await startQueue({ processJobs: true });
    console.log('[office-imp] worker de tarefas iniciado (transcrição, e-mail, limpeza).');
    const stop = async () => {
      await stopQueue();
      await closeDb();
      process.exit(0);
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    return;
  }

  await closeDanglingIntervals();
  await startQueue({ processJobs: config.role === 'all' });
  const app = await buildApp();
  await app.ready();
  const gameServer = await attachRealtime(app);
  await app.listen({ port: config.port, host: config.host });

  setInterval(() => void heartbeat(), 60_000).unref();
  void heartbeat();
  // limpeza diária (retenção de áudio, chat e sessões)
  setInterval(() => void enqueue('cleanup', {}), 24 * 3600_000).unref();
  setTimeout(() => void enqueue('cleanup', {}), 60_000).unref();
  setInterval(() => void autoUpdateServerIfEnabled().catch((e) => console.warn('[office-imp] atualização automática falhou:', (e as Error).message)), 3600_000).unref();

  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.users);
  console.log(`[office-imp] v${config.version} em http://${config.host}:${config.port} — endereço público: ${config.publicUrl}`);
  if (n === 0) {
    console.log('==================================================================');
    console.log(' Primeira execução: crie as contas de Dono em');
    console.log(`   ${config.publicUrl}/setup`);
    console.log(` Token de configuração: ${config.setupToken}`);
    console.log('==================================================================');
  }

  const shutdown = async () => {
    try {
      await gameServer.gracefullyShutdown(false);
      await app.close();
      await stopQueue();
      await closeDb();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error('[office-imp] falha ao iniciar:', e);
  process.exit(1);
});
