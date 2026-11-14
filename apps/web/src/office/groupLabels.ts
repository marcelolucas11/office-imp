// SPDX-License-Identifier: AGPL-3.0-only
import type { ObjectGroup } from '@office-imp/shared';
import { t } from '../lib/i18n';

/** Rótulo de cada grupo da paleta de objetos (a ordem vem de `OBJECT_GROUPS`). */
export function groupLabel(id: ObjectGroup): string {
  switch (id) {
    case 'interactive':
      return t('mm.grpInteractive', 'Interativos');
    case 'structure':
      return t('mm.grpStructure', 'Estrutura');
    case 'desks':
      return t('mm.grpDesks', 'Mesas de trabalho');
    case 'seating':
      return t('mm.grpSeating', 'Cadeiras e sofás');
    case 'furniture':
      return t('mm.grpFurniture', 'Mesas e móveis');
    case 'deskitems':
      return t('mm.grpDeskItems', 'Objetos de mesa');
    case 'appliances':
      return t('mm.grpAppliances', 'Copa e equipamentos');
    case 'wall':
      return t('mm.grpWall', 'De parede');
    case 'plants':
      return t('mm.grpPlants', 'Plantas');
    default:
      return t('mm.grpDecor', 'Decoração');
  }
}
