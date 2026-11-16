// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { Track } from 'livekit-client';
import { EMOTES, ROLE_LABEL, STATUS_COLOR, STATUS_LABEL, can, deskSeat, isAdminRole, mapDesks, type ChatMessage, type PlayerState, type TrackedStatus } from '@office-imp/shared';
import { Badge, Button, IconButton, Input, Tabs, cx } from '@office-imp/ui';
import { avatarPortrait } from '../game/art/avatar';
import { renderMini } from '../game/art/render';
import { bus } from '../game/bus';
import { net } from '../game/net';
import { useGame } from '../game/store';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { desktop, toast, useSession } from '../lib/session';
import { av, useAv, type PeerMedia } from './av';
import { Emo, EmoText } from '../lib/icons';

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';
export const STATUS_KEYS: Partial<Record<TrackedStatus, string>> = { AVAILABLE: 'O', BUSY: 'I', DND: 'U' };

// ---------- ícones ----------
const I = ({ d, off }: { d: string; off?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
    {off ? <path d="M3 3l18 18" /> : null}
  </svg>
);
const MIC = 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4';
const CAM = 'M15 10l5-3v10l-5-3M3 7h12v10H3z';
const SCREEN = 'M3 4h18v12H3zM8 20h8M12 16v4';

// ---------- vídeo ----------
export function TrackView({ track, mirror, contain }: { track: Track; mirror?: boolean; contain?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={cx('h-full w-full bg-black', contain ? 'object-contain' : 'object-cover', mirror && '-scale-x-100')} />;
}

function Tile({ id, name, track, kind, mic, speaking, mirror, big, badge, avatar, peer }: { id: string; name: string; track: Track | null; kind: 'cam' | 'screen'; mic?: boolean; speaking?: boolean; mirror?: boolean; big?: boolean; badge?: string; avatar?: string; peer?: PeerMedia }) {
  const focus = useAv((s) => s.focus);
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);
  const key = `${id}:${kind}`;
  // oculto só para você: o clique no quadro volta a mostrar
  const hidden = peer ? (kind === 'cam' ? peer.pref.hideCam && peer.camOn : peer.pref.hideScreen && peer.screenOn) : false;
  const silenced = peer ? (kind === 'cam' ? peer.pref.mute : peer.pref.smute && peer.screenAudio) : false;
  const onClick = () => {
    if (peer && hidden) av.setPeer(peer.id, kind === 'cam' ? { hideCam: false } : { hideScreen: false });
    else useAv.setState({ focus: focus === key ? null : key });
  };
  return (
    <div
      data-testid={`tile-${key}`}
      onContextMenu={(e) => {
        if (!peer) return;
        e.preventDefault();
        setMenuAt(new DOMRect(e.clientX, e.clientY, 0, 0));
      }}
      className={cx('group relative shrink-0 overflow-hidden rounded-xl border-2 bg-panel-2 transition-all', speaking ? 'border-ok' : 'border-line', big ? 'aspect-video w-full' : 'h-[104px] w-[184px]')}
    >
      <button type="button" onClick={onClick} className="block h-full w-full" title={hidden ? t('video.showAgain', 'Clique para mostrar de novo') : t('video.expand', 'Clique para ampliar')}>
        {track ? (
          <TrackView track={track} mirror={mirror} contain={kind === 'screen'} />
        ) : hidden ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 pb-6 text-center text-[11px] leading-tight text-muted">
            <Emo e="🙈" size={20} />
            <span>{kind === 'cam' ? t('video.camHidden', 'Vídeo oculto para você') : t('video.screenHidden', 'Tela oculta para você')}</span>
          </div>
        ) : (
          <div className="grid h-full w-full place-items-center">{avatar ? <img src={avatar} alt="" className="pixel h-16" /> : <span className="text-2xl text-muted">{name.slice(0, 1).toUpperCase()}</span>}</div>
        )}
      </button>
      <span className="pointer-events-none absolute bottom-1 left-1 flex max-w-[92%] items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px]">
        {kind === 'screen' ? <Emo e="🖥" size={16} /> : mic === false ? <Emo e="🔇" size={16} className="bg-danger/80" /> : null}
        {silenced ? <Emo e="🔕" size={14} title={t('video.silencedForYou', 'Silenciado para você')} /> : null}
        <span className="truncate">{name}</span>
        {badge ? <span className="text-gold">{badge}</span> : null}
      </span>
      {peer ? <PeerMenu peer={peer} kind={kind} at={menuAt} setAt={setMenuAt} /> : null}
    </div>
  );
}

