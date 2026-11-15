// SPDX-License-Identifier: AGPL-3.0-only
// Página /dev/cena (só em desenvolvimento): um escritório gerado pelo map-engine aberto na cena
// de verdade (Phaser), sem servidor nem login. Serve para conferir pisos, paredes, exterior e os
// períodos do dia como aparecem no jogo, e para tirar prints.
// Parâmetros: ?pessoas=15 (1 a 100) &periodo=dawn|day|dusk|night &fuso=America/Sao_Paulo
// &abrir=mapmaker (o Mapmaker) | mesa (a Build Tool da própria mesa, com alguns objetos postos)
// &animados=1 (Fase F: põe na sala de entrada um objeto de cada tipo animado: aquário, expresso,
// relógio, neon, split com uma planta perto, caneca e teclado RGB numa mesa)
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { generateOffice } from '@office-imp/map-engine';
import { DAY_PERIODS, DEFAULT_AVATAR, DEFAULT_TIMEZONE, Wall, buildCollision, dayPeriod, deskSeat, mapDesks, type DayPeriod, type DeskInfo, type MapObject, type OfficeMap, type PlayerState, type Point } from '@office-imp/shared';
import { bus } from '../game/bus';
import { setReduceMotion, useMotion } from '../game/motion';
import { useGame } from '../game/store';
import { t } from '../lib/i18n';
import { MiniMap } from '../office/Hud';
import { MyDeskModal } from '../office/Modals';
import { createGame, forcePeriod, textureStats } from '../office/scene';

const Mapmaker = lazy(() => import('../office/Mapmaker'));

function periodLabel(p: DayPeriod): string {
  if (p === 'dawn') return t('period.dawn', 'Amanhecer');
  if (p === 'day') return t('period.day', 'Dia');
  if (p === 'dusk') return t('period.dusk', 'Entardecer');
  return t('period.night', 'Noite');
}

/**
 * Vitrine das animações (só para conferência): objetos de parede na face da parede de cima mais
 * perto da entrada, aquário e expresso no chão encostados nela, uma costela-de-adão ao lado do
 * split e, nas duas primeiras mesas, uma caneca e um teclado RGB. Só usa blocos livres.
 */
function addShowcase(map: OfficeMap, near: Point): void {
  const W = map.width;
  const wall = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < map.height && map.layers.walls[y * W + x] !== 0;
  const taken = new Set(map.objects.map((o) => `${o.x},${o.y}`));
  const grid = buildCollision(map);
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < map.height && grid[y * W + x] === 0 && !taken.has(`${x},${y}`);
  // faces de parede (com chão embaixo, sem janela) e o chão logo abaixo delas, do mais perto ao mais longe
  const faces: Point[] = [];
  for (let y = 0; y < map.height - 1; y++)
    for (let x = 0; x < W; x++) if (wall(x, y) && map.layers.walls[y * W + x] !== Wall.Window && !wall(x, y + 1) && map.layers.floor[(y + 1) * W + x] && !taken.has(`${x},${y}`)) faces.push({ x, y });
  faces.sort((a, b) => Math.abs(a.x - near.x) + Math.abs(a.y - near.y) - (Math.abs(b.x - near.x) + Math.abs(b.y - near.y)));
  const used = new Set<string>();
  const add = (o: Omit<MapObject, 'id'>) => {
    map.objects.push({ id: `anim_${map.objects.length}`, ...o });
    // o bloco de cima também fica ocupado: a parte alta do objeto de chão cobre a parede
    for (let dx = 0; dx < (o.w ?? 1); dx++) used.add(`${o.x + dx},${o.y}`).add(`${o.x + dx},${o.y - 1}`);
  };
  const slot = (width: number, floor: boolean) =>
    faces.find((f) => {
      for (let dx = 0; dx < width; dx++) {
        const x = f.x + dx;
        if (!faces.some((g) => g.x === x && g.y === f.y) || used.has(`${x},${f.y}`) || used.has(`${x},${f.y + 1}`)) return false;
        // no chão: livre, e com passagem embaixo (não fecha corredor nem porta)
        if (floor && (!free(x, f.y + 1) || !free(x, f.y + 2))) return false;
      }
      return true;
    });
  const put = (type: string, width: number, floor: boolean, extra: Partial<MapObject> = {}) => {
    const f = slot(width, floor);
    if (f) add({ type, x: f.x, y: floor ? f.y + 1 : f.y, ...(width > 1 ? { w: width } : {}), ...extra });
    return f;
  };
  const ac = put('split_ac', 1, false);
  // a planta fica ao lado (debaixo do split ela cobriria o aparelho), a 1 bloco dele
  const spot = ac && [ac.x + 1, ac.x - 1].find((x) => free(x, ac.y + 1) && free(x, ac.y + 2) && !used.has(`${x},${ac.y + 1}`) && !used.has(`${x},${ac.y}`));
  if (ac && spot !== undefined) add({ type: 'monstera', x: spot, y: ac.y + 1 });
  put('wall_clock', 1, false);
  put('neon', 2, false);
  put('aquarium', 2, true);
  put('espresso', 1, true);
  const desks = mapDesks(map);
  if (desks[0]) add({ type: 'mug', x: desks[0].x + 1, y: desks[0].y, color: 'gold' });
  if (desks[1]) add({ type: 'keyboard', x: desks[1].x + 1, y: desks[1].y });
}

