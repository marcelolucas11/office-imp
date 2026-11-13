// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAY_PERIODS, DAY_PERIOD_START, DEFAULT_TIMEZONE, Floor, FLOOR_LABEL, Wall, WALL_LABEL, dayPeriod, localHour } from '../src';

const at = (iso: string) => new Date(iso);

describe('período do dia (dayPeriod)', () => {
  afterEach(() => vi.useRealTimers());

  it('segue as faixas de horário no fuso de São Paulo (UTC−3)', () => {
    const tz = 'America/Sao_Paulo';
    expect(dayPeriod(at('2026-11-13T07:59:59Z'), tz)).toBe('night'); // 04:59
    expect(dayPeriod(at('2026-11-13T08:00:00Z'), tz)).toBe('dawn'); // 05:00
    expect(dayPeriod(at('2026-11-13T09:59:59Z'), tz)).toBe('dawn'); // 06:59
    expect(dayPeriod(at('2026-11-13T10:00:00Z'), tz)).toBe('day'); // 07:00
    expect(dayPeriod(at('2026-11-13T15:00:00Z'), tz)).toBe('day'); // 12:00
    expect(dayPeriod(at('2026-11-13T19:59:59Z'), tz)).toBe('day'); // 16:59
    expect(dayPeriod(at('2026-11-13T20:00:00Z'), tz)).toBe('dusk'); // 17:00
    expect(dayPeriod(at('2026-11-13T21:59:59Z'), tz)).toBe('dusk'); // 18:59
    expect(dayPeriod(at('2026-11-13T22:00:00Z'), tz)).toBe('night'); // 19:00
    expect(dayPeriod(at('2026-11-14T03:00:00Z'), tz)).toBe('night'); // 00:00
  });

  it('o mesmo instante dá períodos diferentes em fusos diferentes', () => {
    const now = at('2026-11-13T21:00:00Z');
    expect(dayPeriod(now, 'America/Sao_Paulo')).toBe('dusk'); // 18:00
    expect(dayPeriod(now, 'America/Santiago')).toBe('dusk'); // 18:00 (horário de verão, UTC−3)
    expect(dayPeriod(now, 'America/Manaus')).toBe('dusk'); // 17:00
    expect(dayPeriod(now, 'America/Los_Angeles')).toBe('day'); // 13:00
    expect(dayPeriod(now, 'Europe/Lisbon')).toBe('night'); // 21:00
    expect(dayPeriod(now, 'Asia/Tokyo')).toBe('dawn'); // 06:00 do dia seguinte
    expect(dayPeriod(now, 'Asia/Kolkata')).toBe('night'); // 02:30 (fuso com meia hora)
    expect(dayPeriod(now, 'UTC')).toBe('night');
  });

  it('respeita o horário de verão do fuso', () => {
    // Nova York: UTC−4 em julho, UTC−5 em janeiro. 11:30Z = 07:30 no verão e 06:30 no inverno
    expect(dayPeriod(at('2026-07-01T11:30:00Z'), 'America/New_York')).toBe('day');
    expect(dayPeriod(at('2026-01-15T11:30:00Z'), 'America/New_York')).toBe('dawn');
  });

  it('aceita Date ou epoch em ms e não depende do fuso da máquina', () => {
    const ts = Date.UTC(2026, 10, 13, 15, 0, 0);
    expect(dayPeriod(ts, 'America/Sao_Paulo')).toBe(dayPeriod(new Date(ts), 'America/Sao_Paulo'));
    expect(localHour(ts, 'America/Sao_Paulo')).toBe(12);
    expect(localHour(ts + 30 * 60000, 'Asia/Kolkata')).toBe(21);
  });

  it('fuso vazio ou inválido cai no padrão', () => {
    const ts = at('2026-11-13T15:00:00Z');
    expect(dayPeriod(ts, '')).toBe(dayPeriod(ts, DEFAULT_TIMEZONE));
    expect(dayPeriod(ts, 'Marte/Olympus')).toBe(dayPeriod(ts, DEFAULT_TIMEZONE));
  });

  it('com relógio falso, o período muda conforme o relógio avança', () => {
    vi.useFakeTimers();
    const tz = 'America/Sao_Paulo';
    vi.setSystemTime(at('2026-11-13T07:30:00Z')); // 04:30
    const seen: string[] = [];
    for (let i = 0; i < 24 * 4; i++) {
      const p = dayPeriod(new Date(), tz);
      if (seen[seen.length - 1] !== p) seen.push(p);
      vi.advanceTimersByTime(15 * 60000);
    }
    expect(seen).toEqual(['night', 'dawn', 'day', 'dusk', 'night']);
    vi.setSystemTime(at('2026-11-13T15:00:00Z'));
    expect(dayPeriod(Date.now(), tz)).toBe('day');
    expect(dayPeriod(Date.now(), 'Asia/Tokyo')).toBe('night');
  });

  it('as faixas cobrem as 24 horas, em ordem', () => {
    expect(DAY_PERIODS).toEqual(['dawn', 'day', 'dusk', 'night']);
    const starts = DAY_PERIODS.map((p) => DAY_PERIOD_START[p]);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    const base = Date.UTC(2026, 5, 1);
    const count: Record<string, number> = {};
    for (let m = 0; m < 24 * 60; m++) {
      const p = dayPeriod(base + m * 60000, 'UTC');
      count[p] = (count[p] ?? 0) + 1;
    }
    expect(count).toEqual({ night: 10 * 60, dawn: 2 * 60, day: 10 * 60, dusk: 2 * 60 });
  });
});

describe('pisos e paredes do visual v2', () => {
  it('os ids antigos não mudaram e os novos entraram no fim', () => {
    expect(Floor).toMatchObject({ None: 0, Wood: 1, WoodDark: 2, CarpetDark: 3, CarpetGold: 4, Tile: 5, Concrete: 6, Grass: 7, Kitchen: 8, Stage: 9, Corridor: 10 });
    expect(Floor).toMatchObject({ Porcelain: 11, BurntCement: 12, Herringbone: 13, CarpetPattern: 14, SyntheticGrass: 15 });
    expect(Wall).toMatchObject({ None: 0, Wall: 1, Window: 2, Dark: 3, Plain: 4, Brick: 5, WoodPanel: 6, Glass: 7 });
  });
  it('todo piso e toda parede têm rótulo', () => {
    for (const id of Object.values(Floor)) if (id) expect(FLOOR_LABEL[id]).toBeTruthy();
    for (const id of Object.values(Wall)) if (id) expect(WALL_LABEL[id]).toBeTruthy();
  });
});
