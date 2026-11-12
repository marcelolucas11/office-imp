// SPDX-License-Identifier: AGPL-3.0-only
// Cria uma conta de Dono pela linha de comando (alternativa à tela /setup).
// Uso: pnpm setup:owner <usuario> "<Nome de exibição>" <senha>
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { DEFAULT_AVATAR } from '@office-imp/shared';
import { config } from '../config';
import { closeDb, db, initDb, schema } from '../db';
import { hashPassword, newId } from '../lib/crypto';

async function main() {
  const [username, displayName, password] = process.argv.slice(2);
  if (!username || !displayName || !password || password.length < 8) {
    console.error('Uso: setup:owner <usuario> "<Nome de exibição>" <senha com 8+ caracteres>');
    process.exit(1);
  }
  await initDb({ databaseUrl: config.databaseUrl, pgliteDir: config.databaseUrl ? null : path.join(config.dataDir, 'pglite') });
  const uname = username.trim().toLowerCase();
  const [dupe] = await db().select().from(schema.users).where(eq(schema.users.username, uname));
  if (dupe) {
    console.error(`Já existe um usuário "${uname}".`);
    process.exit(1);
  }
  await db().insert(schema.users).values({ id: newId(), username: uname, displayName, passwordHash: await hashPassword(password), role: 'OWNER', mustChangePassword: true, createdAt: Date.now(), avatar: DEFAULT_AVATAR });
  console.log(`Dono "${uname}" criado. No primeiro login ele vai trocar a senha e configurar a verificação em duas etapas.`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
