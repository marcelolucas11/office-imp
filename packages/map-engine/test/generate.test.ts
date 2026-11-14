// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { OBJECT_DEFS, buildCollision, deskSeat, emptyMap, Floor, objectGroup, floodFill, mapDesks, MAX_MAP_SIZE, rectContains, rectsOverlap, stripDerivedAreas, withDeskAreas, type GeneratorMeta, type OfficeMap, type WizardInput } from '@office-imp/shared';
import { buildWing, CORRIDOR_H, expandOffice, FLOOR_THEMES, generateOffice, GENERATOR_VERSION, modulesForInput, PLANT_PAIRS, renderAscii, reserveBlankWing, ROOM_H, toTiled, validateOffice } from '../src';

const base: WizardInput = { name: 'Impera', size: 'small', partners: 2, partnersShareRoom: true };

describe('gerador de escritórios', () => {
  it('é determinístico', () => {
    expect(JSON.stringify(generateOffice(base))).toBe(JSON.stringify(generateOffice(base)));
  });

  it.each([
    ['small', undefined, 10],
    ['medium', undefined, 21],
    ['custom', 7, 7],
    ['custom', 15, 15],
    ['custom', 40, 40],
    ['custom', 100, 100],
  ] as const)('template %s (%s) tem mesas suficientes e é válido', (size, customCount, need) => {
    for (const partnersShareRoom of [true, false]) {
      for (const partners of [0, 2, 5]) {
        const map = generateOffice({ name: 'X', size, customCount, partners, partnersShareRoom });
        const res = validateOffice(map);
        expect(res.errors).toEqual([]);
        const desks = mapDesks(map);
        const regular = desks.filter((d) => !d.props?.partner).length;
        const partnerDesks = desks.filter((d) => d.props?.partner).length;
        expect(regular).toBeGreaterThanOrEqual(need);
        expect(partnerDesks).toBe(partners);
        expect(map.width).toBeLessThanOrEqual(MAX_MAP_SIZE);
        expect(map.height).toBeLessThanOrEqual(MAX_MAP_SIZE);
      }
    }
  });

  it('segue a tabela de módulos', () => {
    const count = (input: WizardInput, kind: string) => modulesForInput(input).filter((m) => m.kind === kind).length;
    expect(count({ ...base, size: 'small' }, 'meeting')).toBe(1);
    expect(count({ ...base, size: 'small' }, 'auditorium')).toBe(0);
    expect(count({ ...base, size: 'small' }, 'desks')).toBe(2);
    expect(count({ ...base, size: 'medium' }, 'meeting')).toBe(2);
    expect(count({ ...base, size: 'medium' }, 'auditorium')).toBe(1);
    expect(count({ ...base, size: 'medium' }, 'desks')).toBe(4);
    expect(count({ ...base, size: 'custom', customCount: 40 }, 'meeting')).toBe(4);
    expect(count({ ...base, size: 'custom', customCount: 40 }, 'lounge')).toBe(2);
    expect(count({ ...base, size: 'custom', customCount: 40 }, 'desks')).toBe(7);
    expect(count({ ...base, partnersShareRoom: true }, 'partnersShared')).toBe(1);
    expect(count({ ...base, partners: 3, partnersShareRoom: false }, 'partnerSolo')).toBe(3);
  });

  it('todo cômodo é alcançável a partir do spawn', () => {
    const map = generateOffice({ ...base, size: 'medium', partners: 3, partnersShareRoom: false });
    const grid = buildCollision(map);
    const reach = floodFill(grid, map.width, map.height, map.spawns[0]);
    for (const door of map.objects.filter((o) => o.type === 'door')) expect(reach[door.y * map.width + door.x]).toBe(1);
  });

  it('nenhuma área privada se sobrepõe a outra', () => {
    const map = generateOffice({ ...base, size: 'custom', customCount: 60 });
    expect(validateOffice(map).errors.filter((e) => e.includes('sobrepõem'))).toEqual([]);
  });

  it('expansão anexa ala nova sem alterar o que existe', () => {
    const before = generateOffice(base);
    const plan = expandOffice(before, 8);
    const after = plan.map;
    expect(plan.addedDesks).toBe(12);
    expect(validateOffice(after).errors).toEqual([]);
    // tudo que existia continua igual, exceto a parede leste do corredor (3 tiles) e as bordas vazias
    let changed = 0;
    for (let y = 0; y < before.height; y++) {
      for (let x = 0; x < before.width; x++) {
        const a = before.layers.floor[y * before.width + x] + 100 * before.layers.walls[y * before.width + x];
        const b = after.layers.floor[y * after.width + x] + 100 * after.layers.walls[y * after.width + x];
        if (a !== b) {
          changed++;
          // só pode mudar tile que era parede ou vazio
          expect(before.layers.walls[y * before.width + x] !== 0 || before.layers.floor[y * before.width + x] === 0).toBe(true);
        }
      }
    }
    expect(changed).toBeGreaterThan(0);
    const ids = new Set(before.objects.map((o) => o.id));
    for (const o of before.objects) expect(after.objects.find((p) => p.id === o.id)).toEqual(o);
    for (const a of before.areas) expect(after.areas.find((p) => p.id === a.id)).toEqual(a);
    expect(after.objects.filter((o) => !ids.has(o.id)).length).toBeGreaterThan(0);
    expect(new Set(after.objects.map((o) => o.id)).size).toBe(after.objects.length);
    // expansões sucessivas continuam válidas
    const again = expandOffice(after, 20);
    expect(validateOffice(again.map).errors).toEqual([]);
    expect(mapDesks(again.map).length).toBe(mapDesks(after).length + 24);
  });

  it('expande mapas editados à mão (sem meta do gerador)', () => {
    const map = generateOffice(base);
    delete map.meta;
    const plan = expandOffice(map, 6);
    expect(validateOffice(plan.map).errors).toEqual([]);
    expect(plan.addedDesks).toBeGreaterThanOrEqual(6);
  });

  it('reserva área em branco para montagem manual', () => {
    const map = generateOffice(base);
    const plan = reserveBlankWing(map, 16);
    expect(validateOffice(plan.map).errors).toEqual([]);
    expect(plan.addedDesks).toBe(0);
    expect(plan.map.width).toBeGreaterThan(map.width);
  });

  it('exporta para o formato do Tiled', () => {
    const t = toTiled(generateOffice(base)) as any;
    expect(t.tilewidth).toBe(32);
    expect(t.layers.map((l: any) => l.name)).toEqual(['chao', 'paredes', 'objetos', 'areas', 'spawns']);
  });

  it('desenha em ASCII', () => {
    const txt = renderAscii(generateOffice(base));
    expect(txt).toContain('@');
    expect(txt).toContain('D');
  });
});

