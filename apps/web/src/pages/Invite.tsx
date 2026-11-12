// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Field, Input, Spinner } from '@office-imp/ui';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { ChangePasswordGate, MonitoringGate, TotpGate } from './Gates';
import { AuthShell, ErrorNote } from './Shell';

interface InviteInfo {
  kind: 'EMPLOYEE' | 'GUEST';
  state: 'active' | 'revoked' | 'expired' | 'exhausted';
  office: { name: string; slug: string };
  expiresAt: number | null;
  notice: string | null;
}

const STATE_TEXT = (): Record<string, string> => ({
  revoked: t('invite.revoked', 'Este link de convite foi revogado.'),
  expired: t('invite.expired', 'Este link de convite expirou.'),
  exhausted: t('invite.exhausted', 'Este link já atingiu o limite de usos.'),
});

/** Página do link de convite: funcionário (exige login) ou convidado (só o nome). */
export function Invite() {
  const { token = '' } = useParams();
  const { me, refresh } = useSession();
  const nav = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<InviteInfo>(`/api/invites/${token}`)
      .then(setInfo)
      .catch((e) => setError(errMsg(e)));
  }, [token]);

  // funcionário já logado: ativa o acesso e entra
  useEffect(() => {
    if (!info || info.kind !== 'EMPLOYEE' || info.state !== 'active') return;
    if (!me) {
      nav(`/login?next=${encodeURIComponent(`/convite/${token}`)}`, { replace: true });
      return;
    }
    if (me.kind !== 'user' || me.mustChangePassword || me.mustSetupTotp || !me.monitoringAccepted) return;
    api
      .post(`/api/invites/${token}/accept`)
      .then(async (r) => {
        await refresh();
        nav(`/o/${r.slug}`, { replace: true });
      })
      .catch((e) => setError(errMsg(e)));
  }, [info, me, token]);

  // quem já é da equipe e abre um link de convidado do próprio escritório entra direto
  useEffect(() => {
    if (info?.kind === 'GUEST' && me?.kind === 'user' && me.offices.some((o) => o.slug === info.office.slug && o.activated)) nav(`/o/${info.office.slug}`, { replace: true });
  }, [info, me]);

  const enterGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post(`/api/invites/${token}/guest`, { displayName: name.trim(), acceptNotice: true });
      await refresh();
      nav(`/o/${r.slug}`, { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (!info) {
    return (
      <AuthShell title={t('invite.title', 'Convite')}>
        {error ? <ErrorNote>{error}</ErrorNote> : <Spinner />}
        <Link to="/" className="text-sm text-gold underline">
          {t('invite.home', 'Ir para o início')}
        </Link>
      </AuthShell>
    );
  }

  if (info.state !== 'active') {
    return (
      <AuthShell title={info.office.name}>
        <ErrorNote>{STATE_TEXT()[info.state]}</ErrorNote>
        <p className="text-sm text-muted">{t('invite.askNew', 'Peça um novo link a quem convidou você.')}</p>
      </AuthShell>
    );
  }

  if (info.kind === 'EMPLOYEE') {
    // primeiro acesso pelo link: conclui as etapas obrigatórias antes de ativar o escritório
    if (me?.kind === 'user') {
      if (me.mustChangePassword) return <ChangePasswordGate />;
      if (me.mustSetupTotp) return <TotpGate />;
      if (!me.monitoringAccepted) return <MonitoringGate />;
    }
    return (
      <AuthShell title={info.office.name} subtitle={t('invite.employee', 'Convite da equipe')}>
        {error ? <ErrorNote>{error}</ErrorNote> : <Spinner />}
        {me?.kind === 'guest' ? <p className="text-sm text-muted">{t('invite.guestSession', 'Você está em uma sessão de convidado. Saia e entre com a sua conta para usar este link.')}</p> : null}
        <Link to="/" className="text-sm text-gold underline">
          {t('invite.home', 'Ir para o início')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('invite.guestTitle', 'Visitar {{office}}', { office: info.office.name })}
      subtitle={info.expiresAt ? t('invite.validUntil', 'Convite válido até {{when}}.', { when: new Date(info.expiresAt).toLocaleString('pt-BR') }) : t('invite.guestSubtitle', 'Você foi convidado(a) para este escritório virtual.')}
    >
      <form onSubmit={enterGuest} className="space-y-3">
        {me?.kind === 'user' ? <p className="rounded-lg bg-panel-2 p-3 text-xs text-muted">{t('invite.willReplace', 'Você está logado(a) como {{name}}. Entrar como convidado encerra essa sessão neste navegador.', { name: me.name })}</p> : null}
        <Field label={t('invite.name', 'Como você quer ser chamado(a)?')}>
          <Input name="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus required />
        </Field>
        {info.notice ? <p className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-panel-2 p-3 text-xs leading-relaxed text-stone-300">{info.notice}</p> : null}
        <label className="flex items-start gap-2 text-sm">
          <input name="agree" type="checkbox" className="mt-1 accent-[#d7b870]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{t('invite.agree', 'Li e entendi o aviso acima.')}</span>
        </label>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" disabled={busy || !agree || !name.trim()} className="w-full">
          {t('invite.enter', 'Entrar no escritório')}
        </Button>
      </form>
    </AuthShell>
  );
}
