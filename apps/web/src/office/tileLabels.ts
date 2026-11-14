// SPDX-License-Identifier: AGPL-3.0-only
// Rótulos dos pisos e das paredes na paleta do Mapmaker, pelo i18n (locales/pt-BR.json).
// Um id sem tradução cai no rótulo de `@office-imp/shared`.
import { FLOOR_LABEL, Floor, WALL_LABEL, Wall } from '@office-imp/shared';
import { t } from '../lib/i18n';

export function floorLabel(id: number): string {
  switch (id) {
    case Floor.Wood:
      return t('floor.wood', 'Madeira');
    case Floor.WoodDark:
      return t('floor.woodDark', 'Madeira escura');
    case Floor.CarpetDark:
      return t('floor.carpetDark', 'Carpete grafite');
    case Floor.CarpetGold:
      return t('floor.carpetGold', 'Carpete dourado');
    case Floor.Tile:
      return t('floor.tile', 'Piso claro');
    case Floor.Concrete:
      return t('floor.concrete', 'Concreto');
    case Floor.Grass:
      return t('floor.grass', 'Grama');
    case Floor.Kitchen:
      return t('floor.kitchen', 'Copa (xadrez)');
    case Floor.Stage:
      return t('floor.stage', 'Palco');
    case Floor.Corridor:
      return t('floor.corridor', 'Corredor');
    case Floor.Porcelain:
      return t('floor.porcelain', 'Porcelanato');
    case Floor.BurntCement:
      return t('floor.burntCement', 'Cimento queimado');
    case Floor.Herringbone:
      return t('floor.herringbone', 'Madeira espinha de peixe');
    case Floor.CarpetPattern:
      return t('floor.carpetPattern', 'Carpete com padrão');
    case Floor.SyntheticGrass:
      return t('floor.syntheticGrass', 'Grama sintética');
    default:
      return FLOOR_LABEL[id] ?? `#${id}`;
  }
}

export function wallLabel(id: number): string {
  switch (id) {
    case Wall.Wall:
      return t('wall.wall', 'Parede');
    case Wall.Window:
      return t('wall.window', 'Janela (acompanha a parede ao lado)');
    case Wall.Dark:
      return t('wall.dark', 'Parede escura');
    case Wall.Plain:
      return t('wall.plain', 'Parede lisa clara');
    case Wall.Brick:
      return t('wall.brick', 'Tijolo aparente');
    case Wall.WoodPanel:
      return t('wall.woodPanel', 'Painel de madeira');
    case Wall.Glass:
      return t('wall.glass', 'Divisória de vidro');
    default:
      return WALL_LABEL[id] ?? `#${id}`;
  }
}

const ids = (table: Record<string, number>) =>
  Object.values(table)
    .filter((v) => v !== 0)
    .sort((a, b) => a - b);

/** Ids de piso e de parede na ordem da paleta. */
export const FLOOR_IDS = ids(Floor);
export const WALL_IDS = ids(Wall);
