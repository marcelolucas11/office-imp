// SPDX-License-Identifier: AGPL-3.0-only
// Testes unitários do cliente (arte desenhada por código). Rodam em Node, sem DOM:
// as primitivas são puras e os sprites usam o @napi-rs/canvas pela fábrica injetável.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
