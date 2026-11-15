// SPDX-License-Identifier: AGPL-3.0-only
// Relógio de parede do visual v2 (Fase F): hora no fuso do escritório e ângulos dos ponteiros.
import { describe, expect, it } from 'vitest';
import { clockAngles, localClock } from '../src';

const at = (iso: string) => new Date(iso);

describe('hora do escritório (localClock)', () => {
  it('converte o instante para o fuso do escritório', () => {
    const ts = at('2026-11-14T22:27:41Z');
    expect(localClock(ts, 'America/Sao_Paulo')).toEqual({ hour: 19, minute: 27, second: 41 });
    expect(localClock(ts, 'Asia/Tokyo')).toEqual({ hour: 7, minute: 27, second: 41 });
    expect(localClock(ts, 'UTC')).toEqual({ hour: 22, minute: 27, second: 41 });
    // fuso com meia hora
    expect(localClock(ts, 'Asia/Kolkata')).toEqual({ hour: 3, minute: 57, second: 41 });
    expect(localClock(ts.getTime(), 'America/Santiago').minute).toBe(27);
  });

  it('segue o horário de verão', () => {
    // Nova York: UTC−4 em julho, UTC−5 em dezembro
    expect(localClock(at('2026-07-01T16:00:00Z'), 'America/New_York').hour).toBe(12);
    expect(localClock(at('2026-12-01T16:00:00Z'), 'America/New_York').hour).toBe(11);
  });

  it('fuso vazio ou inválido cai em São Paulo', () => {
    const ts = at('2026-11-14T15:05:00Z');
    expect(localClock(ts, '')).toEqual(localClock(ts, 'America/Sao_Paulo'));
    expect(localClock(ts, 'Nao/Existe')).toEqual({ hour: 12, minute: 5, second: 0 });
  });
});

describe('ângulos dos ponteiros (clockAngles)', () => {
  it('horas andam meio grau por minuto; minutos, 6 graus por minuto', () => {
    expect(clockAngles({ hour: 3, minute: 0 })).toEqual({ hour: 90, minute: 0, second: 0 });
    expect(clockAngles({ hour: 10, minute: 10, second: 30 })).toEqual({ hour: 305, minute: 60, second: 180 });
    expect(clockAngles({ hour: 12, minute: 30 })).toEqual({ hour: 15, minute: 180, second: 0 });
    expect(clockAngles({ hour: 23, minute: 59, second: 59 })).toEqual({ hour: 359.5, minute: 354, second: 354 });
  });

  it('relógio de 12 horas: 0h e 12h, 15h e 3h são iguais', () => {
    expect(clockAngles({ hour: 0, minute: 0 })).toEqual(clockAngles({ hour: 12, minute: 0 }));
    expect(clockAngles({ hour: 15, minute: 45 })).toEqual(clockAngles({ hour: 3, minute: 45 }));
  });

  it('o dos minutos não anda com os segundos (o relógio é redesenhado de minuto em minuto)', () => {
    expect(clockAngles({ hour: 8, minute: 20, second: 0 }).minute).toBe(clockAngles({ hour: 8, minute: 20, second: 59 }).minute);
  });
});
