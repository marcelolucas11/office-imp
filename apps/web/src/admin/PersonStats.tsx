// SPDX-License-Identifier: AGPL-3.0-only
// Estatísticas de uma pessoa no Painel do ADM: dia (hora a hora) e semana (dia a dia), filtro por
// categoria, linha do tempo e o registro de cada entrada e saída com o motivo (tampa, suspensão…).
import { useMemo, useState, type ReactNode } from 'react';
import {
  ACTIVITIES,
  ACTIVITY_COLOR,
  ACTIVITY_LABEL,
  CLIENT_LABEL,
  END_REASON_ICON,
  END_REASON_LABEL,
  ROLE_LABEL,
  SLEEP_REASONS,
  START_REASON_LABEL,
  addDays,
  formatDuration,
  localDate,
  type Activity,
  type EndReason,
  type Role,
  type StartReason,
} from '@office-imp/shared';
import { Badge, Button, Input, Modal, Tabs, cx } from '@office-imp/ui';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { Loadable, useLoad } from './util';

type Ms = Record<Activity, number>;
interface Session {
  start: number;
  end: number | null;
  startReason: string;
  endReason: string | null;
  client: string | null;
}
interface Stats {
  span: 'day' | 'week';
  date: string;
  from: number;
  to: number;
  now: number;
  timezone: string;
  name: string;
  role: string;
  online: boolean;
  totals: Ms;
  onlineMs: number;
  workMs: number;
  callMs: number;
  sleepExits: number;
  buckets: { start: number; end: number; label: string; date?: string; ms: Ms }[];
  segments: { start: number; end: number; act: Activity }[];
  sessions: Session[];
  calls: { with: string; area: string; start: number; end: number | null }[];
  days: { date: string; first: number | null; last: number | null; stillOnline: boolean; onlineMs: number; workMs: number; ms: Ms; sleepExits: number }[];
}

const WORK: Activity[] = ['AVAILABLE', 'CALL', 'BUSY', 'DND'];
const fmtDay = (d: string) => d.split('-').reverse().join('/');
const sum = (ms: Ms, cats: Activity[]) => cats.reduce((n, c) => n + (ms[c] ?? 0), 0);

