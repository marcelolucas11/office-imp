// SPDX-License-Identifier: AGPL-3.0-only
// Garante o cabeçalho SPDX em todos os arquivos-fonte. Uso: pnpm spdx  (ou "pnpm spdx --check" no CI)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'SPDX-License-Identifier: AGPL-3.0-only';
const SKIP = new Set(['node_modules', 'dist', 'build', 'release', '.git', '.turbo', 'drizzle', 'test-results', 'playwright-report', 'data']);
const STYLE = { '.ts': '//', '.tsx': '//', '.js': '//', '.mjs': '//', '.cjs': '//', '.css': '/*', '.sh': '#' };
const check = process.argv.includes('--check');

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (STYLE[path.extname(name)]) yield full;
  }
}

const missing = [];
for (const file of files(root)) {
  const src = readFileSync(file, 'utf8');
  if (src.slice(0, 600).includes(ID)) continue;
  missing.push(path.relative(root, file));
  if (check) continue;
  const style = STYLE[path.extname(file)];
  const line = style === '/*' ? `/* ${ID} */` : `${style} ${ID}`;
  if (src.startsWith('#!')) {
    const nl = src.indexOf('\n');
    writeFileSync(file, `${src.slice(0, nl + 1)}${line}\n${src.slice(nl + 1)}`);
  } else writeFileSync(file, `${line}\n${src}`);
}
if (check && missing.length) {
  console.error(`[spdx] ${missing.length} arquivo(s) sem cabeçalho:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log(check ? '[spdx] todos os arquivos têm o cabeçalho.' : `[spdx] cabeçalho adicionado em ${missing.length} arquivo(s).`);
