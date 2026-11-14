// SPDX-License-Identifier: AGPL-3.0-only
// Configuração do avatar (versão 2 do visual).
//
// O boneco tem sempre o mesmo formato (32×48, mesma silhueta e animação). A versão 2 só acrescenta
// opções: todo campo novo é opcional e a ausência (ou o índice 0) é o visual de antes. As cores
// antigas continuam nos mesmos índices de cada paleta; as novas vieram depois. Um avatar salvo no
// formato antigo (`accessory: number`) é convertido por `sanitizeAvatar` sem perda.

export interface AvatarConfig {
  /** Índice em `AVATAR_OPTIONS.skin`. */
  skin: number;
  /** Estilo de cabelo (`AVATAR_OPTIONS.hairStyles`). */
  hair: number;
  /** Índice em `AVATAR_OPTIONS.hairColor` (também é a cor da barba). */
  hairColor: number;
  /** Cor da roupa de cima (`AVATAR_OPTIONS.shirt`). */
  shirt: number;
  /** Cor da roupa de baixo (`AVATAR_OPTIONS.pants`). */
  pants: number;
  /** Ids de `AVATAR_ACCESSORIES`, sem repetição, em ordem crescente e sem combinações impossíveis. */
  accessories: number[];
  /** Barba ou bigode (`AVATAR_OPTIONS.beards`). Ausente = nenhuma. */
  beard?: number;
  /** Tipo da roupa de cima (`AVATAR_OPTIONS.tops`). Ausente = camiseta. */
  top?: number;
  /** Estampa da roupa de cima (`AVATAR_OPTIONS.patterns`). Ausente = lisa. */
  pattern?: number;
  /** Tipo da roupa de baixo (`AVATAR_OPTIONS.bottoms`). Ausente = calça. */
  bottom?: number;
  /** Tipo de calçado (`AVATAR_OPTIONS.shoes`). Ausente = o básico de sempre. */
  shoes?: number;
  /** Cor do calçado (`AVATAR_OPTIONS.shoeColor`). Ausente = preto de sempre. */
  shoeColor?: number;
  /** Cor dos acessórios que têm cor (`AVATAR_OPTIONS.accColor`). Ausente = a cor original de cada um. */
  accColor?: number;
}

/** Formato antigo, de antes do visual v2 (um acessório só; 0 = nenhum). */
export interface LegacyAvatarConfig {
  skin: number;
  hair: number;
  hairColor: number;
  shirt: number;
  pants: number;
  accessory: number;
}

export const DEFAULT_AVATAR: AvatarConfig = { skin: 1, hair: 1, hairColor: 0, shirt: 0, pants: 0, accessories: [] };

/** Campos opcionais da versão 2 (índice em uma lista de `AVATAR_OPTIONS`). */
export const AVATAR_EXTRA_FIELDS = ['beard', 'top', 'pattern', 'bottom', 'shoes', 'shoeColor', 'accColor'] as const;
export type AvatarExtraField = (typeof AVATAR_EXTRA_FIELDS)[number];

