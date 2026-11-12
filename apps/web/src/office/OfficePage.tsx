// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { areaCenter, isAdminRole, type Status } from '@office-imp/shared';
import { Button, Spinner } from '@office-imp/ui';
import { bus } from '../game/bus';
import { net } from '../game/net';
import { useGame } from '../game/store';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { desktop, toast, useSession } from '../lib/session';
import { av, useAv } from './av';
import { BottomBar, MiniMap, SidePanel, VideoBar } from './Hud';
import { AvatarModal, CalendarModal, CustomStatusModal, DeskModal, MyDeskModal, ObjectModal, ProfileModal, SettingsModal } from './Modals';
import { RadioDock, RadioModal } from './Radio';
import { createGame } from './scene';
import { playSound } from './sounds';

const Mapmaker = lazy(() => import('./Mapmaker'));

function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const game = createGame(ref.current!);
    return () => game.destroy();
  }, []);
  return <div ref={ref} className="absolute inset-0" data-testid="game" />;
}

function kickText(reason: string | null): string {
  switch (reason) {
    case 'other_session':
      return t('kick.other', 'Você entrou neste escritório em outra janela ou dispositivo.');
    case 'removed':
      return t('kick.removed', 'O seu acesso a este escritório foi removido.');
    case 'invite_expired':
      return t('kick.expired', 'O seu convite expirou. Obrigado pela visita!');
    case 'invite_revoked':
      return t('kick.revoked', 'O convite foi encerrado pela administração.');
    case 'office_deleted':
      return t('kick.deleted', 'Este escritório foi excluído.');
    default:
      return t('kick.generic', 'A sua sessão neste escritório foi encerrada.');
  }
}

/** Atalhos de status, ausência automática, sons e avisos de atualização. */
function useOfficeBehaviors() {
  const awayMinutes = useGame((s) => s.office?.settings.awayMinutes ?? 10);
  const forceUpdateAt = useGame((s) => s.forceUpdateAt);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const setStatus = (s: Status) => {
      if (useGame.getState().phase !== 'online') return;
      net.setStatus(s);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      const s: Status | null = k === 'o' ? 'AVAILABLE' : k === 'i' ? 'BUSY' : k === 'u' ? 'DND' : null;
      if (!s) return;
      e.preventDefault();
      setStatus(s);
    };
    window.addEventListener('keydown', onKey, true);
    const offDesk = desktop?.onStatusShortcut((s) => setStatus(s as Status));
    const offMini = desktop?.onMiniChanged((on) => useGame.setState({ mini: on }));
    const offSound = bus.on('sound', (k) => playSound(k));
    return () => {
      window.removeEventListener('keydown', onKey, true);
      offDesk?.();
      offMini?.();
      offSound();
    };
  }, []);

  // ausência automática: sem teclado, mouse ou movimento pelo tempo configurado
  useEffect(() => {
    let last = Date.now();
    const mark = () => {
      last = Date.now();
      const me = useGame.getState().me();
      if (me?.away) net.send('away', { away: false });
    };
    const evs = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const ev of evs) window.addEventListener(ev, mark, { passive: true });
    const offStep = bus.on('me:step', mark);
    const offAct = bus.on('activity', mark);
    const id = window.setInterval(() => {
      const me = useGame.getState().me();
      if (me && !me.away && Date.now() - last > awayMinutes * 60000) net.send('away', { away: true });
    }, 15000);
    return () => {
      for (const ev of evs) window.removeEventListener(ev, mark);
      offStep();
      offAct();
      clearInterval(id);
    };
  }, [awayMinutes]);

  // "Atualizar todos agora": contagem regressiva e recarga
  useEffect(() => {
    if (!forceUpdateAt) return setLeft(null);
    const tick = () => {
      const s = Math.ceil((forceUpdateAt - Date.now()) / 1000);
      setLeft(Math.max(0, s));
      if (s <= 0) {
        clearInterval(id);
        if (desktop) desktop.installUpdateNow();
        else location.reload();
      }
    };
    const id = window.setInterval(tick, 500);
    tick();
    return () => clearInterval(id);
  }, [forceUpdateAt]);

  return left;
}

