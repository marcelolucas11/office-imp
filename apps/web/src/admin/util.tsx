// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { OfficeMap, Rect } from '@office-imp/shared';
import { Select, Spinner } from '@office-imp/ui';
import { renderMini } from '../game/art/render';
import { errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { toast, useSession } from '../lib/session';

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    fn()
      .then((d) => {
        if (id !== seq.current) return;
        setData(d);
        setError('');
      })
      .catch((e) => id === seq.current && setError(errMsg(e)))
      .finally(() => id === seq.current && setLoading(false));
  }, deps);
  useEffect(reload, [reload]);
  return { data, error, loading, reload, setData };
}

/** Executa uma ação e mostra o resultado em um aviso. */
export async function act(fn: () => Promise<unknown>, okText?: string): Promise<boolean> {
  try {
    await fn();
    if (okText) toast(okText, 'ok');
    return true;
  } catch (e) {
    toast(errMsg(e), 'error');
    return false;
  }
}

export const fmtDate = (ts: number | null | undefined) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

export function Loadable({ state, children }: { state: { loading: boolean; error: string; data: unknown }; children: ReactNode }) {
  if (state.error) return <p className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-red-200">{state.error}</p>;
  if (state.data === null && state.loading) return <Spinner />;
  return <>{children}</>;
}

const KEY = 'oi-admin-office';
/** Escritório selecionado no painel (lembrado entre visitas). */
export function useOfficeChoice() {
  const offices = useSession((s) => s.me?.offices ?? []);
  const [id, setId] = useState(() => localStorage.getItem(KEY) ?? '');
  const valid = offices.some((o) => o.id === id) ? id : (offices[0]?.id ?? '');
  const choose = (v: string) => {
    localStorage.setItem(KEY, v);
    setId(v);
  };
  return { officeId: valid, office: offices.find((o) => o.id === valid) ?? null, offices, choose };
}

export function OfficeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const offices = useSession((s) => s.me?.offices ?? []);
  if (offices.length <= 1) return offices[0] ? <span className="rounded-lg bg-panel-2 px-3 py-2 text-sm text-gold">{offices[0].name}</span> : null;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-56" aria-label={t('admin.office', 'Escritório')}>
      {offices.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </Select>
  );
}

export function MapPreview({ map, highlight, width = 860 }: { map: OfficeMap; highlight?: Rect | null; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const px = Math.max(2, Math.min(12, Math.floor(width / map.width)));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const mini = renderMini(map, px, highlight);
    c.width = mini.width;
    c.height = mini.height;
    c.getContext('2d')!.drawImage(mini, 0, 0);
  }, [map, highlight, px]);
  return (
    <div className="overflow-auto rounded-xl border border-line bg-black p-2">
      <canvas ref={ref} data-testid="map-preview" className="mx-auto block" />
    </div>
  );
}
