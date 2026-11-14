// SPDX-License-Identifier: AGPL-3.0-only
// Opções do avatar do visual v2 (o teste de regressão dos avatares antigos fica em objects.test.ts).
import { createCanvas } from '@napi-rs/canvas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AVATAR_ACCESSORIES, AVATAR_EXTRA_FIELDS, AVATAR_EXTRA_OPTIONS, AVATAR_OPTIONS, DIRS, sanitizeAvatar, type AvatarConfig } from '@office-imp/shared';
import { AV_FRAMES, AV_H, AV_W, avatarKey, avatarSheet, paintAvatarFrame } from '../src/game/art/avatar';
import { setCanvasFactory } from '../src/game/art/canvas';
import { Sprite } from '../src/game/art/prim';
import { avatarSections } from '../src/game/art/sheet';

beforeAll(() => setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement));
afterAll(() => setCanvasFactory());

const BASE: AvatarConfig = { skin: 1, hair: 1, hairColor: 1, shirt: 3, pants: 0, accessories: [] };
const pixels = (c: AvatarConfig) => Sprite.fromCanvas(avatarSheet(c)).data;
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Uma configuração para cada valor de cada opção (as outras no padrão), mais combinações de acessórios. */
function everyOption(): { name: string; cfg: AvatarConfig }[] {
  const out: { name: string; cfg: AvatarConfig }[] = [];
  const O = AVATAR_OPTIONS;
  const lists: Record<string, number> = { skin: O.skin.length, hair: O.hairStyles.length, hairColor: O.hairColor.length, shirt: O.shirt.length, pants: O.pants.length };
  for (const [k, n] of Object.entries(lists)) for (let i = 0; i < n; i++) out.push({ name: `${k}=${i}`, cfg: sanitizeAvatar({ ...BASE, [k]: i }) });
  for (const k of AVATAR_EXTRA_FIELDS) for (let i = 1; i < AVATAR_EXTRA_OPTIONS[k].length; i++) out.push({ name: `${k}=${i}`, cfg: sanitizeAvatar({ ...BASE, [k]: i, accessories: k === 'accColor' ? [2, 4, 7, 8] : [] }) });
  for (const a of AVATAR_ACCESSORIES) out.push({ name: `acc=${a.id}`, cfg: sanitizeAvatar({ ...BASE, accessories: [a.id] }) });
  // cada estilo de cabelo debaixo do boné e do chapéu, e com barba e óculos
  for (let h = 0; h < O.hairStyles.length; h++) for (const acc of [[2, 3], [7, 6], [8, 5, 4, 9, 11], [10, 1]]) out.push({ name: `hair=${h}+${acc}`, cfg: sanitizeAvatar({ ...BASE, hair: h, beard: h % 5, accessories: acc }) });
  // roupas × estampas × calçados
  for (let t = 0; t < O.tops.length; t++) for (let p = 0; p < O.patterns.length; p++) out.push({ name: `top=${t},pattern=${p}`, cfg: sanitizeAvatar({ ...BASE, top: t, pattern: p, bottom: (t + p) % 3, shoes: p, accessories: [4, 11, 9] }) });
  return out;
}

describe('avatar do visual v2', () => {
  const all = everyOption();

  it('toda opção renderiza nas 4 direções e 3 quadros, sempre 32×48 por quadro', () => {
    expect([AV_W, AV_H]).toEqual([32, 48]);
    for (const { cfg } of all) {
      const c = avatarSheet(cfg);
      expect([c.width, c.height]).toEqual([AV_W * AV_FRAMES, AV_H * DIRS.length]);
    }
  });

  it('nenhum quadro desenha fora dos seus 32×48', () => {
    const M = 16;
    for (const { name, cfg } of all) {
      for (const dir of DIRS) {
        for (let f = 0; f < AV_FRAMES; f++) {
          const canvas = createCanvas(AV_W + M * 2, AV_H + M * 2);
          paintAvatarFrame(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, M, M, cfg, dir, f);
          const s = Sprite.fromCanvas(canvas as unknown as HTMLCanvasElement);
          let outside = 0;
          let inside = 0;
          for (let y = 0; y < s.h; y++)
            for (let x = 0; x < s.w; x++) {
              if (!s.alpha(x, y)) continue;
              if (x < M || y < M || x >= M + AV_W || y >= M + AV_H) outside++;
              else inside++;
            }
          expect(outside, `${name} ${dir} ${f}`).toBe(0);
          expect(inside, `${name} ${dir} ${f}`).toBeGreaterThan(300);
        }
      }
    }
  });

  it('cada opção nova muda o desenho (e o padrão explícito não muda nada)', () => {
    const base = pixels(sanitizeAvatar(BASE));
    for (const { name, cfg } of all) {
      if (name === 'skin=1' || name === 'hair=1' || name === 'hairColor=1' || name === 'shirt=3' || name === 'pants=0') continue;
      expect(same(pixels(cfg), base), name).toBe(false);
    }
    const explicit = { ...BASE, beard: 0, top: 0, pattern: 0, bottom: 0, shoes: 0, shoeColor: 0, accColor: 0 };
    expect(same(pixels(sanitizeAvatar(explicit)), base)).toBe(true);
    // cor dos acessórios sem acessório colorível não muda nada
    expect(same(pixels(sanitizeAvatar({ ...BASE, accColor: 5, accessories: [1, 9] })), pixels(sanitizeAvatar({ ...BASE, accessories: [1, 9] })))).toBe(true);
  });

  it('formato antigo e o novo equivalente dão o mesmo desenho e a mesma chave', () => {
    const old = { skin: 2, hair: 3, hairColor: 4, shirt: 5, pants: 1, accessory: 2 };
    const neu = { skin: 2, hair: 3, hairColor: 4, shirt: 5, pants: 1, accessories: [2] };
    expect(avatarKey(old as unknown as AvatarConfig)).toBe(avatarKey(neu));
    expect(same(pixels(old as unknown as AvatarConfig), pixels(neu))).toBe(true);
  });

  it('a folha de avatares cobre cada estilo, roupa, estampa, calçado e acessório', () => {
    const cells = avatarSections().flatMap((s) => s.cells);
    expect(cells.length).toBeGreaterThan(70);
    const text = cells.flatMap((c) => c.lines).join(' | ');
    for (let i = 0; i < AVATAR_OPTIONS.hairStyles.length; i++) expect(text).toContain(`CABELO ${i} `);
    for (let i = 0; i < AVATAR_OPTIONS.beards.length; i++) expect(text).toContain(`BARBA ${i} `);
    for (const a of AVATAR_ACCESSORIES) expect(text).toContain(`${a.id} `);
  });
});
