// SPDX-License-Identifier: AGPL-3.0-only
import { createCanvas } from '@napi-rs/canvas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCanvasFactory } from '../src/game/art/canvas';
import { GOLD, PAL, ramp } from '../src/game/art/palette';
import { drawText, textWidth } from '../src/game/art/pixfont';
import { OUTLINE, OUTLINE_MIX, Sprite, hex, mix, noise, rgba, shade, sprite } from '../src/game/art/prim';

/** Desenho do sprite em texto: `#` opaco, `.` transparente. */
function ascii(s: Sprite): string[] {
  const rows: string[] = [];
  for (let y = 0; y < s.h; y++) {
    let row = '';
    for (let x = 0; x < s.w; x++) row += s.alpha(x, y) ? '#' : '.';
    rows.push(row);
  }
  return rows;
}

const opaque = (s: Sprite) => ascii(s).join('').replaceAll('.', '').length;
const onlyHardEdges = (s: Sprite) => s.data.every((v, i) => i % 4 !== 3 || v === 0 || v === 255);

beforeAll(() => setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement));
afterAll(() => setCanvasFactory());

describe('cores', () => {
  it('rgba e hex são inversos', () => {
    expect(rgba('#d7b870')).toEqual([215, 184, 112, 255]);
    expect(rgba('#abc')).toEqual([170, 187, 204, 255]);
    expect(rgba('#11223380')).toEqual([17, 34, 51, 128]);
    expect(rgba(null)).toEqual([0, 0, 0, 0]);
    expect(rgba('transparent')).toEqual([0, 0, 0, 0]);
    expect(hex(215, 184, 112)).toBe('#d7b870');
    expect(hex(17, 34, 51, 128)).toBe('#11223380');
    expect(() => rgba('vermelho')).toThrow();
  });

  it('mix interpola e shade clareia ou escurece em proporção', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(shade('#808080', 0)).toBe('#808080');
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#804020', -0.5)).toBe('#402010');
    expect(shade('#804020', 0.5)).toBe('#c0a090');
  });

  it('as paletas têm 4 tons do escuro ao claro e o dourado Impera', () => {
    const luma = (c: string) => rgba(c)[0] * 0.299 + rgba(c)[1] * 0.587 + rgba(c)[2] * 0.114;
    expect(GOLD).toBe('#d7b870');
    expect(PAL.gold.base).toBe(GOLD);
    for (const m of [...Object.values(PAL), ramp('#3d5a8a'), ramp('#b39a78')]) {
      expect(luma(m.dark)).toBeLessThan(luma(m.base));
      expect(luma(m.base)).toBeLessThan(luma(m.light));
      expect(luma(m.light)).toBeLessThan(luma(m.hi));
    }
    expect(ramp('#3d5a8a').base).toBe('#3d5a8a');
  });
});

