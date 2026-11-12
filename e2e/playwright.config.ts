// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 3100);
const dataDir = process.env.E2E_DATA_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'office-imp-e2e-'));
process.env.E2E_DATA_DIR = dataDir;

/**
 * Testes de ponta a ponta: sobem o servidor real (com PostgreSQL embutido) servindo o cliente web
 * já compilado e simulam três pessoas, cada uma em um navegador com câmera e microfone falsos.
 * Com E2E_LIVEKIT=1 (CI) também conferem o áudio e o vídeo de verdade pelo LiveKit.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        // com E2E_FAKE_AUDIO, o microfone falso toca um arquivo de fala (para conferir a transcrição)
        ...(process.env.E2E_FAKE_AUDIO ? [`--use-file-for-fake-audio-capture=${process.env.E2E_FAKE_AUDIO}`] : []),
      ],
    },
  },
  webServer: {
    command: 'node dist/index.js',
    cwd: path.join(here, '../apps/server'),
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'development',
      PORT: String(PORT),
      PUBLIC_URL: `http://localhost:${PORT}`,
      WEB_DIST: path.join(here, '../apps/web/dist'),
      DATA_DIR: dataDir,
      SETUP_TOKEN: 'e2e-setup-token',
      LIVEKIT_URL: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
      LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? 'devkey',
      LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? 'secret',
      LOG_LEVEL: 'warn',
      // notas de reunião com Egress e Whisper reais (CI)
      ...(process.env.EGRESS_OUT_DIR ? { EGRESS_OUT_DIR: process.env.EGRESS_OUT_DIR } : {}),
      ...(process.env.WHISPER_URL ? { WHISPER_URL: process.env.WHISPER_URL, WHISPER_LANGUAGE: process.env.WHISPER_LANGUAGE ?? 'pt' } : {}),
    },
  },
});