/** Duração para números e listas, sem segundos a partir de 1 minuto: "7h 59min", "45min", "40s". */
function dur(ms: number): string {
  if (ms < 60000) return formatDuration(ms);
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}min` : `${m}min`;
}

/** Duração curta para eixos e rótulos: "45min", "3h", "7h30". */
function short(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

export function PersonStats({ officeId, personId, personName, date: initialDate, span: initialSpan, onClose }: { officeId: string; personId: string; personName: string; date: string; span: 'day' | 'week'; onClose: () => void }) {
  const [span, setSpan] = useState(initialSpan);
  const [date, setDate] = useState(initialDate);
  const [cats, setCats] = useState<Activity[]>(ACTIVITIES);
  const s = useLoad(() => api.get<Stats>(`/api/offices/${officeId}/analytics/person/${encodeURIComponent(personId)}?date=${date}&span=${span}`), [officeId, personId, date, span]);
  const st = s.data;
  const tz = st?.timezone;
  const hm = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const today = st ? localDate(st.now, st.timezone) : '';
  const step = span === 'week' ? 7 : 1;
  const toggle = (c: Activity) => setCats((cur) => (cur.includes(c) ? (cur.length === 1 ? cur : cur.filter((x) => x !== c)) : ACTIVITIES.filter((x) => x === c || cur.includes(x))));
  const allOn = cats.length === ACTIVITIES.length;

  return (
    <Modal title={t('ps.title', 'Estatísticas — {{name}}', { name: st?.name ?? personName })} wide="full" onClose={onClose}>
      <div className="space-y-4" data-testid="person-stats">
        {/* período */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Tabs
              tabs={[
                { id: 'day', label: t('ps.day', 'Dia (hora a hora)') },
                { id: 'week', label: t('ps.week', 'Semana (dia a dia)') },
              ]}
              value={span}
              onChange={setSpan}
            />
            {st?.role ? <Badge color="gray">{ROLE_LABEL[st.role as Role] ?? st.role}</Badge> : null}
            {st?.online ? <Badge color="green">{t('ps.onlineNow', 'no escritório agora')}</Badge> : null}
          </div>
          <div className="flex items-center gap-2">
            <Button small variant="ghost" aria-label={t('ps.prev', 'Anterior')} onClick={() => setDate(addDays(date, -step))}>
              ‹
            </Button>
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
            <Button small variant="ghost" aria-label={t('ps.next', 'Próximo')} disabled={Boolean(today) && addDays(date, step) > today && date >= today} onClick={() => setDate(addDays(date, step))}>
              ›
            </Button>
            {today && date !== today ? (
              <Button small variant="subtle" onClick={() => setDate(today)}>
                {t('ps.today', 'Hoje')}
              </Button>
            ) : null}
          </div>
        </div>

        <Loadable state={s}>
          {st ? (
            <>
              <p className="text-xs text-muted">
                {st.span === 'day'
                  ? t('ps.rangeDay', '{{d}} · fuso {{tz}}', { d: fmtDay(st.date), tz: st.timezone })
                  : t('ps.rangeWeek', 'Semana de {{a}} a {{b}} · fuso {{tz}}', { a: fmtDay(st.days[0]?.date ?? st.date), b: fmtDay(st.days[6]?.date ?? st.date), tz: st.timezone })}
              </p>

              {/* números */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                <Tile label={t('ps.kOnline', 'Logado (online)')} value={dur(st.onlineMs)} />
                <Tile label={t('ps.kWork', 'Trabalhado')} value={dur(st.workMs)} hint={t('ps.kWorkHint', 'online menos inativo e ausente')} />
                <Tile label={ACTIVITY_LABEL.CALL} value={dur(st.totals.CALL)} dot={ACTIVITY_COLOR.CALL} />
                <Tile label={ACTIVITY_LABEL.IDLE} value={dur(st.totals.IDLE)} dot={ACTIVITY_COLOR.IDLE} />
                <Tile label={ACTIVITY_LABEL.DND} value={dur(st.totals.DND)} dot={ACTIVITY_COLOR.DND} />
                <Tile label={ACTIVITY_LABEL.AWAY} value={dur(st.totals.AWAY)} dot={ACTIVITY_COLOR.AWAY} />
                <Tile label={t('ps.kSleep', 'Saídas por tampa/suspensão')} value={String(st.sleepExits)} />
              </div>

              {/* filtro */}
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('ps.filter', 'Filtrar categorias')}>
                <span className="text-xs text-muted">{t('ps.show', 'Mostrar:')}</span>
                {ACTIVITIES.map((c) => {
                  const on = cats.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(c)}
                      className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors', on ? 'border-line bg-panel-2 text-stone-100' : 'border-line/50 text-muted opacity-60 hover:opacity-100')}
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: on ? ACTIVITY_COLOR[c] : 'transparent', border: `2px solid ${ACTIVITY_COLOR[c]}` }} />
                      {ACTIVITY_LABEL[c]}
                      <span className="tabular-nums text-muted">{short(st.totals[c])}</span>
                    </button>
                  );
                })}
                <span className="mx-1 h-4 w-px bg-line" />
                <button type="button" className={cx('rounded-full px-3 py-1 text-xs', allOn ? 'text-muted' : 'text-gold hover:underline')} onClick={() => setCats(ACTIVITIES)}>
                  {t('ps.all', 'Tudo')}
                </button>
                <button type="button" className="rounded-full px-3 py-1 text-xs text-gold hover:underline" onClick={() => setCats(WORK)}>
                  {t('ps.onlyWork', 'Só trabalho')}
                </button>
                <button type="button" className="rounded-full px-3 py-1 text-xs text-gold hover:underline" onClick={() => setCats(['IDLE', 'AWAY'])}>
                  {t('ps.onlyIdle', 'Só parado')}
                </button>
                {!allOn ? <span className="ml-auto text-xs text-muted">{t('ps.selected', 'Selecionado: {{v}}', { v: dur(sum(st.totals, cats)) })}</span> : null}
              </div>

              {st.onlineMs === 0 && st.sessions.length === 0 ? (
                <p className="rounded-xl bg-panel-2 p-6 text-center text-sm text-muted">{st.span === 'day' ? t('ps.noneDay', 'Não entrou no escritório neste dia.') : t('ps.noneWeek', 'Não entrou no escritório nesta semana.')}</p>
              ) : st.span === 'day' ? (
                <DayView st={st} cats={cats} hm={hm} />
              ) : (
                <WeekView
                  st={st}
                  cats={cats}
                  hm={hm}
                  openDay={(d) => {
                    setDate(d);
                    setSpan('day');
                  }}
                />
              )}
            </>
          ) : null}
        </Loadable>
      </div>
    </Modal>
  );
}

function Tile({ label, value, hint, dot }: { label: string; value: string; hint?: string; dot?: string }) {
  return (
    <div className="rounded-xl bg-panel-2 p-3" title={hint}>
      <p className="text-lg font-semibold tabular-nums text-stone-100">{value}</p>
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        {dot ? <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} /> : null}
        {label}
      </p>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-gold">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

function Legend({ cats }: { cats: Activity[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-muted">
      {cats.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ACTIVITY_COLOR[c] }} />
          {ACTIVITY_LABEL[c]}
        </span>
      ))}
    </div>
  );
}

// ---------- gráfico de barras empilhadas ----------

/**
 * Barras empilhadas na ordem fixa das categorias. `max` é o topo do eixo (60 min por hora, ou o
 * maior dia da semana arredondado). Passe o mouse para ver os números; clique (se houver) abre.
 */
function StackedBars({ buckets, cats, max, ticks, tickLabel, onPick, testId }: { buckets: { label: string; ms: Ms; sub?: string }[]; cats: Activity[]; max: number; ticks: number[]; tickLabel: (v: number) => string; onPick?: (i: number) => void; testId?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 220;
  const padL = 60;
  const padB = 34;
  const padT = 26;
  const plotW = W - padL - 8;
  const plotH = H - padB - padT;
  const n = buckets.length || 1;
  const slot = plotW / n;
  const barW = Math.min(56, Math.max(8, slot * 0.62));
  const y = (v: number) => padT + plotH - (Math.min(v, max) / max) * plotH;
  const labelEvery = n > 16 ? 2 : 1;
  const hb = hover !== null ? buckets[hover] : null;
  return (
    <div className="relative" data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t('ps.chart', 'Gráfico de barras empilhadas')} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - 8} y1={y(v)} y2={y(v)} stroke="#2c2c36" strokeWidth={1} />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#9b9ba8">
              {tickLabel(v)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          let acc = 0;
          const parts = cats.filter((c) => b.ms[c] > 0);
          const total = sum(b.ms, cats);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onClick={() => onPick?.(i)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill={hover === i ? 'rgba(215,184,112,0.07)' : 'transparent'} />
              {parts.map((c, k) => {
                const y0 = y(acc);
                acc += b.ms[c];
                const y1 = y(acc);
                const h = Math.max(0, y0 - y1 - (k < parts.length - 1 ? 2 : 0));
                if (h < 0.5) return null;
                const top = k === parts.length - 1;
                const r = top ? Math.min(4, h, barW / 2) : 0;
                const yy = y0 - h;
                return top ? (
                  <path key={c} d={`M${x},${y0} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy + r} V${y0} Z`} fill={ACTIVITY_COLOR[c]} />
                ) : (
                  <rect key={c} x={x} y={yy} width={barW} height={h} fill={ACTIVITY_COLOR[c]} />
                );
              })}
              {total > 0 && n <= 7 ? (
                <text x={x + barW / 2} y={y(total) - 6} textAnchor="middle" fontSize={12} fill="#e7e5e4">
                  {short(total)}
                </text>
              ) : null}
              {i % labelEvery === 0 ? (
                <text x={padL + i * slot + slot / 2} y={H - padB + 16} textAnchor="middle" fontSize={12} fill={hover === i ? '#d7b870' : '#9b9ba8'}>
                  {b.label}
                </text>
              ) : null}
              {b.sub ? (
                <text x={padL + i * slot + slot / 2} y={H - padB + 30} textAnchor="middle" fontSize={11} fill="#9b9ba8">
                  {b.sub}
                </text>
              ) : null}
            </g>
          );
        })}
        <line x1={padL} x2={W - 8} y1={padT + plotH} y2={padT + plotH} stroke="#3a3a46" strokeWidth={1} />
      </svg>
      {hb && hover !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-line bg-ink/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: `${Math.min(78, Math.max(2, ((padL + hover * slot + slot / 2) / W) * 100 - 8))}%` }}
        >
          <p className="mb-1 font-semibold text-gold">{hb.label}</p>
          {cats.map((c) =>
            hb.ms[c] > 0 ? (
              <p key={c} className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ACTIVITY_COLOR[c] }} />
                  {ACTIVITY_LABEL[c]}
                </span>
                <span className="tabular-nums">{dur(hb.ms[c])}</span>
              </p>
            ) : null,
          )}
          <p className="mt-1 flex justify-between gap-4 border-t border-line pt-1 text-muted">
            <span>{t('ps.total', 'Total')}</span>
            <span className="tabular-nums">{dur(sum(hb.ms, cats))}</span>
          </p>
          {onPick ? <p className="mt-1 text-[10px] text-muted">{t('ps.clickDay', 'Clique para ver o dia hora a hora')}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------- dia ----------

function DayView({ st, cats, hm }: { st: Stats; cats: Activity[]; hm: (ts: number) => string }) {
  // mostra só as horas com atividade (com folga), mas no mínimo das 8h às 18h
  const used = st.buckets.map((b, i) => (sum(b.ms, ACTIVITIES) > 0 ? i : -1)).filter((i) => i >= 0);
  const sessionHours = st.sessions.flatMap((p) => [p.start, p.end ?? st.now]).map((ts) => st.buckets.findIndex((b) => ts >= b.start && ts < b.end)).filter((i) => i >= 0);
  const all = [...used, ...sessionHours];
  const lo = Math.max(0, Math.min(8, ...(all.length ? [Math.min(...all) - 1] : [8])));
  const hi = Math.min(st.buckets.length - 1, Math.max(18, ...(all.length ? [Math.max(...all) + 1] : [18])));
  const shown = st.buckets.slice(lo, hi + 1);
  const winFrom = shown[0]?.start ?? st.from;
  const winTo = shown[shown.length - 1]?.end ?? st.to;

  return (
    <div className="space-y-4">
      <Section title={t('ps.hourly', 'Hora a hora')} right={<Legend cats={cats} />}>
        <StackedBars buckets={shown} cats={cats} max={3600_000} ticks={[0, 900_000, 1800_000, 2700_000, 3600_000]} tickLabel={(v) => `${Math.round(v / 60000)}min`} testId="ps-hourly" />
      </Section>
      <Section title={t('ps.timeline', 'Linha do tempo do dia')}>
        <Ribbon st={st} cats={cats} from={winFrom} to={winTo} hm={hm} />
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('ps.events', 'Entradas e saídas')}>
          <Events sessions={st.sessions} now={st.now} hm={hm} />
        </Section>
        <Section title={t('an.callList', 'Calls do dia')}>
          {st.calls.length === 0 ? <p className="text-xs text-muted">{t('an.noCalls', 'Nenhuma call neste dia.')}</p> : null}
          <div className="max-h-72 space-y-1 overflow-auto text-sm">
            {st.calls.map((c, i) => (
              <div key={i} className="flex justify-between gap-3 rounded bg-panel-2 px-3 py-1">
                <span>
                  {c.with} <span className="text-xs text-muted">· {c.area}</span>
                </span>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted">
                  {hm(c.start)} – {c.end ? hm(c.end) : t('an.now', 'agora')} ({dur(Math.min(c.end ?? st.now, st.to) - c.start)})
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

/** Uma faixa contínua com a categoria de cada momento e marcadores de entrada e saída. */
function Ribbon({ st, cats, from, to, hm }: { st: Stats; cats: Activity[]; from: number; to: number; hm: (ts: number) => string }) {
  const [tip, setTip] = useState<{ x: number; text: ReactNode } | null>(null);
  const pct = (ts: number) => Math.max(0, Math.min(100, ((ts - from) / (to - from)) * 100));
  const hours: number[] = [];
  for (let ts = from; ts <= to; ts += 3600_000) hours.push(ts);
  const marks = st.sessions.flatMap((p, i) => [
    { ts: p.start, kind: 'in' as const, s: p, key: `i${i}` },
    ...(p.end !== null ? [{ ts: p.end, kind: 'out' as const, s: p, key: `o${i}` }] : []),
  ]).filter((m) => m.ts >= from && m.ts <= to);
  return (
    <div className="relative select-none" onMouseLeave={() => setTip(null)}>
      {/* marcadores */}
      <div className="relative h-7">
        {marks.map((m) => {
          const reason = m.kind === 'out' ? (m.s.endReason as EndReason) : null;
          const icon = m.kind === 'in' ? '▶' : (END_REASON_ICON[reason!] ?? '■');
          const sleep = reason && SLEEP_REASONS.includes(reason);
          const text = m.kind === 'in' ? `${hm(m.ts)} · ${START_REASON_LABEL[m.s.startReason as StartReason] ?? START_REASON_LABEL.open}` : `${hm(m.ts)} · ${END_REASON_LABEL[reason!] ?? reason}`;
          return (
            <span
              key={m.key}
              className={cx('absolute top-0 -translate-x-1/2 cursor-default rounded px-0.5 text-sm leading-6', m.kind === 'in' ? 'text-ok' : sleep ? 'text-gold' : 'text-muted')}
              style={{ left: `${pct(m.ts)}%` }}
              onMouseEnter={() => setTip({ x: pct(m.ts), text })}
              aria-label={text}
            >
              {icon}
            </span>
          );
        })}
      </div>
      {/* faixa */}
      <div className="relative h-8 overflow-hidden rounded-md bg-panel-3">
        {st.segments
          .filter((g) => g.end > from && g.start < to)
          .map((g, i) => {
            const on = cats.includes(g.act);
            return (
              <div
                key={i}
                className="absolute top-0 h-full"
                style={{ left: `${pct(g.start)}%`, width: `${Math.max(0.15, pct(g.end) - pct(g.start))}%`, background: ACTIVITY_COLOR[g.act], opacity: on ? 1 : 0.15 }}
                onMouseEnter={() => setTip({ x: pct((g.start + g.end) / 2), text: `${ACTIVITY_LABEL[g.act]} · ${hm(g.start)} – ${hm(g.end)} (${dur(g.end - g.start)})` })}
              />
            );
          })}
        {/* fronteiras de sessão (fora do escritório entre elas) */}
        {st.sessions.map((p, i) => (p.end !== null && p.end > from && p.end < to ? <div key={i} className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${pct(p.end)}%` }} /> : null))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-muted">
        {hours.map((ts, i) =>
          i % (hours.length > 14 ? 2 : 1) === 0 ? (
            <span key={ts} className="absolute -translate-x-1/2" style={{ left: `${pct(ts)}%` }}>
              {hm(ts).slice(0, 2)}h
            </span>
          ) : null,
        )}
      </div>
      {tip ? (
        <div className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-ink/95 px-2.5 py-1 text-xs shadow-xl" style={{ left: `${Math.max(12, Math.min(88, tip.x))}%` }}>
          {tip.text}
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-muted">
        {t('ps.ribbonHelp', '▶ entrou · 💻 fechou a tampa · 💤 suspensão · 🌙 suspenso pelo menu · 🚪 saiu · 📶 caiu a internet. Faixa cinza-escura = fora do escritório.')}
      </p>
    </div>
  );
}

