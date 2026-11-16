// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ROLE_LABEL } from '@office-imp/shared';
import { Badge, Spinner, cx } from '@office-imp/ui';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { Logo } from '../pages/Shell';
import { Emo } from '../lib/icons';

const Analytics = lazy(() => import('./Insights').then((m) => ({ default: m.Analytics })));
const Notes = lazy(() => import('./Insights').then((m) => ({ default: m.Notes })));
const Audit = lazy(() => import('./Insights').then((m) => ({ default: m.Audit })));
const Offices = lazy(() => import('./Offices').then((m) => ({ default: m.Offices })));
const Users = lazy(() => import('./People').then((m) => ({ default: m.Users })));
const Invites = lazy(() => import('./People').then((m) => ({ default: m.Invites })));
const Settings = lazy(() => import('./System').then((m) => ({ default: m.Settings })));
const Updates = lazy(() => import('./System').then((m) => ({ default: m.Updates })));

/** Seções do painel: a mesma lista serve à página /admin e ao painel aberto dentro do escritório. */
export const ADMIN_SECTIONS = [
  { id: 'painel', icon: '📊', label: () => t('admin.navPanel', 'Painel em tempo real'), C: Analytics },
  { id: 'escritorios', icon: '🏢', label: () => t('admin.navOffices', 'Escritórios'), C: Offices },
  { id: 'pessoas', icon: '👥', label: () => t('admin.navPeople', 'Pessoas'), C: Users },
  { id: 'convites', icon: '🔗', label: () => t('admin.navInvites', 'Links de convite'), C: Invites },
  { id: 'notas', icon: '📝', label: () => t('admin.navNotes', 'Notas de reunião'), C: Notes },
  { id: 'configuracoes', icon: '⚙️', label: () => t('admin.navSettings', 'Configurações'), C: Settings },
  { id: 'atualizacoes', icon: '⬆️', label: () => t('admin.navUpdates', 'Atualizações'), C: Updates },
  { id: 'auditoria', icon: '🧾', label: () => t('admin.navAudit', 'Auditoria'), C: Audit },
] as const satisfies readonly { id: string; icon: string; label: () => string; C: LazyExoticComponent<ComponentType> }[];

export type AdminSection = (typeof ADMIN_SECTIONS)[number]['id'];

const navClass = (active: boolean) => cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors', active ? 'bg-gold/15 text-gold' : 'text-stone-300 hover:bg-panel-2');

function Fallback() {
  return (
    <div className="p-6">
      <Spinner />
    </div>
  );
}

/**
 * Painel do ADM aberto por cima do escritório: a pessoa continua conectada (áudio, vídeo, tela,
 * chat), só o mapa fica coberto. A navegação entre seções é local (não muda a URL do escritório).
 */
export function AdminPanel({ section, onSection, onClose }: { section: AdminSection; onSection: (s: AdminSection) => void; onClose: () => void }) {
  const me = useSession((s) => s.me);
  const cur = ADMIN_SECTIONS.find((x) => x.id === section) ?? ADMIN_SECTIONS[0];
  const C = cur.C;
  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-line bg-ink shadow-2xl" data-testid="admin-embedded">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">{t('admin.title', 'Painel do ADM')}</p>
          {me ? <Badge>{ROLE_LABEL[me.role]}</Badge> : null}
        </div>
        <nav className="flex-1 space-y-0.5 overflow-auto px-2">
          {ADMIN_SECTIONS.map((n) => (
            <button key={n.id} type="button" className={navClass(n.id === cur.id)} onClick={() => onSection(n.id)}>
              <Emo e={n.icon} size={20} />
              {n.label()}
            </button>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <button type="button" data-testid="admin-close" className="w-full rounded-lg bg-gold/15 px-3 py-2 text-sm font-semibold text-gold hover:bg-gold/25" onClick={onClose}>
            ← {t('admin.backOffice', 'Voltar ao escritório')}
          </button>
          <p className="mt-2 text-[11px] leading-snug text-muted">{t('admin.stillConnected', 'Você continua no escritório: dá para conversar, ouvir e compartilhar a tela com o painel aberto.')}</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <Suspense fallback={<Fallback />}>
          <C />
        </Suspense>
      </main>
    </div>
  );
}

export default function AdminPage() {
  const me = useSession((s) => s.me);
  return (
    <div className="flex h-full" data-testid="admin">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
        <Link to="/" className="px-5 py-4">
          <Logo />
        </Link>
        <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gold">{t('admin.title', 'Painel do ADM')}</p>
        <nav className="flex-1 space-y-0.5 overflow-auto px-2">
          {ADMIN_SECTIONS.map((n) => (
            <NavLink key={n.id} to={`/admin/${n.id}`} className={({ isActive }) => navClass(isActive)}>
              <Emo e={n.icon} size={20} />
              {n.label()}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line p-4 text-xs">
          <p className="flex items-center justify-between gap-2">
            <span className="truncate">{me?.name}</span>
            {me ? <Badge>{ROLE_LABEL[me.role]}</Badge> : null}
          </p>
          <Link to="/" className="block text-gold underline">
            ← {t('admin.back', 'Voltar aos escritórios')}
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route index element={<Navigate to="/admin/painel" replace />} />
            {ADMIN_SECTIONS.map((n) => (
              <Route key={n.id} path={n.id} element={<n.C />} />
            ))}
            <Route path="*" element={<Navigate to="/admin/painel" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
