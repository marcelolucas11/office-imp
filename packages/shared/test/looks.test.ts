// SPDX-License-Identifier: AGPL-3.0-only
// Visual v2, Fase E: cor e setup da mesa escolhidos pelo ocupante (look por cima do mapa
// publicado), tampo real da mesa para a decoração, objetos de parede e paleta sem repetição.
import { describe, expect, it } from 'vitest';
import {
  DESK_DECOR_TYPES,
  OBJECT_DEFS,
  OBJECT_GROUPS,
  OBJECT_TYPES,
  Wall,
  applyDeskLooks,
  deskLooksKey,
  deskTopAt,
  emptyMap,
  objColor,
  objSetup,
  objectGroup,
  sanitizeDeskLook,
  wallMountError,
  type MapObject,
  type OfficeMap,
} from '../src';

const desk = (extra: Partial<MapObject> = {}): MapObject => ({ id: 'd1', type: 'desk', x: 2, y: 2, ...extra });

describe('look da mesa (cor e setup do ocupante)', () => {
  it('sanitizeDeskLook aceita só cor e setup do tipo, e tira o que é igual ao mapa publicado', () => {
    expect(sanitizeDeskLook(desk(), { color: 'walnut', setup: 'gamer' })).toEqual({ color: 'walnut', setup: 'gamer' });
    expect(sanitizeDeskLook(desk(), { color: 'arco-iris', setup: 'gamer' })).toEqual({ setup: 'gamer' });
    expect(sanitizeDeskLook(desk(), { setup: 'tres-monitores' })).toBeNull();
    // igual ao publicado (ausência = padrão): não é personalização
    expect(sanitizeDeskLook(desk(), { color: 'oak', setup: 'monitor' })).toBeNull();
    expect(sanitizeDeskLook(desk({ color: 'walnut', setup: 'dual' }), { color: 'walnut', setup: 'dual' })).toBeNull();
    // voltar ao padrão numa mesa que o mapa pinta de outra cor é personalização
    expect(sanitizeDeskLook(desk({ color: 'walnut' }), { color: 'oak' })).toEqual({ color: 'oak' });
    // cor de outro tipo de mesa não vale (a mesa de vidro não tem nogueira)
    expect(sanitizeDeskLook(desk({ type: 'desk_glass' }), { color: 'walnut', setup: 'aio' })).toEqual({ setup: 'aio' });
    // fora de mesa, nada; entradas estranhas, nada
    expect(sanitizeDeskLook({ type: 'chair' }, { color: 'blue' })).toBeNull();
    for (const junk of [null, undefined, 'gamer', 3, [], { color: 7 }]) expect(sanitizeDeskLook(desk(), junk)).toBeNull();
  });

  it('applyDeskLooks aplica por cima do mapa publicado sem alterá-lo', () => {
    const map: OfficeMap = { ...emptyMap(8, 8), objects: [desk(), { ...desk(), id: 'd2', x: 5 }, { id: 'c1', type: 'chair', x: 2, y: 3 }] };
    const before = JSON.stringify(map);
    expect(applyDeskLooks(map, [])).toBe(map);
    expect(applyDeskLooks(map, [{ id: 'd1', look: null }, { id: 'd2' }])).toBe(map);
    const seen = applyDeskLooks(map, [
      { id: 'd1', look: { color: 'black', setup: 'laptop_silver' } },
      { id: 'c1', look: { color: 'blue' } },
      { id: 'sumiu', look: { setup: 'gamer' } },
    ]);
    expect(JSON.stringify(map)).toBe(before);
    expect(seen).not.toBe(map);
    const d1 = seen.objects.find((o) => o.id === 'd1')!;
    expect([objColor(d1)?.id, objSetup(d1)?.id]).toEqual(['black', 'laptop_silver']);
    // outras mesas e outros objetos ficam como no mapa (look de cadeira não vale)
    expect(seen.objects[1]).toBe(map.objects[1]);
    expect(seen.objects[2]).toBe(map.objects[2]);
    // look inválido para o tipo é ignorado
    expect(applyDeskLooks(map, [{ id: 'd1', look: { color: 'arco-iris' } }])).toBe(map);
  });

  it('deskLooksKey muda só quando algum look muda', () => {
    const a = deskLooksKey([{ id: 'b', look: { setup: 'gamer' } }, { id: 'a', look: { color: 'black' } }, { id: 'c' }]);
    expect(a).toBe(deskLooksKey([{ id: 'a', look: { color: 'black' } }, { id: 'b', look: { setup: 'gamer' } }]));
    expect(a).not.toBe(deskLooksKey([{ id: 'a', look: { color: 'black' } }]));
    expect(deskLooksKey([])).toBe('');
  });
});