/** Lista cronológica: cada entrada e cada saída com o motivo, e quanto tempo ficou fora. */
function Events({ sessions, now, hm, showDate }: { sessions: Session[]; now: number; hm: (ts: number) => string; showDate?: (ts: number) => string }) {
  if (!sessions.length) return <p className="text-xs text-muted">{t('ps.noEvents', 'Nenhuma entrada no período.')}</p>;
  const rows: ReactNode[] = [];
  sessions.forEach((p, i) => {
    const prev = sessions[i - 1];
    if (prev?.end) {
      rows.push(
        <li key={`g${i}`} className="py-0.5 pl-7 text-[11px] text-muted">
          {t('ps.away', 'fora do escritório por {{d}}', { d: dur(p.start - prev.end) })}
        </li>,
      );
    }
    rows.push(
      <li key={`i${i}`} className="flex items-start gap-2 rounded-lg bg-panel-2 px-3 py-1.5">
        <span className="w-4 text-ok">▶</span>
        <span className={cx('shrink-0 tabular-nums text-stone-100', showDate ? 'w-36' : 'w-12')}>{showDate ? showDate(p.start) : hm(p.start)}</span>
        <span className="flex-1">
          {START_REASON_LABEL[p.startReason as StartReason] ?? START_REASON_LABEL.open}
          {p.client ? <span className="text-xs text-muted"> · {CLIENT_LABEL[p.client] ?? p.client}</span> : null}
        </span>
      </li>,
    );
    const reason = p.endReason as EndReason | null;
    const sleep = reason ? SLEEP_REASONS.includes(reason) : false;
    rows.push(
      <li key={`o${i}`} className={cx('flex items-start gap-2 rounded-lg px-3 py-1.5', sleep ? 'border border-gold/40 bg-gold/10' : 'bg-panel-2')}>
        <span className="w-4">{p.end === null ? '🟢' : (END_REASON_ICON[reason!] ?? '■')}</span>
        <span className={cx('shrink-0 tabular-nums text-stone-100', showDate ? 'w-36' : 'w-12')}>{p.end === null ? '—' : showDate ? showDate(p.end) : hm(p.end)}</span>
        <span className="flex-1">
          {p.end === null ? t('ps.stillIn', 'Ainda no escritório') : (END_REASON_LABEL[reason!] ?? reason)}
          {p.end !== null && sleep ? <span className="text-xs text-gold"> · {t('ps.avatarLeft', 'o avatar saiu do escritório e o tempo parou de contar')}</span> : null}
          <span className="block text-[11px] text-muted">{t('ps.sessionLen', 'ficou {{d}}', { d: dur((p.end ?? now) - p.start) })}</span>
        </span>
      </li>,
    );
  });
  return <ol className="max-h-72 space-y-1 overflow-auto text-sm">{rows}</ol>;
}

