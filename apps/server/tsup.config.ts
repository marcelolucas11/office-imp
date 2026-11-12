// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'setup-owner': 'src/cli/setup-owner.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // os pacotes do workspace são código TypeScript: entram no bundle
  noExternal: [/^@office-imp\//],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
