// SPDX-License-Identifier: AGPL-3.0-only
// Tira um print de uma página do servidor de desenvolvimento (por padrão, a prévia /dev/cena)
// com o Chrome sem janela. Uso, com `pnpm --filter @office-imp/web dev` rodando:
//   node e2e/dev-shot.mjs saida.png ["http://localhost:5173/dev/cena?pessoas=7&periodo=night"] [largura] [altura] [espera_ms] [js]
// `js` roda na página antes do print (ex.: "window.__oi.bus.emit('zoom', -1)").
// O Chrome vem de CHROME_PATH (ou /usr/bin/google-chrome); não precisa do navegador do Playwright.
import { chromium } from '@playwright/test';

const [, , out = 'cena.png', url = 'http://localhost:5173/dev/cena', w = '1920', h = '1080', wait = '2500', js = ''] = process.argv;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=game] canvas', { timeout: 20000 });
await page.waitForTimeout(1200);
if (js) await page.evaluate(js);
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
await browser.close();
console.log(`[dev-shot] ${out} ${w}x${h}${errors.length ? `\n  erros na página: ${errors.join(' | ')}` : ''}`);
