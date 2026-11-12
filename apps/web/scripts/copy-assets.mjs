// Copia as fontes do Excalidraw para dist/excalidraw/fonts, para o quadro branco não depender de CDN.
// A família Xiaolai (CJK, ~13 MB) fica de fora; sem ela o texto em chinês/japonês usa a fonte do sistema.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('@excalidraw/excalidraw/package.json'));
const src = path.join(root, 'dist', 'prod', 'fonts');
const dest = path.resolve('dist', 'excalidraw', 'fonts');
if (!existsSync(src)) {
  console.warn('[copy-assets] fontes do Excalidraw não encontradas em', src);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
let n = 0;
for (const family of readdirSync(src)) {
  if (family === 'Xiaolai') continue;
  cpSync(path.join(src, family), path.join(dest, family), { recursive: true });
  n++;
}
console.log(`[copy-assets] ${n} famílias de fontes copiadas para dist/excalidraw/fonts`);
