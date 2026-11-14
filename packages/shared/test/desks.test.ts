// SPDX-License-Identifier: AGPL-3.0-only
// Visual v2, Fases C1 e C2: "mesa de trabalho" como flag da definição (`desk: true`), footprint
// em L, setup da mesa (`MapObject.setup`) e texto curto no sprite (letreiro neon).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESK_SETUP,
  DESK_AREA_CAPACITY,
  DESK_DECOR_TYPES,
  DESK_SETUPS,
  DESK_TYPES,
  OBJECT_DEFS,
  OBJECT_GROUPS,
  OBJECT_TYPES,
  buildCollision,
  defaultDeskSeat,
  defaultDeskZone,
  deskAreas,
  deskSeat,
  deskSetups,
  deskZone,
  emptyMap,
  isDesk,
  isDeskType,
  mapDesks,
  normalizeObjectVariants,
  objDepthRows,
  objMirrored,
  objSetup,
  objSetupError,
  objSize,
  objSolidAt,
  objText,
  objTextError,
  objectGroup,
  rectContains,
  validateMapShape,
  withDeskAreas,
  type MapObject,
  type OfficeMap,
} from '../src/index';

function room(w = 12, h = 10, ...objects: MapObject[]): OfficeMap {
  const m = emptyMap(w, h);
  m.layers.floor.fill(1);
  m.spawns.push({ x: 1, y: 1 });
  m.objects.push(...objects);
  return m;
}

describe('mesa de trabalho é um flag da definição', () => {
  it('o catálogo tem as mesas da Fase C1 e a mesa antiga continua sendo `desk`', () => {
    expect(DESK_TYPES).toEqual(['desk', 'desk_wide', 'desk_l', 'desk_standing', 'desk_glass', 'desk_dark', 'desk_gamer', 'desk_bench']);
    expect(OBJECT_DEFS.desk).toMatchObject({ w: 2, h: 1, solid: true, tall: 1, desk: true });
    for (const type of DESK_TYPES) {
      expect(isDeskType(type)).toBe(true);
      expect(OBJECT_DEFS[type].solid).toBe(true);
      expect(OBJECT_DEFS[type].colors!.length).toBeGreaterThan(1);
    }
    expect(isDeskType('table')).toBe(false);
    expect(isDeskType('desk_lamp')).toBe(false);
    expect(isDesk({ type: 'nao-existe' })).toBe(false);
  });

  it('mapDesks acha todos os tipos de mesa e nada além deles', () => {
    const map = room(40, 10, ...DESK_TYPES.map((type, i) => ({ id: `d${i}`, type, x: 1 + i * 4, y: 2 })), { id: 't', type: 'table', x: 1, y: 6 }, { id: 'c', type: 'chair', x: 6, y: 6 }, { id: 'l', type: 'desk_lamp', x: 8, y: 6 });
    expect(mapDesks(map).map((d) => d.type)).toEqual(DESK_TYPES);
  });

  it('mapa salvo antes do visual v2 (só `desk`, com seat e zone em props) continua igual', () => {
    const old: MapObject = { id: 'desk_1', type: 'desk', x: 3, y: 2, props: { seat: { x: 3, y: 3 }, zone: { x: 3, y: 2, w: 3, h: 1 } } };
    const bare: MapObject = { id: 'desk_2', type: 'desk', x: 7, y: 2 };
    const map = room(12, 8, old, bare);
    expect(validateMapShape(map)).toBeNull();
    expect(mapDesks(map)).toHaveLength(2);
    expect(deskSeat(old)).toEqual({ x: 3, y: 3 });
    expect(deskZone(old)).toEqual({ x: 3, y: 2, w: 3, h: 1 });
    // sem props: os padrões de antes (assento abaixo do canto esquerdo, zona 3×2)
    expect(deskSeat(bare)).toEqual({ x: 7, y: 3 });
    expect(deskZone(bare)).toEqual({ x: 7, y: 2, w: 3, h: 2 });
    expect(objSetup(old)!.id).toBe('monitor');
  });

  it('cada tipo tem um assento padrão livre, colado no tampo', () => {
    for (const type of DESK_TYPES) {
      for (const dir of [undefined, 'right'] as const) {
        const desk: MapObject = { id: 'd', type, x: 4, y: 3, ...(dir ? { dir } : {}) };
        const map = room(12, 10, desk);
        const grid = buildCollision(map);
        const seat = defaultDeskSeat(desk);
        expect(deskSeat(desk)).toEqual(seat);
        expect([type, dir, grid[seat.y * map.width + seat.x]]).toEqual([type, dir, 0]);
        // logo acima do assento há tampo
        expect([type, dir, grid[(seat.y - 1) * map.width + seat.x]]).toEqual([type, dir, 1]);
        const { w } = objSize(desk);
        expect(defaultDeskZone(desk)).toEqual({ x: 4, y: 3, w: w + 1, h: type === 'desk_l' ? 2 : 1 });
      }
    }
    expect(defaultDeskSeat({ type: 'desk', x: 4, y: 3 })).toEqual({ x: 4, y: 4 });
    expect(defaultDeskSeat({ type: 'desk_wide', x: 4, y: 3 })).toEqual({ x: 5, y: 4 });
    expect(defaultDeskSeat({ type: 'desk_l', x: 4, y: 3 })).toEqual({ x: 5, y: 4 });
  });

  it('a área de conversa 2×2 inclui o assento e fica toda em blocos livres, em todos os tipos', () => {
    for (const type of DESK_TYPES) {
      for (const dir of [undefined, 'right'] as const) {
        const desk: MapObject = { id: 'd1', type, x: 4, y: 3, ...(dir ? { dir } : {}) };
        const map = room(12, 10, desk);
        const grid = buildCollision(map);
        const areas = deskAreas(map);
        expect([type, areas.length]).toEqual([type, 1]);
        const [a] = areas;
        expect(a).toMatchObject({ id: 'desk:d1', kind: 'private', desk: true, deskId: 'd1', capacity: DESK_AREA_CAPACITY });
        const r = a.rects[0];
        expect([r.w, r.h]).toEqual([2, 2]);
        const seat = deskSeat(desk);
        expect(rectContains(r, seat.x, seat.y)).toBe(true);
        for (let y = r.y; y < r.y + 2; y++) for (let x = r.x; x < r.x + 2; x++) expect([type, dir, x, y, grid[y * map.width + x]]).toEqual([type, dir, x, y, 0]);
      }
    }
    expect(withDeskAreas(room(12, 10, { id: 'd1', type: 'desk_gamer', x: 2, y: 2 })).areas).toHaveLength(1);
  });
});

