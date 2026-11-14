// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  ACC,
  AVATAR_ACCESSORIES,
  AVATAR_EXTRA_FIELDS,
  AVATAR_EXTRA_OPTIONS,
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  accessoriesConflict,
  accessoryBlockers,
  avatarConfigKey,
  sanitizeAccessories,
  sanitizeAvatar,
  toggleAccessory,
} from '../src';

describe('sanitizeAvatar: formato antigo', () => {
  it('converte `accessory` em `accessories` sem perda (0 = lista vazia)', () => {
    const base = { skin: 2, hair: 3, hairColor: 4, shirt: 5, pants: 1 };
    expect(sanitizeAvatar({ ...base, accessory: 0 })).toEqual({ ...base, accessories: [] });
    for (const id of [1, 2, 3, 4]) expect(sanitizeAvatar({ ...base, accessory: id })).toEqual({ ...base, accessories: [id] });
  });

  it('os ids 1 a 4 continuam sendo óculos, boné, fones e gravata', () => {
    expect([ACC.Glasses, ACC.Cap, ACC.Headphones, ACC.Tie]).toEqual([1, 2, 3, 4]);
  });

  it('`accessory` fora do antigo limite (0 a 4) vira nenhum', () => {
    expect(sanitizeAvatar({ accessory: 5 }).accessories).toEqual([]);
    expect(sanitizeAvatar({ accessory: -1 }).accessories).toEqual([]);
    expect(sanitizeAvatar({ accessory: 1.5 }).accessories).toEqual([]);
  });

  it('com os dois campos, vale `accessories`', () => {
    expect(sanitizeAvatar({ accessory: 2, accessories: [1] }).accessories).toEqual([1]);
    expect(sanitizeAvatar({ accessory: 2, accessories: [] }).accessories).toEqual([]);
  });

  it('as cores de antes continuam nos mesmos índices', () => {
    expect(AVATAR_OPTIONS.skin.slice(0, 5)).toEqual(['#f6d3b3', '#e8b88f', '#c98d5f', '#9a6238', '#6b4226']);
    expect(AVATAR_OPTIONS.hairColor.slice(0, 7)).toEqual(['#1c1917', '#4a2c17', '#8a5a2b', '#d7b870', '#b91c1c', '#9ca3af', '#f5f5f4']);
    expect(AVATAR_OPTIONS.shirt.slice(0, 10)).toEqual(['#d7b870', '#111827', '#f5f5f4', '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#db2777']);
    expect(AVATAR_OPTIONS.pants.slice(0, 6)).toEqual(['#1f2937', '#374151', '#1e3a8a', '#44403c', '#0f172a', '#78350f']);
    expect(AVATAR_OPTIONS.hairStyles.slice(0, 6)).toEqual(['Careca', 'Curto', 'Médio', 'Longo', 'Topete', 'Rabo de cavalo']);
    expect(AVATAR_OPTIONS.shoeColor[0]).toBe('#111318');
    expect(AVATAR_OPTIONS.accColor[0]).toBeNull();
  });
});

describe('sanitizeAvatar: formato novo', () => {
  it('16 cores por peça e pelo menos 12 cabelos', () => {
    for (const k of ['skin', 'hairColor', 'shirt', 'pants', 'shoeColor', 'accColor'] as const) expect(AVATAR_OPTIONS[k]).toHaveLength(16);
    expect(new Set(AVATAR_OPTIONS.skin).size).toBe(16);
    expect(AVATAR_OPTIONS.hairStyles.length).toBeGreaterThanOrEqual(12);
  });

  it('objeto vazio, nulo ou de outro tipo vira o avatar zerado, sem campos opcionais', () => {
    const zero = { skin: 0, hair: 0, hairColor: 0, shirt: 0, pants: 0, accessories: [] };
    expect(sanitizeAvatar({})).toEqual(zero);
    expect(sanitizeAvatar(null)).toEqual(zero);
    expect(sanitizeAvatar(undefined)).toEqual(zero);
    expect(sanitizeAvatar('x')).toEqual(zero);
    expect(sanitizeAvatar([1, 2])).toEqual(zero);
  });

  it('mantém os campos novos válidos e omite os que estão no padrão', () => {
    const cfg = { skin: 15, hair: 14, hairColor: 15, shirt: 15, pants: 15, accessories: [9, 1], beard: 4, top: 3, pattern: 3, bottom: 2, shoes: 3, shoeColor: 15, accColor: 15 };
    expect(sanitizeAvatar(cfg)).toEqual({ ...cfg, accessories: [1, 9] });
    const zeros = sanitizeAvatar({ ...DEFAULT_AVATAR, beard: 0, top: 0, pattern: 0, bottom: 0, shoes: 0, shoeColor: 0, accColor: 0 });
    expect(zeros).toEqual(DEFAULT_AVATAR);
    for (const k of AVATAR_EXTRA_FIELDS) expect(k in zeros).toBe(false);
  });

  it('índice fora do limite, negativo, quebrado ou de outro tipo vira o padrão', () => {
    const bad = { skin: 16, hair: 99, hairColor: -1, shirt: 2.5, pants: '3', accessories: [], beard: 5, top: 4, pattern: -2, bottom: 3, shoes: 4, shoeColor: 16, accColor: 1e9 };
    expect(sanitizeAvatar(bad)).toEqual({ skin: 0, hair: 0, hairColor: 0, shirt: 0, pants: 0, accessories: [] });
    for (const k of AVATAR_EXTRA_FIELDS) {
      const max = AVATAR_EXTRA_OPTIONS[k].length;
      expect(sanitizeAvatar({ [k]: max - 1 })[k]).toBe(max - 1);
      expect(sanitizeAvatar({ [k]: max })[k]).toBeUndefined();
    }
  });

  it('acessórios: só ids conhecidos, sem repetição, em ordem', () => {
    expect(sanitizeAccessories([11, 4, 4, 0, 12, -1, 'x', 2.5, null, 9])).toEqual([4, 9, 11]);
    expect(sanitizeAccessories('1,2')).toEqual([]);
    expect(sanitizeAccessories(Array.from({ length: 1000 }, () => 4))).toEqual([4]);
  });

  it('sai igual ao entrar de novo (idempotente) e a chave não depende da ordem', () => {
    const a = sanitizeAvatar({ skin: 3, accessories: [11, 2, 9], top: 2, shoes: 1 });
    expect(sanitizeAvatar(a)).toEqual(a);
    expect(avatarConfigKey(a)).toBe(avatarConfigKey(sanitizeAvatar({ skin: 3, accessories: [9, 11, 2], top: 2, shoes: 1 })));
    expect(avatarConfigKey(a)).not.toBe(avatarConfigKey(sanitizeAvatar({ skin: 3, accessories: [9, 11, 2], top: 2 })));
  });
});

