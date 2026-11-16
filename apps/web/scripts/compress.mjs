// SPDX-License-Identifier: AGPL-3.0-only
// Gera as versões comprimidas (.br e .gz) dos arquivos de texto do dist. O servidor entrega a
// versão comprimida a quem aceita (`preCompressed` do @fastify/static), sem gastar CPU a cada
// acesso e sem depender de o proxy da VPS (Traefik, nginx…) comprimir: o JS do escritório cai de
// ~2,3 MB para ~0,5 MB na rede.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TEXT = /\.(js|mjs|css|html|svg|json|wasm|txt|map)$/i;
const MIN = 1024;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let files = 0;
let before = 0;
let after = 0;
const t0 = Date.now();
for (const file of walk(dist)) {
  if (!TEXT.test(file)) continue;
  const buf = readFileSync(file);
  if (buf.length < MIN) continue;
  const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
  const gz = gzipSync(buf, { level: 9 });
  // só vale a pena se ficar menor
  if (br.length < buf.length) writeFileSync(`${file}.br`, br);
  if (gz.length < buf.length) writeFileSync(`${file}.gz`, gz);
  files++;
  before += buf.length;
  after += Math.min(br.length, buf.length);
}
const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(`[compress] ${files} arquivos: ${mb(before)} MB → ${mb(after)} MB (brotli) em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
