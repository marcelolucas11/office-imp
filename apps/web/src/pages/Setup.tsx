// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, Field, Input, Toggle } from '@office-imp/ui';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { AuthShell, ErrorNote } from './Shell';

interface OwnerForm {
  displayName: string;
  username: string;
  password: string;
}
const blank = (): OwnerForm => ({ displayName: '', username: '', password: '' });

function OwnerFields({ label, value, onChange }: { label: string; value: OwnerForm; onChange: (v: OwnerForm) => void }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-line p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-gold">{label}</legend>
      <Field label={t('setup.name', 'Nome de exibição')}>
        <Input value={value.displayName} onChange={(e) => onChange({ ...value, displayName: e.target.value })} maxLength={60} required />
      </Field>
      <Field label={t('setup.username', 'Usuário (para o login)')} hint={t('setup.usernameHint', '3 a 32 letras minúsculas, números, ponto, hífen ou sublinhado. Não é e-mail.')}>
        <Input value={value.username} onChange={(e) => onChange({ ...value, username: e.target.value.toLowerCase() })} autoCapitalize="none" required />
      </Field>
      <Field label={t('setup.password', 'Senha (mínimo de 8 caracteres)')}>
        <Input type="password" value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} minLength={8} required />
      </Field>
    </fieldset>
  );
}

/** Primeira execução: cria as contas de Dono (você e o sócio). */
export function Setup() {
  const { me, needsSetup, refresh } = useSession();
  const nav = useNavigate();
  const [token, setToken] = useState(new URLSearchParams(location.search).get('token') ?? '');
  const [a, setA] = useState(blank());
  const [b, setB] = useState(blank());
  const [two, setTwo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (me) return <Navigate to="/" replace />;
  if (!needsSetup) return <Navigate to="/login" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/setup', { token: token.trim(), owners: two ? [a, b] : [a] });
      await refresh();
      nav('/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell wide title={t('setup.title', 'Configuração inicial')} subtitle={t('setup.subtitle', 'Crie as contas de Dono. Elas têm acesso total: escritórios, pessoas, painel e atualizações.')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('setup.token', 'Token de configuração')} hint={t('setup.tokenHint', 'Aparece no log do servidor na primeira execução (docker compose logs app) e no final do install.sh.')}>
          <Input value={token} onChange={(e) => setToken(e.target.value)} required />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <OwnerFields label={t('setup.owner1', 'Dono 1 (você)')} value={a} onChange={setA} />
          {two ? <OwnerFields label={t('setup.owner2', 'Dono 2 (sócio)')} value={b} onChange={setB} /> : <div className="grid place-items-center rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">{t('setup.oneOwner', 'Só uma conta de Dono será criada. Você pode promover outra pessoa a Dono depois.')}</div>}
        </div>
        <Toggle checked={two} onChange={setTwo} label={t('setup.two', 'Criar também a conta do sócio agora')} />
        <ErrorNote>{error}</ErrorNote>
        <p className="text-xs text-muted">{t('setup.next', 'Em seguida você vai configurar a verificação em duas etapas (obrigatória para Donos e Admins). O sócio faz o mesmo no primeiro login dele.')}</p>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t('app.wait', 'Aguarde…') : t('setup.submit', 'Criar contas e continuar')}
        </Button>
      </form>
    </AuthShell>
  );
}