describe('footprint em L', () => {
  const at = (map: OfficeMap, grid: Uint8Array, x: number, y: number) => grid[y * map.width + x];

  it('a mesa em L só bloqueia o tampo de cima e o retorno; o vão fica livre', () => {
    const desk: MapObject = { id: 'l', type: 'desk_l', x: 2, y: 2 };
    const map = room(8, 8, desk);
    const grid = buildCollision(map);
    expect([2, 3, 4].map((x) => at(map, grid, x, 2))).toEqual([1, 1, 1]);
    expect([2, 3, 4].map((x) => at(map, grid, x, 3))).toEqual([1, 0, 0]);
    expect(objSolidAt(desk, 0, 1)).toBe(true);
    expect(objSolidAt(desk, 1, 1)).toBe(false);
    expect(objSolidAt(desk, 3, 0)).toBe(false);
    expect(objSolidAt(desk, 0, 2)).toBe(false);
    expect(objMirrored(desk)).toBe(false);
  });

  it('com dir "right" o L é espelhado (retorno à direita)', () => {
    const desk: MapObject = { id: 'l', type: 'desk_l', x: 2, y: 2, dir: 'right' };
    const map = room(8, 8, desk);
    const grid = buildCollision(map);
    expect(objMirrored(desk)).toBe(true);
    expect([2, 3, 4].map((x) => at(map, grid, x, 2))).toEqual([1, 1, 1]);
    expect([2, 3, 4].map((x) => at(map, grid, x, 3))).toEqual([0, 0, 1]);
    for (const dir of ['left', 'up', 'down'] as const) expect(objMirrored({ type: 'desk_l', dir })).toBe(false);
  });

  it('objetos comuns continuam bloqueando o retângulo inteiro e a direção não os espelha', () => {
    const table: MapObject = { id: 't', type: 'table', x: 1, y: 1, w: 3, h: 2, dir: 'right' };
    const map = room(8, 8, table);
    const grid = buildCollision(map);
    for (let y = 1; y < 3; y++) for (let x = 1; x < 4; x++) expect(at(map, grid, x, y)).toBe(1);
    expect(objMirrored(table)).toBe(false);
    expect(objSolidAt({ id: 'c', type: 'chair', x: 0, y: 0 }, 0, 0)).toBe(false);
  });

  it('a profundidade de desenho da mesa em L é a do tampo de cima', () => {
    expect(objDepthRows({ id: 'l', type: 'desk_l', x: 0, y: 0 })).toBe(1);
    expect(objDepthRows({ id: 'd', type: 'desk', x: 0, y: 0 })).toBe(1);
    expect(objDepthRows({ id: 't', type: 'table', x: 0, y: 0 })).toBe(2);
    expect(objDepthRows({ id: 't', type: 'table', x: 0, y: 0, h: 3 })).toBe(3);
  });

  it('toda máscara do catálogo tem o tamanho do objeto', () => {
    for (const type of OBJECT_TYPES) {
      const def = OBJECT_DEFS[type];
      if (!def.cells) continue;
      expect(def.resizable).toBeFalsy();
      expect(def.cells).toHaveLength(def.h);
      for (const row of def.cells) expect(row).toHaveLength(def.w);
    }
  });
});