export const AVATAR_OPTIONS = {
  // 5 tons de antes, mais 7 tons de pele e 4 de fantasia
  skin: [
    '#f6d3b3', '#e8b88f', '#c98d5f', '#9a6238', '#6b4226',
    '#fbe4cf', '#f0c39c', '#dba476', '#b57a4c', '#86532f', '#5a3621', '#3e2516',
    '#8fcf8a', '#8db6e8', '#c3a6e6', '#a9adb5',
  ],
  hairStyles: [
    'Careca', 'Curto', 'Médio', 'Longo', 'Topete', 'Rabo de cavalo',
    'Raspado', 'Black power', 'Coque', 'Moicano', 'Franja', 'Cacheado', 'Tranças', 'Repartido de lado', 'Calvície',
  ],
  hairColor: [
    '#1c1917', '#4a2c17', '#8a5a2b', '#d7b870', '#b91c1c', '#9ca3af', '#f5f5f4',
    '#6b3a1e', '#b8834a', '#ead49c', '#d9631e', '#5b5f66', '#2563eb', '#db2777', '#7c3aed', '#16a34a',
  ],
  shirt: [
    '#d7b870', '#111827', '#f5f5f4', '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#db2777',
    '#facc15', '#7f1d1d', '#1e3a8a', '#9ca3af', '#d6c4a8', '#4d5b2a',
  ],
  pants: [
    '#1f2937', '#374151', '#1e3a8a', '#44403c', '#0f172a', '#78350f',
    '#3b5b8c', '#6b8fbf', '#c2a878', '#e7e5e4', '#0b0b0d', '#4d5b2a', '#7f1d1d', '#9ca3af', '#166534', '#db2777',
  ],
  /** O índice 0 é o preto de sempre. */
  shoeColor: [
    '#111318', '#3a2a1e', '#6b4226', '#a16207', '#f5f5f4', '#9ca3af', '#1e3a8a', '#b91c1c',
    '#d7b870', '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#facc15',
  ],
  /** O índice 0 (`null`) é a cor original de cada acessório (boné dourado, gravata vermelha…). */
  accColor: [
    null, '#d7b870', '#111318', '#f5f5f4', '#b91c1c', '#2563eb', '#1e3a8a', '#16a34a',
    '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#6b4226', '#9ca3af', '#7f1d1d', '#facc15',
  ] as (string | null)[],
  beards: ['Nenhuma', 'Barba curta', 'Cavanhaque', 'Bigode', 'Barba cheia'],
  tops: ['Camiseta', 'Camisa social', 'Moletom', 'Blazer'],
  patterns: ['Lisa', 'Listras', 'Xadrez', 'Logo Impera'],
  bottoms: ['Calça', 'Bermuda', 'Saia'],
  shoes: ['Básico', 'Social', 'Tênis', 'Bota'],
};

/** Lista de `AVATAR_OPTIONS` de cada campo opcional (o tamanho dela limita o índice). */
export const AVATAR_EXTRA_OPTIONS: Record<AvatarExtraField, readonly unknown[]> = {
  beard: AVATAR_OPTIONS.beards,
  top: AVATAR_OPTIONS.tops,
  pattern: AVATAR_OPTIONS.patterns,
  bottom: AVATAR_OPTIONS.bottoms,
  shoes: AVATAR_OPTIONS.shoes,
  shoeColor: AVATAR_OPTIONS.shoeColor,
  accColor: AVATAR_OPTIONS.accColor,
};

/**
 * Lugar do corpo que o acessório ocupa. Dois acessórios do mesmo lugar não combinam:
 * `eyes` (um óculos só), `head` (boné ou chapéu), `ears` (fones ou headset).
 */
export type AccessorySlot = 'eyes' | 'head' | 'ears';

export interface AvatarAccessory {
  /** Id estável (gravado no avatar). 1 a 4 são os acessórios de antes, com o mesmo número. */
  id: number;
  label: string;
  slot?: AccessorySlot;
  /** Ids que não combinam com este, além dos do mesmo lugar (a regra vale nos dois sentidos). */
  excludes?: number[];
  /** Usa `accColor` quando definido. */
  colorable?: boolean;
}

export const ACC = {
  Glasses: 1,
  Cap: 2,
  Headphones: 3,
  Tie: 4,
  Sunglasses: 5,
  RoundGlasses: 6,
  Hat: 7,
  Headset: 8,
  Watch: 9,
  Earring: 10,
  Badge: 11,
} as const;

export const AVATAR_ACCESSORIES: AvatarAccessory[] = [
  { id: ACC.Glasses, label: 'Óculos', slot: 'eyes' },
  { id: ACC.Sunglasses, label: 'Óculos escuros', slot: 'eyes' },
  { id: ACC.RoundGlasses, label: 'Óculos redondos', slot: 'eyes' },
  { id: ACC.Cap, label: 'Boné', slot: 'head', colorable: true },
  // a aba larga do chapéu não deixa lugar para a haste dos fones
  { id: ACC.Hat, label: 'Chapéu', slot: 'head', excludes: [ACC.Headphones, ACC.Headset], colorable: true },
  { id: ACC.Headphones, label: 'Fones', slot: 'ears' },
  { id: ACC.Headset, label: 'Headset gamer', slot: 'ears', colorable: true },
  { id: ACC.Tie, label: 'Gravata', colorable: true },
  { id: ACC.Watch, label: 'Relógio' },
  // as conchas dos fones cobrem a orelha
  { id: ACC.Earring, label: 'Brinco', excludes: [ACC.Headphones, ACC.Headset] },
  { id: ACC.Badge, label: 'Crachá Impera' },
];

