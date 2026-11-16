// SPDX-License-Identifier: AGPL-3.0-only
// 1.3.0: área da mesa editável no Mapmaker (nome, forma, capacidade, sem área) e personalização da
// própria mesa pelo ocupante além de cor e setup (modelo, cadeira e tapete).
import { describe, expect, it } from 'vitest';
import {
  DESK_AREA_PREFIX,
  DESK_CHAIR_PREFIX,
  DESK_RUG_PREFIX,
  DESK_TYPES,
  applyDeskLooks,
  buildCollision,
  deskAreas,
  deskChair,
  deskLookFieldError,
  deskModels,
  deskRugRect,
  emptyMap,
  sanitizeDeskLook,
  type MapObject,
  type OfficeMap,
} from '../src';

function room(w = 14, h = 10, ...objects: MapObject[]): OfficeMap {
  const m = emptyMap(w, h);
  m.layers.floor.fill(1);
  m.spawns.push({ x: 1, y: 1 });
  m.objects.push(...objects);
  return m;
}
const desk = (extra: Partial<MapObject> = {}): MapObject => ({ id: 'd1', type: 'desk', x: 2, y: 2, ...extra });

describe('área da mesa editável', () => {
  it('sem nada nas props continua a automática 2×2 com o nome "Mesa N"', () => {
    const [a] = deskAreas(room(14, 10, desk()));
    expect(a).toMatchObject({ id: `${DESK_AREA_PREFIX}d1`, name: 'Mesa 1', capacity: 4, staffOnly: false });
    expect(a.rects).toHaveLength(1);
  });

  it('nome, capacidade, só equipe, reunião e forma desenhada vêm das props da mesa', () => {
    const d = desk({ props: { areaName: 'Mesa do João', areaCapacity: 6, areaStaffOnly: true, areaMeeting: true, areaRects: [{ x: 1, y: 3, w: 4, h: 2 }, { x: 1, y: 5, w: 1, h: 1 }] } });
    const [a] = deskAreas(room(14, 10, d));
    expect(a).toMatchObject({ name: 'Mesa do João', capacity: 6, staffOnly: true, meeting: true, desk: true, deskId: 'd1' });
    expect(a.rects).toEqual([{ x: 1, y: 3, w: 4, h: 2 }, { x: 1, y: 5, w: 1, h: 1 }]);
  });

  it('o formato antigo (props.area, um retângulo) continua valendo', () => {
    const [a] = deskAreas(room(14, 10, desk({ props: { area: { x: 2, y: 3, w: 3, h: 3 } } })));
    expect(a.rects).toEqual([{ x: 2, y: 3, w: 3, h: 3 }]);
  });

  it('a forma é recortada pelo mapa e lixo é ignorado (volta para a automática)', () => {
    const [a] = deskAreas(room(14, 10, desk({ props: { areaRects: [{ x: 12, y: 8, w: 9, h: 9 }] } })));
    expect(a.rects).toEqual([{ x: 12, y: 8, w: 2, h: 2 }]);
    for (const junk of [[], ['x'], [{ x: 1.5, y: 1, w: 2, h: 2 }], [{ x: 30, y: 30, w: 2, h: 2 }]]) {
      const [b] = deskAreas(room(14, 10, desk({ props: { areaRects: junk } })));
      expect(b.rects[0]).toMatchObject({ w: 2, h: 2 });
    }
  });

  it('mesa sem área (noArea) não gera área; a vizinha automática desvia da desenhada', () => {
    expect(deskAreas(room(14, 10, desk({ props: { noArea: true } })))).toEqual([]);
    const big = desk({ props: { areaRects: [{ x: 2, y: 3, w: 4, h: 3 }] } });
    const next: MapObject = { id: 'd2', type: 'desk', x: 7, y: 2 };
    const areas = deskAreas(room(14, 10, big, next));
    expect(areas.map((a) => a.id)).toEqual([`${DESK_AREA_PREFIX}d1`, `${DESK_AREA_PREFIX}d2`]);
    const r2 = areas[1].rects[0];
    expect(r2.x).toBeGreaterThanOrEqual(6);
    // a numeração segue a ordem das mesas, com ou sem área
    expect(deskAreas(room(14, 10, desk({ props: { noArea: true } }), next))[0].name).toBe('Mesa 2');
  });
});