function TopLeft() {
  const office = useGame((s) => s.office);
  const me = useGame((s) => s.players[s.meId]);
  const map = useGame((s) => s.map);
  const recordings = useGame((s) => s.recordings);
  const hide = useGame((s) => s.mini);
  const role = useSession((s) => s.me?.role);
  const isUser = useSession((s) => s.me?.kind === 'user');
  const [busy, setBusy] = useState(false);
  if (!office || !me || hide) return null;
  const area = me.areaId ? map?.areas.find((a) => a.id === me.areaId) : null;
  const rec = area ? recordings[area.id] : undefined;
  const canStart = Boolean(area?.meeting && isUser && role !== 'GUEST' && (!office.settings.notesRestrictedToAdmins || isAdminRole(role)));
  const toggle = async () => {
    if (!area) return;
    setBusy(true);
    try {
      await api.post(rec ? '/api/meetings/stop' : '/api/meetings/start', { officeId: office.id, areaId: area.id });
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[260px] flex-col items-start gap-2">
      <div className="rounded-xl border border-line bg-panel/90 px-3 py-1.5 text-sm font-semibold text-gold shadow-lg" data-testid="office-name">
        {office.name}
      </div>
      {area ? (
        <div className="rounded-xl border border-sky-400/40 bg-panel/90 px-3 py-1.5 text-xs shadow-lg" data-testid="area-badge">
          🔒 {area.name} <span className="text-muted">· {t('area.private', 'conversa privada')}</span>
        </div>
      ) : me.spotlight ? (
        <div className="rounded-xl border border-warn/60 bg-panel/90 px-3 py-1.5 text-xs shadow-lg">★ {t('area.spotlight', 'Você está no palco: todos ouvem e veem você.')}</div>
      ) : null}
      {rec ? (
        <div className="oi-pulse rounded-xl border border-danger bg-danger/20 px-3 py-1.5 text-xs font-semibold text-red-200 shadow-lg" data-testid="rec-indicator">
          🔴 {t('rec.badge', 'Gravando áudio para notas')}
        </div>
      ) : null}
      {area?.meeting && (canStart || rec) ? (
        <div className="pointer-events-auto">
          <Button small variant={rec ? 'danger' : 'ghost'} disabled={busy} onClick={() => void toggle()} data-testid="notes-toggle">
            {rec ? t('rec.stop', 'Parar as notas') : t('rec.start', '📝 Iniciar notas de reunião')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Hint() {
  const hint = useGame((s) => s.hint);
  const buildMode = useGame((s) => s.buildMode);
  const hide = useGame((s) => s.simplified || s.mini || Boolean(s.modal));
  if (hide) return null;
  if (buildMode) {
    return (
      <div className="absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-ok bg-panel/95 px-4 py-1.5 text-xs shadow-lg">
        {t('hint.build', 'Clique na área verde da sua mesa para colocar o objeto.')}
        <button type="button" className="text-gold underline" onClick={() => useGame.setState({ buildMode: null, buildProps: null })}>
          {t('app.cancel', 'Cancelar')}
        </button>
      </div>
    );
  }
  if (!hint) return null;
  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full border border-gold/60 bg-panel/95 px-4 py-1.5 text-xs shadow-lg" data-testid="hint">
      {hint.text}
    </div>
  );
}

function Modals() {
  const modal = useGame((s) => s.modal);
  if (!modal) return null;
  switch (modal.kind) {
    case 'object':
      return <ObjectModal object={modal.object} />;
    case 'desk':
      return <DeskModal deskId={modal.deskId} />;
    case 'myDesk':
      return <MyDeskModal />;
    case 'profile':
      return <ProfileModal playerId={modal.playerId} />;
    case 'settings':
      return <SettingsModal />;
    case 'avatar':
      return <AvatarModal />;
    case 'customStatus':
      return <CustomStatusModal />;
    case 'radio':
      return <RadioModal />;
    case 'calendar':
      return <CalendarModal />;
    case 'mapmaker':
      return (
        <Suspense fallback={null}>
          <Mapmaker />
        </Suspense>
      );
    default:
      return null;
  }
}

export default function OfficePage() {
  const { slug = '', areaId } = useParams();
  const nav = useNavigate();
  const phase = useGame((s) => s.phase);
  const map = useGame((s) => s.map);
  const error = useGame((s) => s.error);
  const errorCode = useGame((s) => s.errorCode);
  const kickReason = useGame((s) => s.kickReason);
  const canAdmin = useGame((s) => s.canAdmin);
  const left = useOfficeBehaviors();
  const deepLinked = useRef(false);

  useEffect(() => {
    void net.connect(slug);
    av.start();
    // usado pelos testes de ponta a ponta
    (window as any).__oi = { game: useGame, av: useAv, net, bus };
    return () => {
      av.stop();
      net.disconnect();
    };
  }, [slug]);

  // link direto para uma sala (agenda) e atalho para abrir o Mapmaker
  useEffect(() => {
    if (phase !== 'online' || deepLinked.current) return;
    deepLinked.current = true;
    const area = areaId ? useGame.getState().map?.areas.find((a) => a.id === areaId) : null;
    if (area) net.send('teleport', areaCenter(area));
    if (new URLSearchParams(location.search).get('mapmaker') === '1' && canAdmin) useGame.setState({ modal: { kind: 'mapmaker' } });
  }, [phase, areaId, canAdmin]);

  if (phase === 'error' || phase === 'kicked') {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md space-y-4 rounded-2xl border border-line bg-panel p-6 text-center" data-testid="office-blocked">
          <div className="text-4xl">{phase === 'kicked' ? '👋' : '🚪'}</div>
          <p className="text-sm">{phase === 'kicked' ? kickText(kickReason) : error}</p>
          {errorCode === 'invite_required' ? <p className="text-xs text-muted">{t('office.inviteRequired', 'Cole o link de convite na tela inicial para ativar o seu acesso.')}</p> : null}
          <div className="flex justify-center gap-2">
            {phase === 'kicked' && kickReason === 'other_session' ? <Button onClick={() => void net.connect(slug)}>{t('office.retake', 'Usar aqui')}</Button> : null}
            <Link to="/">
              <Button variant="ghost">{t('office.home', 'Voltar ao início')}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-ink" data-testid="office" data-phase={phase}>
      {map ? <GameCanvas /> : null}
      {phase === 'online' ? (
        <>
          <VideoBar />
          <TopLeft />
          <MiniMap />
          <SidePanel />
          <Hint />
          <RadioDock />
          <BottomBar />
          <Modals />
        </>
      ) : null}
      {phase === 'connecting' || phase === 'reconnecting' || phase === 'idle' ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-ink/80">
          <div className="flex flex-col items-center gap-3 text-sm text-muted">
            <Spinner className="h-6 w-6" />
            {phase === 'reconnecting' ? t('office.reconnecting', 'Reconectando…') : t('office.connecting', 'Entrando no escritório…')}
            <Button small variant="ghost" onClick={() => nav('/')}>
              {t('app.cancel', 'Cancelar')}
            </Button>
          </div>
        </div>
      ) : null}
      {left !== null ? (
        <div className="absolute left-1/2 top-1/3 z-[60] -translate-x-1/2 rounded-2xl border border-gold bg-panel px-6 py-4 text-center shadow-2xl" data-testid="force-update">
          <p className="text-sm font-semibold text-gold">{t('update.forced', 'O app será atualizado')}</p>
          <p className="mt-1 text-xs text-muted">{t('update.forcedIn', 'Recarregando em {{n}} s. Você volta para o mesmo lugar.', { n: left })}</p>
        </div>
      ) : null}
    </div>
  );
}
