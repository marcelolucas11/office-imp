// SPDX-License-Identifier: AGPL-3.0-only
// Modo Mini em janela à parte, no estilo do Gather: só as câmeras flutuando sobre os outros apps.
//  - App desktop: janela sem moldura e transparente, aberta por esta página (mesma origem). As câmeras são
//    desenhadas nela por um React portal, então a conexão de áudio e vídeo continua sendo a mesma.
//  - Navegador com Document Picture-in-Picture (Chrome/Edge): mesma ideia, numa janela PiP.
//  - Sem nenhum dos dois: o Modo Mini antigo, dentro da própria página (Hud.tsx).
// Clicar numa câmera volta para o escritório.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Track } from 'livekit-client';
import { STATUS_COLOR, STATUS_LABEL, type Status } from '@office-imp/shared';
import { cx } from '@office-imp/ui';
import { avatarPortrait } from '../game/art/avatar';
import { net } from '../game/net';
import { useGame } from '../game/store';
import { t } from '../lib/i18n';
import { desktop } from '../lib/session';
import { av, useAv } from './av';
import { MOD, STATUS_KEYS, TrackView } from './Hud';

const TILE_W = 240;
const TILE_H = 135;
const MAX_TILES = 4;
const PIP_W = TILE_W + 32;

type Target = { win: Window; root: HTMLElement; kind: 'desktop' | 'pip' };

/** Sai do Modo Mini e volta para o escritório (a janela principal reaparece). */
export function exitMini() {
  useGame.setState({ mini: false });
  desktop?.setMini(false);
}

/** Copia as folhas de estilo da página para a janela mini (Tailwind, fontes, tema). */
function copyStyles(to: Document) {
  for (const node of Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))) {
    if (node instanceof HTMLLinkElement) {
      const link = to.createElement('link');
      link.rel = 'stylesheet';
      link.href = node.href; // endereço absoluto: a janela mini é about:blank
      to.head.appendChild(link);
    } else {
      const style = to.createElement('style');
      style.textContent = node.textContent;
      to.head.appendChild(style);
    }
  }
}

function prepare(win: Window, kind: Target['kind']): Target {
  const doc = win.document;
  doc.title = t('mini.title', 'Modo Mini');
  doc.documentElement.lang = 'pt-BR';
  copyStyles(doc);
  const style = doc.createElement('style');
  style.textContent =
    kind === 'desktop'
      ? 'html,body{background:transparent!important;margin:0;overflow:hidden}'
      : 'html,body{margin:0;overflow:auto;background:var(--color-ink)}';
  doc.head.appendChild(style);
  doc.body.innerHTML = '';
  const root = doc.createElement('div');
  root.id = 'oi-mini-root';
  doc.body.appendChild(root);
  return { win, root, kind };
}

function canPip(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

/** Abre e mantém a janela mini enquanto o Modo Mini estiver ligado. */
export function MiniMode() {
  const mini = useGame((s) => s.mini);
  const phase = useGame((s) => s.phase);
  const [target, setTarget] = useState<Target | null>(null);
  const on = mini && phase === 'online';

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let opened: Window | null = null;
    const onGone = () => {
      if (cancelled) return;
      setTarget(null);
      useGame.setState({ miniExt: false });
      if (useGame.getState().mini) exitMini();
    };
    const attach = (w: Window, kind: Target['kind']) => {
      opened = w;
      const tg = prepare(w, kind);
      w.addEventListener('pagehide', onGone);
      useGame.setState({ miniExt: true });
      setTarget(tg);
    };

    if (desktop?.miniWindow) {
      const w = window.open('about:blank', 'oi-mini', `width=${TILE_W + 20},height=${TILE_H + 70}`);
      if (w) attach(w, 'desktop');
    } else if (!desktop && canPip()) {
      // a abertura precisa do clique da pessoa: este efeito roda logo depois do clique em "Modo Mini"
      (window as any).documentPictureInPicture
        .requestWindow({ width: PIP_W, height: TILE_H * 2 + 90 })
        .then((w: Window) => {
          if (cancelled) return w.close();
          attach(w, 'pip');
        })
        .catch(() => undefined); // sem permissão: fica o Modo Mini dentro da página
    }

    return () => {
      cancelled = true;
      useGame.setState({ miniExt: false });
      setTarget(null);
      try {
        opened?.removeEventListener('pagehide', onGone);
        opened?.close();
      } catch {}
    };
  }, [on]);

  if (!target) return null;
  return createPortal(<MiniContent target={target} />, target.root);
}