/** Botão "⋯" do quadro de vídeo/tela de outra pessoa: abre os controles de áudio e vídeo dela. */
function PeerMenu({ peer, kind, at, setAt, inline }: { peer: PeerMedia; kind: 'cam' | 'screen'; at: DOMRect | null; setAt: (r: DOMRect | null) => void; inline?: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  const p = peer.pref;
  const custom = kind === 'cam' ? p.mute || p.vol < 1 || p.hideCam : p.smute || p.svol < 1 || p.hideScreen;
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAt(at ? null : (btn.current?.getBoundingClientRect() ?? null));
  };
  const label = kind === 'cam' ? t('peer.menuCam', 'Áudio e vídeo de {{name}}', { name: peer.name }) : t('peer.menuScreen', 'Tela de {{name}}', { name: peer.name });
  return (
    <>
      {inline ? (
        <button ref={btn} type="button" onClick={toggle} data-testid={`peer-menu-${peer.id}:${kind}`} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-panel-3 px-2.5 py-1 text-xs text-stone-100 transition-colors hover:bg-line">
          <Emo e="🔊" size={14} />
          {t('peer.controls', 'Áudio e vídeo')}
        </button>
      ) : (
        <button
          ref={btn}
          type="button"
          onClick={toggle}
          aria-label={label}
          title={label}
          data-testid={`peer-menu-${peer.id}:${kind}`}
          className={cx(
            'absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-lg bg-black/70 text-stone-100 transition-opacity hover:bg-black/90 focus-visible:opacity-100',
            at || custom ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <Emo e="⋯" size={16} />
        </button>
      )}
      {at ? createPortal(<PeerPopover id={peer.id} kind={kind} at={at} trigger={btn.current} onClose={() => setAt(null)} />, document.body) : null}
    </>
  );
}

function PeerPopover({ id, kind, at, trigger, onClose }: { id: string; kind: 'cam' | 'screen'; at: DOMRect; trigger: HTMLElement | null; onClose: () => void }) {
  const peer = useAv((s) => s.peers.find((x) => x.id === id));
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.left, top: at.bottom + 6 });

  // abre abaixo do botão; se não couber, acima — sempre dentro da janela
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(8, at.right - w), window.innerWidth - w - 8);
    const below = at.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, at.top - h - 6) : below;
    setPos({ left, top });
  }, [at]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = e.target as Node;
      // o próprio botão "⋯" fecha pelo clique dele
      if (ref.current && !ref.current.contains(el) && !trigger?.contains(el)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [onClose, trigger]);

  // a pessoa saiu da conversa: fecha
  useEffect(() => {
    if (!peer) onClose();
  }, [peer, onClose]);
  if (!peer) return null;

  const p = peer.pref;
  const forAll = (what: 'mic' | 'cam' | 'screen') => {
    av.muteForAll(peer.id, what);
    onClose();
  };
  const row = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-panel-3 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';
  const volume = (value: number, muted: boolean, onVol: (v: number) => void, onMute: () => void, label: string, testid: string) => (
    <div className="px-2.5 py-1.5">
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums">{muted ? t('peer.muted', 'mudo') : `${Math.round(value * 100)}%`}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onMute} className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-panel-3', muted && 'bg-danger/25 text-danger')} title={muted ? t('peer.unmuteMe', 'Voltar a ouvir') : t('peer.muteMe', 'Silenciar para mim')} aria-label={muted ? t('peer.unmuteMe', 'Voltar a ouvir') : t('peer.muteMe', 'Silenciar para mim')} data-testid={`${testid}-mute`}>
          <Emo e={muted ? '🔕' : value < 0.5 ? '🔈' : '🔊'} size={18} />
        </button>
        <input type="range" min={0} max={100} step={1} value={muted ? 0 : Math.round(value * 100)} onChange={(e) => onVol(Number(e.target.value) / 100)} className="w-full accent-[#d7b870]" aria-label={label} data-testid={`${testid}-vol`} />
      </div>
    </div>
  );

  return (
    <div ref={ref} className="oi-pop fixed z-50 w-72 rounded-2xl border border-line bg-panel p-1.5 text-stone-100 shadow-2xl" style={pos} data-testid={`peer-popover-${id}:${kind}`} onClick={(e) => e.stopPropagation()}>
      <div className="truncate px-2.5 pb-1 pt-1.5 text-sm font-semibold">{kind === 'cam' ? peer.name : t('peer.screenOf', 'Tela de {{name}}', { name: peer.name })}</div>
      <div className="px-2.5 pb-1 text-[11px] uppercase tracking-wide text-muted">{t('peer.forMe', 'Só para você')}</div>
      {kind === 'cam' ? (
        <>
          {volume(p.vol, p.mute, (v) => av.setPeer(id, { vol: v }), () => av.setPeer(id, { mute: !p.mute, ...(p.mute && p.vol === 0 ? { vol: 1 } : {}) }), t('peer.voiceVol', 'Volume da voz'), 'peer-voice')}
          <button type="button" className={row} disabled={!peer.camOn} onClick={() => av.setPeer(id, { hideCam: !p.hideCam })} data-testid="peer-hide-cam">
            <Emo e={p.hideCam ? '👁' : '🙈'} size={18} />
            {p.hideCam ? t('peer.showCam', 'Mostrar o vídeo') : t('peer.hideCam', 'Ocultar o vídeo para mim')}
          </button>
        </>
      ) : (
        <>
          {peer.screenAudio ? volume(p.svol, p.smute, (v) => av.setPeer(id, { svol: v }), () => av.setPeer(id, { smute: !p.smute, ...(p.smute && p.svol === 0 ? { svol: 1 } : {}) }), t('peer.screenVol', 'Volume do áudio da tela'), 'peer-screen') : <div className="px-2.5 py-1.5 text-xs text-muted">{t('peer.noScreenAudio', 'Esta tela está sendo compartilhada sem áudio.')}</div>}
          <button type="button" className={row} onClick={() => av.setPeer(id, { hideScreen: !p.hideScreen })} data-testid="peer-hide-screen">
            <Emo e={p.hideScreen ? '👁' : '🙈'} size={18} />
            {p.hideScreen ? t('peer.showScreen', 'Mostrar a tela') : t('peer.hideScreen', 'Ocultar a tela para mim')}
          </button>
        </>
      )}
      <div className="my-1 border-t border-line" />
      <div className="px-2.5 pb-1 text-[11px] uppercase tracking-wide text-muted">{t('peer.forAll', 'Para todos na conversa')}</div>
      {kind === 'cam' ? (
        <>
          <button type="button" className={row} disabled={!peer.live || !peer.mic || peer.spotlight} onClick={() => forAll('mic')} data-testid="peer-mute-all">
            <Emo e="🔇" size={18} />
            {t('peer.muteAll', 'Desligar o microfone para todos')}
          </button>
          <button type="button" className={row} disabled={!peer.live || !peer.camOn || peer.spotlight} onClick={() => forAll('cam')} data-testid="peer-cam-all">
            <Emo e="📷" size={18} />
            {t('peer.camAll', 'Desligar a câmera para todos')}
          </button>
        </>
      ) : (
        <button type="button" className={row} disabled={!peer.live || !peer.screenOn || peer.spotlight} onClick={() => forAll('screen')} data-testid="peer-screen-all">
          <Emo e="🛑" size={18} />
          {t('peer.screenAll', 'Parar o compartilhamento para todos')}
        </button>
      )}
      <div className="px-2.5 pb-1.5 pt-0.5 text-[11px] leading-snug text-muted">{peer.spotlight ? t('peer.spotlightHint', 'Quem está no palco só pode ser desligado por quem está na mesma conversa.') : t('peer.forAllHint', 'Só a própria pessoa consegue religar. Ela recebe um aviso com o seu nome.')}</div>
    </div>
  );
}

