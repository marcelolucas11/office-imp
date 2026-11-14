// SPDX-License-Identifier: AGPL-3.0-only
// Aba "Cor" (visual v2, Fase E): as variantes de um objeto como amostras com a miniatura do sprite
// naquela cor. Nas mesas de trabalho, a mesma área tem a aba "Setup". Usada no Mapmaker (objeto
// selecionado ou item da paleta antes de colocar) e na Build Tool (decoração e a própria mesa).
import { useMemo, useState, type ReactNode } from 'react';
import { OBJECT_DEFS, deskSetups, objColor, objSetup, objectColors } from '@office-imp/shared';
import { cx } from '@office-imp/ui';
import { objectIcon } from '../game/art/objects';
import { t } from '../lib/i18n';

/** O tipo tem o que escolher na aba (mais de uma cor, ou setups de mesa)? */
export function hasVariants(type: string): boolean {
  return objectColors(type).length > 1 || deskSetups(type).length > 0;
}

interface Props {
  type: string;
  /** Cor em uso (id da variante; ausente = padrão do tipo). */
  color?: string;
  /** Setup em uso (só mesas). */
  setup?: string;
  onColor?: (id: string) => void;
  /** Sem ele, a aba "Setup" não aparece. */
  onSetup?: (id: string) => void;
  /** Linha abaixo do título (para quem vale a escolha). */
  note?: ReactNode;
  /** Botão de recolher o painel. */
  onHide?: () => void;
  className?: string;
  testid?: string;
}

export function ColorTab({ type, color, setup, onColor, onSetup, note, onHide, className, testid = 'color-tab' }: Props) {
  const def = OBJECT_DEFS[type];
  const colors = onColor ? objectColors(type) : [];
  const setups = onSetup ? deskSetups(type) : [];
  const [asked, setTab] = useState<'color' | 'setup'>('color');
  const tab = asked === 'setup' && setups.length ? 'setup' : colors.length > 1 ? 'color' : setups.length ? 'setup' : 'color';
  const curColor = objColor({ type, color })?.id;
  const curSetup = objSetup({ type, setup })?.id;
  const items = useMemo(
    () =>
      tab === 'color'
        ? colors.map((c) => ({ id: c.id, label: c.label, hex: c.hex, icon: objectIcon(type, c.id, curSetup, 48, true) }))
        : setups.map((s) => ({ id: s.id, label: s.label, hex: null as string | null, icon: objectIcon(type, curColor, s.id, 48, true) })),
    [tab, type, curColor, curSetup, colors, setups],
  );
  if (!def || (colors.length < 2 && !setups.length)) return null;
  const current = tab === 'color' ? curColor : curSetup;
  const currentLabel = items.find((i) => i.id === current)?.label ?? '';
  const pick = (id: string) => (tab === 'color' ? onColor?.(id) : onSetup?.(id));
  const tabBtn = (id: 'color' | 'setup', label: string) => (
    <button
      key={id}
      type="button"
      data-testid={`${testid}-tab-${id}`}
      onClick={() => setTab(id)}
      className={cx('rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tab === id ? 'bg-gold/20 text-gold' : 'text-muted hover:text-stone-100')}
    >
      {label}
    </button>
  );
  return (
    <div className={cx('w-60 rounded-xl border border-gold/50 bg-panel/95 p-2 shadow-2xl', className)} data-testid={testid}>
      <div className="mb-1 flex items-center gap-1">
        {colors.length > 1 ? tabBtn('color', t('colorTab.color', 'Cor')) : null}
        {setups.length ? tabBtn('setup', t('colorTab.setup', 'Setup')) : null}
        <span className="ml-auto truncate text-[11px] text-muted" title={def.label}>
          {def.label}
        </span>
        {onHide ? (
          <button type="button" aria-label={t('colorTab.hide', 'Recolher')} title={t('colorTab.hide', 'Recolher')} onClick={onHide} className="rounded px-1 text-muted hover:text-stone-100">
            –
          </button>
        ) : null}
      </div>
      {note ? <p className="mb-1 text-[11px] leading-snug text-muted">{note}</p> : null}
      <div className="grid grid-cols-4 gap-1">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            title={it.label}
            aria-label={it.label}
            aria-pressed={it.id === current}
            data-testid={`${testid}-${tab}-${it.id}`}
            onClick={() => pick(it.id)}
            className={cx('relative grid aspect-square place-items-center rounded-lg border-2 bg-panel-2', it.id === current ? 'border-gold' : 'border-transparent hover:border-line')}
          >
            <img src={it.icon} alt="" className="pixel h-12 w-12" />
            {it.hex ? <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-black/50" style={{ background: it.hex }} /> : null}
          </button>
        ))}
      </div>
      <p className="mt-1 truncate text-xs" data-testid={`${testid}-current`}>
        <span className="text-muted">{tab === 'color' ? t('colorTab.colorIs', 'Cor:') : t('colorTab.setupIs', 'Setup:')}</span> <span className="text-gold">{currentLabel}</span>
      </p>
    </div>
  );
}