// ---------- semana ----------

function WeekView({ st, cats, hm, openDay }: { st: Stats; cats: Activity[]; hm: (ts: number) => string; openDay: (d: string) => void }) {
  const maxDay = Math.max(...st.buckets.map((b) => sum(b.ms, cats)), 3600_000);
  const topH = Math.max(1, Math.ceil(maxDay / 3600_000 / 2) * 2);
  const ticks = useMemo(() => {
    const stepH = topH <= 4 ? 1 : topH <= 10 ? 2 : 4;
    const out: number[] = [];
    for (let h = 0; h <= topH; h += stepH) out.push(h * 3600_000);
    return out;
  }, [topH]);
  const worked = st.days.filter((d) => d.onlineMs > 0);
  const avg = worked.length ? worked.reduce((n, d) => n + d.workMs, 0) / worked.length : 0;
  const dayFmt = (ts: number) => new Date(ts).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: st.timezone });
  return (
    <div className="space-y-4">
      <Section title={t('ps.weekly', 'Horas por dia')} right={<span className="text-xs text-muted">{t('ps.avg', 'Média trabalhada nos dias com entrada: {{v}}', { v: dur(avg) })}</span>}>
        <StackedBars
          buckets={st.buckets.map((b, i) => ({ label: b.label, ms: b.ms, sub: st.days[i]?.sleepExits ? `💤 ${st.days[i].sleepExits}` : undefined }))}
          cats={cats}
          max={topH * 3600_000}
          ticks={ticks}
          tickLabel={(v) => `${Math.round(v / 3600_000)}h`}
          onPick={(i) => openDay(st.buckets[i].date!)}
          testId="ps-weekly"
        />
        <div className="mt-2">
          <Legend cats={cats} />
        </div>
      </Section>
      <Section title={t('ps.weekTable', 'Resumo dos dias')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">{t('ps.colDay', 'Dia')}</th>
                <th className="px-3 py-2">{t('ps.colFirst', 'Entrada')}</th>
                <th className="px-3 py-2">{t('ps.colLast', 'Saída')}</th>
                <th className="px-3 py-2">{t('ps.colOnline', 'Logado')}</th>
                <th className="px-3 py-2">{t('ps.colWork', 'Trabalhado')}</th>
                {ACTIVITIES.filter((c) => cats.includes(c)).map((c) => (
                  <th key={c} className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ACTIVITY_COLOR[c] }} />
                      {ACTIVITY_LABEL[c]}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2">{t('ps.colSleep', 'Tampa/susp.')}</th>
              </tr>
            </thead>
            <tbody>
              {st.days.map((d, i) => (
                <tr key={d.date} className={cx('cursor-pointer border-b border-line/60 last:border-0 hover:bg-panel-2', d.onlineMs === 0 && 'text-muted')} onClick={() => openDay(d.date)}>
                  <td className="px-3 py-2 whitespace-nowrap">{st.buckets[i]?.label}</td>
                  <td className="px-3 py-2 tabular-nums">{d.first ? hm(d.first) : '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{d.stillOnline ? t('an.now', 'agora') : d.last ? hm(d.last) : '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{d.onlineMs ? short(d.onlineMs) : '—'}</td>
                  <td className="px-3 py-2 font-medium tabular-nums">{d.workMs ? short(d.workMs) : '—'}</td>
                  {ACTIVITIES.filter((c) => cats.includes(c)).map((c) => (
                    <td key={c} className="px-3 py-2 tabular-nums">
                      {d.ms[c] ? short(d.ms[c]) : '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2 tabular-nums">{d.sleepExits || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title={t('ps.weekEvents', 'Entradas e saídas da semana')}>
        <Events sessions={st.sessions} now={st.now} hm={hm} showDate={dayFmt} />
      </Section>
    </div>
  );
}