/** Vídeos de quem está conectado com você. No modo simplificado ocupa a tela inteira. */
export function VideoBar() {
  const { peers, localCam, localScreen, focus, cam, mic, conn, meSpeaking } = useAv();
  const simplified = useGame((s) => s.simplified || (s.mini && !s.miniExt));
  const mini = useGame((s) => s.mini && !s.miniExt);
  const players = useGame((s) => s.players);
  const meId = useGame((s) => s.meId);
  // janela escondida (Modo Mini do app desktop): os vídeos ficam só na janela mini, sem uma segunda cópia
  // tocando aqui atrás (e sem pedir ao servidor a qualidade dos quadros grandes desta janela)
  const winHidden = useGame((s) => s.winHidden);
  const me = players[meId];
  const portraits = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of Object.values(players)) out[p.id] = avatarPortrait(p.avatar, 2);
    return out;
  }, [players]);
  if (winHidden) return null;

  const tiles: React.ReactNode[] = [];
  for (const p of peers) {
    if (p.screenOn) tiles.push(<Tile key={`${p.id}:screen`} id={p.id} name={p.name} track={p.screen} kind="screen" big={simplified} peer={p} />);
    tiles.push(<Tile key={`${p.id}:cam`} id={p.id} name={p.name} track={p.cam} kind="cam" mic={p.mic} speaking={p.speaking} big={simplified} badge={p.spotlight ? '★' : undefined} avatar={portraits[p.id]} peer={p} />);
  }
  const showSelf = cam || simplified || peers.length > 0;
  if (localScreen) tiles.unshift(<Tile key="me:screen" id="me" name={t('video.yourScreen', 'Sua tela')} track={localScreen} kind="screen" big={simplified} />);
  if (showSelf && me) tiles.unshift(<Tile key="me:cam" id="me" name={t('video.you', 'Você')} track={localCam} kind="cam" mic={mic} speaking={mic && meSpeaking} mirror big={simplified} avatar={portraits[meId]} />);

  const focused = focus ? findFocus(focus, peers, localCam, localScreen) : null;

  if (simplified) {
    const n = Math.max(1, tiles.length);
    const cols = mini ? 1 : n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
    return (
      <div className="absolute inset-0 z-20 overflow-auto bg-ink p-4 pb-24" data-testid="simplified">
        {tiles.length ? (
          <div className="mx-auto grid max-w-6xl gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {tiles}
          </div>
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">{conn === 'off' ? t('video.dndEmpty', 'Você está em “Não incomodar”.') : t('video.alone', 'Ninguém por perto. Chegue perto de alguém para conversar.')}</div>
        )}
        {focused ? <FocusOverlay {...focused} /> : null}
      </div>
    );
  }
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex max-w-[calc(100vw-520px)] -translate-x-1/2 gap-2 overflow-x-auto pb-1" data-testid="videobar">
        <div className="pointer-events-auto flex gap-2">{tiles}</div>
      </div>
      {focused ? <FocusOverlay {...focused} /> : null}
    </>
  );
}

