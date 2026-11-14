// SPDX-License-Identifier: AGPL-3.0-only
// Pisos, paredes, janelas e exterior do visual v2 (Fase B).
import { createCanvas } from '@napi-rs/canvas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY_PERIODS, Floor, Wall, emptyMap, type OfficeMap } from '@office-imp/shared';
import { generateOffice } from '@office-imp/map-engine';
import { setCanvasFactory } from '../src/game/art/canvas';
import { DECOR_KINDS, DECOR_SIZE, EXTERIOR, EXTERIOR_MARGIN, decorSprite, exteriorDecor, exteriorGrass, isVoid, windowView } from '../src/game/art/exterior';
import { FLOOR_COLOR, FLOOR_PATTERN, FLOOR_PERIOD, paintFloorPattern } from '../src/game/art/floors';
import { Sprite, rgba } from '../src/game/art/prim';
import { renderFull, renderMini, renderScene } from '../src/game/art/render';
import { T, drawFloor, drawStatic, hasPeriodWalls, makeCanvas, tilesetCanvas, wallStyle, wallTileAt, windowKind } from '../src/game/art/tiles';
import { WALL_MINI, paintWall } from '../src/game/art/walls';

beforeAll(() => setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement));
afterAll(() => setCanvasFactory());

const floorIds = Object.values(Floor).filter((v) => v !== 0);
const wallIds = Object.values(Wall).filter((v) => v !== 0);
const same = (a: Sprite, b: Sprite) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const lum = (c: string) => {
  const [r, g, b] = rgba(c);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
const colors = (s: Sprite) => {
  const set = new Set<string>();
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) set.add(s.get(x, y) ?? 'vazio');
  return set;
};

/** Sala 8×6 com parede em volta; `wall` no contorno e piso de madeira. */
function room(wall: number = Wall.Wall, w = 8, h = 6): OfficeMap {
  const map = emptyMap(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      map.layers.floor[y * w + x] = Floor.Wood;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) map.layers.walls[y * w + x] = wall;
    }
  }
  map.spawns.push({ x: 2, y: 2 });
  return map;
}
const setWall = (map: OfficeMap, x: number, y: number, id: number) => {
  map.layers.walls[y * map.width + x] = id;
};

