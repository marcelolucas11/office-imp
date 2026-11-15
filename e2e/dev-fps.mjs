// SPDX-License-Identifier: AGPL-3.0-only
// Mede o custo da cena parada na prévia /dev/cena com o Chrome sem janela: quadros por segundo
// (requestAnimationFrame) e tempo de CPU da página (métricas do DevTools: script e tarefas), com
// as animações de contexto ligadas e com "Reduzir animações". Uso, com o `pnpm dev` rodando:
//   node e2e/dev-fps.mjs ["http://localhost:5173/dev/cena?pessoas=15&animados=1"] [segundos] [rodadas] [largura] [altura]
// No fim mostra a memória de texturas, o heap de JS e o custo da troca de período (dia → noite).
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
// memória: texturas da cena (largura × altura × 4 bytes) e heap de JS depois de coletar o lixo
const tex = await page.evaluate(() => window.__oi.textures?.() ?? null);
await cdp.send('HeapProfiler.collectGarbage');
const heap = (await metrics()).JSHeapUsedSize / 1048576;
// troca de período (refaz os blocos estáticos se o mapa tem janela): tempo até a cena voltar a desenhar
const periodMs = await page.evaluate(
  () =>
    new Promise((done) => {
      window.__oi.bus.emit('period', 'day');
      const t0 = performance.now();
      window.__oi.bus.emit('period', 'night');
      const sync = performance.now() - t0;
      requestAnimationFrame(() => requestAnimationFrame(() => done({ sync, frames: performance.now() - t0 })));
    }),
);
await page.evaluate(() => window.__oi.bus.emit('period', null));
const fmt = (v) => v.toFixed(1).padStart(7);
console.log(`[dev-fps] ${url} ${w}x${h} (${secs} s por janela)`);
console.log('  modo        fps   script ms/s  tarefas ms/s  heap MB');
for (const row of rows) console.log(`  ${row.mode.padEnd(9)}${fmt(row.fps)}${fmt(row.scriptMsPerSec)}      ${fmt(row.taskMsPerSec)}       ${fmt(row.heapMb)}`);
if (tex) console.log(`  texturas: ${tex.count} (${(tex.bytes / 1048576).toFixed(1)} MB na GPU), ${tex.objects} objetos na cena; heap de JS após coleta: ${heap.toFixed(1)} MB`);
console.log(`  troca de período (dia → noite): ${periodMs.sync.toFixed(0)} ms de script, ${periodMs.frames.toFixed(0)} ms até 2 quadros depois`);
await browser.close();
