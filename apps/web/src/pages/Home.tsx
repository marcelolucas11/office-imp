// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, can, isAdminRole } from '@office-imp/shared';
import { Badge, Button, Card, Empty, Input } from '@office-imp/ui';
import { t } from '../lib/i18n';
import { desktop, useSession } from '../lib/session';
import { inviteTokenFrom } from './Login';
import { Logo } from './Shell';

/** Lista de escritórios da pessoa. */
export function Home() {
  const { me, refresh, logout } = useSession();
  const nav = useNavigate();
  const [link, setLink] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => void refresh().catch(() => {}), 20000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!me) return null;
  const admin = isAdminRole(me.role);
  const openInvite = () => {
    const tk = inviteTokenFrom(link);
    if (tk) nav(`/convite/${tk}`);
  };

  return (
    <div className="h-full overflow-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-ink/95 px-6 py-3 backdrop-blur">
        <Logo />
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline">{me.name}</span>
          <Badge>{ROLE_LABEL[me.role]}</Badge>
          {admin ? (
            <Link to="/admin">
              <Button variant="ghost" small>
                {t('home.admin', 'Painel do ADM')}
              </Button>
            </Link>
          ) : null}
          <Button variant="subtle" small onClick={() => void logout().then(() => nav('/login'))}>
            {t('app.logout', 'Sair')}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{t('home.title', 'Seus escritórios')}</h1>
          <p className="text-sm text-muted">{t('home.subtitle', 'Escolha um escritório para entrar.')}</p>
        </div>
        {me.offices.length === 0 ? (
          <Empty>
            {can(me.role, 'office.create') ? (
              <div className="space-y-3">
                <p>{t('home.noneAdmin', 'Ainda não há nenhum escritório. Crie o primeiro pelo assistente.')}</p>
                <Link to="/admin/escritorios">
                  <Button>{t('home.create', 'Criar escritório')}</Button>
                </Link>
              </div>
            ) : (
              t('home.none', 'Você ainda não foi atribuído(a) a nenhum escritório. Fale com a administração.')
            )}
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {me.offices.map((o) => (
              <Card key={o.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-gold">{o.name}</h2>
                  <Badge color={o.online ? 'green' : 'gray'}>{t('home.online', '{{n}} online', { n: o.online ?? 0 })}</Badge>
                </div>
                <p className="text-xs text-muted">{t('home.desks', 'Mesas: {{used}} de {{cap}} ocupadas', { used: o.desksUsed ?? 0, cap: o.deskCapacity })}</p>
                {o.activated === false ? (
                  <p className="rounded-lg bg-panel-2 p-2 text-xs text-warn">{t('home.needInvite', 'Para entrar pela primeira vez, abra o link de convite deste escritório (peça à administração).')}</p>
                ) : (
                  <Link to={`/o/${o.slug}`} className="mt-auto">
                    <Button className="w-full" data-testid={`enter-${o.slug}`}>
                      {t('home.enter', 'Entrar')}
                    </Button>
                  </Link>
                )}
              </Card>
            ))}
          </div>
        )}
        {me.kind === 'user' ? (
          <Card className="space-y-2">
            <h2 className="text-sm font-semibold">{t('home.inviteTitle', 'Recebeu um link de convite?')}</h2>
            <div className="flex gap-2">
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('login.invitePh', 'Cole o link aqui')} />
              <Button variant="ghost" onClick={openInvite}>
                {t('login.open', 'Abrir')}
              </Button>
            </div>
          </Card>
        ) : null}
        <p className="text-[11px] text-muted">
          office-imp v{__APP_VERSION__}
          {desktop ? ` · ${t('home.desktop', 'app desktop')} v${desktop.version}` : ''}
        </p>
      </main>
    </div>
  );
}