function findFocus(focus: string, peers: PeerMedia[], localCam: Track | null, localScreen: Track | null): { track: Track; name: string; contain: boolean; mirror: boolean; peer?: PeerMedia; kind?: 'cam' | 'screen' } | null {
  const [id, kind] = focus.split(':');
  if (id === 'me') {
    const track = kind === 'screen' ? localScreen : localCam;
    return track ? { track, name: t('video.you', 'Você'), contain: kind === 'screen', mirror: kind !== 'screen' } : null;
  }
  const p = peers.find((x) => x.id === id);
  const track = kind === 'screen' ? p?.screen : p?.cam;
  return p && track ? { track, name: p.name, contain: kind === 'screen', mirror: false, peer: p, kind: kind === 'screen' ? 'screen' : 'cam' } : null;
}

function FocusOverlay({ track, name, contain, mirror, peer, kind }: { track: Track; name: string; contain: boolean; mirror: boolean; peer?: PeerMedia; kind?: 'cam' | 'screen' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);
  return (
    <div ref={ref} className="absolute inset-x-6 bottom-24 top-32 z-30 overflow-hidden rounded-2xl border border-line bg-black shadow-2xl">
      <TrackView track={track} contain={contain} mirror={mirror} />
      <div className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs">{name}</div>
      <div className="absolute right-3 top-3 flex gap-2">
        {peer && kind ? <PeerMenu peer={peer} kind={kind} at={menuAt} setAt={setMenuAt} inline /> : null}
        <Button small variant="subtle" onClick={() => void ref.current?.requestFullscreen?.()}>
          {t('video.fullscreen', 'Tela cheia')}
        </Button>
        <Button small variant="subtle" onClick={() => useAv.setState({ focus: null })}>
          {t('app.close', 'Fechar')}
        </Button>
      </div>
    </div>
  );
}

// ---------- status ----------
export function StatusMenu({ onClose }: { onClose: () => void }) {
  const me = useGame((s) => s.players[s.meId]);
  const current: TrackedStatus | null = me ? (me.away ? 'AWAY' : me.status) : null;
  const pick = (s: TrackedStatus) => {
    net.setStatus(s);
    onClose();
  };
  const row = (s: TrackedStatus, extra?: string) => (
    <button key={s} type="button" data-testid={`status-${s}`} onClick={() => pick(s)} className={cx('block w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-panel-3', current === s && 'bg-panel-3')}>
      <span className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s], boxShadow: s === 'DND' ? 'inset 0 0 0 1px #0008' : undefined }} />
        <span className="flex-1 text-sm font-medium">{STATUS_LABEL[s]}</span>
        {STATUS_KEYS[s] ? (
          <kbd className="text-xs text-muted">
            {MOD} + {STATUS_KEYS[s]}
          </kbd>
        ) : null}
      </span>
      {extra ? <span className="mt-1 block pl-[22px] text-xs leading-snug text-muted">{extra}</span> : null}
    </button>
  );
  return (
    <div className="oi-pop absolute bottom-14 left-0 z-40 w-80 rounded-2xl border border-line bg-panel p-2 shadow-2xl" data-testid="status-menu">
      {row('AVAILABLE')}
      {row('BUSY')}
      {row('DND', t('status.dndHelp', 'Ninguém poderá falar com você. Use esta opção quando estiver em outra ligação.'))}
      {row('AWAY', t('status.awayHelp', 'Para quando sair do computador. Fica até você escolher outro status.'))}
      <div className="my-1 border-t border-line" />
      <button
        type="button"
        className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-3"
        onClick={() => {
          useGame.setState({ modal: { kind: 'customStatus' } });
          onClose();
        }}
      >
        {me?.customStatus ? (
          <>
            <Emo e={me.customStatus.emoji} /> {me.customStatus.text}
          </>
        ) : (
          <EmoText text={t('status.custom', '✏️ Definir um status personalizado…')} />
        )}
      </button>
    </div>
  );
}

