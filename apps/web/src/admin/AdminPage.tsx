// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense } from 'react';
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

export default function AdminPage() {
  const me = useSession((s) => s.me);
  const nav = [
    { to: '/admin/painel', icon: '📊', label: t('admin.navPanel', 'Painel em tempo real') },
    { to: '/admin/escritorios', icon: '🏢', label: t('admin.navOffices', 'Escritórios') },
    { to: '/admin/pessoas', icon: '👥', label: t('admin.navPeople', 'Pessoas') },
    { to: '/admin/convites', icon: '🔗', label: t('admin.navInvites', 'Links de convite') },
    { to: '/admin/notas', icon: '📝', label: t('admin.navNotes', 'Notas de reunião') },
    { to: '/admin/configuracoes', icon: '⚙️', label: t('admin.navSettings', 'Configurações') },
    { to: '/admin/atualizacoes', icon: '⬆️', label: t('admin.navUpdates', 'Atualizações') },
    { to: '/admin/auditoria', icon: '🧾', label: t('admin.navAudit', 'Auditoria') },
  ];
  return (
    <div className="flex h-full" data-testid="admin">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
        <Link to="/" className="px-5 py-4">
          <Logo />
        </Link>
        <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gold">{t('admin.title', 'Painel do ADM')}</p>
        <nav className="flex-1 space-y-0.5 overflow-auto px-2">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors', isActive ? 'bg-gold/15 text-gold' : 'text-stone-300 hover:bg-panel-2')}>
              <Emo e={n.icon} size={20} />
              {n.label}
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
        <Suspense
          fallback={
            <div className="p-6">
              <Spinner />
            </div>
          }
        >
          <Routes>
            <Route index element={<Navigate to="/admin/painel" replace />} />
            <Route path="painel" element={<Analytics />} />
            <Route path="escritorios" element={<Offices />} />
            <Route path="pessoas" element={<Users />} />
            <Route path="convites" element={<Invites />} />
            <Route path="notas" element={<Notes />} />
            <Route path="configuracoes" element={<Settings />} />
            <Route path="atualizacoes" element={<Updates />} />
            <Route path="auditoria" element={<Audit />} />
            <Route path="*" element={<Navigate to="/admin/painel" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