export default function DevScene() {
  const [params] = useSearchParams();
  const people = Math.max(1, Math.min(100, Number(params.get('pessoas')) || 15));
  const timezone = params.get('fuso') || DEFAULT_TIMEZONE;
  const asked = params.get('periodo') as DayPeriod | null;
  const open = params.get('abrir');
  const showcase = params.get('animados') === '1';
  const modal = useGame((s) => s.modal);
  const [forced, setForced] = useState<DayPeriod | null>(asked && DAY_PERIODS.includes(asked) ? asked : null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = generateOffice({ name: 'Impera', size: 'custom', customCount: people, partners: 2, partnersShareRoom: true });
    // Build Tool: a primeira mesa é sua, com uma caneca dourada e um vaso
    const mine = open === 'mesa' ? (mapDesks(map).find((d) => !d.props?.partner) ?? null) : null;
    const desks: DeskInfo[] = mine ? [{ id: mine.id, userId: 'dev', userName: t('devScene.me', 'Você'), online: true }] : [];
    if (mine) {
      map.objects.push({ id: 'decor_dev_mug', type: 'mug', x: mine.x + 1, y: mine.y, color: 'gold', ownerDeskId: mine.id });
      map.objects.push({ id: 'decor_dev_plant', type: 'plant_small', x: mine.x + 2, y: mine.y, color: 'blue', ownerDeskId: mine.id });
    }
    const spawn = mine ? deskSeat(mine) : (map.spawns[0] ?? { x: 1, y: 1 });
    if (showcase) addShowcase(map, spawn);
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
      deskId: mine?.id ?? null,
      distance: 2,
      profile: { title: '', about: '', timezone },
    };
    // sem servidor ninguém abre porta: todas começam abertas
    const doors = Object.fromEntries(map.objects.filter((o) => o.type === 'door').map((o) => [o.id, true as const]));
    useGame.setState({
      phase: 'online',
      office: { id: 'dev', slug: 'dev', name: 'Impera', timezone, settings: { awayMinutes: 10, notesRestrictedToAdmins: false, monitoringNotice: '' } },
      map,
      baseMap: map,
      mapRev: useGame.getState().mapRev + 1,
      meId: me.id,
      players: { [me.id]: me },
      desks,
      doors,
      canAdmin: true,
      modal: open === 'mapmaker' ? { kind: 'mapmaker' } : open === 'mesa' ? { kind: 'myDesk' } : null,
    });
    // conferência: window.__oi.motion.set(true) para "Reduzir animações"; window.__oi.textures() conta as texturas
    (window as any).__oi = { game: useGame, bus, motion: { set: setReduceMotion, store: useMotion }, textures: textureStats };
    const game = createGame(ref.current!);
    return () => {
      game.destroy();
      forcePeriod(null);
      useGame.setState({ phase: 'idle', office: null, map: null, baseMap: null, players: {}, meId: '', doors: {}, desks: [], modal: null });
    };
  }, [people, timezone, open, showcase]);

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
      {modal?.kind === 'mapmaker' ? (
        <Suspense fallback={null}>
          <Mapmaker />
        </Suspense>
      ) : null}
      {modal?.kind === 'myDesk' ? <MyDeskModal initialTab="decor" /> : null}
      <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/90 p-2 text-xs" data-testid="dev-periods">
        <span className="text-muted">{t('devScene.period', 'Período do dia')}</span>
        {btn(t('devScene.auto', 'Automático ({{period}})', { period: periodLabel(auto) }), null)}
        {DAY_PERIODS.map((p) => btn(periodLabel(p), p))}
      </div>
    </div>
  );
}
