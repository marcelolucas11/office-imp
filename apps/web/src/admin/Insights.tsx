// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useState } from 'react';
import { ROLE_LABEL, STATUS_COLOR, STATUS_LABEL, addDays, formatDuration, localDate, type PersonRow, type Role } from '@office-imp/shared';
import { Badge, Button, Card, Empty, Input, Modal, Select, Spinner } from '@office-imp/ui';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { Loadable, OfficeSelect, Page, act, fmtDate, useLoad, useOfficeChoice } from './util';

type Tracked = 'AVAILABLE' | 'BUSY' | 'DND' | 'AWAY';
const TRACKED: Tracked[] = ['AVAILABLE', 'BUSY', 'DND', 'AWAY'];
interface AnalyticsData {
  from: string;
  to: string;
  timezone: string;
  now: number;
  rows: PersonRow[];
}

function StatusBar({ row }: { row: PersonRow }) {
  const total = TRACKED.reduce((n, s) => n + (row.status[s] ?? 0), 0);
  if (!total) return <div className="h-3 w-full rounded-full bg-panel-3" />;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-panel-3" title={TRACKED.map((s) => `${STATUS_LABEL[s]}: ${formatDuration(row.status[s] ?? 0)}`).join(' · ')}>
      {TRACKED.map((s) => (row.status[s] ? <div key={s} style={{ width: `${(row.status[s] / total) * 100}%`, background: STATUS_COLOR[s] }} /> : null))}
    </div>
  );
}

interface Timeline {
  from: number;
  to: number;
  name: string;
  presence: { start: number; end: number | null }[];
  statuses: { status: Tracked; start: number; end: number | null }[];
  calls: { with: string; area: string; start: number; end: number | null }[];
}

function PersonModal({ officeId, row, date, onClose }: { officeId: string; row: PersonRow; date: string; onClose: () => void }) {
  const s = useLoad(() => api.get<Timeline>(`/api/offices/${officeId}/analytics/person/${encodeURIComponent(row.id)}?date=${date}`), [officeId, row.id, date]);
  const tl = s.data;
  const now = Date.now();
  const pos = (ts: number) => (tl ? Math.max(0, Math.min(100, ((ts - tl.from) / (tl.to - tl.from)) * 100)) : 0);
  const bar = (start: number, end: number | null, color: string, title: string, key: string) => {
    const e = Math.min(end ?? now, tl!.to);
    return <div key={key} title={title} className="absolute top-0 h-full rounded-sm" style={{ left: `${pos(start)}%`, width: `${Math.max(0.3, pos(e) - pos(start))}%`, background: color }} />;
  };
  const hm = (ts: number | null) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : t('an.now', 'agora'));
  return (
    <Modal title={t('an.personTitle', '{{name}} — {{date}}', { name: row.name, date: date.split('-').reverse().join('/') })} wide onClose={onClose}>
      <Loadable state={s}>
        {tl ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-center text-sm">
              <Stat label={t('an.online', 'Online')} value={formatDuration(row.onlineMs)} />
              <Stat label={t('an.active', 'Ativo')} value={formatDuration(row.activeMs)} />
              <Stat label={t('an.inCall', 'Em call')} value={formatDuration(row.callMs)} />
              <Stat label={t('an.away', 'Ausente')} value={formatDuration(row.status.AWAY ?? 0)} />
            </div>
            <div className="space-y-2">
              {[
                { label: t('an.rowPresence', 'Presença'), items: tl.presence.map((p, i) => bar(p.start, p.end, '#d7b870', `${hm(p.start)} – ${hm(p.end)}`, `p${i}`)) },
                { label: t('an.rowStatus', 'Status'), items: tl.statuses.map((p, i) => bar(p.start, p.end, STATUS_COLOR[p.status], `${STATUS_LABEL[p.status]}: ${hm(p.start)} – ${hm(p.end)}`, `s${i}`)) },
                { label: t('an.rowCalls', 'Calls'), items: tl.calls.map((p, i) => bar(p.start, p.end, '#38bdf8', `${p.with} (${p.area}): ${hm(p.start)} – ${hm(p.end)}`, `c${i}`)) },
              ].map((r) => (
                <div key={r.label} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted">{r.label}</span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded bg-panel-3">{r.items}</div>
                </div>
              ))}
              <div className="flex justify-between pl-[92px] text-[10px] text-muted">
                {[0, 6, 12, 18, 24].map((h) => (
                  <span key={h}>{String(h).padStart(2, '0')}h</span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-semibold">{t('an.callList', 'Calls do dia')}</h4>
              {tl.calls.length === 0 ? <p className="text-xs text-muted">{t('an.noCalls', 'Nenhuma call neste dia.')}</p> : null}
              <div className="max-h-56 space-y-1 overflow-auto text-sm">
                {tl.calls.map((c, i) => (
                  <div key={i} className="flex justify-between gap-3 rounded bg-panel-2 px-3 py-1">
                    <span>
                      {c.with} <span className="text-xs text-muted">· {c.area}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {hm(c.start)} – {hm(c.end)} ({formatDuration(Math.min(c.end ?? now, tl.to) - c.start)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Loadable>
    </Modal>
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
                    <th className="px-4 py-2">{t('an.colActive', 'Ativo')}</th>
                    <th className="w-56 px-4 py-2">
                      {t('an.colStatus', 'Status')}
                      <span className="ml-2 font-normal">
                        {TRACKED.map((s) => (
                          <span key={s} className="mr-1.5 inline-flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                          </span>
                        ))}
                      </span>
                    </th>
                    <th className="px-4 py-2">{t('an.colCall', 'Em call')}</th>
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
                            </span>
                          ) : (
                            <span className="text-muted">{t('an.offline', 'offline')}</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-4 py-2 tabular-nums">{formatDuration(r.onlineMs)}</td>
                      <td className="px-4 py-2 tabular-nums">{formatDuration(r.activeMs)}</td>
                      <td className="px-4 py-2">
                        <StatusBar row={r} />
                        <p className="mt-1 text-[10px] text-muted">
                          {formatDuration(r.status.AVAILABLE ?? 0)} · {formatDuration(r.status.BUSY ?? 0)} · {formatDuration(r.status.DND ?? 0)}
                        </p>
                      </td>
                      <td className="px-4 py-2 tabular-nums">{formatDuration(r.callMs)}</td>
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
          <p className="text-[11px] text-muted">
            {t(
              'an.legend',
              'Verde: disponível · amarelo: ocupado · vermelho: não incomodar · cinza: ausente. “Ativo” = online menos ausente. “Em call” = conectado em áudio e vídeo com pelo menos uma pessoa (por proximidade ou na mesma sala privada). Clique em uma pessoa para ver a linha do tempo do dia.',
            )}
          </p>
        </>
      )}
      {person && data ? <PersonModal officeId={officeId} row={person} date={live || period === 'day' ? (date || data.to) : data.to} onClose={() => setPerson(null)} /> : null}
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
