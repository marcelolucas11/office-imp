// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Field, Input, Toggle } from '@office-imp/ui';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { desktop, toast } from '../lib/session';
import { Loadable, Page, act, fmtDate, useLoad } from './util';

interface SettingsData {
  global: { autoUpdateOnOpen: boolean; autoUpdateServer: boolean };
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string; from: string } | null;
  google: { configured: boolean; clientId: string; fromEnv: boolean; redirectUri: string };
  whisperConfigured: boolean;
  summaryConfigured: boolean;
  isOwner: boolean;
}

function SmtpCard({ data, reload }: { data: SettingsData; reload: () => void }) {
  const [f, setF] = useState(data.smtp ?? { host: '', port: 587, secure: false, user: '', pass: '', from: '' });
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const save = () => act(() => api.put('/api/admin/settings/smtp', { ...f, port: Number(f.port) }), t('smtp.saved', 'SMTP salvo.')).then((ok) => ok && reload());
  const test = async () => {
    setBusy(true);
    await act(() => api.post('/api/admin/settings/smtp/test', { to: to.trim() }), t('smtp.testOk', 'E-mail de teste enviado. Confira a caixa de entrada (e o spam).'));
    setBusy(false);
  };
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t('smtp.title', 'E-mail (SMTP) para as notas de reunião')}</h2>
        <Badge color={data.smtp ? 'green' : 'gray'}>{data.smtp ? t('sys.configured', 'configurado') : t('sys.notConfigured', 'não configurado')}</Badge>
      </div>
      <p className="text-xs text-muted">{t('smtp.help', 'É a “conta de envio” que o servidor usa para mandar a transcrição. Serve Gmail (com senha de app), Brevo, Resend, Zoho ou o SMTP do seu provedor. A senha fica criptografada no banco.')}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t('smtp.host', 'Servidor (host)')}>
          <Input name="smtpHost" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="smtp.gmail.com" />
        </Field>
        <Field label={t('smtp.port', 'Porta')}>
          <Input name="smtpPort" type="number" value={f.port} onChange={(e) => setF({ ...f, port: Number(e.target.value), secure: Number(e.target.value) === 465 })} />
        </Field>
        <Field group label={t('smtp.secure', 'Conexão')}>
          <Toggle checked={f.secure} onChange={(v) => setF({ ...f, secure: v })} label={f.secure ? t('smtp.ssl', 'SSL/TLS direto (porta 465)') : t('smtp.starttls', 'STARTTLS (porta 587)')} />
        </Field>
        <Field label={t('smtp.user', 'Usuário')}>
          <Input name="smtpUser" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} autoComplete="off" />
        </Field>
        <Field label={t('smtp.pass', 'Senha (ou senha de app)')}>
          <Input name="smtpPass" type="password" value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label={t('smtp.from', 'Remetente')} hint={t('smtp.fromHint', 'Ex.: Office Impera <notas@seudominio.com>')}>
          <Input name="smtpFrom" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button onClick={() => void save()} disabled={!f.host || !f.from} data-testid="smtp-save">
          {t('app.save', 'Salvar')}
        </Button>
        {data.smtp ? (
          <Button variant="subtle" onClick={() => void act(() => api.put('/api/admin/settings/smtp', null), t('smtp.removed', 'SMTP removido.')).then(reload)}>
            {t('app.remove', 'Remover')}
          </Button>
        ) : null}
        <span className="mx-2 h-6 w-px bg-line" />
        <Field label={t('smtp.testTo', 'Enviar um teste para')}>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="voce@empresa.com" className="w-64" />
        </Field>
        <Button variant="ghost" onClick={() => void test()} disabled={busy || !data.smtp || !to.trim()}>
          {t('smtp.test', 'Testar envio')}
        </Button>
      </div>
      <p className="text-[11px] text-muted">{t('smtp.recipients', 'Quem recebe as notas é definido por escritório, em Escritórios → Configurações.')}</p>
    </Card>
  );
}