/** Escritório como o gerador fazia antes do visual v2 (versão 1 do meta). */
function legacyOffice(input: WizardInput): OfficeMap {
  const map = emptyMap(1, ROOM_H * 2 + CORRIDOR_H);
  const gen: GeneratorMeta = { version: 1, corridorY: ROOM_H, topX: 0, bottomX: 0, endX: 0, roomHeight: ROOM_H, counters: {} };
  buildWing(map, gen, modulesForInput(input), 0, false);
  map.meta = { gen };
  return map;
}

const floorsOf = (map: OfficeMap, x0 = 0) => {
  const set = new Set<number>();
  for (let y = 0; y < map.height; y++) for (let x = x0; x < map.width; x++) set.add(map.layers.floor[y * map.width + x]);
  set.delete(0);
  return set;
};

/** Piso embaixo do primeiro objeto do tipo dado (identifica o cômodo: só a copa tem cafeteira, etc.). */
const roomFloorAt = (map: OfficeMap, type: string, partner = false) => {
  const o = map.objects.find((x) => x.type === type && Boolean(x.props?.partner) === partner)!;
  return map.layers.floor[o.y * map.width + o.x];
};

describe('pisos do visual v2 no gerador', () => {
  const input: WizardInput = { name: 'Impera', size: 'medium', partners: 2, partnersShareRoom: true };

  it('escritório novo usa os pisos novos por tipo de cômodo', () => {
    const map = generateOffice(input);
    expect(map.meta?.gen?.version).toBe(GENERATOR_VERSION);
    const used = floorsOf(map);
    for (const f of [Floor.Herringbone, Floor.CarpetPattern, Floor.Porcelain, Floor.BurntCement]) expect(used.has(f)).toBe(true);
    // os pisos que os novos substituíram não aparecem mais
    for (const f of [Floor.Wood, Floor.Kitchen, Floor.Corridor]) expect(used.has(f)).toBe(false);
    const gen = map.meta!.gen!;
    for (let y = gen.corridorY; y < gen.corridorY + CORRIDOR_H; y++) expect(map.layers.floor[y * map.width + 3]).toBe(Floor.BurntCement);
    expect(roomFloorAt(map, 'desk')).toBe(Floor.Herringbone); // sala de mesas
    expect(roomFloorAt(map, 'desk', true)).toBe(Floor.CarpetGold); // sala dos sócios
    expect(roomFloorAt(map, 'coffee')).toBe(Floor.Porcelain); // copa
    expect(roomFloorAt(map, 'whiteboard')).toBe(Floor.CarpetPattern); // reunião
    expect(roomFloorAt(map, 'rug_logo')).toBe(Floor.Tile); // recepção
    expect(roomFloorAt(map, 'podium')).toBe(Floor.Stage); // palco
  });

  it('o tema antigo continua igual ao de antes do visual v2', () => {
    const map = legacyOffice(input);
    expect(validateOffice(map).errors).toEqual([]);
    expect([...floorsOf(map)].sort((a, b) => a - b)).toEqual([Floor.Wood, Floor.CarpetDark, Floor.CarpetGold, Floor.Tile, Floor.Kitchen, Floor.Stage, Floor.Corridor].sort((a, b) => a - b));
    expect(FLOOR_THEMES[1]).toEqual({
      reception: Floor.Tile,
      desks: Floor.Wood,
      meeting: Floor.CarpetDark,
      lounge: Floor.Kitchen,
      auditorium: Floor.CarpetDark,
      stage: Floor.Stage,
      partners: Floor.CarpetGold,
      blank: Floor.Wood,
      corridor: Floor.Corridor,
    });
  });

  it('expandir um escritório antigo não troca os pisos dele, e a ala nova segue o tema antigo', () => {
    const before = legacyOffice(input);
    const plan = expandOffice(before, 20);
    const after = plan.map;
    expect(validateOffice(after).errors).toEqual([]);
    expect(after.meta?.gen?.version).toBe(1);
    // o piso onde já se andava fica igual (só parede e vazio podem mudar, como em qualquer expansão)
    for (let y = 0; y < before.height; y++) {
      for (let x = 0; x < before.width; x++) {
        const i = y * before.width + x;
        if (before.layers.walls[i] === 0 && before.layers.floor[i] !== 0) expect(after.layers.floor[y * after.width + x]).toBe(before.layers.floor[i]);
      }
    }
    const added = floorsOf(after, before.width);
    for (const f of [Floor.Herringbone, Floor.CarpetPattern, Floor.Porcelain, Floor.BurntCement]) expect(added.has(f)).toBe(false);
    expect(added.has(Floor.Wood)).toBe(true);
    expect(added.has(Floor.Corridor)).toBe(true);
  });

  it('expandir um escritório novo segue o tema novo, mesmo sem o meta do gerador', () => {
    const fresh = generateOffice(input);
    const withMeta = expandOffice(fresh, 20).map;
    expect(floorsOf(withMeta, fresh.width).has(Floor.Herringbone)).toBe(true);
    expect(floorsOf(withMeta, fresh.width).has(Floor.Wood)).toBe(false);
    const edited = generateOffice(input);
    delete edited.meta;
    const plan = expandOffice(edited, 20);
    expect(validateOffice(plan.map).errors).toEqual([]);
    expect(plan.map.meta?.gen?.version).toBe(GENERATOR_VERSION);
    expect(floorsOf(plan.map, edited.width).has(Floor.BurntCement)).toBe(true);
    // e um antigo editado à mão continua antigo
    const old = legacyOffice(input);
    delete old.meta;
    expect(expandOffice(old, 20).map.meta?.gen?.version).toBe(1);
  });
});