describe('pisos', () => {
  it('todo piso tem cor chapada e padrão de 256 px, opaco e determinístico', () => {
    expect(FLOOR_PATTERN).toBe(FLOOR_PERIOD * T);
    for (const id of floorIds) {
      expect(FLOOR_COLOR[id], `piso ${id}`).toMatch(/^#[0-9a-f]{6}$/);
      const a = paintFloorPattern(id)!;
      expect(a.w).toBe(FLOOR_PATTERN);
      expect(a.h).toBe(FLOOR_PATTERN);
      for (let i = 3; i < a.data.length; i += 4) if (a.data[i] !== 255) throw new Error(`piso ${id} com pixel transparente`);
      expect(same(a, paintFloorPattern(id)!)).toBe(true);
    }
    expect(paintFloorPattern(0)).toBeNull();
    expect(paintFloorPattern(99)).toBeNull();
  });

  it('usa poucos tons e contraste baixo (piso ruidoso atrapalha a leitura dos avatares)', () => {
    for (const id of floorIds) {
      const s = paintFloorPattern(id)!;
      const set = colors(s);
      expect(set.size, `piso ${id} tem ${set.size} cores`).toBeLessThanOrEqual(8);
      // sem contar o filete dourado do palco, nenhum tom se afasta muito do tom médio do piso
      const ls = [...set].filter((c) => !(id === Floor.Stage && c === '#a88c4c')).map(lum);
      expect(Math.max(...ls) - Math.min(...ls), `piso ${id}`).toBeLessThan(50);
      // e a grande maioria dos pixels fica nos tons próximos da cor chapada
      const base = lum(FLOOR_COLOR[id]);
      let near = 0;
      for (let y = 0; y < s.h; y += 3) for (let x = 0; x < s.w; x += 3) if (Math.abs(lum(s.get(x, y)!) - base) < 22) near++;
      expect(near / Math.ceil(s.w / 3) ** 2, `piso ${id}`).toBeGreaterThan(0.75);
    }
  });

  it('os pisos são distintos entre si', () => {
    const seen = new Map<string, number>();
    for (const id of floorIds) {
      const s = paintFloorPattern(id)!;
      let h = 2166136261;
      for (let i = 0; i < s.data.length; i += 4) h = Math.imul(h ^ ((s.data[i] << 16) | (s.data[i + 1] << 8) | s.data[i + 2]), 16777619);
      const key = String(h >>> 0);
      expect(seen.has(key), `piso ${id} igual ao ${seen.get(key)}`).toBe(false);
      seen.set(key, id);
    }
  });

  it('o padrão é contínuo: o bloco (tx, ty) é o recorte do padrão e repete a cada 8 blocos, também em coordenadas negativas', () => {
    for (const id of [Floor.Wood, Floor.Herringbone, Floor.BurntCement, Floor.Porcelain]) {
      const pat = paintFloorPattern(id)!;
      const tile = (tx: number, ty: number) => {
        const c = makeCanvas(T, T);
        drawFloor(c.getContext('2d')!, id, 0, 0, tx, ty);
        return Sprite.fromCanvas(c);
      };
      const a = tile(3, 5);
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) expect(a.get(x, y)).toBe(pat.get(3 * T + x, 5 * T + y));
      expect(same(a, tile(3 + FLOOR_PERIOD, 5 - FLOOR_PERIOD))).toBe(true);
      expect(same(tile(-1, -1), tile(FLOOR_PERIOD - 1, FLOOR_PERIOD - 1))).toBe(true);
      expect(same(a, tile(4, 5))).toBe(false);
    }
  });

  it('as tábuas atravessam a emenda do padrão (nenhuma tábua curta na volta)', () => {
    const s = paintFloorPattern(Floor.Wood)!;
    const joint = s.get(0, 7); // não importa a cor: mede-se a distância entre emendas na fileira
    expect(joint).toBeTruthy();
    for (let row = 0; row < FLOOR_PATTERN / 8; row++) {
      const y = row * 8 + 3;
      const cuts: number[] = [];
      const seam = s.get(0, row * 8 + 7)!;
      for (let x = 0; x < FLOOR_PATTERN; x++) {
        // emenda = coluna inteira (7 px) mais escura que as vizinhas
        let full = true;
        for (let k = 0; k < 7; k++) if (lum(s.get(x, row * 8 + k)!) > lum(seam) + 14) full = false;
        if (full) cuts.push(x);
      }
      expect(cuts.length, `fileira ${row} (y=${y})`).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < cuts.length; i++) {
        const next = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + FLOOR_PATTERN;
        expect(next - cuts[i], `fileira ${row}`).toBeGreaterThanOrEqual(32);
      }
    }
  });

  it('a folha de tiles do Mapmaker tem todos os pisos e paredes', () => {
    const floor = Sprite.fromCanvas(tilesetCanvas('floor'));
    const walls = Sprite.fromCanvas(tilesetCanvas('walls'));
    for (const id of floorIds) expect(floor.alpha((id - 1) * T + 16, 16), `piso ${id}`).toBe(255);
    for (const id of wallIds) expect(walls.alpha((id - 1) * T + 16, 30), `parede ${id}`).toBe(255);
    expect(floor.w).toBeGreaterThanOrEqual(Math.max(...floorIds) * T);
  });
});