function MiniContent({ target }: { target: Target }) {
  const { peers, localCam, mic, cam, meSpeaking } = useAv();
  const players = useGame((s) => s.players);
  const meId = useGame((s) => s.meId);
  const me = players[meId];
  const [menu, setMenu] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const portraits = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of Object.values(players)) out[p.id] = avatarPortrait(p.avatar, 2);
    return out;
  }, [players]);

  // a janela do app desktop acompanha o tamanho do conteúdo (cresce para cima a partir do canto)
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || target.kind !== 'desktop') return;
    const report = () => {
      const r = el.getBoundingClientRect();
      desktop?.setMiniSize?.(Math.ceil(r.width), Math.ceil(r.height));
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [target]);

  // fecha o menu de status ao apertar Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    target.win.addEventListener('keydown', onKey);
    return () => target.win.removeEventListener('keydown', onKey);
  }, [target]);

  if (!me) return null;
  const status: Status | 'AWAY' = me.away ? 'AWAY' : me.status;
  const dnd = me.status === 'DND';

  const tiles: { key: string; name: string; track: Track | null; mic?: boolean; speaking?: boolean; mirror?: boolean; avatar?: string; screen?: boolean }[] = [];
  tiles.push({ key: 'me', name: t('video.you', 'Você'), track: cam ? localCam : null, mic, speaking: mic && meSpeaking, mirror: true, avatar: portraits[meId] });
  for (const p of peers) {
    tiles.push({ key: `${p.id}:cam`, name: p.name, track: p.cam, mic: p.mic, speaking: p.speaking, avatar: portraits[p.id] });
    if (p.screen) tiles.push({ key: `${p.id}:screen`, name: p.name, track: p.screen, screen: true });
  }
  const shown = tiles.slice(0, MAX_TILES);
  const extra = tiles.length - shown.length;
  const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties;
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;
  const desk = target.kind === 'desktop';

  return (
    <div ref={boxRef} className={cx('inline-flex select-none flex-col items-stretch gap-2 p-2.5 text-stone-100', !desk && 'w-full')} style={{ width: desk ? TILE_W + 20 : undefined }} data-testid="mini-window">
      {shown.map((tile) => (
        <button
          key={tile.key}
          type="button"
          style={{ ...noDrag, height: TILE_H }}
          onClick={exitMini}
          title={t('mini.back', 'Clique para voltar ao escritório')}
          data-testid={`mini-tile-${tile.key}`}
          className={cx(
            'group relative w-full shrink-0 overflow-hidden rounded-2xl border-2 bg-panel-2 shadow-[0_10px_28px_rgba(0,0,0,0.55)] transition-transform hover:scale-[1.015]',
            tile.speaking ? 'border-ok' : 'border-white/10',
          )}
        >
          {tile.track ? (
            <TrackView track={tile.track} mirror={tile.mirror} contain={tile.screen} />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-b from-panel-3 to-panel-2">
              {tile.avatar ? <img src={tile.avatar} alt="" className="pixel h-14" /> : <span className="text-2xl text-muted">{tile.name.slice(0, 1).toUpperCase()}</span>}
            </div>
          )}
          <span className="absolute bottom-1.5 left-1.5 flex max-w-[85%] items-center gap-1 rounded-lg bg-black/65 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-sm">
            {tile.screen ? '🖥' : tile.mic === false ? <MicOff /> : null}
            <span className="truncate">{tile.name}</span>
          </span>
          {tile.key === 'me' ? <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-black/60" style={{ background: STATUS_COLOR[status] }} /> : null}
          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100">{t('mini.backShort', '↗ Voltar ao escritório')}</span>
        </button>
      ))}
      {extra > 0 ? (
        <button type="button" style={noDrag} onClick={exitMini} className="rounded-xl bg-black/70 py-1 text-center text-xs font-semibold text-gold shadow-lg">
          {t('mini.more', '+{{n}} pessoas na conversa', { n: extra })}
        </button>
      ) : null}

      {/* menu de status */}
      {menu ? (
        <div className="oi-pop rounded-2xl border border-line bg-panel/95 p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.6)] backdrop-blur" style={noDrag} data-testid="mini-status-menu">
          {(['AVAILABLE', 'BUSY', 'DND'] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`mini-status-${s}`}
              onClick={() => {
                net.setStatus(s);
                setMenu(false);
              }}
              className={cx('block w-full rounded-xl px-2.5 py-2 text-left hover:bg-panel-3', me.status === s && 'bg-panel-3')}
            >
              <span className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                <span className="flex-1 text-[13px] font-medium">{STATUS_LABEL[s]}</span>
                <kbd className="text-[10px] text-muted">
                  {MOD}+{STATUS_KEYS[s]}
                </kbd>
              </span>
              {s === 'DND' ? <span className="mt-0.5 block pl-5 text-[11px] leading-snug text-muted">{t('mini.dndHelp', 'Ninguém poderá falar com você.')}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* barra de controles: arrastar, microfone, câmera, status e voltar */}
      <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-panel/90 p-1 shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur" style={desk ? drag : undefined}>
        {desk ? (
          <span className="grid h-8 w-5 cursor-grab place-items-center text-muted" title={t('mini.drag', 'Arraste para mover')} aria-hidden="true">
            <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
              <circle cx="2" cy="2" r="1.2" />
              <circle cx="6" cy="2" r="1.2" />
              <circle cx="2" cy="7" r="1.2" />
              <circle cx="6" cy="7" r="1.2" />
              <circle cx="2" cy="12" r="1.2" />
              <circle cx="6" cy="12" r="1.2" />
            </svg>
          </span>
        ) : null}
        <MiniBtn label={mic ? t('bar.micOff', 'Desligar o microfone') : t('bar.micOn', 'Ligar o microfone')} active={mic} disabled={dnd} onClick={() => void av.setMic(!mic)} testId="mini-mic">
          {mic ? <MicOn /> : <MicOff />}
        </MiniBtn>
        <MiniBtn label={cam ? t('bar.camOff', 'Desligar a câmera') : t('bar.camOn', 'Ligar a câmera')} active={cam} disabled={dnd} onClick={() => void av.setCam(!cam)} testId="mini-cam">
          <CamIcon off={!cam} />
        </MiniBtn>
        <button
          type="button"
          style={noDrag}
          data-testid="mini-status"
          onClick={() => setMenu((v) => !v)}
          title={t('mini.status', 'Mudar o status')}
          className={cx('flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1.5 text-[12px] font-medium hover:bg-panel-3', menu && 'bg-panel-3')}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} />
          <span className="truncate whitespace-nowrap">{STATUS_LABEL[status]}</span>
        </button>
        <MiniBtn label={t('bar.exitMini', 'Sair do Modo Mini')} onClick={exitMini} testId="mini-exit">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
          </svg>
        </MiniBtn>
      </div>
    </div>
  );
}

function MiniBtn({ label, active, disabled, onClick, children, testId }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors disabled:opacity-40', active ? 'bg-gold text-ink' : 'bg-panel-3 text-stone-100 hover:bg-line')}
    >
      {children}
    </button>
  );
}

const MicOn = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
  </svg>
);
const MicOff = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4M3 3l18 18" />
  </svg>
);
const CamIcon = ({ off }: { off?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 10l5-3v10l-5-3M3 7h12v10H3z" />
    {off ? <path d="M3 3l18 18" /> : null}
  </svg>
);