/** Quantos valores o campo `accessory` antigo aceitava (0 = nenhum, 1 a 4). */
export const LEGACY_ACCESSORY_COUNT = 5;

const ACC_BY_ID = new Map(AVATAR_ACCESSORIES.map((a) => [a.id, a]));

export function avatarAccessory(id: number): AvatarAccessory | undefined {
  return ACC_BY_ID.get(id);
}

/** Os dois acessórios não podem ser usados juntos (mesmo lugar do corpo ou exclusão explícita). */
export function accessoriesConflict(a: number, b: number): boolean {
  if (a === b) return false;
  const A = ACC_BY_ID.get(a);
  const B = ACC_BY_ID.get(b);
  if (!A || !B) return false;
  if (A.slot && A.slot === B.slot) return true;
  return Boolean(A.excludes?.includes(b) || B.excludes?.includes(a));
}

/** Acessórios da lista que impedem `id` (vazio se `id` combina com todos). */
export function accessoryBlockers(list: readonly number[], id: number): number[] {
  return list.filter((x) => accessoriesConflict(x, id));
}

/** Liga ou desliga um acessório; ao ligar, tira da lista os que não combinam com ele. */
export function toggleAccessory(list: readonly number[], id: number): number[] {
  if (!ACC_BY_ID.has(id)) return [...list];
  if (list.includes(id)) return list.filter((x) => x !== id);
  return [...list.filter((x) => !accessoriesConflict(x, id)), id].sort((a, b) => a - b);
}

const MAX_ACCESSORY_INPUT = 32;

/**
 * Normaliza a lista de acessórios: só ids conhecidos, sem repetição, e quando dois não combinam
 * fica o que veio primeiro. Sai em ordem crescente.
 */
export function sanitizeAccessories(list: unknown): number[] {
  if (!Array.isArray(list)) return [];
  const out: number[] = [];
  for (const v of list.slice(0, MAX_ACCESSORY_INPUT)) {
    if (!Number.isInteger(v) || !ACC_BY_ID.has(v as number) || out.includes(v as number)) continue;
    if (out.some((x) => accessoriesConflict(x, v as number))) continue;
    out.push(v as number);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Aceita o formato antigo (`accessory`) e o novo (`accessories` e os campos opcionais).
 * Índice fora da lista vira 0 (o padrão); campo opcional no padrão é omitido.
 * Se vierem os dois, vale `accessories`.
 */
export function sanitizeAvatar(a: unknown): AvatarConfig {
  const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
  const idx = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < max ? (v as number) : 0);
  let accessories: number[];
  if (Array.isArray(o.accessories)) accessories = sanitizeAccessories(o.accessories);
  else {
    const legacy = idx(o.accessory, LEGACY_ACCESSORY_COUNT);
    accessories = legacy ? [legacy] : [];
  }
  const out: AvatarConfig = {
    skin: idx(o.skin, AVATAR_OPTIONS.skin.length),
    hair: idx(o.hair, AVATAR_OPTIONS.hairStyles.length),
    hairColor: idx(o.hairColor, AVATAR_OPTIONS.hairColor.length),
    shirt: idx(o.shirt, AVATAR_OPTIONS.shirt.length),
    pants: idx(o.pants, AVATAR_OPTIONS.pants.length),
    accessories,
  };
  for (const key of AVATAR_EXTRA_FIELDS) {
    const v = idx(o[key], AVATAR_EXTRA_OPTIONS[key].length);
    if (v) out[key] = v;
  }
  return out;
}

/** Chave estável da configuração (mesma aparência, mesma chave). */
export function avatarConfigKey(cfg: AvatarConfig): string {
  const extra = AVATAR_EXTRA_FIELDS.map((k) => cfg[k] ?? 0).join('.');
  return `${cfg.skin}.${cfg.hair}.${cfg.hairColor}.${cfg.shirt}.${cfg.pants}.${cfg.accessories.join('-')}.${extra}`;
}