// ---------- barra inferior ----------
export function BottomBar() {
  const nav = useNavigate();
  const { mic, cam, screen, conn, blocked } = useAv();
  const me = useGame((s) => s.players[s.meId]);
  const panel = useGame((s) => s.panel);
  const unread = useGame((s) => s.unread);
  const simplified = useGame((s) => s.simplified);
  const mini = useGame((s) => s.mini && !s.miniExt);
  const minimap = useGame((s) => s.minimap);
  const canAdmin = useGame((s) => s.canAdmin);
  const music = useGame((s) => s.music);
  const following = useGame((s) => s.following);
  const players = useGame((s) => s.players);
  const role = useSession((s) => s.me?.role);
  const [menu, setMenu] = useState<'status' | 'emotes' | 'more' | null>(null);
  const set = useGame.setState;
  if (!me) return null;
  const status = me.away ? 'AWAY' : me.status;
  const dnd = me.status === 'DND';
  const setMini = (on: boolean) => {
    set({ mini: on });
    desktop?.setMini(on);
  };

  if (mini) {
    return (
      <div className="absolute inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 border-t border-line bg-panel/95 p-2">
        <IconButton label={t('bar.mic', 'Microfone')} active={mic} onClick={() => void av.setMic(!mic)} disabled={dnd}>
          <I d={MIC} off={!mic} />
        </IconButton>
        <IconButton label={t('bar.cam', 'Câmera')} active={cam} onClick={() => void av.setCam(!cam)} disabled={dnd}>
          <I d={CAM} off={!cam} />
        </IconButton>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[status] }} title={STATUS_LABEL[status]} />
        <Button small variant="ghost" onClick={() => setMini(false)}>
          {t('bar.exitMini', 'Sair do Modo Mini')}
        </Button>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex items-end justify-between gap-3 p-3" data-testid="bottombar">
      {/* esquerda: eu e o meu status */}
      <div className="relative">
        <button type="button" data-testid="status-button" onClick={() => setMenu(menu === 'status' ? null : 'status')} className="flex items-center gap-3 rounded-2xl border border-line bg-panel/95 px-3 py-2 text-left shadow-lg hover:border-gold">
          <img src={avatarPortrait(me.avatar, 1)} alt="" className="pixel h-9" />
          <span>
            <span className="block max-w-40 truncate text-sm font-semibold">{me.name}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
              <span data-testid="status-label">{STATUS_LABEL[status]}</span>
              {me.customStatus ? <span className="max-w-28 truncate">· {me.customStatus.emoji} {me.customStatus.text}</span> : null}
            </span>
          </span>
        </button>
        {menu === 'status' ? <StatusMenu onClose={() => setMenu(null)} /> : null}
      </div>

      {/* centro: mídia e ações */}
      <div className="relative flex items-center gap-2 rounded-2xl border border-line bg-panel/95 p-2 shadow-lg">
        <IconButton data-testid="btn-mic" label={mic ? t('bar.micOff', 'Desligar o microfone') : t('bar.micOn', 'Ligar o microfone')} active={mic} onClick={() => void av.setMic(!mic)} disabled={dnd}>
          <I d={MIC} off={!mic} />
        </IconButton>
        <IconButton data-testid="btn-cam" label={cam ? t('bar.camOff', 'Desligar a câmera') : t('bar.camOn', 'Ligar a câmera')} active={cam} onClick={() => void av.setCam(!cam)} disabled={dnd}>
          <I d={CAM} off={!cam} />
        </IconButton>
        <IconButton data-testid="btn-screen" label={screen ? t('bar.screenOff', 'Parar de compartilhar a tela') : t('bar.screenOn', 'Compartilhar a tela')} active={screen} onClick={() => void av.setScreen(!screen)} disabled={dnd}>
          <I d={SCREEN} />
        </IconButton>
        <span className="mx-1 h-6 w-px bg-line" />
        <IconButton label={me.hand ? t('bar.handDown', 'Baixar a mão') : t('bar.handUp', 'Levantar a mão')} active={me.hand} onClick={() => net.send('hand', { raised: !me.hand })}>
          <Emo e="✋" size={20} />
        </IconButton>
        <IconButton label={t('bar.emotes', 'Reações')} active={menu === 'emotes'} onClick={() => setMenu(menu === 'emotes' ? null : 'emotes')}>
          <Emo e="😀" size={20} />
        </IconButton>
        {menu === 'emotes' ? (
          <div className="oi-pop absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-1 rounded-2xl border border-line bg-panel p-2 shadow-2xl">
            {EMOTES.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-lg p-1.5 hover:bg-panel-3"
                onClick={() => {
                  net.send('emote', { emoji: e });
                  setMenu(null);
                }}
              >
                <Emo e={e} size={28} />
              </button>
            ))}
          </div>
        ) : null}
        <span className="mx-1 h-6 w-px bg-line" />
        <IconButton label={t('bar.radio', 'Rádio do escritório')} active={music.some((c) => c.listeners.includes(me.id))} onClick={() => set({ modal: { kind: 'radio' } })}>
          <Emo e="🎵" size={20} />
          {music.length ? <span className="absolute -right-1 -top-1 rounded-full bg-gold px-1 text-[10px] font-bold text-ink">{music.length}</span> : null}
        </IconButton>
        {can(me.role, 'calendar.use') ? (
          <IconButton label={t('bar.calendar', 'Agenda')} onClick={() => set({ modal: { kind: 'calendar' } })}>
            <Emo e="📅" size={20} />
          </IconButton>
        ) : null}
        <IconButton label={t('bar.simplified', 'Visualização Simplificada (só as pessoas)')} active={simplified} onClick={() => set({ simplified: !simplified })}>
          <Emo e="👁" size={20} />
        </IconButton>
        <IconButton label={t('bar.more', 'Mais opções')} active={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
          <Emo e="⋯" size={20} />
        </IconButton>
        {menu === 'more' ? (
          <div className="oi-pop absolute bottom-14 right-0 w-64 rounded-2xl border border-line bg-panel p-2 text-sm shadow-2xl" onClick={() => setMenu(null)}>
            <MenuItem onClick={() => setMini(true)}><Emo e="🪟" /> {t('more.mini', 'Modo Mini')}</MenuItem>
            <MenuItem onClick={() => set({ minimap: !minimap })}><Emo e="🗺" /> {minimap ? t('more.hideMinimap', 'Esconder o mini-mapa') : t('more.showMinimap', 'Mostrar o mini-mapa')}</MenuItem>
            <MenuItem onClick={() => net.send('lead')}><Emo e="🚩" /> {t('more.lead', 'Pedir que me sigam (liderar)')}</MenuItem>
            {me.deskId ? (
              <>
                <MenuItem
                  onClick={() => {
                    const desk = mapDesks(useGame.getState().map!).find((d) => d.id === me.deskId);
                    if (desk) net.send('teleport', deskSeat(desk));
                  }}
                >
                  <Emo e="🪑" /> {t('more.goDesk', 'Ir para a minha mesa')}
                </MenuItem>
                <MenuItem onClick={() => set({ modal: { kind: 'myDesk' } })}><Emo e="🪴" /> {t('more.myDesk', 'Minha mesa (recados e decoração)')}</MenuItem>
              </>
            ) : null}
            <MenuItem onClick={() => set({ modal: { kind: 'avatar' } })}><Emo e="🧍" /> {t('more.avatar', 'Personalizar o avatar')}</MenuItem>
            <MenuItem onClick={() => set({ modal: { kind: 'settings' } })}><Emo e="⚙" /> {t('more.settings', 'Áudio, vídeo e preferências')}</MenuItem>
            {canAdmin ? (
              <>
                <div className="my-1 border-t border-line" />
                <MenuItem onClick={() => set({ modal: { kind: 'mapmaker' } })}><Emo e="🛠" /> {t('more.mapmaker', 'Mapmaker e Build Tool')}</MenuItem>
                <MenuItem data-testid="open-admin" onClick={() => set({ admin: 'painel' })}><Emo e="📊" /> {t('more.admin', 'Painel do ADM')}</MenuItem>
              </>
            ) : isAdminRole(role) ? (
              <MenuItem data-testid="open-admin" onClick={() => set({ admin: 'painel' })}><Emo e="📊" /> {t('more.admin', 'Painel do ADM')}</MenuItem>
            ) : null}
            <div className="my-1 border-t border-line" />
            <MenuItem onClick={() => nav('/')}><Emo e="🚪" /> {t('more.leave', 'Sair do escritório')}</MenuItem>
          </div>
        ) : null}
        {following ? (
          <div className="absolute -top-10 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-gold bg-panel px-3 py-1 text-xs">
            {t('bar.following', 'Seguindo {{name}}', { name: players[following]?.name ?? '' })}
            <button type="button" className="text-gold underline" onClick={() => set({ following: null })}>
              {t('bar.stopFollow', 'parar')}
            </button>
          </div>
        ) : null}
        {blocked ? (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <Button small onClick={() => void av.unblock()}>
              <Emo e="🔊" /> {t('bar.unblock', 'Clique para ativar o som')}
            </Button>
          </div>
        ) : null}
        {conn === 'error' || conn === 'connecting' ? <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] text-warn">{conn === 'error' ? t('bar.avError', 'áudio/vídeo indisponível, tentando de novo…') : t('bar.avConnecting', 'conectando áudio/vídeo…')}</span> : null}
      </div>

      {/* direita: painéis */}
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel/95 p-2 shadow-lg">
        <IconButton data-testid="btn-chat" label={t('bar.chat', 'Chat')} active={panel === 'chat'} onClick={() => set({ panel: panel === 'chat' ? null : 'chat', unread: 0 })}>
          <Emo e="💬" size={20} />
          {unread > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span> : null}
        </IconButton>
        <IconButton data-testid="btn-people" label={t('bar.people', 'Participantes')} active={panel === 'people'} onClick={() => set({ panel: panel === 'people' ? null : 'people' })}>
          <Emo e="👥" size={20} />
          <span className="absolute -right-1 -top-1 rounded-full bg-panel-3 px-1 text-[10px] font-bold text-stone-100">{Object.keys(players).length}</span>
        </IconButton>
      </div>
    </div>
  );
}