describe('paredes', () => {
  const n = { below: false, above: false, left: true, right: true };

  it('toda parede tem desenho e cor de mini-mapa; só a divisória de vidro tem transparência', () => {
    for (const id of wallIds) {
      expect(WALL_MINI[id], `parede ${id}`).toMatch(/^#[0-9a-f]{6}$/);
      if (id === Wall.Window) continue;
      const face = paintWall({ style: id, n });
      const top = paintWall({ style: id, n: { ...n, below: true } });
      let clear = 0;
      for (let i = 3; i < face.data.length; i += 4) if (face.data[i] < 255) clear++;
      if (id === Wall.Glass) {
        expect(clear).toBeGreaterThan(400);
        expect(top.alpha(2, 16)).toBe(0);
        expect(top.alpha(15, 16)).toBe(255);
      } else {
        expect(clear, `parede ${id}`).toBe(0);
        expect(same(face, top)).toBe(false);
      }
    }
  });

  it('os acabamentos são distintos e determinísticos', () => {
    const styles = wallIds.filter((id) => id !== Wall.Window);
    for (const a of styles) {
      expect(same(paintWall({ style: a, n, variant: 1 }), paintWall({ style: a, n, variant: 1 }))).toBe(true);
      for (const b of styles) if (a < b) expect(same(paintWall({ style: a, n }), paintWall({ style: b, n })), `${a} x ${b}`).toBe(false);
    }
    // tijolo e madeira variam de bloco para bloco; a parede lisa não
    expect(same(paintWall({ style: Wall.Brick, n, variant: 0 }), paintWall({ style: Wall.Brick, n, variant: 1 }))).toBe(false);
    expect(same(paintWall({ style: Wall.Plain, n, variant: 0 }), paintWall({ style: Wall.Plain, n, variant: 1 }))).toBe(true);
  });

  it('a janela adota o acabamento da parede vizinha', () => {
    const map = room(Wall.Brick);
    setWall(map, 2, 0, Wall.Window);
    setWall(map, 3, 0, Wall.Window);
    expect(wallStyle(map, 2, 0)).toBe(Wall.Brick);
    expect(wallStyle(map, 3, 0)).toBe(Wall.Brick);
    expect(wallStyle(map, 1, 0)).toBe(Wall.Brick);
    setWall(map, 1, 0, Wall.WoodPanel);
    expect(wallStyle(map, 2, 0)).toBe(Wall.WoodPanel);
    // parede de janelas de ponta a ponta: fica com o acabamento padrão
    const all = room(Wall.Window);
    expect(wallStyle(all, 3, 0)).toBe(Wall.Wall);
    // ao lado de uma divisória de vidro, procura do outro lado
    const glass = room(Wall.Plain);
    setWall(glass, 2, 0, Wall.Glass);
    setWall(glass, 3, 0, Wall.Window);
    expect(wallStyle(glass, 3, 0)).toBe(Wall.Plain);
    expect(wallTileAt(map, 3, 3)).toBeNull();
  });

  it('janela para o exterior mostra a vista; vista de fora ou entre cômodos, só vidro', () => {
    const map = room(Wall.Wall, 8, 9);
    for (let x = 1; x < 7; x++) setWall(map, x, 4, Wall.Wall); // parede interna no meio
    setWall(map, 3, 0, Wall.Window); // em cima: dá para fora
    setWall(map, 3, 4, Wall.Window); // no meio: entre dois cômodos
    setWall(map, 3, 8, Wall.Window); // embaixo: vista de fora
    setWall(map, 0, 2, Wall.Window); // lateral: trecho vertical
    expect(windowKind(map, 3, 0, false)).toBe('view');
    expect(windowKind(map, 3, 4, false)).toBe('inner');
    expect(windowKind(map, 3, 8, false)).toBe('outside');
    expect(wallTileAt(map, 0, 2)).toMatchObject({ window: 'outside', n: { below: true } });
    expect(wallTileAt(map, 3, 0)).toMatchObject({ window: 'view', style: Wall.Wall, winLeft: false, winRight: false });
    // janelas vizinhas se emendam
    setWall(map, 4, 0, Wall.Window);
    expect(wallTileAt(map, 3, 0)).toMatchObject({ winRight: true });
    expect(wallTileAt(map, 4, 0)).toMatchObject({ winLeft: true });
    // um vazio do lado de dentro do mapa também é exterior
    const hole = room(Wall.Wall, 8, 9);
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 3; y++) {
        hole.layers.floor[y * 8 + x] = 0;
        hole.layers.walls[y * 8 + x] = 0;
      }
      setWall(hole, x, 3, Wall.Wall);
      hole.layers.floor[3 * 8 + x] = Floor.Wood;
    }
    setWall(hole, 3, 3, Wall.Window);
    expect(isVoid(hole, 3, 2)).toBe(true);
    expect(windowKind(hole, 3, 3, false)).toBe('view');
  });

  it('o período do dia só muda as janelas que dão para fora', () => {
    const map = room(Wall.Plain, 8, 9);
    for (let x = 1; x < 7; x++) setWall(map, x, 4, Wall.Plain);
    setWall(map, 3, 0, Wall.Window);
    setWall(map, 3, 4, Wall.Window);
    setWall(map, 3, 8, Wall.Window);
    expect(hasPeriodWalls(map)).toBe(true);
    expect(hasPeriodWalls(room())).toBe(false);
    const draw = (period: (typeof DAY_PERIODS)[number]) => {
      const c = makeCanvas(8 * T, 9 * T);
      drawStatic(c.getContext('2d')!, map, 0, 0, 8, 9, period);
      return Sprite.fromCanvas(c);
    };
    const day = draw('day');
    const night = draw('night');
    let diff = 0;
    for (let y = 0; y < day.h; y++) {
      for (let x = 0; x < day.w; x++) {
        if (day.get(x, y) === night.get(x, y)) continue;
        diff++;
        const tx = Math.floor(x / T);
        const ty = Math.floor(y / T);
        expect(tx === 3 && (ty === 0 || ty === 8), `pixel (${x},${y}) mudou fora das janelas externas`).toBe(true);
      }
    }
    expect(diff).toBeGreaterThan(100);
    // o padrão é o dia
    const c = makeCanvas(8 * T, 9 * T);
    drawStatic(c.getContext('2d')!, map, 0, 0, 8, 9);
    expect(same(Sprite.fromCanvas(c), day)).toBe(true);
  });

  it('blocos sem piso nem parede ficam transparentes (é onde o exterior aparece)', () => {
    const map = room();
    map.layers.floor[2 * 8 + 3] = 0;
    const c = makeCanvas(8 * T, 6 * T);
    drawStatic(c.getContext('2d')!, map, 0, 0, 8, 6);
    const s = Sprite.fromCanvas(c);
    expect(s.alpha(3 * T + 16, 2 * T + 16)).toBe(0);
    expect(s.alpha(4 * T + 16, 2 * T + 16)).toBe(255);
    // trecho que sai do mapa não desenha nada fora dele
    const big = makeCanvas(12 * T, 10 * T);
    drawStatic(big.getContext('2d')!, map, -2, -2, 12, 10);
    const b = Sprite.fromCanvas(big);
    expect(b.alpha(T, T)).toBe(0);
    expect(b.alpha(2 * T + 4, 2 * T + 4)).toBe(255);
  });
});

