// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { MAP_FORMAT_VERSION, WALL_FACE_ROWS, Wall, doorDistance, doorTiles, emptyMap, migrateMap, thickenWalls, wallFaceLevel, wallMountError, type OfficeMap } from '../src';

/**
 * Mapa no formato 1 (paredes finas): um cômodo 7×5 com a parede de cima (janela no meio), a de
 * baixo com uma porta, um relógio na parede de cima, uma mesa, uma área e um spawn.
 */
function legacy(): OfficeMap {
  const m = { ...emptyMap(7, 6), version: 1 };
  m.layers.floor.fill(1);
  const wall = (x: number, y: number, id: number = Wall.Wall) => (m.layers.walls[y * 7 + x] = id);
  for (let x = 0; x < 7; x++) {
    wall(x, 0);
    wall(x, 4);
  }
  for (let y = 0; y < 5; y++) {
    wall(0, y);
    wall(6, y);
  }
  wall(3, 0, Wall.Window);
  m.layers.walls[4 * 7 + 3] = 0;
  m.objects.push({ id: 'door', type: 'door', x: 3, y: 4 }, { id: 'clock', type: 'wall_clock', x: 2, y: 0 }, { id: 'desk_1', type: 'desk', x: 1, y: 2, props: { zone: { x: 1, y: 2, w: 3, h: 1 }, seat: { x: 1, y: 3 } } });
  m.areas.push({ id: 'a', name: 'Sala', kind: 'private', staffOnly: false, capacity: 6, rects: [{ x: 1, y: 1, w: 5, h: 3 }] });
  m.spawns.push({ x: 3, y: 5 });
  m.meta = { gen: { version: 2, corridorY: 5, topX: 0, bottomX: 0, endX: 6, roomHeight: 5, counters: {} } };
  return m;
}

describe('paredes altas (formato 2)', () => {
  it('a face de uma parede sobe até 2 blocos; um trecho vertical mais fundo é só topo', () => {
    const m = migrateMap(legacy());
    expect(WALL_FACE_ROWS).toBe(2);
    expect(wallFaceLevel(m, 2, 1)).toBe(0);
    expect(wallFaceLevel(m, 2, 0)).toBe(1);
    // canto: a parede da esquerda desce o cômodo inteiro, então ali é topo
    expect(wallFaceLevel(m, 0, 0)).toBe(-1);
    expect(wallFaceLevel(m, 2, 3)).toBe(-1);
  });

  it('a migração dobra as paredes com face e desce o que está abaixo', () => {
    const before = legacy();
    const m = thickenWalls(before);
    expect(m.version).toBe(MAP_FORMAT_VERSION);
    // 2 fileiras com face fina (a de cima e a de baixo, com a porta): cada uma ganha uma fileira
    expect(m.height).toBe(before.height + 2);
    const at = (x: number, y: number) => m.layers.walls[y * m.width + x];
    expect([at(3, 0), at(3, 1)]).toEqual([Wall.Window, Wall.Window]);
    expect([at(2, 5), at(2, 6)]).toEqual([Wall.Wall, Wall.Wall]);
    // o vão da porta continua vão, com a porta na fileira de baixo
    expect([at(3, 5), at(3, 6)]).toEqual([0, 0]);
    expect(m.objects.find((o) => o.id === 'door')).toMatchObject({ x: 3, y: 6 });
    // o relógio fica na fileira de cima da face; a mesa, a zona, o assento, a área e o spawn descem 1 (ou 2)
    expect(m.objects.find((o) => o.id === 'clock')).toMatchObject({ x: 2, y: 0 });
    expect(wallMountError(m, { type: 'wall_clock', x: 2, y: 0 })).toBeNull();
    const desk = m.objects.find((o) => o.id === 'desk_1')!;
    expect(desk.y).toBe(3);
    expect(desk.props).toMatchObject({ zone: { y: 3, h: 1 }, seat: { y: 4 } });
    expect(m.areas[0].rects[0]).toMatchObject({ y: 2, h: 3 });
    expect(m.spawns[0]).toEqual({ x: 3, y: 7 });
    expect(m.meta?.gen).toMatchObject({ corridorY: 7, roomHeight: 7, wallRows: 2 });
    // o original não muda, e um mapa já atualizado volta igual
    expect(before.height).toBe(6);
    expect(thickenWalls(m)).toBe(m);
  });

  it('a porta numa parede alta ocupa o vão inteiro (2 blocos)', () => {
    const m = migrateMap(legacy());
    const door = m.objects.find((o) => o.type === 'door')!;
    expect(doorTiles(m, door)).toEqual([
      { x: 3, y: 6 },
      { x: 3, y: 5 },
    ]);
    // dá para abrir de dentro do cômodo (logo acima do vão) e de fora
    expect(doorDistance(m, door, 3, 4)).toBe(1);
    expect(doorDistance(m, door, 3, 7)).toBe(1);
    expect(doorDistance(m, door, 3, 3)).toBe(2);
    // numa parede fina, só o bloco da porta
    const thin = legacy();
    expect(doorTiles(thin, thin.objects[0])).toEqual([{ x: 3, y: 4 }]);
  });
});
