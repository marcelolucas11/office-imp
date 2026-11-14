// SPDX-License-Identifier: AGPL-3.0-only
// Página /dev/cena (só em desenvolvimento): um escritório gerado pelo map-engine aberto na cena
// de verdade (Phaser), sem servidor nem login. Serve para conferir pisos, paredes, exterior e os
// períodos do dia como aparecem no jogo, e para tirar prints.
// Parâmetros: ?pessoas=15 (1 a 100) &periodo=dawn|day|dusk|night &fuso=America/Sao_Paulo
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { generateOffice } from '@office-imp/map-engine';
import { DAY_PERIODS, DEFAULT_AVATAR, DEFAULT_TIMEZONE, dayPeriod, type DayPeriod, type PlayerState } from '@office-imp/shared';
import { bus } from '../game/bus';
import { useGame } from '../game/store';
import { t } from '../lib/i18n';
import { MiniMap } from '../office/Hud';
import { createGame, forcePeriod } from '../office/scene';

function periodLabel(p: DayPeriod): string {
  if (p === 'dawn') return t('period.dawn', 'Amanhecer');
  if (p === 'day') return t('period.day', 'Dia');
  if (p === 'dusk') return t('period.dusk', 'Entardecer');
  return t('period.night', 'Noite');
}

export default function DevScene() {
  const [params] = useSearchParams();
  const people = Math.max(1, Math.min(100, Number(params.get('pessoas')) || 15));
  const timezone = params.get('fuso') || DEFAULT_TIMEZONE;
  const asked = params.get('periodo') as DayPeriod | null;
  const [forced, setForced] = useState<DayPeriod | null>(asked && DAY_PERIODS.includes(asked) ? asked : null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = generateOffice({ name: 'Impera', size: 'custom', customCount: people, partners: 2, partnersShareRoom: true });
    const spawn = map.spawns[0] ?? { x: 1, y: 1 };
    const me: PlayerState = {
      id: 'dev',
      name: t('devScene.me', 'Você'),
      role: 'OWNER',
      x: spawn.x,
      y: spawn.y,
      dir: 'down',
      status: 'AVAILABLE',
      away: false,
      customStatus: null,
      avatar: DEFAULT_AVATAR,
      hand: false,
      areaId: null,
      spotlight: false,
      mic: false,
      cam: false,
      screen: false,
      deskId: null,
      distance: 2,
      profile: { title: '', about: '', timezone },
    };
    // sem servidor ninguém abre porta: todas começam abertas
    const doors = Object.fromEntries(map.objects.filter((o) => o.type === 'door').map((o) => [o.id, true as const]));
    useGame.setState({
      phase: 'online',
      office: { id: 'dev', slug: 'dev', name: 'Impera', timezone, settings: { awayMinutes: 10, notesRestrictedToAdmins: false, monitoringNotice: '' } },
      map,
      mapRev: useGame.getState().mapRev + 1,
      meId: me.id,
      players: { [me.id]: me },
      desks: [],
      doors,
      modal: null,
    });
    (window as any).__oi = { game: useGame, bus };
    const game = createGame(ref.current!);
    return () => {
      game.destroy();
      forcePeriod(null);
      useGame.setState({ phase: 'idle', office: null, map: null, players: {}, meId: '', doors: {} });
    };
  }, [people, timezone]);

  useEffect(() => forcePeriod(forced), [forced]);

  const auto = dayPeriod(Date.now(), timezone);
  const btn = (label: string, value: DayPeriod | null) => (
    <button key={label} type="button" onClick={() => setForced(value)} className={`rounded border px-2 py-1 ${forced === value ? 'border-gold text-gold' : 'border-line text-stone-100'}`}>
      {label}
    </button>
  );
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={ref} className="absolute inset-0" data-testid="game" />
      <MiniMap />
      <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/90 p-2 text-xs" data-testid="dev-periods">
        <span className="text-muted">{t('devScene.period', 'Período do dia')}</span>
        {btn(t('devScene.auto', 'Automático ({{period}})', { period: periodLabel(auto) }), null)}
        {DAY_PERIODS.map((p) => btn(periodLabel(p), p))}
      </div>
    </div>
  );
}