describe('tampo da mesa para a decoração', () => {
  it('a mesa grande tem 3 blocos de tampo e a L inclui o retorno (espelhado com dir: right)', () => {
    const wide = desk({ type: 'desk_wide' });
    expect([0, 1, 2, 3].map((dx) => deskTopAt(wide, wide.x + dx, wide.y))).toEqual([true, true, true, false]);
    expect(deskTopAt(wide, wide.x, wide.y + 1)).toBe(false);
    const l = desk({ type: 'desk_l' });
    expect([0, 1, 2].map((dx) => deskTopAt(l, l.x + dx, l.y + 1))).toEqual([true, false, false]);
    const lr = desk({ type: 'desk_l', dir: 'right' });
    expect([0, 1, 2].map((dx) => deskTopAt(lr, lr.x + dx, lr.y + 1))).toEqual([false, false, true]);
    const plain = desk();
    expect([0, 1, 2].map((dx) => deskTopAt(plain, plain.x + dx, plain.y))).toEqual([true, true, false]);
  });
});

describe('objetos de parede', () => {
  const room = (): OfficeMap => {
    const m = emptyMap(6, 5);
    m.layers.floor.fill(1);
    for (let x = 0; x < 6; x++) m.layers.walls[x] = Wall.Wall; // parede de cima, face à mostra
    m.layers.walls[6 + 5] = Wall.Wall; // trecho vertical à direita (parede em cima de parede)
    return m;
  };

  it('relógio, cortiça, neon, split e as plantas de parede só vão na face de uma parede', () => {
    const m = room();
    const wallOnly = OBJECT_TYPES.filter((t) => OBJECT_DEFS[t].wallOnly).sort();
    expect(wallOnly).toEqual(['corkboard', 'hanging_fern', 'neon', 'split_ac', 'wall_clock', 'wall_garden']);
    expect(wallMountError(m, { type: 'wall_clock', x: 2, y: 0 })).toBeNull();
    expect(wallMountError(m, { type: 'wall_clock', x: 2, y: 2 })).toContain('face de uma parede');
    // parede com outra parede embaixo não tem face
    expect(wallMountError(m, { type: 'hanging_fern', x: 5, y: 0 })).toContain('face de uma parede');
    // 2 blocos: os dois precisam estar na parede
    expect(wallMountError(m, { type: 'wall_garden', x: 1, y: 0 })).toBeNull();
    expect(wallMountError(m, { type: 'corkboard', x: 4, y: 0 })).toContain('face de uma parede');
    expect(wallMountError(m, { type: 'neon', x: 0, y: 0, w: 4 })).toBeNull();
    expect(wallMountError(m, { type: 'split_ac', x: 9, y: 0 })).toContain('fora do mapa');
    // quadro decorativo e pôster continuam podendo ir no chão (estão na decoração da mesa desde antes)
    expect(wallMountError(m, { type: 'frame', x: 2, y: 2 })).toBeNull();
    expect(wallMountError(m, { type: 'poster', x: 2, y: 2 })).toBeNull();
    expect(wallMountError(m, { type: 'plant', x: 2, y: 2 })).toBeNull();
  });
});

describe('paleta: cada tipo uma vez só', () => {
  it('o catálogo, os grupos do Mapmaker e a Build Tool não repetem tipo', () => {
    expect(new Set(OBJECT_TYPES).size).toBe(OBJECT_TYPES.length);
    expect(new Set(DESK_DECOR_TYPES).size).toBe(DESK_DECOR_TYPES.length);
    const grouped = OBJECT_GROUPS.flatMap((g) => OBJECT_TYPES.filter((t) => objectGroup(t) === g));
    expect(grouped.sort()).toEqual([...OBJECT_TYPES].sort());
  });

  it('a Build Tool tem as plantas de chão novas e nenhum objeto de parede, mesa ou objeto grande', () => {
    for (const type of ['succulent_bowl', 'monstera', 'snake_plant', 'cactus', 'palm', 'tall_vase']) expect(DESK_DECOR_TYPES).toContain(type);
    for (const type of DESK_DECOR_TYPES) {
      const def = OBJECT_DEFS[type];
      expect([type, def.w, def.h, Boolean(def.wallOnly), Boolean(def.desk)]).toEqual([type, 1, 1, false, false]);
    }
  });
});
