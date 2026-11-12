// SPDX-License-Identifier: AGPL-3.0-only
// Gera apps/web/src/locales/pt-BR.json a partir das chamadas t('chave', 'texto padrão') do código.
// Para traduzir o app: copie o arquivo para es.json (ou en.json), traduza os valores e registre
// o idioma em apps/web/src/lib/i18n.ts.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['apps/web/src', 'packages/ui/src'];
const out = path.join(root, 'apps/web/src/locales/pt-BR.json');
const call = /\bt\(\s*'((?:[^'\\]|\\.)+)'\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/g;
const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

const found = new Map();
const conflicts = [];
for (const dir of dirs) {
  for (const file of files(path.join(root, dir))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(call)) {
      const key = m[1];
      const text = unescape(m[2] ?? m[3] ?? m[4] ?? '');
      if (found.has(key) && found.get(key) !== text) conflicts.push(`${key}: "${found.get(key)}" x "${text}" (${path.relative(root, file)})`);
      else found.set(key, text);
    }
  }
}
const sorted = Object.fromEntries([...found.entries()].sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`[i18n] ${found.size} textos em ${path.relative(root, out)}`);
if (conflicts.length) {
  console.error(`[i18n] ${conflicts.length} chave(s) com textos diferentes:\n  ${conflicts.join('\n  ')}`);
  process.exitCode = 1;
}
