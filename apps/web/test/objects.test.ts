// SPDX-License-Identifier: AGPL-3.0-only
import { createCanvas } from '@napi-rs/canvas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AVATAR_OPTIONS, DESK_SETUPS, DESK_TYPES, DIRS, OBJECT_DEFS, OBJECT_TYPES, deskSetups, emptyMap, objectColors, type AvatarConfig, type Dir, type MapObject } from '@office-imp/shared';
import { AV_FRAMES, AV_H, AV_W, avatarSheet } from '../src/game/art/avatar';
import { setCanvasFactory } from '../src/game/art/canvas';
import { REDESIGNED_TYPES, objectIcon, objectKey, objectSprite } from '../src/game/art/objects';
import { Sprite, rgba } from '../src/game/art/prim';
import { sortedObjects } from '../src/game/art/render';
import { SETUP_IDS } from '../src/game/art/setups';
import { artSheets, sampleAvatars } from '../src/game/art/sheet';
import { T } from '../src/game/art/tiles';

beforeAll(() => setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement));
afterAll(() => setCanvasFactory());

const obj = (type: string, extra: Partial<MapObject> = {}): MapObject => ({ id: 't', type, x: 0, y: 0, ...extra });
const pixels = (o: MapObject) => Sprite.fromCanvas(objectSprite(o));
const same = (a: Sprite, b: Sprite) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);