describe('plantas do visual v2 no gerador', () => {
  const input: WizardInput = { name: 'Impera', size: 'medium', partners: 2, partnersShareRoom: true };
  const plants = (map: OfficeMap, x0 = 0) => map.objects.filter((o) => o.x >= x0 && objectGroup(o.type) === 'plants');

  it('escritório novo alterna as plantas novas; os cantos da recepção cruzam costela-de-adão e espada-de-são-jorge', () => {
    const map = generateOffice(input);
    const used = new Set(plants(map).map((o) => o.type));
    for (const type of ['monstera', 'snake_plant', 'palm', 'cactus', 'tall_vase']) expect([type, used.has(type)]).toEqual([type, true]);
    expect(used.has('plant')).toBe(false);
    // recepção: a primeira sala do escritório (a do tapete com logo)
    const logo = map.objects.find((o) => o.type === 'rug_logo')!;
    const corners = plants(map)
      .filter((o) => Math.abs(o.x - logo.x) <= 6 && Math.abs(o.y - logo.y) <= 6)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((o) => o.type);
    expect(corners).toEqual(['monstera', 'snake_plant', 'snake_plant', 'monstera']);
    expect(JSON.stringify(generateOffice(input))).toBe(JSON.stringify(map));
  });

  it('as plantas novas ocupam o mesmo bloco e bloqueiam como a planta de sempre', () => {
    for (const type of new Set(Object.values(PLANT_PAIRS).flat())) {
      const def = OBJECT_DEFS[type];
      expect([type, def.w, def.h, def.solid, def.tall]).toEqual([type, 1, 1, true, 1]);
    }
    const fresh = generateOffice(input);
    const legacy = legacyOffice(input);
    // mesmas posições de planta, mesmo mapa de colisão
    expect(plants(fresh).map((o) => [o.x, o.y])).toEqual(plants(legacy).map((o) => [o.x, o.y]));
    const a = { ...fresh, layers: { ...fresh.layers, floor: legacy.layers.floor } };
    expect(Array.from(buildCollision(a))).toEqual(Array.from(buildCollision(legacy)));
  });

  it('escritório antigo e a ala nova dele continuam só com a planta de sempre', () => {
    const before = legacyOffice(input);
    expect(new Set(plants(before).map((o) => o.type))).toEqual(new Set(['plant']));
    const after = expandOffice(before, 20).map;
    expect(new Set(plants(after, before.width).map((o) => o.type))).toEqual(new Set(['plant']));
    // e as plantas que já existiam não mudam
    expect(plants(after).filter((o) => o.x < before.width)).toEqual(plants(before));
  });

  it('o ASCII mostra toda planta como "p"', () => {
    expect(renderAscii(generateOffice(input))).toContain('p');
  });
});

