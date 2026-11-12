// SPDX-License-Identifier: AGPL-3.0-only
// Empacota o processo principal e os preloads em arquivos únicos (sem node_modules em tempo de execução).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
  define: {
    __MAC_SIGNED__: JSON.stringify(process.env.MAC_SIGNED === '1'),
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? pkg.version),
    __SERVER_URL__: JSON.stringify(process.env.OFFICE_IMP_SERVER_URL ?? ''),
  },
};
await build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.js' });
await build({ ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.js' });
await build({ ...common, entryPoints: ['src/picker-preload.ts'], outfile: 'dist/picker-preload.js' });