/** Hash dos pixels que não depende do arredondamento de alfa da biblioteca de canvas. */
function stableHash(c: HTMLCanvasElement): string {
  const s = Sprite.fromCanvas(c);
  let h = 2166136261;
  const add = (v: number) => {
    h = Math.imul(h ^ v, 16777619);
  };
  for (let i = 0; i < s.data.length; i += 4) {
    const a = s.data[i + 3];
    if (a === 255) {
      add(s.data[i]);
      add(s.data[i + 1]);
      add(s.data[i + 2]);
      add(255);
    } else add(a === 0 ? 0 : 1);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

describe('cor na chave do cache de sprite', () => {
  it('sem cor, com a cor padrão ou com cor desconhecida dá a mesma chave', () => {
    const def = objectColors('chair')[0].id;
    expect(objectKey(obj('chair'))).toBe(objectKey(obj('chair', { color: def })));
    expect(objectKey(obj('chair'))).toBe(objectKey(obj('chair', { color: 'nao-existe' })));
    expect(objectSprite(obj('chair'))).toBe(objectSprite(obj('chair', { color: def })));
  });

  it('cada variante tem chave e pixels próprios', () => {
    for (const type of OBJECT_TYPES) {
      const colors = objectColors(type);
      if (colors.length < 2) continue;
      const keys = new Set(colors.map((c) => objectKey(obj(type, { color: c.id }))));
      expect(keys.size).toBe(colors.length);
      const base = pixels(obj(type));
      for (const c of colors.slice(1)) expect([type, c.id, same(base, pixels(obj(type, { color: c.id })))]).toEqual([type, c.id, false]);
    }
  });

  it('a chave também separa direção e tamanho; tipo sem cores ignora o campo', () => {
    expect(objectKey(obj('chair', { dir: 'left' }))).not.toBe(objectKey(obj('chair', { dir: 'right' })));
    expect(objectKey(obj('table', { w: 5, h: 3 }))).not.toBe(objectKey(obj('table')));
    expect(objectKey(obj('desk', { color: 'blue' }))).toBe(objectKey(obj('desk')));
  });

  it('a cor da variante aparece no desenho', () => {
    for (const type of ['chair', 'sofa']) {
      for (const c of objectColors(type)) {
        const s = pixels(obj(type, { color: c.id }));
        const [r, g, b] = rgba(c.hex);
        let found = 0;
        for (let i = 0; i < s.data.length; i += 4) if (s.data[i] === r && s.data[i + 1] === g && s.data[i + 2] === b && s.data[i + 3] === 255) found++;
        expect(found).toBeGreaterThan(20);
      }
    }
    expect(objectIcon('chair', 'blue')).not.toBe(objectIcon('chair'));
  });
});

describe('setup da mesa e texto no sprite (Fase C2)', () => {
  it('todo setup do catálogo tem desenho', () => {
    expect([...SETUP_IDS].sort()).toEqual(DESK_SETUPS.map((st) => st.id).sort());
  });

  it('o setup entra na chave e no desenho de toda mesa; o padrão é igual a não ter setup', () => {
    for (const type of DESK_TYPES) {
      expect(objectKey(obj(type))).toBe(objectKey(obj(type, { setup: 'monitor' })));
      expect(objectKey(obj(type))).toBe(objectKey(obj(type, { setup: 'saiu-do-catalogo' })));
      const keys = new Set(DESK_SETUPS.map((st) => objectKey(obj(type, { setup: st.id }))));
      expect([type, keys.size]).toEqual([type, DESK_SETUPS.length]);
      const base = pixels(obj(type));
      for (const st of DESK_SETUPS.slice(1)) expect([type, st.id, same(base, pixels(obj(type, { setup: st.id })))]).toEqual([type, st.id, false]);
    }
    // fora de mesa o campo é ignorado
    expect(objectKey(obj('chair', { setup: 'gamer' }))).toBe(objectKey(obj('chair')));
  });

  it('a mesa em L com dir "right" sai espelhada', () => {
    const left = pixels(obj('desk_l', { setup: 'none' }));
    const right = pixels(obj('desk_l', { setup: 'none', dir: 'right' }));
    expect(same(left.flipX(), right)).toBe(true);
    expect(same(left, right)).toBe(false);
  });

  it('o letreiro neon desenha o texto de props.text, que entra na chave', () => {
    const def = OBJECT_DEFS.neon.text!.default;
    expect(objectKey(obj('neon'))).toBe(objectKey(obj('neon', { props: { text: def } })));
    expect(objectKey(obj('neon', { props: { text: 'CAFE' } }))).not.toBe(objectKey(obj('neon')));
    expect(same(pixels(obj('neon')), pixels(obj('neon', { props: { text: 'CAFE' } })))).toBe(false);
    // texto longo num letreiro estreito não estoura o sprite
    const long = pixels(obj('neon', { props: { text: 'X'.repeat(24) } }));
    expect([long.w, long.h]).toEqual([64, 32]);
  });

  it('objeto solto em cima da mesa é desenhado logo depois dela; o mousepad fica por baixo do teclado', () => {
    const map = emptyMap(8, 6);
    map.objects.push(
      { id: 'kb', type: 'keyboard', x: 2, y: 1 },
      { id: 'pad', type: 'mousepad', x: 2, y: 1 },
      { id: 'desk', type: 'desk', x: 1, y: 1 },
      { id: 'chair', type: 'chair', x: 1, y: 2 },
      { id: 'behind', type: 'plant_small', x: 3, y: 0 },
    );
    expect(sortedObjects(map).map((o) => o.id)).toEqual(['behind', 'desk', 'pad', 'kb', 'chair']);
  });
});

describe('sprites dos objetos', () => {
  it('todo tipo do catálogo desenha algo, no tamanho certo, em todas as cores e direções', () => {
    for (const type of OBJECT_TYPES) {
      const def = OBJECT_DEFS[type];
      for (const color of [undefined, ...objectColors(type).map((c) => c.id)]) {
        for (const dir of [undefined, ...DIRS] as (Dir | undefined)[]) {
          const s = pixels(obj(type, { dir, color }));
          expect([type, s.w, s.h]).toEqual([type, def.w * T, (def.h + (def.tall ?? 0)) * T]);
          expect(s.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
        }
      }
    }
  });

  it('objetos redesenhados têm contorno escuro em toda a borda e nenhum pixel suavizado', () => {
    // todo tipo com desenho do visual v2: cadeira e sofá (Fase A), mesas e assentos (C1), objetos de mesa e extras (C2),
    // plantas, móveis, copa, interativos e estrutura (C3)
    expect(REDESIGNED_TYPES).toEqual(
      expect.arrayContaining([
        ...['chair', 'sofa', 'armchair', 'photo', 'trophy', ...DESK_TYPES, 'keyboard', 'neon', 'aquarium', 'split_ac'],
        ...['plant', 'plant_small', 'monstera', 'snake_plant', 'cactus', 'succulent_bowl', 'palm', 'tall_vase', 'hanging_fern', 'wall_garden'],
        ...['table', 'table_round', 'counter', 'bookshelf', 'cabinet', 'lamp', 'podium', 'rug', 'rug_logo', 'frame', 'coffee', 'cooler', 'fridge'],
      ]),
    );
    const bad: string[] = [];
    for (const type of REDESIGNED_TYPES) {
      const colors = objectColors(type).length ? objectColors(type).map((c) => c.id) : [undefined];
      const setups = [undefined, ...deskSetups(type).map((st) => st.id)];
      const variants = colors.flatMap((color) => DIRS.flatMap((dir) => setups.map((setup) => ({ color, dir, setup }))));
      for (const v of variants) {
        const name = `${type}/${v.color}/${v.dir}/${v.setup}`;
        const s = pixels(obj(type, v));
        for (let y = 0; y < s.h; y++) {
          for (let x = 0; x < s.w; x++) {
            const a = s.alpha(x, y);
            if (a === 0) continue;
            if (a !== 255) bad.push(`${name} (${x},${y}): alfa ${a}`);
            const onEdge = s.alpha(x - 1, y) === 0 || s.alpha(x + 1, y) === 0 || s.alpha(x, y - 1) === 0 || s.alpha(x, y + 1) === 0;
            if (!onEdge) continue;
            const i = (y * s.w + x) * 4;
            if (Math.max(s.data[i], s.data[i + 1], s.data[i + 2]) >= 96) bad.push(`${name} (${x},${y}): borda sem contorno`);
          }
        }
      }
    }
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it('as folhas de conferência cobrem o catálogo inteiro', () => {
    const sheets = artSheets(1);
    expect(sheets.map((s) => s.name)).toEqual(['pisos', 'exterior', 'objetos', 'avatares']);
    const variants = OBJECT_TYPES.reduce((n, type) => n + Math.max(1, objectColors(type).length), 0);
    expect(sheets.find((s) => s.name === 'objetos')!.count).toBeGreaterThanOrEqual(variants);
    for (const s of sheets) expect(s.canvas.width * s.canvas.height).toBeGreaterThan(0);
    const big = artSheets(2);
    expect(big[0].canvas.width).toBe(sheets[0].canvas.width * 2);
  });
});

describe('avatar', () => {
  // O boneco não muda no visual v2: um avatar salvo tem que sair pixel a pixel igual.
  // Hashes gerados com a arte de antes do visual v2 (commit 218a6c9). Chave: pele.cabelo.corDoCabelo.camisa.calça.acessório.
  // Para ver os valores atuais: PRINT_AVATAR_HASHES=1 pnpm --filter @office-imp/web test
  const expected: Record<string, string> = {
    '0.1.0.0.0.0': 'd9d260bf', '1.2.1.1.1.1': 'e888d305', '2.3.2.2.2.2': '74473485', '3.4.3.3.3.3': '4e7b3dbf', '4.5.4.4.4.4': '351f118f',
    '0.0.5.5.5.0': '3bed96a9', '1.1.6.6.0.1': '6432016f', '2.2.0.7.1.2': 'ec0528b5', '3.3.1.8.2.3': 'ca03c5d5', '4.4.2.9.3.4': '4008141b',
    '0.0.0.0.0.0': '37b2a779', '1.0.1.3.1.1': '2511c981', '2.0.2.6.2.2': '1afac947', '3.0.3.9.3.3': 'a1c4546f', '4.0.4.2.4.4': 'af2fb709',
    '1.1.2.1.1.0': '1f32d573', '2.1.3.4.2.1': 'bf1daf77', '3.1.4.7.3.2': 'ea2f4733', '4.1.5.0.4.3': '6b5462c5', '0.1.6.3.5.4': 'fc8d8c97',
    '2.2.4.2.2.0': 'bf6bcd8d', '3.2.5.5.3.1': '9a800ca5', '4.2.6.8.4.2': '6d9ed725', '0.2.0.1.5.3': '3d2022cf', '1.2.1.4.0.4': '06f4d261',
    '3.3.6.3.3.0': '1d1ebd11', '4.3.0.6.4.1': 'e29182ad', '0.3.1.9.5.2': '66299ecd', '1.3.2.2.0.3': '940175b5', '2.3.3.5.1.4': '80299d31',
    '4.4.1.4.4.0': 'd79cf4df', '0.4.2.7.5.1': '4af5345f', '1.4.3.0.0.2': '8b9ca0a3', '2.4.4.3.1.3': '75f56f2f', '3.4.5.6.2.4': '0d4c9c67',
    '0.5.3.5.5.0': '5de8f427', '1.5.4.8.0.1': '38b7e933', '2.5.5.1.1.2': 'ee70c2bf', '3.5.6.4.2.3': '2b5035d5', '4.5.0.7.3.4': '25ac87ff',
  };

  const key = (c: AvatarConfig) => `${c.skin}.${c.hair}.${c.hairColor}.${c.shirt}.${c.pants}.${c.accessory}`;
  const configs: AvatarConfig[] = [...sampleAvatars()];
  const O = AVATAR_OPTIONS;
  for (let hair = 0; hair < O.hairStyles.length; hair++) for (let accessory = 0; accessory < O.accessories.length; accessory++) configs.push({ skin: (hair + accessory) % O.skin.length, hair, hairColor: (hair * 2 + accessory) % O.hairColor.length, shirt: (hair + accessory * 3) % O.shirt.length, pants: (hair + accessory) % O.pants.length, accessory });

  it('a folha tem 4 direções × 3 quadros de 32×48', () => {
    const c = avatarSheet(configs[0]);
    expect([c.width, c.height]).toEqual([AV_W * AV_FRAMES, AV_H * DIRS.length]);
    expect([AV_W, AV_H]).toEqual([32, 48]);
  });

  it('avatares salvos renderizam idênticos aos de antes do visual v2', () => {
    const got = Object.fromEntries(configs.map((c) => [key(c), stableHash(avatarSheet(c))]));
    if (process.env.PRINT_AVATAR_HASHES) console.log(JSON.stringify(got));
    expect(got).toEqual(expected);
  });
});