describe('áreas das mesas', () => {
  it('cada mesa comum ganha uma área de 4 tiles com a cadeira, sem sobrepor outras áreas', () => {
    const map = generateOffice({ name: 'X', size: 'custom', customCount: 15, partners: 2, partnersShareRoom: true });
    const full = withDeskAreas(map);
    const desks = mapDesks(map);
    const regular = desks.filter((d) => !d.props?.partner);
    const areas = full.areas.filter((a) => a.desk);
    expect(areas.length).toBe(regular.length);
    const grid = buildCollision(map);
    for (const a of areas) {
      expect(a.capacity).toBe(4);
      expect(a.rects).toHaveLength(1);
      const r = a.rects[0];
      expect(r.w * r.h).toBe(4);
      const desk = desks.find((d) => d.id === a.deskId)!;
      const seat = deskSeat(desk);
      expect(rectContains(r, seat.x, seat.y)).toBe(true);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) expect(grid[y * map.width + x]).toBe(0);
    }
    const all = full.areas.filter((a) => a.kind === 'private').flatMap((a) => a.rects);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(rectsOverlap(all[i], all[j])).toBe(false);
    // continua válido e as áreas derivadas não são gravadas
    expect(validateOffice(stripDerivedAreas(full)).errors).toEqual([]);
    expect(stripDerivedAreas(full).areas.some((a) => a.desk)).toBe(false);
  });

  it('é idempotente', () => {
    const map = generateOffice(base);
    expect(JSON.stringify(withDeskAreas(withDeskAreas(map)))).toBe(JSON.stringify(withDeskAreas(map)));
  });
});
