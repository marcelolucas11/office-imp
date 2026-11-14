// SPDX-License-Identifier: AGPL-3.0-only
// Rótulos das opções do avatar pelo i18n (locales/pt-BR.json). Os índices seguem as listas de
// `AVATAR_OPTIONS` e os ids de `AVATAR_ACCESSORIES` em `@office-imp/shared`; um índice sem
// tradução cai no rótulo de lá.
import { AVATAR_OPTIONS, avatarAccessory } from '@office-imp/shared';
import { t } from '../lib/i18n';

const pick = (list: string[], fallback: readonly string[], i: number) => list[i] ?? fallback[i] ?? `#${i}`;

export function hairStyleLabel(i: number): string {
  const list = [
    t('avatar.hair.0', 'Careca'),
    t('avatar.hair.1', 'Curto'),
    t('avatar.hair.2', 'Médio'),
    t('avatar.hair.3', 'Longo'),
    t('avatar.hair.4', 'Topete'),
    t('avatar.hair.5', 'Rabo de cavalo'),
    t('avatar.hair.6', 'Raspado'),
    t('avatar.hair.7', 'Black power'),
    t('avatar.hair.8', 'Coque'),
    t('avatar.hair.9', 'Moicano'),
    t('avatar.hair.10', 'Franja'),
    t('avatar.hair.11', 'Cacheado'),
    t('avatar.hair.12', 'Tranças'),
    t('avatar.hair.13', 'Repartido de lado'),
    t('avatar.hair.14', 'Calvície'),
  ];
  return pick(list, AVATAR_OPTIONS.hairStyles, i);
}

export function beardLabel(i: number): string {
  const list = [t('avatar.beard.0', 'Nenhuma'), t('avatar.beard.1', 'Barba curta'), t('avatar.beard.2', 'Cavanhaque'), t('avatar.beard.3', 'Bigode'), t('avatar.beard.4', 'Barba cheia')];
  return pick(list, AVATAR_OPTIONS.beards, i);
}

export function topLabel(i: number): string {
  const list = [t('avatar.top.0', 'Camiseta'), t('avatar.top.1', 'Camisa social'), t('avatar.top.2', 'Moletom'), t('avatar.top.3', 'Blazer')];
  return pick(list, AVATAR_OPTIONS.tops, i);
}

export function patternLabel(i: number): string {
  const list = [t('avatar.pattern.0', 'Lisa'), t('avatar.pattern.1', 'Listras'), t('avatar.pattern.2', 'Xadrez'), t('avatar.pattern.3', 'Logo Impera')];
  return pick(list, AVATAR_OPTIONS.patterns, i);
}

export function bottomLabel(i: number): string {
  const list = [t('avatar.bottom.0', 'Calça'), t('avatar.bottom.1', 'Bermuda'), t('avatar.bottom.2', 'Saia')];
  return pick(list, AVATAR_OPTIONS.bottoms, i);
}

export function shoesLabel(i: number): string {
  const list = [t('avatar.shoes.0', 'Básico'), t('avatar.shoes.1', 'Social'), t('avatar.shoes.2', 'Tênis'), t('avatar.shoes.3', 'Bota')];
  return pick(list, AVATAR_OPTIONS.shoes, i);
}

export function accessoryLabel(id: number): string {
  const map: Record<number, string> = {
    1: t('avatar.acc.1', 'Óculos'),
    2: t('avatar.acc.2', 'Boné'),
    3: t('avatar.acc.3', 'Fones'),
    4: t('avatar.acc.4', 'Gravata'),
    5: t('avatar.acc.5', 'Óculos escuros'),
    6: t('avatar.acc.6', 'Óculos redondos'),
    7: t('avatar.acc.7', 'Chapéu'),
    8: t('avatar.acc.8', 'Headset gamer'),
    9: t('avatar.acc.9', 'Relógio'),
    10: t('avatar.acc.10', 'Brinco'),
    11: t('avatar.acc.11', 'Crachá Impera'),
  };
  return map[id] ?? avatarAccessory(id)?.label ?? `#${id}`;
}