describe('modelo, cadeira e tapete da própria mesa', () => {
  it('só troca de modelo com o mesmo footprint e assento', () => {
    expect(deskModels('desk')).toEqual(['desk', 'desk_standing', 'desk_glass', 'desk_dark', 'desk_gamer', 'desk_bench']);
    expect(deskModels('desk_wide')).toEqual(['desk_wide']);
    expect(deskModels('desk_l')).toEqual(['desk_l']);
    expect(deskModels('chair')).toEqual([]);
    for (const t of DESK_TYPES) expect(deskModels(t)).toContain(t);
  });

  it('sanitizeDeskLook: modelo, cor do modelo, cadeira, cor da cadeira e tapete', () => {
    const chair: MapObject = { id: 'c1', type: 'chair', x: 2, y: 3 };
    expect(sanitizeDeskLook(desk(), { type: 'desk_gamer', color: 'pink' }, chair)).toEqual({ type: 'desk_gamer', color: 'pink' });
    // cor que não existe no modelo escolhido sai
    expect(sanitizeDeskLook(desk(), { type: 'desk_glass', color: 'walnut' }, chair)).toEqual({ type: 'desk_glass' });
    // modelo de outro tamanho não vale
    expect(sanitizeDeskLook(desk(), { type: 'desk_wide' }, chair)).toBeNull();
    expect(sanitizeDeskLook(desk(), { chair: 'chair_gamer', chairColor: 'pink' }, chair)).toEqual({ chair: 'chair_gamer', chairColor: 'pink' });
    expect(sanitizeDeskLook(desk(), { chair: 'chair' }, chair)).toBeNull();
    expect(sanitizeDeskLook(desk(), { chair: 'sofa' }, chair)).toBeNull();
    expect(sanitizeDeskLook(desk(), { rug: 'graphite' }, chair)).toEqual({ rug: 'graphite' });
    expect(sanitizeDeskLook(desk(), { rug: 'arco-iris' }, chair)).toBeNull();
    // sem cadeira no mapa: a cor só acompanha uma cadeira escolhida
    expect(sanitizeDeskLook(desk(), { chairColor: 'pink' }, null)).toBeNull();
    expect(sanitizeDeskLook(desk(), { chair: 'chair_gamer', chairColor: 'pink' }, null)).toEqual({ chair: 'chair_gamer', chairColor: 'pink' });
  });

  it('deskLookFieldError valida cada campo no contexto do resto', () => {
    const chair: MapObject = { id: 'c1', type: 'chair', x: 2, y: 3 };
    expect(deskLookFieldError(desk(), chair, { type: 'desk_wide' }, 'type')).not.toBeNull();
    expect(deskLookFieldError(desk(), chair, { type: 'desk_gamer', color: 'pink' }, 'color')).toBeNull();
    expect(deskLookFieldError(desk(), chair, { color: 'pink' }, 'color')).not.toBeNull();
    expect(deskLookFieldError(desk(), null, { chairColor: 'pink' }, 'chairColor')).not.toBeNull();
    expect(deskLookFieldError(desk(), chair, { chair: 'stool' }, 'chair')).toBeNull();
    expect(deskLookFieldError(desk(), chair, { rug: 'nope' }, 'rug')).not.toBeNull();
  });

  it('applyDeskLooks troca o modelo e a cadeira, põe o tapete e não mexe na colisão', () => {
    const chair: MapObject = { id: 'c1', type: 'chair', x: 2, y: 3, dir: 'up', color: 'blue' };
    const map = room(14, 10, desk({ color: 'walnut' }), chair, { id: 'p', type: 'plant', x: 8, y: 8 });
    const before = JSON.stringify(map);
    const seen = applyDeskLooks(map, [{ id: 'd1', look: { type: 'desk_glass', chair: 'chair_gamer', chairColor: 'pink', rug: 'graphite' } }]);
    expect(JSON.stringify(map)).toBe(before);
    const d = seen.objects.find((o) => o.id === 'd1')!;
    expect(d.type).toBe('desk_glass');
    expect(d.color).toBeUndefined(); // a nogueira não existe na mesa de vidro
    expect(seen.objects.find((o) => o.id === 'c1')).toMatchObject({ type: 'chair_gamer', color: 'pink', dir: 'up' });
    const rug = seen.objects.find((o) => o.id === `${DESK_RUG_PREFIX}d1`)!;
    expect(rug).toMatchObject({ type: 'rug', color: 'graphite', ...deskRugRect(map.objects[0]) });
    expect(deskRugRect(map.objects[0])).toEqual({ x: 2, y: 2, w: 2, h: 2 });
    expect(seen.objects[0].id).toBe(rug.id); // tapete primeiro: é chão
    expect(Array.from(buildCollision(seen))).toEqual(Array.from(buildCollision(map)));
    expect(deskChair(seen, d)?.id).toBe('c1');
  });

  it('sem cadeira no assento, a escolhida entra virada para a mesa', () => {
    const map = room(14, 10, desk());
    const seen = applyDeskLooks(map, [{ id: 'd1', look: { chair: 'chair_exec' } }]);
    expect(seen.objects.find((o) => o.id === `${DESK_CHAIR_PREFIX}d1`)).toMatchObject({ type: 'chair_exec', x: 2, y: 3, dir: 'up' });
  });
});
