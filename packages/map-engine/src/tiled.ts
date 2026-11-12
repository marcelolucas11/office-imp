// SPDX-License-Identifier: AGPL-3.0-only
import { TILE, objSize, type OfficeMap } from '@office-imp/shared';

/** Exporta o mapa no formato JSON do Tiled (tilelayers + objectgroups). */
export function toTiled(map: OfficeMap): Record<string, unknown> {
  let nextId = 1;
  const tileLayer = (name: string, data: number[], offset: number) => ({
    id: nextId++,
    name,
    type: 'tilelayer',
    width: map.width,
    height: map.height,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    data: data.map((v) => (v ? v + offset : 0)),
  });
  let objId = 1;
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: map.width,
    height: map.height,
    tilewidth: TILE,
    tileheight: TILE,
    tilesets: [
      { firstgid: 1, name: 'office-imp-floor', tilewidth: TILE, tileheight: TILE, tilecount: 16, columns: 16, image: 'tileset-floor.png', imagewidth: 16 * TILE, imageheight: TILE },
      { firstgid: 101, name: 'office-imp-walls', tilewidth: TILE, tileheight: TILE, tilecount: 16, columns: 16, image: 'tileset-walls.png', imagewidth: 16 * TILE, imageheight: TILE },
    ],
    layers: [
      tileLayer('chao', map.layers.floor, 0),
      tileLayer('paredes', map.layers.walls, 100),
      {
        id: nextId++,
        name: 'objetos',
        type: 'objectgroup',
        visible: true,
        opacity: 1,
        objects: map.objects.map((o) => {
          const { w, h } = objSize(o);
          return {
            id: objId++,
            name: o.id,
            type: o.type,
            x: o.x * TILE,
            y: o.y * TILE,
            width: w * TILE,
            height: h * TILE,
            properties: Object.entries({ ...(o.props ?? {}), ...(o.dir ? { dir: o.dir } : {}) }).map(([name, value]) => ({
              name,
              type: 'string',
              value: typeof value === 'string' ? value : JSON.stringify(value),
            })),
          };
        }),
      },
      {
        id: nextId++,
        name: 'areas',
        type: 'objectgroup',
        visible: true,
        opacity: 1,
        objects: map.areas.flatMap((a) =>
          a.rects.map((r) => ({
            id: objId++,
            name: a.name,
            type: a.kind,
            x: r.x * TILE,
            y: r.y * TILE,
            width: r.w * TILE,
            height: r.h * TILE,
            properties: [
              { name: 'areaId', type: 'string', value: a.id },
              { name: 'capacity', type: 'int', value: a.capacity },
              { name: 'staffOnly', type: 'bool', value: a.staffOnly },
            ],
          })),
        ),
      },
      {
        id: nextId++,
        name: 'spawns',
        type: 'objectgroup',
        visible: true,
        opacity: 1,
        objects: map.spawns.map((s) => ({ id: objId++, name: 'spawn', type: 'spawn', point: true, x: s.x * TILE + TILE / 2, y: s.y * TILE + TILE / 2, width: 0, height: 0 })),
      },
    ],
  };
}
