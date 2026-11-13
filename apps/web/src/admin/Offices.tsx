// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_INTERACTION_DISTANCE, can, type DeskInfo, type OfficeMap, type OfficeSettings, type Rect, type WizardInput } from '@office-imp/shared';
import { Badge, Button, Card, Empty, Field, Input, Modal, Tabs, Textarea, Toggle } from '@office-imp/ui';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { toast, useSession } from '../lib/session';
import { Loadable, MapPreview, OfficeSelect, Page, act, fmtDate, useLoad, useOfficeChoice } from './util';
import { Emo } from '../lib/icons';

interface AdminOffice {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  plannedHeadcount: number;
  settings: OfficeSettings;
  expansion: Expansion;
}
interface Expansion {
  capacity: number;
  used: number;
  members: number;
  planned: number;
  suggested: boolean;
  reason: 'planned' | 'usage' | null;
  extra: number;
}

// ---------- assistente de criação ----------
function Wizard({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const [input, setInput] = useState<WizardInput>({ name: '', size: 'small', customCount: 30, partners: 2, partnersShareRoom: true });
  const [preview, setPreview] = useState<{ map: OfficeMap; desks: number; meetingRooms: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const body = () => ({ ...input, name: input.name.trim() || 'Escritório', customCount: input.size === 'custom' ? input.customCount : undefined });

  useEffect(() => {
    const id = setTimeout(() => {
      api
        .post('/api/offices/preview', body())
        .then((r) => {
          setPreview(r);
          setError('');
        })
        .catch((e) => setError(errMsg(e)));
    }, 250);
    return () => clearTimeout(id);
  }, [input.size, input.customCount, input.partners, input.partnersShareRoom]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/offices', { ...body(), name: input.name.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      toast(t('wiz.created', 'Escritório criado.'), 'ok');
      onCreated(r.slug);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const sizeBtn = (size: WizardInput['size'], label: string, hint: string) => (
    <button type="button" data-testid={`size-${size}`} onClick={() => setInput({ ...input, size })} className={`flex-1 rounded-xl border p-3 text-left ${input.size === size ? 'border-gold bg-gold/10' : 'border-line hover:border-muted'}`}>
      <span className="block text-sm font-semibold">{label}</span>
      <span className="block text-xs text-muted">{hint}</span>
    </button>
  );
  return (
    <Modal
      title={t('wiz.title', 'Criar escritório')}
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('app.cancel', 'Cancelar')}
          </Button>
          <Button onClick={() => void create()} disabled={busy || input.name.trim().length < 2} data-testid="wiz-create">
            {t('wiz.create', 'Criar')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('wiz.name', '1. Nome do escritório')}>
          <Input name="officeName" value={input.name} onChange={(e) => setInput({ ...input, name: e.target.value })} maxLength={60} autoFocus />
        </Field>
        <Field group label={t('wiz.size', '2. Tamanho')}>
          <div className="flex gap-2">
            {sizeBtn('small', t('wiz.small', '1 a 10 funcionários'), t('wiz.smallHint', 'mesas, 1 sala de reunião, copa e recepção'))}
            {sizeBtn('medium', t('wiz.medium', '11 a 21 funcionários'), t('wiz.mediumHint', '2 salas de reunião e auditório com palco'))}
            {sizeBtn('custom', t('wiz.custom', 'Número personalizado'), t('wiz.customHint', 'você escolhe quantas pessoas'))}
          </div>
        </Field>
        {input.size === 'custom' ? (
          <Field label={t('wiz.count', 'Quantos funcionários?')}>
            <Input type="number" min={1} max={100} value={input.customCount ?? 30} onChange={(e) => setInput({ ...input, customCount: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} className="w-32" />
          </Field>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('wiz.partners', '3. Quantos sócios?')} hint={t('wiz.partnersHint', 'Os sócios ficam em sala própria e não contam nas mesas dos funcionários.')}>
            <Input name="partners" type="number" min={0} max={10} value={input.partners} onChange={(e) => setInput({ ...input, partners: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} className="w-32" />
          </Field>
          {input.partners > 1 ? (
            <Field group label={t('wiz.share', '4. Os sócios vão ficar na mesma sala?')}>
              <Toggle checked={input.partnersShareRoom} onChange={(v) => setInput({ ...input, partnersShareRoom: v })} label={input.partnersShareRoom ? t('wiz.shareYes', 'Sim: uma Sala dos Sócios compartilhada') : t('wiz.shareNo', 'Não: uma sala individual para cada sócio')} />
            </Field>
          ) : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-stone-300">
            {t('wiz.preview', '5. Pré-visualização')}
            {preview ? <span className="ml-2 text-muted">{t('wiz.previewStats', '{{d}} mesas · {{r}} sala(s) de reunião · {{w}}×{{h}} tiles', { d: preview.desks, r: preview.meetingRooms, w: preview.map.width, h: preview.map.height })}</span> : null}
          </p>
          {preview ? <MapPreview map={preview.map} /> : null}
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}

// ---------- expansão ----------
function ExpansionCard({ office, onChanged }: { office: AdminOffice; onChanged: () => void }) {
  const nav = useNavigate();
  const ex = office.expansion;
  const [extra, setExtra] = useState(ex.extra || 6);
  const [plan, setPlan] = useState<{ map: OfficeMap; addedDesks: number; addedMeetingRooms: number; region: Rect } | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = () => act(async () => setPlan(await api.post(`/api/offices/${office.id}/expansion/preview`, { extra })));
  const approve = async (mode: 'auto' | 'manual') => {
    setBusy(true);
    const ok = await act(
      () => api.post(`/api/offices/${office.id}/expansion/approve`, { extra, mode }),
      mode === 'auto' ? t('exp.done', 'Nova ala criada. Quem está online já vê o mapa novo.') : t('exp.manualDone', 'Área em branco reservada. Monte a ala no Mapmaker.'),
    );
    setBusy(false);
    if (!ok) return;
    setPlan(null);
    onChanged();
    if (mode === 'manual') nav(`/o/${office.slug}?mapmaker=1`);
  };
  return (
    <Card className={ex.suggested ? 'border-gold' : ''}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {t('exp.title', 'Expansão do escritório')} {ex.suggested ? <Badge>{t('exp.suggested', 'sugerida')}</Badge> : null}
          </h3>
          <p className="text-sm text-muted" data-testid="exp-status">
            {t('exp.status', 'Mesas ocupadas: {{used}} de {{cap}} · {{members}} pessoas atribuídas', { used: ex.used, cap: ex.capacity, members: ex.members })}
          </p>
          {ex.suggested ? <p className="mt-1 text-sm text-gold-soft">{ex.reason === 'planned' ? t('exp.reasonPlanned', 'O número de funcionários previsto ({{n}}) passou da capacidade.', { n: ex.planned }) : t('exp.reasonUsage', 'As mesas chegaram a 90% de ocupação.')}</p> : null}
        </div>
        <div className="flex items-end gap-2">
          <Field label={t('exp.extra', 'Nova ala para quantas pessoas?')}>
            <Input type="number" min={1} max={100} value={extra} onChange={(e) => setExtra(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="w-28" data-testid="exp-extra" />
          </Field>
          <Button variant="ghost" onClick={() => void preview()} data-testid="exp-preview">
            {t('exp.preview', 'Pré-visualizar')}
          </Button>
          {ex.suggested ? (
            <Button variant="subtle" onClick={() => void act(() => api.post(`/api/offices/${office.id}/expansion/dismiss`)).then(onChanged)}>
              {t('exp.dismiss', 'Agora não')}
            </Button>
          ) : null}
        </div>
      </div>
      {plan ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm">{t('exp.plan', 'A nova ala (em verde) acrescenta {{d}} mesas e {{r}} sala(s) de reunião. Nada do que já existe é alterado.', { d: plan.addedDesks, r: plan.addedMeetingRooms })}</p>
          <MapPreview map={plan.map} highlight={plan.region} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void approve('auto')} disabled={busy} data-testid="exp-approve">
              {t('exp.approve', 'Aprovar e criar a ala')}
            </Button>
            <Button variant="ghost" onClick={() => void approve('manual')} disabled={busy}>
              {t('exp.manual', 'Criar manualmente no Mapmaker')}
            </Button>
            <Button variant="subtle" onClick={() => setPlan(null)}>
              {t('app.cancel', 'Cancelar')}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- mesas ----------
function Desks({ officeId }: { officeId: string }) {
  const desks = useLoad(() => api.get<DeskInfo[]>(`/api/offices/${officeId}/desks`), [officeId]);
  const members = useLoad(() => api.get<{ id: string; name: string }[]>(`/api/offices/${officeId}/members`), [officeId]);
  const assign = (deskId: string, userId: string | null) => act(() => api.post(`/api/offices/${officeId}/desks/${deskId}/assign`, { userId })).then(desks.reload);
  const free = (desks.data ?? []).filter((d) => !d.userId);
  const taken = (desks.data ?? []).filter((d) => d.userId);
  const without = (members.data ?? []).filter((m) => !taken.some((d) => d.userId === m.id));
  return (
    <Loadable state={desks}>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-semibold">{t('desks.taken', 'Mesas ocupadas ({{n}})', { n: taken.length })}</h3>
          {taken.length === 0 ? <Empty>{t('desks.noneTaken', 'Ninguém tem mesa ainda.')}</Empty> : null}
          <div className="space-y-1">
            {taken.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-panel-2 px-3 py-1.5 text-sm">
                <span>{d.userName}</span>
                <Button small variant="subtle" onClick={() => void assign(d.id, null)}>
                  {t('desks.release', 'Liberar')}
                </Button>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="mb-2 font-semibold">{t('desks.assign', 'Atribuir mesa ({{n}} livres)', { n: free.length })}</h3>
          {without.length === 0 ? <Empty>{t('desks.allSet', 'Todas as pessoas do escritório já têm mesa.')}</Empty> : null}
          <div className="space-y-1">
            {without.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-panel-2 px-3 py-1.5 text-sm">
                <span>{m.name}</span>
                <Button small variant="ghost" disabled={!free.length} onClick={() => void assign(free[0].id, m.id)}>
                  {t('desks.give', 'Dar a próxima mesa livre')}
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">{t('desks.hint', 'Cada pessoa também pode escolher a própria mesa dentro do escritório (tecla X em uma mesa livre). Ao liberar, a mesa fica livre; nenhuma área do mapa é apagada.')}</p>
        </Card>
      </div>
    </Loadable>
  );
}

function LostFound({ officeId }: { officeId: string }) {
  const s = useLoad(() => api.get<{ id: string; formerOwner: string; items: { type: string; props?: any }[]; createdAt: number }[]>(`/api/offices/${officeId}/lost-found`), [officeId]);
  return (
    <Loadable state={s}>
      {(s.data ?? []).length === 0 ? <Empty>{t('lost.none', 'Nada nos achados e perdidos.')}</Empty> : null}
      <div className="space-y-2">
        {(s.data ?? []).map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <p>
                {t('lost.from', 'Itens da mesa de {{name}}', { name: r.formerOwner })} <span className="text-muted">· {fmtDate(r.createdAt)}</span>
              </p>
              <p className="text-xs text-muted">{r.items.map((i) => i.props?.title || i.props?.text || i.type).join(', ')}</p>
            </div>
            <Button small variant="subtle" onClick={() => void act(() => api.del(`/api/offices/${officeId}/lost-found/${r.id}`)).then(s.reload)}>
              {t('lost.discard', 'Descartar')}
            </Button>
          </Card>
        ))}
      </div>
    </Loadable>
  );
}

// ---------- configurações do escritório ----------
function OfficeSettingsForm({ office, onSaved }: { office: AdminOffice; onSaved: () => void }) {
  const isOwner = useSession((s) => s.me?.role === 'OWNER');
  const [name, setName] = useState(office.name);
  const [timezone, setTimezone] = useState(office.timezone);
  const [planned, setPlanned] = useState(office.plannedHeadcount);
  const [st, setSt] = useState(office.settings);
  const [recipients, setRecipients] = useState(office.settings.notesRecipients.join('\n'));
  const save = () =>
    act(
      () =>
        api.patch(`/api/offices/${office.id}`, {
          name: name.trim(),
          timezone: timezone.trim(),
          plannedHeadcount: planned,
          settings: {
            awayMinutes: st.awayMinutes,
            chatRetentionDays: st.chatRetentionDays,
            audioRetentionDays: st.audioRetentionDays,
            notesRestrictedToAdmins: st.notesRestrictedToAdmins,
            interactionDistance: st.interactionDistance,
            notesRecipients: recipients
              .split(/[\n,;]+/)
              .map((r) => r.trim())
              .filter(Boolean),
            ...(isOwner && st.monitoringNotice !== office.settings.monitoringNotice ? { monitoringNotice: st.monitoringNotice } : {}),
          },
        }),
      t('oset.saved', 'Configurações salvas.'),
    ).then((ok) => ok && onSaved());
  const num = (k: 'awayMinutes' | 'chatRetentionDays' | 'audioRetentionDays' | 'interactionDistance', label: string, hint?: string, max?: number) => (
    <Field label={label} hint={hint}>
      <Input type="number" min={1} max={max} value={st[k]} onChange={(e) => setSt({ ...st, [k]: Math.min(max ?? Infinity, Math.max(1, Number(e.target.value) || 1)) })} />
    </Field>
  );
  return (
    <Card className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t('oset.name', 'Nome do escritório')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label={t('oset.tz', 'Fuso horário')} hint={t('oset.tzHint', 'Define o “dia” do painel. Ex.: America/Sao_Paulo')}>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </Field>
        <Field label={t('oset.planned', 'Funcionários previstos')} hint={t('oset.plannedHint', 'Se passar da capacidade, o painel sugere uma nova ala.')}>
          <Input type="number" min={0} max={400} value={planned} onChange={(e) => setPlanned(Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        {num('awayMinutes', t('oset.away', 'Ausente depois de (minutos)'), t('oset.awayHint', 'Sem teclado, mouse ou movimento.'))}
        {num('chatRetentionDays', t('oset.chatDays', 'Guardar o chat por (dias)'))}
        {num('interactionDistance', t('oset.distance', 'Distância de interação (blocos)'), t('oset.distanceHint', 'Raio de proximidade de todos no escritório. Padrão: 2. Só a administração muda.'), MAX_INTERACTION_DISTANCE)}
        {num('audioRetentionDays', t('oset.audioDays', 'Guardar áudios de reunião por (dias)'), t('oset.audioHint', 'O texto das notas fica guardado sem prazo.'))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('oset.recipients', 'Quem recebe as notas de reunião por e-mail')} hint={t('oset.recipientsHint', 'Um e-mail por linha. É só uma lista de destino: o app não liga esses e-mails a nenhuma conta.')}>
          <Textarea name="recipients" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="voce@empresa.com" />
        </Field>
        <div className="space-y-3">
          <Toggle checked={st.notesRestrictedToAdmins} onChange={(v) => setSt({ ...st, notesRestrictedToAdmins: v })} label={t('oset.notesAdmins', 'Só Donos e Admins podem iniciar notas de reunião')} />
          <Field label={t('oset.notice', 'Aviso de transparência (mostrado no primeiro acesso)')} hint={isOwner ? undefined : t('oset.noticeOwner', 'Só o Dono pode editar este texto.')}>
            <Textarea value={st.monitoringNotice} onChange={(e) => setSt({ ...st, monitoringNotice: e.target.value })} disabled={!isOwner} className="min-h-32" />
          </Field>
        </div>
      </div>
      <Button onClick={() => void save()} data-testid="oset-save">
        {t('app.save', 'Salvar')}
      </Button>
    </Card>
  );
}

export function Offices() {
  const { me, refresh } = useSession();
  const nav = useNavigate();
  const { officeId, choose } = useOfficeChoice();
  const [wizard, setWizard] = useState(false);
  const [tab, setTab] = useState<'general' | 'desks' | 'lost'>('general');
  const detail = useLoad(() => (officeId ? api.get<AdminOffice>(`/api/offices/${officeId}/admin`) : Promise.resolve(null)), [officeId]);
  const office = detail.data;
  const remove = async () => {
    if (!office || !confirm(t('office.deleteAsk', 'Excluir o escritório “{{name}}”? Mapa, mesas, chat, painel e notas de reunião serão apagados. Isso não pode ser desfeito.', { name: office.name }))) return;
    if (await act(() => api.del(`/api/offices/${office.id}`), t('office.deleted', 'Escritório excluído.'))) await refresh();
  };
  return (
    <Page
      title={t('admin.navOffices', 'Escritórios')}
      subtitle={t('offices.subtitle', 'Crie escritórios prontos, ajuste as configurações e expanda quando a equipe crescer.')}
      actions={
        <>
          <OfficeSelect value={officeId} onChange={choose} />
          {can(me?.role, 'office.create') ? (
            <Button onClick={() => setWizard(true)} data-testid="new-office">
              ＋ {t('offices.new', 'Criar escritório')}
            </Button>
          ) : null}
        </>
      }
    >
      {!officeId ? (
        <Empty>{t('offices.none', 'Nenhum escritório ainda. Use “Criar escritório” para montar o primeiro em menos de um minuto.')}</Empty>
      ) : (
        <Loadable state={detail}>
          {office ? (
            <div className="space-y-4" key={office.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => nav(`/o/${office.slug}`)}>{t('offices.enter', 'Entrar no escritório')}</Button>
                <Button variant="ghost" onClick={() => nav(`/o/${office.slug}?mapmaker=1`)}>
                  <Emo e="🛠" /> {t('offices.mapmaker', 'Abrir o Mapmaker')}
                </Button>
                {can(me?.role, 'office.delete') ? (
                  <Button variant="subtle" className="ml-auto" onClick={() => void remove()}>
                    {t('offices.delete', 'Excluir escritório')}
                  </Button>
                ) : null}
              </div>
              <ExpansionCard office={office} onChanged={() => (detail.reload(), void refresh())} />
              <Tabs
                tabs={[
                  { id: 'general', label: t('offices.tabGeneral', 'Configurações') },
                  { id: 'desks', label: t('offices.tabDesks', 'Mesas') },
                  { id: 'lost', label: t('offices.tabLost', 'Achados e perdidos') },
                ]}
                value={tab}
                onChange={setTab}
              />
              {tab === 'general' ? <OfficeSettingsForm office={office} onSaved={() => (detail.reload(), void refresh())} /> : null}
              {tab === 'desks' ? <Desks officeId={office.id} /> : null}
              {tab === 'lost' ? <LostFound officeId={office.id} /> : null}
            </div>
          ) : null}
        </Loadable>
      )}
      {wizard ? (
        <Wizard
          onClose={() => setWizard(false)}
          onCreated={async (slug) => {
            setWizard(false);
            const m = await refresh();
            const created = m?.offices.find((o) => o.slug === slug);
            if (created) choose(created.id);
          }}
        />
      ) : null}
    </Page>
  );
}

