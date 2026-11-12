import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;
export { schema };

let dbInstance: DB | null = null;
let closeFn: (() => Promise<void>) | null = null;

function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const c of [path.join(here, '../../drizzle'), path.join(here, '../drizzle'), path.join(here, 'drizzle'), path.resolve('drizzle')]) {
    if (fs.existsSync(path.join(c, 'meta/_journal.json'))) return c;
  }
  throw new Error('Pasta de migrações (drizzle/) não encontrada.');
}

/**
 * Conecta ao banco. Com DATABASE_URL usa PostgreSQL; sem ela usa PGlite
 * (PostgreSQL embutido, em memória ou em disco) — ideal para desenvolvimento e testes.
 */
export async function initDb(opts: { databaseUrl?: string; pgliteDir?: string | null }): Promise<DB> {
  if (opts.databaseUrl) {
    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.Pool({ connectionString: opts.databaseUrl, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: migrationsFolder() });
    dbInstance = db;
    closeFn = () => pool.end();
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    if (opts.pgliteDir) fs.mkdirSync(opts.pgliteDir, { recursive: true });
    const client = opts.pgliteDir ? new PGlite(opts.pgliteDir) : new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: migrationsFolder() });
    dbInstance = db as unknown as DB;
    closeFn = () => client.close();
  }
  return dbInstance!;
}

export function db(): DB {
  if (!dbInstance) throw new Error('Banco não inicializado.');
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  await closeFn?.();
  dbInstance = null;
  closeFn = null;
}
