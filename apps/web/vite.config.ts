// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const api = process.env.VITE_DEV_API ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? pkg.version) },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: api, changeOrigin: false },
      '/rt': { target: api, ws: true, changeOrigin: false },
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, sourcemap: false },
});
