// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESK_SETUP, OBJECT_DEFS, buildCollision, deskSeat, emptyMap, Floor, objColor, objColorError, objSetupError, objectGroup, floodFill, mapDesks, MAX_MAP_SIZE, rectContains, rectsOverlap, stripDerivedAreas, withDeskAreas, type GeneratorMeta, type OfficeMap, type WizardInput } from '@office-imp/shared';
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

describe('setups e cadeiras do visual v2 no gerador (Fase E)', () => {
  const input: WizardInput = { name: 'Impera', size: 'custom', customCount: 100, partners: 4, partnersShareRoom: true };
  const regular = (map: OfficeMap) => mapDesks(map).filter((d) => !d.props?.partner);
  const setupOf = (d: { setup?: string }) => d.setup ?? DEFAULT_DESK_SETUP;
  /** Cadeiras agrupadas por cômodo (o cômodo é o retângulo de paredes em volta: usa a posição do cômodo no gerador). */
  const chairsByRoom = (map: OfficeMap) => {
    const rooms = new Map<string, Set<string>>();
    const cy = map.meta!.gen!.corridorY;
    for (const o of map.objects) {
      if (o.type !== 'chair') continue;
      // o cômodo de cima ou de baixo do corredor, e a porta mais próxima à esquerda dá o começo dele
      const side = o.y < cy ? 'top' : 'bottom';
      const door = map.objects.filter((d) => d.type === 'door' && (d.y < cy) === (side === 'top') && d.x <= o.x + 6).sort((a, b) => b.x - a.x)[0];
      const key = `${side}:${door?.x ?? -1}`;
      if (!rooms.has(key)) rooms.set(key, new Set());
      rooms.get(key)!.add(objColor(o)!.id);
    }
    return rooms;
  };

  it('escritório novo guarda a seed e sorteia setups variados, a maioria com monitor', () => {
    const map = generateOffice(input);
    expect(typeof map.meta?.gen?.seed).toBe('number');
    expect(JSON.stringify(generateOffice(input))).toBe(JSON.stringify(map));
    const desks = regular(map);
    const count = new Map<string, number>();
    for (const d of desks) count.set(setupOf(d), (count.get(setupOf(d)) ?? 0) + 1);
    // monitor é o mais comum; aparecem ao menos notebook prata, dois monitores, all-in-one e gamer
    const monitor = count.get('monitor') ?? 0;
    for (const [id, n] of count) if (id !== 'monitor') expect([id, n < monitor]).toEqual([id, true]);
    expect(monitor / desks.length).toBeGreaterThan(0.3);
    for (const id of ['laptop_silver', 'dual', 'aio', 'gamer']) expect([id, (count.get(id) ?? 0) > 0]).toEqual([id, true]);
    expect(count.has('none')).toBe(false);
    // o padrão não é gravado, e todo setup gravado é válido
    for (const o of map.objects) {
      expect(o.setup).not.toBe(DEFAULT_DESK_SETUP);
      expect(objSetupError(o)).toBeNull();
      expect(objColorError(o)).toBeNull();
    }
    expect(validateOffice(map).errors).toEqual([]);
  });

  it('sócios ficam com dois monitores, all-in-one, notebook prata ou monitor', () => {
    const partners = mapDesks(generateOffice({ ...input, partners: 10 })).filter((d) => d.props?.partner);
    expect(partners).toHaveLength(10);
    for (const d of partners) expect(['dual', 'aio', 'laptop_silver', 'monitor']).toContain(setupOf(d));
  });

  it('as cadeiras de um cômodo têm a mesma cor, e os cômodos variam', () => {
    const rooms = chairsByRoom(generateOffice(input));
    expect(rooms.size).toBeGreaterThan(5);
    for (const [key, colors] of rooms) expect([key, colors.size]).toEqual([key, 1]);
    const all = new Set([...rooms.values()].flatMap((c) => [...c]));
    expect(all.size).toBeGreaterThan(1);
    expect(all.has('graphite')).toBe(true);
  });

  it('outro escritório (outro nome) sai com outro sorteio; a mesma entrada sai igual', () => {
    const a = regular(generateOffice(input)).map(setupOf);
    const b = regular(generateOffice({ ...input, name: 'Outra Empresa' })).map(setupOf);
    expect(a).toHaveLength(b.length);
    expect(a).not.toEqual(b);
    expect(regular(generateOffice({ ...input, name: '  impera ' })).map(setupOf)).toEqual(a);
  });

  it('setups e cores não mudam a colisão nem o lugar de nada', () => {
    const fresh = generateOffice(input);
    const plain = JSON.parse(JSON.stringify(fresh)) as OfficeMap;
    for (const o of plain.objects) {
      delete o.setup;
      if (o.type === 'chair') delete o.color;
    }
    expect(Array.from(buildCollision(fresh))).toEqual(Array.from(buildCollision(plain)));
    expect(withDeskAreas(fresh).areas).toEqual(withDeskAreas(plain).areas);
  });

  it('escritório antigo (versão 1) e a ala nova dele não ganham setup nem cor de cadeira', () => {
    const before = legacyOffice({ ...input, customCount: 20 });
    const after = expandOffice(before, 20).map;
    for (const o of after.objects) {
      expect([o.id, o.setup]).toEqual([o.id, undefined]);
      if (o.type === 'chair') expect([o.id, o.color]).toEqual([o.id, undefined]);
    }
  });

  it('a ala nova de um escritório novo também varia, sem mexer nas mesas que já existem', () => {
    const fresh = generateOffice({ ...input, customCount: 20 });
    const plan = expandOffice(fresh, 40);
    expect(JSON.stringify(expandOffice(fresh, 40).map)).toBe(JSON.stringify(plan.map));
    for (const d of mapDesks(fresh)) expect(plan.map.objects.find((o) => o.id === d.id)).toEqual(d);
    const added = regular(plan.map).filter((d) => !fresh.objects.some((o) => o.id === d.id));
    expect(added.length).toBeGreaterThanOrEqual(36);
    expect(new Set(added.map(setupOf)).size).toBeGreaterThan(2);
  });
});
