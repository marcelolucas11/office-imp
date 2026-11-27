// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useState } from 'react';
import { ACTIVITIES, ACTIVITY_COLOR, ACTIVITY_LABEL, ROLE_LABEL, STATUS_COLOR, STATUS_LABEL, addDays, formatDuration, localDate, type PersonRow, type Role } from '@office-imp/shared';
import { Badge, Button, Card, Empty, Input, Modal, Select, Spinner } from '@office-imp/ui';
import { PersonStats } from './PersonStats';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { Loadable, OfficeSelect, Page, act, fmtDate, useLoad, useOfficeChoice } from './util';

interface AnalyticsData {
  from: string;
  to: string;
  timezone: string;
  now: number;
  rows: PersonRow[];
}

/** Distribuição do tempo online por categoria (soma = online). */
function ActivityBar({ row }: { row: PersonRow }) {
  const act = row.activity;
  const total = ACTIVITIES.reduce((n, c) => n + (act?.[c] ?? 0), 0);
  if (!total) return <div className="h-3 w-full rounded-full bg-panel-3" />;
  return (
    <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-panel-3" title={ACTIVITIES.map((c) => `${ACTIVITY_LABEL[c]}: ${formatDuration(act[c] ?? 0)}`).join(' · ')}>
      {ACTIVITIES.map((c) => (act[c] ? <div key={c} style={{ width: `${(act[c] / total) * 100}%`, background: ACTIVITY_COLOR[c] }} /> : null))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-panel-2 p-3">
      <p className="text-lg font-semibold text-gold">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

/** Painel em tempo real: horas online, status e calls de todos (Donos e Admins incluídos). */
export function Analytics() {
  const { officeId, office, choose } = useOfficeChoice();
  const [period, setPeriod] = useState<'today' | 'day' | 'week' | 'month'>('today');
  const [date, setDate] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState('');
  const [person, setPerson] = useState<PersonRow | null>(null);
  const live = period === 'today';

  const range = useMemo(() => {
    if (live || !date) return null;
    if (period === 'day') return { from: date, to: date };
    if (period === 'week') return { from: addDays(date, -6), to: date };
    return { from: addDays(date, -29), to: date };
  }, [period, date, live]);

  useEffect(() => {
    setData(null);
    setError('');
    if (!officeId) return;
    if (live) {
      const es = new EventSource(`/api/offices/${officeId}/analytics/live`, { withCredentials: true });
      es.onmessage = (ev) => {
        try {
          setData(JSON.parse(ev.data));
          setError('');
        } catch {}
      };
      es.onerror = () => setError(t('an.liveLost', 'Conexão ao vivo interrompida. Tentando de novo…'));
      return () => es.close();
    }
    if (!range) return;
    api
      .get<AnalyticsData>(`/api/offices/${officeId}/analytics?from=${range.from}&to=${range.to}`)
      .then(setData)
      .catch((e) => setError(errMsg(e)));
  }, [officeId, live, range?.from, range?.to]);

  useEffect(() => {
    if (!date && data) setDate(localDate(data.now, data.timezone));
  }, [data, date]);

  const rows = data?.rows ?? [];
  const csv = officeId && data ? `/api/offices/${officeId}/analytics.csv?from=${data.from}&to=${data.to}` : '';
  const totals = rows.reduce((a, r) => ({ online: a.online + r.onlineMs, call: a.call + r.callMs, now: a.now + (r.current ? 1 : 0) }), { online: 0, call: 0, now: 0 });

  return (
    <Page
      title={t('admin.navPanel', 'Painel em tempo real')}
      subtitle={data ? t('an.subtitle', 'Fuso do escritório: {{tz}} · período: {{from}} a {{to}}', { tz: data.timezone, from: data.from.split('-').reverse().join('/'), to: data.to.split('-').reverse().join('/') }) : undefined}
      actions={
        <>
          <OfficeSelect value={officeId} onChange={choose} />
          <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="w-40" aria-label={t('an.period', 'Período')}>
            <option value="today">{t('an.today', 'Hoje (ao vivo)')}</option>
            <option value="day">{t('an.day', 'Um dia')}</option>
            <option value="week">{t('an.week', '7 dias até')}</option>
            <option value="month">{t('an.month', '30 dias até')}</option>
          </Select>
          {!live ? <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /> : null}
          {csv ? (
            <a href={csv}>
              <Button variant="ghost">{t('an.csv', 'Exportar CSV')}</Button>
            </a>
          ) : null}
        </>
      }
    >
      {!officeId ? (
        <Empty>{t('inv.noOffice', 'Crie um escritório primeiro.')}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={live ? t('an.onlineNow', 'Online agora') : t('an.people', 'Pessoas no período')} value={String(live ? totals.now : rows.length)} />
            <Stat label={t('an.totalOnline', 'Horas online (soma)')} value={formatDuration(totals.online)} />
            <Stat label={t('an.totalCall', 'Horas em call (soma)')} value={formatDuration(totals.call)} />
            <Stat label={t('an.officeLabel', 'Escritório')} value={office?.name ?? '—'} />
          </div>
          {error ? <p className="text-sm text-warn">{error}</p> : null}
          {!data ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <Empty>{t('an.none', 'Ninguém entrou no escritório neste período.')}</Empty>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm" data-testid="analytics-table">
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2">{t('an.colPerson', 'Pessoa')}</th>
                    {live ? <th className="px-4 py-2">{t('an.colNow', 'Agora')}</th> : null}
                    <th className="px-4 py-2">{t('an.colOnline', 'Online')}</th>
                    <th className="px-4 py-2">{t('an.colActive', 'Trabalhado')}</th>
                    <th className="w-56 px-4 py-2">{t('an.colSplit', 'Como o tempo foi usado')}</th>
                    <th className="px-4 py-2">{t('an.colCall', 'Em call')}</th>
                    <th className="px-4 py-2">{t('an.colIdle', 'Inativo')}</th>
                    <th className="px-4 py-2" title={t('an.colSleepHint', 'Saídas por tampa fechada, suspensão ou computador desligado')}>
                      {t('an.colSleep', 'Tampa/susp.')}
                    </th>
                    <th className="px-4 py-2">{t('an.colWith', 'Com quem')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-panel-2" onClick={() => setPerson(r)} data-testid={`an-row-${r.name}`}>
                      <td className="px-4 py-2">
                        <span className="font-medium">{r.name}</span> <span className="text-[11px] text-muted">{ROLE_LABEL[r.role as Role] ?? r.role}</span>
                      </td>
                      {live ? (
                        <td className="px-4 py-2 text-xs">
                          {r.current ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[r.current.status] }} />
                              {STATUS_LABEL[r.current.status]}
                              <span className="text-muted">· {r.current.area ?? t('people.openArea', 'área aberta')}</span>
                              {r.current.inCall ? <Badge color="gold">{t('an.inCallNow', 'em call')}</Badge> : null}
                              {r.current.idle && !r.current.inCall ? <Badge color="gray">{t('an.idleNow', 'inativo')}</Badge> : null}
                            </span>
                          ) : (
                            <span className="text-muted">{t('an.offline', 'offline')}</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-4 py-2 tabular-nums">{formatDuration(r.onlineMs)}</td>
                      <td className="px-4 py-2 tabular-nums">{formatDuration(r.activeMs)}</td>
                      <td className="px-4 py-2">
                        <ActivityBar row={r} />
                      </td>
                      <td className="px-4 py-2 tabular-nums">{formatDuration(r.callMs)}</td>
                      <td className="px-4 py-2 tabular-nums">{formatDuration(r.idleMs ?? 0)}</td>
                      <td className="px-4 py-2 tabular-nums">{r.sleepExits ? `💤 ${r.sleepExits}` : '—'}</td>
                      <td className="px-4 py-2 text-xs">
                        {r.callWith.slice(0, 5).map((c) => (
                          <span key={c.id} className="mr-2 whitespace-nowrap">
                            {c.name} <span className="text-muted">({formatDuration(c.ms)})</span>
                          </span>
                        ))}
                        {r.callAreas.length ? <p className="text-[10px] text-muted">{r.callAreas.map((a) => `${a.name}: ${formatDuration(a.ms)}`).join(' · ')}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
            {ACTIVITIES.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ACTIVITY_COLOR[c] }} />
                {ACTIVITY_LABEL[c]}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            {t(
              'an.legend2',
              '“Trabalhado” = online menos inativo e ausente. “Inativo” = sem mexer no mouse nem no teclado por 5 min ou mais, fora de call (só no app do Mac e do Windows). “Em call” = conectado em áudio e vídeo com pelo menos uma pessoa. Ao fechar a tampa ou o computador entrar em suspensão, o avatar sai do escritório e o tempo para de contar. Clique em uma pessoa para ver o dia hora a hora, a semana e cada entrada e saída.',
            )}
          </p>
        </>
      )}
      {person && data ? (
        <PersonStats officeId={officeId} personId={person.id} personName={person.name} date={live || period === 'day' ? date || data.to : data.to} span={live || period === 'day' ? 'day' : 'week'} onClose={() => setPerson(null)} />
      ) : null}
    </Page>
  );
}

// ---------- notas de reunião ----------
interface MeetingRow {
  id: string;
  areaName: string;
  startedByName: string;
  participants: string[];
  start: number;
  end: number | null;
  status: 'recording' | 'processing' | 'done' | 'failed';
  error: string | null;
}
interface MeetingDetail {
  meeting: MeetingRow;
  note: { transcript: string; summary: string | null; sentTo: string[]; sentAt: number | null; emailError: string | null } | null;
  tracks: { id: string; subjectName: string; startedAt: number; available: boolean }[];
}

function MeetingModal({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted: () => void }) {
  const s = useLoad(() => api.get<MeetingDetail>(`/api/meetings/${id}`), [id]);
  const d = s.data;
  const remove = async () => {
    if (!confirm(t('notes.deleteAsk', 'Excluir esta reunião, a transcrição e os áudios?'))) return;
    if (await act(() => api.del(`/api/meetings/${id}`), t('notes.deleted', 'Reunião excluída.'))) onDeleted();
  };
  return (
    <Modal
      title={d ? t('notes.detailTitle', '{{room}} — {{when}}', { room: d.meeting.areaName, when: fmtDate(d.meeting.start) }) : t('admin.navNotes', 'Notas de reunião')}
      wide
      onClose={onClose}
      footer={
        d ? (
          <>
            <Button variant="subtle" onClick={() => void remove()}>
              {t('app.delete', 'Excluir')}
            </Button>
            {d.note ? (
              <a href={`/api/meetings/${id}/transcript`}>
                <Button variant="ghost">{t('notes.download', 'Baixar transcrição (.md)')}</Button>
              </a>
            ) : null}
          </>
        ) : undefined
      }
    >
      <Loadable state={s}>
        {d ? (
          <div className="space-y-4 text-sm">
            <p className="text-xs text-muted">
              {t('notes.meta', 'Iniciada por {{by}} · participantes: {{who}}', { by: d.meeting.startedByName, who: d.meeting.participants.join(', ') || '—' })}
              {d.meeting.end ? ` · ${formatDuration(d.meeting.end - d.meeting.start)}` : ''}
            </p>
            {d.meeting.status === 'failed' ? <p className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-red-200">{d.meeting.error}</p> : null}
            {d.meeting.status === 'processing' ? <p className="text-warn">{t('notes.processing', 'Transcrevendo… isso pode levar alguns minutos.')}</p> : null}
            {d.note ? (
              <p className="text-xs">
                {d.note.sentAt ? <span className="text-ok">✓ {t('notes.sent', 'E-mail enviado para {{to}} em {{when}}', { to: d.note.sentTo.join(', '), when: fmtDate(d.note.sentAt) })}</span> : <span className="text-warn">⚠ {d.note.emailError ?? t('notes.notSent', 'E-mail não enviado.')}</span>}
              </p>
            ) : null}
            {d.tracks.length ? (
              <div className="space-y-1">
                <h4 className="font-semibold">{t('notes.audio', 'Áudio (uma faixa por pessoa)')}</h4>
                {d.tracks.map((tr) => (
                  <div key={tr.id} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-xs">{tr.subjectName}</span>
                    {tr.available ? <audio controls preload="none" src={`/api/meetings/${id}/audio/${tr.id}`} className="h-8 flex-1" /> : <span className="text-xs text-muted">{t('notes.audioGone', 'áudio apagado (prazo de retenção)')}</span>}
                  </div>
                ))}
              </div>
            ) : null}
            {d.note?.summary ? (
              <div>
                <h4 className="font-semibold">{t('notes.summary', 'Resumo')}</h4>
                <p className="whitespace-pre-wrap rounded-xl bg-panel-2 p-3">{d.note.summary}</p>
              </div>
            ) : null}
            {d.note ? (
              <div>
                <h4 className="font-semibold">{t('notes.transcript', 'Transcrição')}</h4>
                <pre className="max-h-[45vh] select-text overflow-auto whitespace-pre-wrap rounded-xl bg-panel-2 p-3 font-sans text-sm leading-relaxed">{d.note.transcript}</pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </Loadable>
    </Modal>
  );
}

export function Notes() {
  const { officeId, choose } = useOfficeChoice();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useLoad(() => (officeId ? api.get<MeetingRow[]>(`/api/offices/${officeId}/meetings${query ? `?q=${encodeURIComponent(query)}` : ''}`) : Promise.resolve([])), [officeId, query]);
  const badge = (m: MeetingRow) => {
    const map = { recording: ['red', t('notes.stRec', 'gravando')], processing: ['gold', t('notes.stProc', 'transcrevendo')], done: ['green', t('notes.stDone', 'pronta')], failed: ['red', t('notes.stFail', 'falhou')] } as const;
    const [color, text] = map[m.status];
    return <Badge color={color}>{text}</Badge>;
  };
  return (
    <Page
      title={t('admin.navNotes', 'Notas de reunião')}
      subtitle={t('notes.subtitle', 'Áudio transcrito no próprio servidor (Whisper), sem vídeo. Uma cópia fica aqui e outra vai por e-mail.')}
      actions={
        <>
          <OfficeSelect value={officeId} onChange={choose} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q.trim());
            }}
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('notes.search', 'Buscar no texto…')} className="w-56" />
            <Button type="submit" variant="ghost">
              {t('notes.searchBtn', 'Buscar')}
            </Button>
          </form>
        </>
      }
    >
      <Loadable state={list}>
        {(list.data ?? []).length === 0 ? (
          <Empty>{query ? t('notes.noHits', 'Nenhuma reunião com esse texto.') : t('notes.none', 'Nenhuma nota ainda. Dentro de uma sala de reunião, clique em “Iniciar notas de reunião”.')}</Empty>
        ) : (
          <div className="space-y-2">
            {(list.data ?? []).map((m) => (
              <div key={m.id} role="button" tabIndex={0} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4 hover:border-gold" onClick={() => setOpen(m.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(m.id)}>
                <div>
                  <p className="font-medium">
                    {m.areaName} <span className="text-xs text-muted">· {fmtDate(m.start)}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {m.participants.join(', ')}
                    {m.end ? ` · ${formatDuration(m.end - m.start)}` : ''}
                  </p>
                </div>
                {badge(m)}
              </div>
            ))}
          </div>
        )}
      </Loadable>
      {open ? (
        <MeetingModal
          id={open}
          onClose={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null);
            list.reload();
          }}
        />
      ) : null}
    </Page>
  );
}

// ---------- auditoria ----------
const ACTION_LABEL: Record<string, string> = {
  'user.create': 'Criou a conta',
  'user.delete': 'Removeu a conta',
  'user.role': 'Mudou o papel',
  'user.offices': 'Mudou os escritórios da pessoa',
  'user.password_reset': 'Redefiniu a senha',
  'user.totp_reset': 'Zerou a verificação em duas etapas',
  'invite.create': 'Gerou link de convite',
  'invite.revoke': 'Revogou link de convite',
  'office.create': 'Criou o escritório',
  'office.update': 'Alterou o escritório',
  'office.delete': 'Excluiu o escritório',
  'office.expand': 'Expandiu o escritório',
  'map.publish': 'Publicou o mapa',
  'map.restore': 'Restaurou versão do mapa',
  'desk.assign': 'Atribuiu mesa',
  'settings.smtp': 'Alterou o SMTP',
  'settings.google': 'Alterou as credenciais do Google',
  'settings.updates': 'Alterou as configurações de atualização',
  'server.update': 'Atualizou o servidor',
  'clients.force_update': 'Forçou a atualização dos apps',
  'meeting.delete': 'Excluiu uma reunião',
  'av.mute': 'Desligou o mic/câmera/tela de alguém para todos',
};

export function Audit() {
  const list = useLoad(() => api.get<{ id: string; actorName: string; action: string; target: string | null; meta: Record<string, unknown> | null; createdAt: number }[]>('/api/audit'), []);
  return (
    <Page title={t('admin.navAudit', 'Auditoria')} subtitle={t('audit.subtitle', 'Quem criou, removeu ou promoveu quem; convites gerados e revogados; mudanças de configuração.')}>
      <Loadable state={list}>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2">{t('audit.when', 'Quando')}</th>
                <th className="px-4 py-2">{t('audit.who', 'Quem')}</th>
                <th className="px-4 py-2">{t('audit.what', 'O quê')}</th>
                <th className="px-4 py-2">{t('audit.details', 'Detalhes')}</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((a) => (
                <tr key={a.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{fmtDate(a.createdAt)}</td>
                  <td className="px-4 py-2">{a.actorName}</td>
                  <td className="px-4 py-2">{ACTION_LABEL[a.action] ?? a.action}</td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {a.target ?? ''} {a.meta ? JSON.stringify(a.meta) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(list.data ?? []).length === 0 ? <p className="p-6 text-center text-sm text-muted">{t('audit.none', 'Nada registrado ainda.')}</p> : null}
        </Card>
      </Loadable>
    </Page>
  );
}