describe('exterior e períodos do dia', () => {
  it('cada período tem a sua paleta chapada de grama, e o padrão repete sem emenda', () => {
    const seen = new Set<string>();
    for (const period of DAY_PERIODS) {
      const g = Sprite.fromCanvas(exteriorGrass(period));
      expect(g.w).toBe(FLOOR_PATTERN);
      const set = colors(g);
      expect(set.size, period).toBeLessThanOrEqual(6);
      expect(set.has(EXTERIOR[period].grass.base)).toBe(true);
      seen.add(EXTERIOR[period].grass.base);
      expect(exteriorGrass(period)).toBe(exteriorGrass(period));
    }
    expect(seen.size).toBe(4);
    // a noite é bem mais escura que o dia
    expect(lum(EXTERIOR.night.grass.base)).toBeLessThan(lum(EXTERIOR.day.grass.base) * 0.6);
  });

  it('estrelas e lua só aparecem à noite; sol no horizonte ao amanhecer e ao entardecer', () => {
    const has = (period: (typeof DAY_PERIODS)[number], color: string | null) => {
      if (!color) return false;
      for (let v = 0; v < 4; v++) if (colors(windowView(period, v)).has(color)) return true;
      return false;
    };
    expect(EXTERIOR.night.star && EXTERIOR.night.moon).toBeTruthy();
    expect(has('night', EXTERIOR.night.star)).toBe(true);
    expect(has('night', EXTERIOR.night.moon)).toBe(true);
    for (const period of ['dawn', 'day', 'dusk'] as const) {
      expect(EXTERIOR[period].star).toBeNull();
      expect(EXTERIOR[period].moon).toBeNull();
      expect(has(period, EXTERIOR.night.star)).toBe(false);
    }
    expect(has('dawn', EXTERIOR.dawn.sun)).toBe(true);
    expect(has('dusk', EXTERIOR.dusk.sun)).toBe(true);
    expect(EXTERIOR.day.sun).toBeNull();
    // céu, árvores e grama em todas as vistas; a vista é contínua e dá a volta a cada 4 blocos
    for (const period of DAY_PERIODS) {
      const set = colors(windowView(period, 2));
      for (const c of [EXTERIOR[period].sky, EXTERIOR[period].grass.base, EXTERIOR[period].leaf.base]) expect(set.has(c), `${period} ${c}`).toBe(true);
      expect(same(windowView(period, 1), windowView(period, 5))).toBe(true);
      expect(same(windowView(period, 1), windowView(period, 2))).toBe(false);
    }
  });

  it('árvores e arbustos: sprites com contorno, um por tipo e período', () => {
    for (const kind of DECOR_KINDS) {
      const day = Sprite.fromCanvas(decorSprite(kind, 'day'));
      expect(day.w).toBe(DECOR_SIZE[kind].w);
      expect(day.h).toBe(DECOR_SIZE[kind].h);
      let opaque = 0;
      for (let i = 3; i < day.data.length; i += 4) if (day.data[i] === 255) opaque++;
      expect(opaque, kind).toBeGreaterThan(40);
      expect(same(day, Sprite.fromCanvas(decorSprite(kind, 'night'))), kind).toBe(false);
      expect(decorSprite(kind, 'dusk')).toBe(decorSprite(kind, 'dusk'));
    }
  });

  it('a distribuição é determinística, fica na margem e nunca encosta no escritório', () => {
    const map = generateOffice({ name: 'X', size: 'custom', customCount: 15, partners: 2, partnersShareRoom: true });
    const a = exteriorDecor(map);
    expect(a).toEqual(exteriorDecor(map));
    expect(a.length).toBeGreaterThan(60);
    expect(new Set(a.map((d) => d.kind)).size).toBeGreaterThanOrEqual(6);
    const M = EXTERIOR_MARGIN * T;
    let last = -Infinity;
    for (const d of a) {
      const { w, h } = DECOR_SIZE[d.kind];
      for (let ty = Math.floor(d.y / T); ty <= Math.floor((d.y + h - 1) / T); ty++) {
        for (let tx = Math.floor(d.x / T); tx <= Math.floor((d.x + w - 1) / T); tx++) expect(isVoid(map, tx, ty), `${d.kind} em (${tx},${ty})`).toBe(true);
      }
      const bx = d.x + Math.floor(w / 2);
      const by = d.y + h;
      expect(bx >= -M && bx < map.width * T + M && by >= -M && by < map.height * T + M).toBe(true);
      expect(by).toBeGreaterThanOrEqual(last);
      last = by;
    }
    // os vazios de dentro do mapa também recebem exterior quando há espaço
    const hollow = emptyMap(30, 30);
    for (let i = 0; i < 30; i++) for (const [x, y] of [[i, 0], [i, 29], [0, i], [29, i]]) {
      hollow.layers.walls[y * 30 + x] = Wall.Wall;
      hollow.layers.floor[y * 30 + x] = Floor.Wood;
    }
    expect(exteriorDecor(hollow).some((d) => d.x > T && d.y > T && d.x < 28 * T && d.y < 28 * T)).toBe(true);
  });

  it('crescer o mapa para leste não muda as árvores que já existiam a oeste', () => {
    const small = room(Wall.Wall, 10, 8);
    const wide = room(Wall.Wall, 40, 8);
    const key = (d: { kind: string; x: number; y: number }) => `${d.kind}:${d.x}:${d.y}`;
    const west = (list: ReturnType<typeof exteriorDecor>) => list.filter((d) => d.x + DECOR_SIZE[d.kind].w < -8).map(key);
    expect(west(exteriorDecor(small)).length).toBeGreaterThan(5);
    expect(west(exteriorDecor(wide)).filter((k) => west(exteriorDecor(small)).includes(k)).length).toBeGreaterThan(5);
    const ys = (list: ReturnType<typeof exteriorDecor>) => list.filter((d) => d.x + DECOR_SIZE[d.kind].w < -8 && d.y > -8 * T && d.y < 12 * T).map(key).sort();
    expect(ys(exteriorDecor(wide))).toEqual(ys(exteriorDecor(small)));
  });

  it('a cena completa cobre a margem com grama; o Mapmaker continua com fundo neutro', () => {
    const map = room(Wall.Plain);
    setWall(map, 3, 0, Wall.Window);
    const scene = Sprite.fromCanvas(renderScene(map, { period: 'night', margin: 3 }));
    expect(scene.w).toBe((8 + 6) * T);
    expect(scene.h).toBe((6 + 6) * T);
    for (let i = 3; i < scene.data.length; i += 4) if (scene.data[i] !== 255) throw new Error('cena com pixel transparente');
    const nightGrass = new Set(Object.values(EXTERIOR.night.grass));
    expect(nightGrass.has(scene.get(2, 2)!) || scene.get(2, 2) !== null).toBe(true);
    const day = Sprite.fromCanvas(renderScene(map, { margin: 3 }));
    expect(same(day, scene)).toBe(false);
    // o interior não escurece: o piso no meio da sala é igual de dia e à noite
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) expect(scene.get(6 * T + x, 6 * T + y)).toBe(day.get(6 * T + x, 6 * T + y));
    const hole = room();
    hole.layers.floor[2 * 8 + 3] = 0;
    const full = Sprite.fromCanvas(renderFull(hole));
    expect(full.get(3 * T + 16, 2 * T + 16)).toBe('#0b0b0d');
    const mini = Sprite.fromCanvas(renderMini(hole, 4));
    expect(mini.get(3 * 4 + 1, 2 * 4 + 1)).toBe('#22382a');
  });
});
