import { createCanvas } from '@napi-rs/canvas';
import { generateOffice } from '@office-imp/map-engine';
import { setCanvasFactory } from '../src/game/art/canvas';
import { objectAnim, plantsInBreeze } from '../src/game/art/anim';
import { objectKey, objectSprite, objectStrip } from '../src/game/art/objects';
import { DECOR_KINDS, decorFrames, decorSprite, decorStrip, exteriorDecor, exteriorGrass } from '../src/game/art/exterior';
import { drawStatic, makeCanvas, T } from '../src/game/art/tiles';
setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);
for (const n of [15, 40, 100]) {
  const map = generateOffice({ name: 'Impera', size: 'custom', customCount: n, partners: 2, partnersShareRoom: true });
  const t = (label: string, f: () => void) => { const a = performance.now(); f(); console.log(`${n}p ${label}: ${(performance.now() - a).toFixed(0)} ms`); };
  console.log(`${n}p mapa ${map.width}x${map.height}, ${map.objects.length} objetos`);
  t('grama', () => exteriorGrass('day'));
  t('estáticos', () => { for (let cy = 0; cy < map.height; cy += 16) for (let cx = 0; cx < map.width; cx += 16) { const w = Math.min(16, map.width - cx), h = Math.min(16, map.height - cy); const c = makeCanvas(w * T, h * T); drawStatic(c.getContext('2d')!, map, cx, cy, w, h, 'day'); } });
  t('decor (lista)', () => exteriorDecor(map));
  t('decor (sprites, quadro 0)', () => { for (const k of DECOR_KINDS) decorSprite(k, 'day'); });
  t('decor (tiras)', () => { for (const k of DECOR_KINDS) if (decorFrames(k) > 1) decorStrip(k, 'day'); });
  const seen = new Set<string>(); let strips = 0;
  t('objetos (quadro 0)', () => { for (const o of map.objects) objectSprite(o); });
  t('objetos (tiras animadas)', () => { const b = plantsInBreeze(map); for (const o of map.objects) { const opts = { breeze: b.has(o.id) }; if (objectAnim(o, opts)) { const k = objectKey(o); if (!seen.has(k)) { seen.add(k); strips++; } objectStrip(o, opts); } } });
  console.log(`${n}p tiras distintas: ${strips}`);
}