function GoogleCard({ data, reload }: { data: SettingsData; reload: () => void }) {
  const [clientId, setClientId] = useState(data.google.fromEnv ? '' : data.google.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const save = () => act(() => api.put('/api/admin/settings/google', { clientId: clientId.trim(), clientSecret: clientSecret.trim() }), t('google.saved', 'Credenciais do Google salvas.')).then((ok) => ok && (setClientSecret(''), reload()));
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t('google.title', 'Google Calendar')}</h2>
        <Badge color={data.google.configured ? 'green' : 'gray'}>{data.google.configured ? t('sys.configured', 'configurado') : t('sys.notConfigured', 'não configurado')}</Badge>
      </div>
      <p className="text-xs text-muted">{t('google.help', 'Crie um “ID do cliente OAuth” do tipo Aplicativo da Web no Google Cloud, com a Google Calendar API ativada, e cole aqui o ID e a chave secreta. O passo a passo está em docs/INSTALL.md.')}</p>
      <Field label={t('google.redirect', 'URI de redirecionamento autorizado (copie para o Google Cloud)')}>
        <div className="flex gap-2">
          <Input readOnly value={data.google.redirectUri} onFocus={(e) => e.target.select()} />
          <Button variant="ghost" onClick={() => void navigator.clipboard?.writeText(data.google.redirectUri).then(() => toast(t('app.copied', 'Copiado.'), 'ok'))}>
            {t('app.copy', 'Copiar')}
          </Button>
        </div>
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t('google.clientId', 'ID do cliente')} hint={data.google.fromEnv ? t('google.fromEnv', 'Hoje vem do arquivo .env do servidor. Preencher aqui substitui.') : undefined}>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxxxxxx.apps.googleusercontent.com" />
        </Field>
        <Field label={t('google.secret', 'Chave secreta do cliente')}>
          <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={clientId.trim().length < 10 || clientSecret.trim().length < 6}>
          {t('app.save', 'Salvar')}
        </Button>
        {data.google.configured && !data.google.fromEnv ? (
          <Button variant="subtle" onClick={() => void act(() => api.put('/api/admin/settings/google', null), t('google.removed', 'Credenciais removidas.')).then(reload)}>
            {t('app.remove', 'Remover')}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function Settings() {
  const s = useLoad(() => api.get<SettingsData>('/api/admin/settings'), []);
  return (
    <Page title={t('admin.navSettings', 'Configurações')} subtitle={t('sys.subtitle', 'Integrações do servidor. As opções de cada escritório ficam em Escritórios.')}>
      <Loadable state={s}>
        {s.data ? (
          <>
            <SmtpCard data={s.data} reload={s.reload} />
            <GoogleCard data={s.data} reload={s.reload} />
            <Card className="space-y-2 text-sm">
              <h2 className="font-semibold">{t('sys.services', 'Serviços do servidor')}</h2>
              <p className="flex items-center gap-2">
                <Badge color={s.data.whisperConfigured ? 'green' : 'red'}>{s.data.whisperConfigured ? t('sys.on', 'ativo') : t('sys.off', 'desligado')}</Badge>
                {t('sys.whisper', 'Transcrição local (Whisper)')}
              </p>
              <p className="flex items-center gap-2">
                <Badge color={s.data.summaryConfigured ? 'green' : 'gray'}>{s.data.summaryConfigured ? t('sys.on', 'ativo') : t('sys.optional', 'opcional')}</Badge>
                {t('sys.summary', 'Resumo automático por IA (variável SUMMARY_LLM_URL no .env; sem ela, o e-mail leva só a transcrição)')}
              </p>
            </Card>
          </>
        ) : null}
      </Loadable>
    </Page>
  );
}

// ---------- atualizações ----------
interface UpdateStatus {
  current: string;
  latest: { tag: string; version: string; url: string; publishedAt: string } | null;
  updateAvailable: boolean;
  updaterAvailable: boolean;
  updater: { state?: string; log?: string[]; error?: string; startedAt?: number; finishedAt?: number; version?: string } | null;
  global: { autoUpdateOnOpen: boolean; autoUpdateServer: boolean };
  canUpdateServer: boolean;
}

export function Updates() {
  const s = useLoad(() => api.get<UpdateStatus>('/api/admin/update/status'), []);
  const d = s.data;
  const running = d?.updater?.state === 'running';
  const [desk, setDesk] = useState<{ status: string; version?: string; message?: string } | null>(null);

  useEffect(() => desktop?.onUpdateState(setDesk), []);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(s.reload, 4000);
    return () => clearInterval(id);
  }, [running]);

  const setGlobal = (patch: Partial<UpdateStatus['global']>) => act(() => api.patch('/api/admin/settings/global', patch)).then(s.reload);
  const updateServer = async () => {
    if (!d?.latest || !confirm(t('upd.serverAsk', 'Atualizar o servidor para a versão {{v}}? O escritório fica fora do ar por cerca de um minuto. Um backup do banco é feito antes e, se algo falhar, a versão anterior volta sozinha.', { v: d.latest.version }))) return;
    if (await act(() => api.post('/api/admin/update/server'), t('upd.serverStarted', 'Atualização iniciada. Acompanhe o andamento abaixo.'))) window.setTimeout(s.reload, 2500);
  };
  const updateClients = async () => {
    if (!confirm(t('upd.clientsAsk', 'Atualizar o app de todos que estão conectados agora? Eles veem um aviso de 30 segundos e voltam para o mesmo lugar.'))) return;
    try {
      const r = await api.post('/api/admin/update/clients');
      toast(t('upd.clientsDone', 'Aviso enviado para {{n}} pessoa(s) conectada(s).', { n: r.online }), 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Page
      title={t('admin.navUpdates', 'Atualizações')}
      subtitle={t('upd.subtitle', 'Cada versão publicada no GitHub gera a imagem do servidor e os instaladores de Mac e Windows.')}
      actions={
        <Button variant="ghost" onClick={() => void api.get('/api/admin/update/status?refresh=1').then(s.setData)}>
          {t('upd.check', 'Verificar agora')}
        </Button>
      }
    >
      <Loadable state={s}>
        {d ? (
          <>
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{t('upd.server', 'Servidor')}</h2>
                  <p className="text-sm" data-testid="server-version">
                    {t('upd.versions', 'Versão instalada: {{cur}} · disponível: {{latest}}', { cur: d.current, latest: d.latest?.version ?? t('upd.unknown', 'não foi possível consultar o GitHub') })}
                  </p>
                  {d.latest ? (
                    <a href={d.latest.url} target="_blank" rel="noreferrer" className="text-xs text-gold underline">
                      {t('upd.notes', 'Ver as novidades da versão {{v}}', { v: d.latest.version })}
                    </a>
                  ) : null}
                </div>
                {d.canUpdateServer ? (
                  <Button onClick={() => void updateServer()} disabled={!d.updateAvailable || !d.updaterAvailable || running} data-testid="update-server">
                    {running ? t('upd.running', 'Atualizando…') : d.updateAvailable ? t('upd.serverBtn', 'Atualizar servidor') : t('upd.upToDate', 'Servidor atualizado')}
                  </Button>
                ) : (
                  <span className="text-xs text-muted">{t('upd.ownerOnly', 'Só o Dono atualiza o servidor.')}</span>
                )}
              </div>
              {d.canUpdateServer && !d.updaterAvailable ? <p className="text-xs text-warn">{t('upd.noUpdater', 'O serviço de atualização (updater) não está rodando nesta instalação. Atualize pela VPS com: cd /opt/office-imp && ./update.sh')}</p> : null}
              {d.updater?.error ? <p className="text-xs text-danger">{d.updater.error}</p> : null}
              {d.updater?.log?.length ? <pre className="max-h-56 overflow-auto rounded-lg bg-black/60 p-3 text-[11px] leading-relaxed text-stone-300">{d.updater.log.join('\n')}</pre> : null}
              {d.canUpdateServer ? <Toggle checked={d.global.autoUpdateServer} onChange={(v) => void setGlobal({ autoUpdateServer: v })} label={t('upd.autoServer', 'Atualizar o servidor sozinho quando sair uma versão nova (verifica de madrugada)')} /> : null}
            </Card>
            <Card className="space-y-3">
              <h2 className="font-semibold">{t('upd.clients', 'Apps das pessoas (desktop e navegador)')}</h2>
              <Toggle checked={d.global.autoUpdateOnOpen} onChange={(v) => void setGlobal({ autoUpdateOnOpen: v })} label={t('upd.autoOpen', 'Atualizar automaticamente ao abrir')} />
              <p className="text-xs text-muted">{t('upd.autoOpenHelp', 'Ligado: o app desktop confere as versões do GitHub ao abrir e se atualiza; o navegador recarrega quando o servidor mudou de versão. No Mac sem assinatura da Apple, o app avisa e abre a página de download em vez de se atualizar sozinho.')}</p>
              <Button variant="ghost" onClick={() => void updateClients()} data-testid="update-clients">
                {t('upd.clientsBtn', 'Atualizar todos agora')}
              </Button>
            </Card>
            {desktop ? (
              <Card className="space-y-2">
                <h2 className="font-semibold">{t('upd.thisApp', 'Este app desktop')}</h2>
                <p className="text-sm">
                  {t('upd.desktopVersion', 'Versão: {{v}}', { v: desktop.version })}
                  {desk ? ` · ${desk.status}${desk.version ? ` ${desk.version}` : ''}${desk.message ? ` — ${desk.message}` : ''}` : ''}
                </p>
                <Button small variant="ghost" onClick={() => desktop?.checkUpdates(true)}>
                  {t('upd.checkDesktop', 'Procurar atualização deste app')}
                </Button>
              </Card>
            ) : null}
            {d.updater?.finishedAt ? <p className="text-[11px] text-muted">{t('upd.last', 'Última atualização do servidor: {{when}}', { when: fmtDate(d.updater.finishedAt) })}</p> : null}
          </>
        ) : null}
      </Loadable>
    </Page>
  );
}
