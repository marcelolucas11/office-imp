// SPDX-License-Identifier: AGPL-3.0-only
// Página /dev/arte (só em desenvolvimento): as mesmas folhas de sprites do `pnpm art:sheet`,
// desenhadas no navegador, para conferir a arte enquanto se edita.
import { useMemo, useState } from 'react';
import { artSheets } from '../game/art/sheet';
import { t } from '../lib/i18n';

const SCALES = [1, 2, 3, 4];

function sheetTitle(name: string): string {
  if (name === 'pisos') return t('devArt.floors', 'Pisos e paredes');
  if (name === 'exterior') return t('devArt.exterior', 'Exterior e períodos do dia');
  if (name === 'objetos') return t('devArt.objects', 'Objetos');
  if (name === 'avatares') return t('devArt.avatars', 'Avatares');
  return name;
}

export default function DevArt() {
  const [scale, setScale] = useState(3);
  const sheets = useMemo(() => artSheets(scale).map((s) => ({ name: s.name, count: s.count, width: s.canvas.width, height: s.canvas.height, url: s.canvas.toDataURL() })), [scale]);
  return (
    <div className="h-full overflow-auto p-4 text-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-gold">{t('devArt.title', 'Arte do escritório (desenvolvimento)')}</h1>
        <label className="flex items-center gap-2 text-muted">
          {t('devArt.scale', 'Ampliação')}
          <select className="rounded border border-line bg-panel px-2 py-1 text-stone-100" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {SCALES.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted">{t('devArt.hint', 'Mesmas folhas geradas por "pnpm art:sheet".')}</span>
      </div>
      {sheets.map((s) => (
        <section key={s.name} className="mb-6">
          <h2 className="mb-2 font-semibold">
            {sheetTitle(s.name)} <span className="text-muted">({s.count})</span>
          </h2>
          <img src={s.url} width={s.width} height={s.height} alt={sheetTitle(s.name)} className="pixel max-w-none rounded border border-line" />
        </section>
      ))}
    </div>
  );
}
