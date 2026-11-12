// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '@office-imp/ui';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { AuthShell, ErrorNote } from './Shell';

/** Extrai o token de um link de convite colado (ou aceita o token puro). */
export function inviteTokenFrom(text: string): string | null {
  const m = text.trim().match(/(?:\/convite\/)?([A-Za-z0-9_-]{20,})\/?$/);
  return m ? m[1] : null;
}

export function Login() {
  const { me, needsSetup, refresh } = useSession();
  const nav = useNavigate();
  const next = new URLSearchParams(location.search).get('next') || '/';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');

  if (me) return <Navigate to={safeNext} replace />;
  if (needsSetup) return <Navigate to="/setup" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/api/auth/login', { username: username.trim().toLowerCase(), password, ...(needTotp ? { code: code.trim() } : {}) });
      if (res.needTotp) {
        setNeedTotp(true);
        return;
      }
      await refresh();
      nav(safeNext, { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const openInvite = () => {
    const tk = inviteTokenFrom(link);
    if (!tk) return setError(t('login.badLink', 'Esse não parece ser um link de convite válido.'));
    nav(`/convite/${tk}`);
  };

  return (
    <AuthShell title={t('login.title', 'Entrar')} subtitle={t('login.subtitle', 'Use o usuário e a senha que a administração criou para você.')}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('login.username', 'Usuário')}>
          <Input name="username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" autoFocus required disabled={needTotp} />
        </Field>
        <Field label={t('login.password', 'Senha')}>
          <Input name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required disabled={needTotp} />
        </Field>
        {needTotp ? (
          <Field label={t('login.code', 'Código do app autenticador')} hint={t('login.codeHint', 'Sem o celular? Use um dos códigos de recuperação.')}>
            <Input name="code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus required />
          </Field>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t('app.wait', 'Aguarde…') : t('login.submit', 'Entrar')}
        </Button>
        <p className="text-xs text-muted">{t('login.forgot', 'Esqueceu a senha? Peça a um administrador para redefinir. O app não guarda o e-mail de ninguém.')}</p>
      </form>
      <div className="space-y-2 border-t border-line pt-4">
        <Field label={t('login.invite', 'Tem um link de convite?')}>
          <div className="flex gap-2">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('login.invitePh', 'Cole o link aqui')} />
            <Button variant="ghost" onClick={openInvite}>
              {t('login.open', 'Abrir')}
            </Button>
          </div>
        </Field>
      </div>
    </AuthShell>
  );
}
