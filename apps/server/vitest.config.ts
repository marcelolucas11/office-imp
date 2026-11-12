// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'threads',
  },
});
