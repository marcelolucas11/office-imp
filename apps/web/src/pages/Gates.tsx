// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button, Field, Input } from '@office-imp/ui';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { AuthShell, ErrorNote } from './Shell';

/** Primeiro login: a senha temporária precisa ser trocada. */
export function ChangePasswordGate() {
  const { refresh, logout } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== again) return setError(t('gate.pwMismatch', 'As duas senhas novas não são iguais.'));
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/change-password', { current, next });
      await refresh();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title={t('gate.pwTitle', 'Crie a sua senha')} subtitle={t('gate.pwSubtitle', 'A senha que você recebeu é temporária. Escolha uma nova para continuar.')}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('gate.pwCurrent', 'Senha temporária (atual)')}>
          <Input name="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus required />
        </Field>
        <Field label={t('gate.pwNew', 'Nova senha (mínimo de 8 caracteres)')}>
          <Input name="next" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} autoComplete="new-password" required />
        </Field>
        <Field label={t('gate.pwAgain', 'Repita a nova senha')}>
          <Input name="again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} minLength={8} autoComplete="new-password" required />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">
            {t('gate.pwSubmit', 'Salvar e continuar')}
          </Button>
          <Button variant="ghost" onClick={() => void logout()}>
            {t('app.logout', 'Sair')}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}

/** Dono e Admin: verificação em duas etapas obrigatória (app autenticador, sem e-mail). */
export function TotpGate() {
  const { refresh, logout } = useSession();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .post('/api/auth/totp/begin')
      .then(async (r) => {
        setSetup(r);
        setQr(await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 220 }));
      })
      .catch((e) => setError(errMsg(e)));
  }, []);

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/api/auth/totp/enable', { code: code.trim() });
      setCodes(r.recoveryCodes);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <AuthShell title={t('gate.recTitle', 'Guarde os códigos de recuperação')} subtitle={t('gate.recSubtitle', 'Se você perder o celular, cada código abaixo vale por um login. Eles não serão mostrados de novo.')}>
        <div data-testid="recovery-codes" className="grid grid-cols-2 gap-2 rounded-xl bg-panel-2 p-4 font-mono text-sm">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}>
            {t('app.copy', 'Copiar')}
          </Button>
          <Button className="flex-1" onClick={() => void refresh()}>
            {t('gate.recDone', 'Já guardei, continuar')}
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('gate.totpTitle', 'Verificação em duas etapas')} subtitle={t('gate.totpSubtitle', 'Obrigatória para Donos e Admins. Use um app autenticador (Google Authenticator, Authy, 1Password…).')}>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-300">
        <li>{t('gate.totp1', 'Abra o app autenticador no celular e escolha “adicionar conta”.')}</li>
        <li>{t('gate.totp2', 'Leia o QR code abaixo (ou digite a chave).')}</li>
        <li>{t('gate.totp3', 'Digite aqui o código de 6 dígitos que o app mostrar.')}</li>
      </ol>
      {setup ? (
        <div className="flex flex-col items-center gap-2">
          {qr ? <img src={qr} width={220} height={220} alt={t('gate.qrAlt', 'QR code da verificação em duas etapas')} className="rounded-lg" /> : null}
          <code data-testid="totp-secret" className="select-all break-all rounded bg-panel-2 px-2 py-1 text-xs">
            {setup.secret}
          </code>
        </div>
      ) : null}
      <form onSubmit={enable} className="space-y-3">
        <Field label={t('gate.totpCode', 'Código de 6 dígitos')}>
          <Input name="code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoFocus required />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !setup} className="flex-1">
            {t('gate.totpSubmit', 'Ativar')}
          </Button>
          <Button variant="ghost" onClick={() => void logout()}>
            {t('app.logout', 'Sair')}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}

/** Transparência (LGPD): a pessoa é avisada do que é registrado antes de entrar. */
export function MonitoringGate() {
  const { me, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      await api.post('/api/auth/accept-monitoring');
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title={t('gate.monTitle', 'Antes de entrar')} subtitle={t('gate.monSubtitle', 'Aviso de transparência sobre os dados registrados neste escritório virtual.')}>
      <p className="whitespace-pre-wrap rounded-xl bg-panel-2 p-4 text-sm leading-relaxed text-stone-200">{me?.monitoringNotice}</p>
      <Button onClick={accept} disabled={busy} className="w-full">
        {t('gate.monAccept', 'Entendi')}
      </Button>
    </AuthShell>
  );
}
