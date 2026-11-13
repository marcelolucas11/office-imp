// SPDX-License-Identifier: AGPL-3.0-only
// Gera as folhas de conferência visual em PNG, em Node, sem navegador.
// Uso: pnpm art:sheet [--scale=3] [--out=docs/visual-v2/sheet]
// Os desenhos são os mesmos módulos do cliente (src/game/art); aqui só se injeta a
// fábrica de canvas do @napi-rs/canvas no lugar de `document.createElement`.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { setCanvasFactory } from '../src/game/art/canvas';
import { artSheets } from '../src/game/art/sheet';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const scale = Math.max(1, Math.min(8, Number(arg('scale') ?? 3) || 3));
const outDir = path.resolve(root, arg('out') ?? 'docs/visual-v2/sheet');

const started = performance.now();
setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);
mkdirSync(outDir, { recursive: true });
for (const sheet of artSheets(scale)) {
  const file = path.join(outDir, `${sheet.name}.png`);
  const png = (sheet.canvas as unknown as { toBuffer(mime: 'image/png'): Buffer }).toBuffer('image/png');
  writeFileSync(file, png);
  console.log(`[art:sheet] ${path.relative(root, file)}  ${sheet.canvas.width}x${sheet.canvas.height}  ${sheet.count} itens`);
}
console.log(`[art:sheet] pronto em ${Math.round(performance.now() - started)} ms (escala ${scale}x)`);
