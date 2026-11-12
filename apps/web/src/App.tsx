// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isAdminRole } from '@office-imp/shared';
import { Button, Spinner, cx } from '@office-imp/ui';
import { t } from './lib/i18n';
import { desktop, useSession, useToasts } from './lib/session';
import { ChangePasswordGate, MonitoringGate, TotpGate } from './pages/Gates';
import { Home } from './pages/Home';
import { Invite } from './pages/Invite';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';

const OfficePage = lazy(() => import('./office/OfficePage'));
const AdminPage = lazy(() => import('./admin/AdminPage'));

export function Loading({ label }: { label?: string }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex items-center gap-3 text-sm text-muted">
        <Spinner /> {label ?? t('app.loading', 'Carregando…')}
      </div>
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-80 flex-col gap-2">
      {toasts.map((x) => (
        <div key={x.id} className={cx('oi-pop pointer-events-auto rounded-xl border bg-panel p-3 text-sm shadow-xl', x.kind === 'error' ? 'border-danger/60' : x.kind === 'ok' ? 'border-ok/50' : 'border-line')}>
          <div className="flex items-start gap-2">
            <span className="flex-1 whitespace-pre-wrap break-words">{x.text}</span>
            <button type="button" aria-label={t('app.close', 'Fechar')} className="text-muted hover:text-stone-100" onClick={() => dismiss(x.id)}>
              ✕
            </button>
          </div>
          {x.action ? (
            <Button
              small
              className="mt-2"
              onClick={() => {
                x.action!.run();
                dismiss(x.id);
              }}
            >
              {x.action.label}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Exige sessão e conclui as etapas obrigatórias (senha, 2FA, aviso de monitoramento). */
function Private({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { me, needsSetup } = useSession();
  const loc = useLocation();
  if (!me) return <Navigate to={needsSetup ? '/setup' : `/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (me.kind === 'user') {
    if (me.mustChangePassword) return <ChangePasswordGate />;
    if (me.mustSetupTotp) return <TotpGate />;
    if (!me.monitoringAccepted) return <MonitoringGate />;
  }
  if (admin && !isAdminRole(me.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  const { loading, me, refresh } = useSession();

  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);

  // versão: recarrega o cliente web quando o servidor foi atualizado; no desktop, confere se há instalador novo
  useEffect(() => {
    if (!me) return;
    if (me.version !== __APP_VERSION__ && me.autoUpdateOnOpen) {
      const flag = `oi-reloaded-${me.version}`;
      if (!sessionStorage.getItem(flag)) {
        sessionStorage.setItem(flag, '1');
        location.reload();
        return;
      }
    }
    desktop?.checkUpdates(me.autoUpdateOnOpen);
  }, [me?.version, me?.autoUpdateOnOpen]);

  if (loading) return <Loading />;
  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/convite/:token" element={<Invite />} />
          <Route
            path="/"
            element={
              <Private>
                <Home />
              </Private>
            }
          />
          <Route
            path="/o/:slug"
            element={
              <Private>
                <OfficePage />
              </Private>
            }
          />
          <Route
            path="/o/:slug/sala/:areaId"
            element={
              <Private>
                <OfficePage />
              </Private>
            }
          />
          <Route
            path="/admin/*"
            element={
              <Private admin>
                <AdminPage />
              </Private>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toasts />
    </>
  );
}