function MenuItem({ onClick, children, 'data-testid': testid }: { onClick: () => void; children: React.ReactNode; 'data-testid'?: string }) {
  return (
    <button type="button" data-testid={testid} onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-stone-100 hover:bg-panel-3">
      {children}
    </button>
  );
}

// ---------- mini-mapa ----------
export function MiniMap() {
  const map = useGame((s) => s.map);
  const mapRev = useGame((s) => s.mapRev);
  const show = useGame((s) => s.minimap && !s.simplified && !(s.mini && !s.miniExt) && !s.winHidden);
  const ref = useRef<HTMLCanvasElement>(null);
  const px = map ? Math.max(1, Math.min(4, Math.floor(232 / map.width))) : 2;
  const base = useMemo(() => (map ? renderMini(map, px) : null), [mapRev, px]);

  useEffect(() => {
    if (!show || !base) return;
    const draw = () => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(base, 0, 0);
      const g = useGame.getState();
      for (const p of Object.values(g.players)) {
        ctx.fillStyle = p.id === g.meId ? '#d7b870' : STATUS_COLOR[p.away ? 'AWAY' : p.status];
        const r = p.id === g.meId ? Math.max(3, px) : Math.max(2, px * 0.8);
        ctx.beginPath();
        ctx.arc(p.x * px + px / 2, p.y * px + px / 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0b0b0d';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    draw();
    const id = window.setInterval(draw, 400);
    return () => clearInterval(id);
  }, [show, base, px]);

  if (!show || !map || !base) return null;
  return (
    <div className="absolute right-3 top-3 z-20 overflow-hidden rounded-xl border border-line bg-panel/90 p-1 shadow-lg">
      <canvas
        ref={ref}
        width={base.width}
        height={base.height}
        data-testid="minimap"
        className="block cursor-pointer"
        title={t('minimap.hint', 'Clique para ir até o ponto')}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          bus.emit('goto', { x: Math.floor(((e.clientX - r.left) / r.width) * map.width), y: Math.floor(((e.clientY - r.top) / r.height) * map.height) });
        }}
      />
    </div>
  );
}

