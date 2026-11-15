// SPDX-License-Identifier: AGPL-3.0-only
// Mede o custo da cena parada na prévia /dev/cena com o Chrome sem janela: quadros por segundo
// (requestAnimationFrame) e tempo de CPU da página (métricas do DevTools: script e tarefas), com
// as animações de contexto ligadas e com "Reduzir animações". Uso, com o `pnpm dev` rodando:
//   node e2e/dev-fps.mjs ["http://localhost:5173/dev/cena?pessoas=15&animados=1"] [segundos] [rodadas] [largura] [altura]
// O Chrome vem de CHROME_PATH (ou /usr/bin/google-chrome). Sem GPU (WebGL por software), o FPS
// absoluto é bem menor que numa máquina comum: compare as duas colunas entre si.
import { chromium } from '@playwright/test';

const [, , url = 'http://localhost:5173/dev/cena?pessoas=15&animados=1', secs = '5', rounds = '2', w = '1600', h = '900'] = process.argv;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=game] canvas', { timeout: 20000 });
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

/** Uma janela de medição: quadros, CPU de script e de tarefas (ms por segundo de relógio). */
async function measure(reduce) {
  await page.evaluate((r) => window.__oi.motion.set(r), reduce);
  await page.waitForTimeout(800);
  const before = await metrics();
  const frames = await page.evaluate(
    (ms) =>
      new Promise((done) => {
        let n = 0;
        const end = performance.now() + ms;
        const step = (t) => {
          n++;
          if (t < end) requestAnimationFrame(step);
          else done(n);
        };
        requestAnimationFrame(step);
      }),
    Number(secs) * 1000,
  );
  const after = await metrics();
  const wall = after.Timestamp - before.Timestamp;
  return {
    fps: frames / Number(secs),
    scriptMsPerSec: ((after.ScriptDuration - before.ScriptDuration) * 1000) / wall,
    taskMsPerSec: ((after.TaskDuration - before.TaskDuration) * 1000) / wall,
    heapMb: after.JSHeapUsedSize / 1048576,
  };
}

const rows = [];
for (let r = 0; r < Number(rounds); r++) {
  rows.push({ mode: 'animando', ...(await measure(false)) });
  rows.push({ mode: 'reduzido', ...(await measure(true)) });
}
await page.evaluate(() => window.__oi.motion.set(false));
const fmt = (v) => v.toFixed(1).padStart(7);
console.log(`[dev-fps] ${url} ${w}x${h} (${secs} s por janela)`);
console.log('  modo        fps   script ms/s  tarefas ms/s  heap MB');
for (const row of rows) console.log(`  ${row.mode.padEnd(9)}${fmt(row.fps)}${fmt(row.scriptMsPerSec)}      ${fmt(row.taskMsPerSec)}       ${fmt(row.heapMb)}`);
await browser.close();