describe('setup da mesa', () => {
  it('os setups da Fase C2, com o monitor como padrão', () => {
    expect(DESK_SETUPS.map((s) => s.id)).toEqual(['monitor', 'gamer', 'dual', 'laptop_silver', 'aio', 'laptop', 'none']);
    expect(DEFAULT_DESK_SETUP).toBe('monitor');
    for (const s of DESK_SETUPS) {
      expect(s.id).toMatch(/^[a-z0-9_]{1,24}$/);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it('toda mesa aceita todos os setups; outros tipos, nenhum', () => {
    for (const type of DESK_TYPES) expect(deskSetups(type)).toBe(DESK_SETUPS);
    expect(deskSetups('chair')).toEqual([]);
    expect(deskSetups('table')).toEqual([]);
    expect(deskSetups('nao-existe')).toEqual([]);
  });

  it('sem setup ou com setup desconhecido vale o padrão; fora de mesa é null', () => {
    expect(objSetup({ type: 'desk' })!.id).toBe('monitor');
    expect(objSetup({ type: 'desk_l', setup: 'gamer' })!.id).toBe('gamer');
    expect(objSetup({ type: 'desk', setup: 'saiu-do-catalogo' })!.id).toBe('monitor');
    expect(objSetup({ type: 'chair', setup: 'gamer' })).toBeNull();
  });

  it('a validação aceita setup ausente ou válido e recusa o resto', () => {
    expect(objSetupError({ type: 'desk' })).toBeNull();
    expect(objSetupError({ type: 'desk_glass', setup: 'aio' })).toBeNull();
    expect(objSetupError({ type: 'desk', setup: 'tres-monitores' })).toBe('setup desconhecido para desk: tres-monitores');
    expect(objSetupError({ type: 'chair', setup: 'gamer' })).toBe('setup desconhecido para chair: gamer');
    expect(objSetupError({ type: 'desk', setup: 3 })).toBe('setup de mesa inválido');
    expect(objSetupError({ type: 'desk', setup: null })).toBe('setup de mesa inválido');
    expect(validateMapShape(room(8, 8, { id: 'a', type: 'desk', x: 1, y: 1 }, { id: 'b', type: 'desk_wide', x: 4, y: 1, setup: 'dual', color: 'walnut' }))).toBeNull();
    expect(validateMapShape(room(8, 8, { id: 'a', type: 'desk', x: 1, y: 1, setup: 'x' }))).toBe('setup desconhecido para desk: x');
    expect(validateMapShape(room(8, 8, { id: 'a', type: 'sofa', x: 1, y: 1, setup: 'gamer' }))).toBe('setup desconhecido para sofa: gamer');
  });

  it('normalizar tira o setup e a cor inválidos já gravados, sem alterar o mapa recebido', () => {
    const clean = room(10, 8, { id: 'a', type: 'desk', x: 1, y: 1, setup: 'gamer' }, { id: 'b', type: 'chair', x: 1, y: 2, color: 'blue' });
    expect(normalizeObjectVariants(clean)).toBe(clean);
    const dirty = room(10, 8, { id: 'a', type: 'desk', x: 1, y: 1, setup: 'antigo', color: 'walnut' }, { id: 'b', type: 'desk', x: 4, y: 1, setup: 'aio', color: 'roxo' }, { id: 'c', type: 'chair', x: 1, y: 2, setup: 'gamer' });
    const before = JSON.stringify(dirty);
    const fixed = normalizeObjectVariants(dirty);
    expect(JSON.stringify(dirty)).toBe(before);
    expect(fixed.objects).toEqual([
      { id: 'a', type: 'desk', x: 1, y: 1, color: 'walnut' },
      { id: 'b', type: 'desk', x: 4, y: 1, setup: 'aio' },
      { id: 'c', type: 'chair', x: 1, y: 2 },
    ]);
    expect(validateMapShape(fixed)).toBeNull();
  });
});

describe('texto no sprite (letreiro neon)', () => {
  it('usa props.text, sem quebras e cortado no limite; vazio cai no texto padrão', () => {
    const spec = OBJECT_DEFS.neon.text!;
    expect(objText({ type: 'neon' })).toBe(spec.default);
    expect(objText({ type: 'neon', props: { text: '   ' } })).toBe(spec.default);
    expect(objText({ type: 'neon', props: { text: ' Bom\n dia ' } })).toBe('Bom dia');
    expect(objText({ type: 'neon', props: { text: 'x'.repeat(100) } })).toHaveLength(spec.max);
    expect(objText({ type: 'neon', props: { text: 42 } })).toBe(spec.default);
    expect(objText({ type: 'note', props: { text: 'oi' } })).toBeNull();
  });

  it('a validação recusa texto longo demais ou que não é texto', () => {
    const max = OBJECT_DEFS.neon.text!.max;
    expect(objTextError({ type: 'neon' })).toBeNull();
    expect(objTextError({ type: 'neon', props: { text: 'ABERTO' } })).toBeNull();
    expect(objTextError({ type: 'neon', props: { text: 'x'.repeat(max + 1) } })).toMatch(/longo demais/);
    expect(objTextError({ type: 'neon', props: { text: 7 } })).toBe('texto de objeto inválido');
    // a nota tem texto livre de até 500 caracteres: não é afetada
    expect(objTextError({ type: 'note', props: { text: 'x'.repeat(400) } })).toBeNull();
    expect(validateMapShape(room(8, 8, { id: 'n', type: 'neon', x: 1, y: 1, props: { text: 'x'.repeat(max + 1) } }))).toMatch(/longo demais/);
    expect(validateMapShape(room(8, 8, { id: 'n', type: 'neon', x: 1, y: 1, color: 'cyan', props: { text: 'Café' } }))).toBeNull();
  });
});

describe('catálogo das Fases C1 e C2', () => {
  it('tem as cadeiras, os objetos de mesa e os 10 extras', () => {
    const expected = [
      ...['chair', 'chair_gamer', 'chair_exec', 'stool', 'armchair', 'pouf'],
      ...['keyboard', 'mousepad', 'mouse', 'mug', 'bottle', 'headphones', 'desk_lamp', 'photo', 'postits', 'books', 'trophy', 'succulent', 'cactus_small'],
      ...['espresso', 'podcast_mic', 'ring_light', 'printer', 'snack_machine', 'corkboard', 'wall_clock', 'neon', 'aquarium', 'split_ac'],
    ];
    for (const type of expected) expect([type, Boolean(OBJECT_DEFS[type])]).toEqual([type, true]);
  });

  it('os objetos de mesa são 1×1, não bloqueiam e podem ir para a mesa do funcionário', () => {
    for (const type of OBJECT_TYPES) {
      if (objectGroup(type) !== 'deskitems') continue;
      const def = OBJECT_DEFS[type];
      expect([type, def.w, def.h, def.solid]).toEqual([type, 1, 1, false]);
      expect([type, DESK_DECOR_TYPES.includes(type)]).toEqual([type, true]);
    }
    for (const type of DESK_DECOR_TYPES) expect([type, Boolean(OBJECT_DEFS[type])]).toEqual([type, true]);
    // os tipos de antes do visual v2 continuam na lista
    for (const type of ['plant_small', 'plant', 'lamp', 'frame', 'photo', 'trophy', 'note', 'poster']) expect(DESK_DECOR_TYPES).toContain(type);
  });

  it('todo tipo cai num grupo da paleta e nenhum grupo fica vazio', () => {
    const count = new Map<string, number>();
    for (const type of OBJECT_TYPES) {
      const g = objectGroup(type);
      expect(OBJECT_GROUPS).toContain(g);
      count.set(g, (count.get(g) ?? 0) + 1);
    }
    for (const g of OBJECT_GROUPS) expect([g, (count.get(g) ?? 0) > 0]).toEqual([g, true]);
    expect(objectGroup('desk_l')).toBe('desks');
    expect(objectGroup('poster')).toBe('interactive');
    expect(objectGroup('nao-existe')).toBe('decor');
  });

  it('um tipo por objeto: nenhum tipo novo é uma cor de outro tipo', () => {
    const colorIds = new Set(OBJECT_TYPES.flatMap((t) => (OBJECT_DEFS[t].colors ?? []).map((c) => c.id)));
    for (const type of OBJECT_TYPES) {
      const suffix = type.split('_').pop()!;
      const base = type.slice(0, -(suffix.length + 1));
      if (base && OBJECT_DEFS[base]?.colors?.some((c) => c.id === suffix)) throw new Error(`${type} parece uma cor de ${base}`);
    }
    expect(colorIds.size).toBeGreaterThan(10);
  });
});
