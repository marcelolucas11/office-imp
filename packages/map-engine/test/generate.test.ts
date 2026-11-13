// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { buildCollision, deskSeat, floodFill, mapDesks, MAX_MAP_SIZE, rectContains, rectsOverlap, stripDerivedAreas, withDeskAreas, type WizardInput } from '@office-imp/shared';
import { expandOffice, generateOffice, modulesForInput, renderAscii, reserveBlankWing, toTiled, validateOffice } from '../src';

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