describe('acessórios: combinações impossíveis', () => {
  it('um óculos só: fica o primeiro da lista', () => {
    expect(sanitizeAvatar({ accessories: [5, 1, 6] }).accessories).toEqual([5]);
    expect(sanitizeAvatar({ accessories: [6, 1] }).accessories).toEqual([6]);
  });

  it('boné ou chapéu; fones ou headset', () => {
    expect(sanitizeAvatar({ accessories: [ACC.Hat, ACC.Cap] }).accessories).toEqual([ACC.Hat]);
    expect(sanitizeAvatar({ accessories: [ACC.Headset, ACC.Headphones] }).accessories).toEqual([ACC.Headset]);
  });

  it('chapéu não combina com fones nem headset; boné combina', () => {
    expect(sanitizeAvatar({ accessories: [ACC.Hat, ACC.Headphones, ACC.Headset] }).accessories).toEqual([ACC.Hat]);
    expect(sanitizeAvatar({ accessories: [ACC.Headset, ACC.Hat] }).accessories).toEqual([ACC.Headset]);
    expect(sanitizeAvatar({ accessories: [ACC.Cap, ACC.Headphones] }).accessories).toEqual([ACC.Cap, ACC.Headphones]);
    expect(sanitizeAvatar({ accessories: [ACC.Cap, ACC.Headset] }).accessories).toEqual([ACC.Cap, ACC.Headset]);
  });

  it('brinco não combina com fones nem headset', () => {
    expect(sanitizeAvatar({ accessories: [ACC.Earring, ACC.Headphones] }).accessories).toEqual([ACC.Earring]);
    expect(sanitizeAvatar({ accessories: [ACC.Headset, ACC.Earring] }).accessories).toEqual([ACC.Headset]);
  });

  it('gravata, relógio e crachá combinam com tudo', () => {
    const all = AVATAR_ACCESSORIES.map((a) => a.id);
    for (const free of [ACC.Tie, ACC.Watch, ACC.Badge]) for (const id of all) expect(accessoriesConflict(free, id)).toBe(false);
    expect(sanitizeAvatar({ accessories: [ACC.Glasses, ACC.Cap, ACC.Headphones, ACC.Tie, ACC.Watch, ACC.Badge] }).accessories).toEqual([1, 2, 3, 4, 9, 11]);
  });

  it('a regra vale nos dois sentidos e nunca para o próprio acessório', () => {
    for (const a of AVATAR_ACCESSORIES) {
      expect(accessoriesConflict(a.id, a.id)).toBe(false);
      for (const b of AVATAR_ACCESSORIES) expect(accessoriesConflict(a.id, b.id)).toBe(accessoriesConflict(b.id, a.id));
    }
  });

  it('nenhuma lista normalizada tem conflito', () => {
    const ids = AVATAR_ACCESSORIES.map((a) => a.id);
    for (let mask = 0; mask < 1 << ids.length; mask += 7) {
      const list = sanitizeAccessories(ids.filter((_, i) => mask & (1 << i)));
      for (const a of list) expect(accessoryBlockers(list, a)).toEqual([]);
    }
  });

  it('toggleAccessory liga trocando os que não combinam, e desliga', () => {
    expect(toggleAccessory([ACC.Glasses, ACC.Tie], ACC.Sunglasses)).toEqual([ACC.Tie, ACC.Sunglasses]);
    expect(toggleAccessory([ACC.Headphones, ACC.Earring, ACC.Cap], ACC.Hat)).toEqual([ACC.Hat, ACC.Earring]);
    expect(toggleAccessory([ACC.Earring, ACC.Watch], ACC.Headset)).toEqual([ACC.Headset, ACC.Watch]);
    expect(toggleAccessory([ACC.Tie, ACC.Watch], ACC.Tie)).toEqual([ACC.Watch]);
    expect(toggleAccessory([ACC.Tie], 99)).toEqual([ACC.Tie]);
    expect(accessoryBlockers([ACC.Hat, ACC.Glasses], ACC.Headphones)).toEqual([ACC.Hat]);
  });
});