describe('noise', () => {
  it('é determinístico e fica em 0..1', () => {
    for (let i = 0; i < 500; i++) {
      const v = noise(i * 7 - 300, i * 13 - 900, i % 11);
      expect(v).toBe(noise(i * 7 - 300, i * 13 - 900, i % 11));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('não muda de valor entre versões (os pisos dependem dele)', () => {
    expect([noise(0, 0), noise(1, 0), noise(0, 1), noise(5, 9, 3), noise(31, 17, 7), noise(-4, 12, 2)]).toEqual([0, 0.94, 0.093, 0.562, 0.212, 0.863]);
  });

  it('varia com a coordenada e com a seed', () => {
    const values = new Set<number>();
    for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) values.add(noise(x, y, 1));
    expect(values.size).toBeGreaterThan(200);
    expect(noise(3, 4, 1)).not.toBe(noise(3, 4, 2));
  });
});

describe('primitivas', () => {
  it('px e rect gravam pixels inteiros e ignoram o que cai fora', () => {
    const s = new Sprite(4, 3);
    s.px(1, 1, '#ff0000').px(-1, 0, '#ff0000').px(9, 9, '#ff0000');
    expect(s.get(1, 1)).toBe('#ff0000');
    expect(opaque(s)).toBe(1);
    s.rect(2, -1, 5, 3, '#00ff00');
    expect(ascii(s)).toEqual(['..##', '.###', '....']);
    s.rect(0, 0, 4, 3, null);
    expect(opaque(s)).toBe(0);
  });

  it('rrect faz cantos em degrau', () => {
    expect(ascii(sprite(6, 5, (s) => s.rrect(0, 0, 6, 5, '#ffffff', 1)))).toEqual(['.####.', '######', '######', '######', '.####.']);
    expect(ascii(sprite(8, 6, (s) => s.rrect(0, 0, 8, 6, '#ffffff', 2)))).toEqual(['..####..', '.######.', '########', '########', '.######.', '..####..']);
    // raio 0 é um retângulo; raio grande demais é limitado pelo tamanho
    expect(opaque(sprite(6, 5, (s) => s.rrect(0, 0, 6, 5, '#ffffff', 0)))).toBe(30);
    expect(ascii(sprite(4, 3, (s) => s.rrect(0, 0, 4, 3, '#ffffff', 9)))).toEqual(['.##.', '####', '.##.']);
  });

  it('ellipse não tem anti-aliasing e é simétrica', () => {
    const s = sprite(7, 7, (e) => e.ellipse(0, 0, 7, 7, '#336699'));
    expect(ascii(s)).toEqual(['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..']);
    expect(onlyHardEdges(s)).toBe(true);
    const wide = sprite(12, 5, (e) => e.ellipse(0, 0, 12, 5, '#336699'));
    const rows = ascii(wide);
    expect(rows).toEqual([...rows].reverse());
    expect(rows.map((r) => [...r].reverse().join(''))).toEqual(rows);
    expect(onlyHardEdges(wide)).toBe(true);
    expect(new Set(rows.join('').replaceAll('.', '')).size).toBe(1);
  });

  it('line liga as duas pontas com 1 px de espessura', () => {
    const s = sprite(6, 4, (l) => l.line(0, 0, 5, 3, '#ffffff'));
    expect(s.alpha(0, 0)).toBe(255);
    expect(s.alpha(5, 3)).toBe(255);
    expect(opaque(s)).toBe(6);
    expect(ascii(sprite(5, 1, (l) => l.line(4, 0, 0, 0, '#ffffff')))).toEqual(['#####']);
  });

  it('poly preenche sem anti-aliasing, incluindo os vértices', () => {
    const tri = sprite(7, 4, (p) =>
      p.poly(
        [
          [0, 3],
          [3, 0],
          [6, 3],
        ],
        '#2f6e45',
      ),
    );
    expect(ascii(tri)).toEqual(['...#...', '..###..', '.#####.', '#######']);
    expect(onlyHardEdges(tri)).toBe(true);
    const box = sprite(5, 5, (p) =>
      p.poly(
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
        ],
        '#2f6e45',
      ),
    );
    expect(opaque(box)).toBe(9);
  });

  it('paste compõe com alfa e não apaga com pixel transparente', () => {
    const base = sprite(2, 1, (s) => s.rect(0, 0, 2, 1, '#000000'));
    const over = sprite(2, 1, (s) => s.px(0, 0, '#ffffff80'));
    base.paste(over);
    expect(base.get(0, 0)).toBe('#808080');
    expect(base.get(1, 0)).toBe('#000000');
  });

  it('flipX espelha na horizontal', () => {
    const s = sprite(3, 1, (f) => f.px(0, 0, '#ff0000'));
    expect(s.flipX().get(2, 0)).toBe('#ff0000');
    expect(s.flipX().get(0, 0)).toBeNull();
  });
});

describe('contorno automático', () => {
  it('pinta os 4 vizinhos transparentes com a cor vizinha misturada 78% com o contorno', () => {
    const s = sprite(5, 5, (o) => o.px(2, 2, '#d7b870')).outline();
    expect(ascii(s)).toEqual(['.....', '..#..', '.###.', '..#..', '.....']);
    const expected = mix('#d7b870', OUTLINE, OUTLINE_MIX);
    expect(OUTLINE).toBe('#1d1519');
    expect(OUTLINE_MIX).toBe(0.78);
    for (const [x, y] of [
      [1, 2],
      [3, 2],
      [2, 1],
      [2, 3],
    ])
      expect(s.get(x, y)).toBe(expected);
    expect(s.get(2, 2)).toBe('#d7b870');
  });

  it('cada trecho do contorno puxa a cor da peça ao lado', () => {
    const s = sprite(6, 3, (o) => o.rect(1, 1, 2, 1, '#ff0000').rect(3, 1, 2, 1, '#0000ff')).outline();
    expect(s.get(0, 1)).toBe(mix('#ff0000', OUTLINE, OUTLINE_MIX));
    expect(s.get(5, 1)).toBe(mix('#0000ff', OUTLINE, OUTLINE_MIX));
    expect(s.get(1, 0)).toBe(mix('#ff0000', OUTLINE, OUTLINE_MIX));
    expect(s.get(4, 2)).toBe(mix('#0000ff', OUTLINE, OUTLINE_MIX));
    // o miolo não muda
    expect(s.get(1, 1)).toBe('#ff0000');
    expect(s.get(4, 1)).toBe('#0000ff');
  });

  it('não sai do sprite nem muda o tamanho', () => {
    const s = sprite(3, 3, (o) => o.rect(0, 0, 3, 3, '#ffffff')).outline();
    expect(opaque(s)).toBe(9);
    expect(s.get(0, 0)).toBe('#ffffff');
  });

  it('aceita cor e intensidade próprias', () => {
    const s = sprite(3, 1, (o) => o.px(1, 0, '#ffffff')).outline({ color: '#000000', amount: 1 });
    expect(s.get(0, 0)).toBe('#000000');
  });

  it('piece contorna a peça separadamente, por cima do que já existe', () => {
    const s = new Sprite(8, 6);
    s.piece((p) => p.rect(1, 1, 6, 4, '#b9875a'));
    s.piece((p) => p.rect(3, 2, 2, 2, '#9da2aa'));
    const edge = mix('#9da2aa', OUTLINE, OUTLINE_MIX);
    expect(s.get(3, 2)).toBe('#9da2aa');
    expect(s.get(2, 2)).toBe(edge);
    expect(s.get(3, 1)).toBe(edge);
    expect(s.get(5, 3)).toBe(edge);
    expect(s.get(1, 1)).toBe('#b9875a');
    expect(s.get(0, 1)).toBe(mix('#b9875a', OUTLINE, OUTLINE_MIX));
  });
});

describe('canvas e fonte', () => {
  it('toCanvas grava os mesmos pixels e drawTo respeita a transparência', () => {
    const s = sprite(4, 4, (o) => o.rect(1, 1, 2, 2, '#d7b870')).outline();
    const back = Sprite.fromCanvas(s.toCanvas());
    expect([...back.data]).toEqual([...s.data]);
    expect(s.toCanvas()).toBe(s.toCanvas());
    const target = createCanvas(6, 6) as unknown as HTMLCanvasElement;
    const ctx = target.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 6, 6);
    s.drawTo(ctx, 1, 1);
    const out = Sprite.fromCanvas(target);
    expect(out.get(0, 0)).toBe('#ff0000');
    expect(out.get(1, 1)).toBe('#ff0000');
    expect(out.get(2, 2)).toBe('#d7b870');
  });

  it('a fonte 3×5 mede e escreve o texto', () => {
    expect(textWidth('')).toBe(0);
    expect(textWidth('AB')).toBe(7);
    expect(textWidth('ação')).toBe(textWidth('ACAO'));
    const s = new Sprite(8, 5);
    drawText(s, 'il', 0, 0, '#ffffff');
    expect(ascii(s)).toEqual(['###.#...', '.#..#...', '.#..#...', '.#..#...', '###.###.']);
  });
});
