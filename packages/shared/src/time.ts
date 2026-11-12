// SPDX-License-Identifier: AGPL-3.0-only
/** Deslocamento (ms) do fuso `tz` em relação ao UTC no instante `ts`. */
export function tzOffsetMs(ts: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(ts))) if (p.type !== 'literal') parts[p.type] = Number(p.value);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Data local (YYYY-MM-DD) de um instante no fuso `tz`. */
export function localDate(ts: number, tz: string): string {
  const d = new Date(ts + tzOffsetMs(ts, tz));
  return d.toISOString().slice(0, 10);
}

/** Início (epoch ms UTC) do dia local `date` (YYYY-MM-DD) no fuso `tz`. */
export function dayStart(date: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let start = guess - tzOffsetMs(guess, tz);
  start = guess - tzOffsetMs(start, tz);
  return start;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** [início, fim) em epoch ms do intervalo de dias locais [from, to] (inclusive). */
export function dayRange(from: string, to: string, tz: string): [number, number] {
  return [dayStart(from, tz), dayStart(addDays(to, 1), tz)];
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
