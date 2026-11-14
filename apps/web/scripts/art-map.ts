// SPDX-License-Identifier: AGPL-3.0-only
// Gera um escritório de exemplo pelo map-engine e renderiza o mapa inteiro em PNG, em Node,
// sem navegador: exterior (grama e árvores), chão, paredes com a vista das janelas e objetos,
// como aparece no jogo (sem avatares).
//
// Uso: pnpm art:map [--size=15] [--partners=2] [--solo] [--period=day] [--margin=8] [--scale=1]
//                   [--theme=2] [--json=mapa.json] [--name=rotulo] [--out=docs/visual-v2/prints]
//   --size     small | medium | número de pessoas (1 a 100). Padrão: 15
//   --partners quantos sócios (padrão 2); --solo dá uma sala para cada um
//   --period   dawn | day | dusk | night | all (os quatro). Padrão: day
//   --margin   blocos de exterior em volta do mapa (padrão 8)
//   --theme    1 = pisos de antes do visual v2 (como um escritório já existente); 2 = pisos novos
//   --json     renderiza um mapa salvo (JSON no formato do office-imp) em vez de gerar um
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { CORRIDOR_H, ROOM_H, buildWing, generateOffice, modulesForInput, validateOffice } from '@office-imp/map-engine';
import { DAY_PERIODS, emptyMap, validateMapShape, type DayPeriod, type GeneratorMeta, type OfficeMap, type WizardInput } from '@office-imp/shared';
import { setCanvasFactory } from '../src/game/art/canvas';
import { renderScene } from '../src/game/art/render';
import { scaleCanvas } from '../src/game/art/sheet';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);
const int = (v: string | undefined, def: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v ?? def)) || def));

const sizeArg = arg('size') ?? '15';
const input: WizardInput =
  sizeArg === 'small' || sizeArg === 'medium'
    ? { name: 'Impera', size: sizeArg, partners: int(arg('partners'), 2, 0, 10), partnersShareRoom: !flag('solo') }
    : { name: 'Impera', size: 'custom', customCount: int(sizeArg, 15, 1, 100), partners: int(arg('partners'), 2, 0, 10), partnersShareRoom: !flag('solo') };
const periodArg = arg('period') ?? 'day';
const periods: DayPeriod[] = periodArg === 'all' ? DAY_PERIODS : DAY_PERIODS.includes(periodArg as DayPeriod) ? [periodArg as DayPeriod] : ['day'];
const margin = int(arg('margin'), 8, 0, 40);
const scale = int(arg('scale'), 1, 1, 4);
const theme = int(arg('theme'), 2, 1, 2);
const outDir = path.resolve(root, arg('out') ?? 'docs/visual-v2/prints');

/** Escritório com os pisos de antes do visual v2 (o que o gerador fazia na versão 1). */
function legacyOffice(inp: WizardInput): OfficeMap {
  const map = emptyMap(1, ROOM_H * 2 + CORRIDOR_H);
  const gen: GeneratorMeta = { version: 1, corridorY: ROOM_H, topX: 0, bottomX: 0, endX: 0, roomHeight: ROOM_H, counters: {} };
  buildWing(map, gen, modulesForInput(inp), 0, false);
  map.meta = { gen };
  return map;
}

function loadMap(): { map: OfficeMap; label: string } {
  const json = arg('json');
  if (json) {
    const map = JSON.parse(readFileSync(path.resolve(process.cwd(), json), 'utf8')) as OfficeMap;
    const error = validateMapShape(map);
    if (error) throw new Error(`mapa inválido: ${error}`);
    return { map, label: path.basename(json).replace(/\.json$/i, '') };
  }
  const people = input.size === 'custom' ? String(input.customCount) : input.size;
  return { map: theme === 1 ? legacyOffice(input) : generateOffice(input), label: `${people}p${theme === 1 ? '-pisos-antigos' : ''}` };
}

const started = performance.now();
setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);
const { map, label } = loadMap();
const check = validateOffice(map);
if (check.errors.length) console.warn(`[art:map] aviso: ${check.errors.join(' | ')}`);
mkdirSync(outDir, { recursive: true });
for (const period of periods) {
  const canvas = scaleCanvas(renderScene(map, { period, margin }), scale);
  const file = path.join(outDir, `mapa-${arg('name') ?? label}-${period}.png`);
  writeFileSync(file, (canvas as unknown as { toBuffer(mime: 'image/png'): Buffer }).toBuffer('image/png'));
  console.log(`[art:map] ${path.relative(root, file)}  ${canvas.width}x${canvas.height}  (${map.width}x${map.height} blocos, ${map.objects.length} objetos, ${period})`);
}
console.log(`[art:map] pronto em ${Math.round(performance.now() - started)} ms`);