// ---------- painel lateral: chat e participantes ----------
export function SidePanel() {
  const panel = useGame((s) => s.panel);
  const hide = useGame((s) => s.mini && !s.miniExt);
  if (!panel || hide) return null;
  return (
    <aside className="absolute bottom-20 right-3 top-3 z-30 flex w-80 flex-col overflow-hidden rounded-2xl border border-line bg-panel/97 shadow-2xl" data-testid={`panel-${panel}`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gold">{panel === 'chat' ? t('chat.title', 'Chat') : t('people.title', 'Participantes')}</h2>
        <button type="button" aria-label={t('app.close', 'Fechar')} className="text-muted hover:text-stone-100" onClick={() => useGame.setState({ panel: null })}>
          ✕
        </button>
      </div>
      {panel === 'chat' ? <ChatPanel /> : <PeoplePanel />}
    </aside>
  );
}

function ChatPanel() {
  const chat = useGame((s) => s.chat);
  const tab = useGame((s) => s.chatTab);
  const dmWith = useGame((s) => s.dmWith);
  const meId = useGame((s) => s.meId);
  const players = useGame((s) => s.players);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const others = Object.values(players).filter((p) => p.id !== meId);
  const list = chat.filter((m: ChatMessage) => (tab === 'dm' ? m.scope === 'dm' && (!dmWith || m.fromId === dmWith || m.toId === dmWith) : m.scope === tab));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
    useGame.setState({ unread: 0 });
  }, [list.length, tab]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) return;
    if (tab === 'dm') {
      if (!dmWith) return toast(t('chat.pickPerson', 'Escolha com quem você quer falar.'), 'info');
      net.send('chat', { scope: 'dm', to: dmWith, text: msg });
    } else net.send('chat', { scope: tab, text: msg });
    setText('');
  };

  return (
    <>
      <div className="px-2 pt-1">
        <Tabs
          tabs={[
            { id: 'near', label: t('chat.near', 'Perto de mim') },
            { id: 'all', label: t('chat.all', 'Todos') },
            { id: 'dm', label: t('chat.dm', 'Direta') },
          ]}
          value={tab}
          onChange={(v) => useGame.setState({ chatTab: v })}
        />
      </div>
      {tab === 'dm' ? (
        <div className="border-b border-line p-2">
          <select aria-label={t('chat.with', 'Conversar com')} value={dmWith ?? ''} onChange={(e) => useGame.setState({ dmWith: e.target.value || null })} className="w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-sm">
            <option value="">{t('chat.pick', 'Escolha uma pessoa…')}</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3 text-sm" data-testid="chat-list">
        {list.length === 0 ? <p className="pt-6 text-center text-xs text-muted">{tab === 'near' ? t('chat.emptyNear', 'Mensagens para quem está no seu raio ou na mesma sala.') : t('chat.empty', 'Nenhuma mensagem ainda.')}</p> : null}
        {list.map((m) => (
          <div key={m.id} className={cx('max-w-[92%] rounded-xl px-3 py-1.5', m.fromId === meId ? 'ml-auto bg-gold/15' : 'bg-panel-2')}>
            <div className="flex items-baseline justify-between gap-3 text-[10px] text-muted">
              <span className="font-semibold text-gold-soft">
                {m.fromId === meId ? t('chat.me', 'Você') : m.fromName}
                {m.scope === 'dm' && m.fromId === meId && m.toId ? ` → ${players[m.toId]?.name ?? ''}` : ''}
              </span>
              <span>{new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p className="whitespace-pre-wrap break-words">{m.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-2">
        <Input data-testid="chat-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t('chat.placeholder', 'Escreva uma mensagem…')} />
        <Button type="submit" small>
          {t('chat.send', 'Enviar')}
        </Button>
      </form>
    </>
  );
}

interface Member {
  id: string;
  name: string;
  role: PlayerState['role'];
}

function PeoplePanel() {
  const players = useGame((s) => s.players);
  const meId = useGame((s) => s.meId);
  const office = useGame((s) => s.office);
  const desks = useGame((s) => s.desks);
  const map = useGame((s) => s.map);
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState('');
  const isGuest = useSession((s) => s.me?.kind === 'guest');

  useEffect(() => {
    if (!office || isGuest) return;
    api
      .get<Member[]>(`/api/offices/${office.id}/members`)
      .then(setMembers)
      .catch((e) => console.warn(errMsg(e)));
  }, [office?.id, isGuest]);

  const online = Object.values(players)
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const offline = members.filter((m) => !players[m.id] && m.name.toLowerCase().includes(q.toLowerCase()));
  const goDesk = (userId: string) => {
    const d = desks.find((x) => x.userId === userId);
    const obj = d && map ? mapDesks(map).find((o) => o.id === d.id) : null;
    if (obj) net.send('teleport', deskSeat(obj));
    else toast(t('people.noDesk', 'Esta pessoa ainda não tem mesa.'), 'info');
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('people.search', 'Buscar…')} className="mb-2" />
      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('people.online', 'Online ({{n}})', { n: online.length })}</p>
      {online.map((p) => {
        const area = p.areaId ? map?.areas.find((a) => a.id === p.areaId)?.name : null;
        const st = p.away ? 'AWAY' : p.status;
        return (
          <div key={p.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-panel-2" data-testid={`person-${p.name}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[st] }} title={STATUS_LABEL[st]} />
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => useGame.setState({ modal: { kind: 'profile', playerId: p.id } })}>
              <span className="block truncate text-sm">
                {p.name} {p.id === meId ? <span className="text-muted">({t('people.you', 'você')})</span> : null} {p.hand ? <Emo e="✋" size={15} /> : null}
              </span>
              <span className="block truncate text-[11px] text-muted">
                {ROLE_LABEL[p.role]} · {area ?? t('people.openArea', 'área aberta')}
                {p.customStatus ? (
                  <>
                    {' · '}
                    <Emo e={p.customStatus.emoji} size={13} /> {p.customStatus.text}
                  </>
                ) : null}
              </span>
            </button>
            {p.id !== meId ? (
              <span className="flex shrink-0 gap-1 opacity-70 group-hover:opacity-100">
                <button type="button" title={t('people.wave', 'Acenar')} onClick={() => net.send('wave', { to: p.id })}>
                  <Emo e="👋" size={20} />
                </button>
                <button type="button" title={t('people.message', 'Mensagem')} onClick={() => useGame.setState({ panel: 'chat', chatTab: 'dm', dmWith: p.id })}>
                  <Emo e="💬" size={20} />
                </button>
                <button type="button" title={t('people.goto', 'Ir até')} onClick={() => net.gotoPlayer(p.id)}>
                  <Emo e="📍" size={20} />
                </button>
              </span>
            ) : null}
          </div>
        );
      })}
      {offline.length ? (
        <>
          <p className="mt-3 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('people.offline', 'Offline ({{n}})', { n: offline.length })}</p>
          {offline.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted hover:bg-panel-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-panel-3" />
              <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
              <Badge color="gray">{ROLE_LABEL[m.role]}</Badge>
              <button type="button" title={t('people.goDesk', 'Ir até a mesa')} onClick={() => goDesk(m.id)}>
                <Emo e="🪑" size={20} />
              </button>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
