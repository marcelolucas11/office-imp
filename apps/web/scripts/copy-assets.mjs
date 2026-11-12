// SPDX-License-Identifier: AGPL-3.0-only
// Copia as fontes do Excalidraw para dist/excalidraw/fonts, para o quadro branco não depender de CDN.
// A família Xiaolai (CJK, ~13 MB) fica de fora; sem ela o texto em chinês/japonês usa a fonte do sistema.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(web);
const src = path.join(web, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts');
const dest = path.resolve('dist', 'excalidraw', 'fonts');
if (!existsSync(src)) {
  console.warn('[copy-assets] fontes do Excalidraw não encontradas em', src);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
let n = 0;
for (const family of readdirSync(src)) {
  if (family === 'Xiaolai') continue;
  cpSync(path.join(src, family), path.join(dest, family), { recursive: true, dereference: true });
  n++;
}
console.log(`[copy-assets] ${n} famílias de fontes copiadas para dist/excalidraw/fonts`);
