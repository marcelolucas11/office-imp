// SPDX-License-Identifier: AGPL-3.0-only
// Modo Mini em janela à parte, no estilo do Gather: só as câmeras flutuando sobre os outros apps.
//  - App desktop: janela sem moldura e transparente, aberta por esta página (mesma origem). As câmeras são
//    desenhadas nela por um React portal, então a conexão de áudio e vídeo continua sendo a mesma.
//  - Navegador com Document Picture-in-Picture (Chrome/Edge): mesma ideia, numa janela PiP.
//  - Sem nenhum dos dois: o Modo Mini antigo, dentro da própria página (Hud.tsx).
// Sozinho na conversa, o Modo Mini vira um ícone (o seu boneco ou a sua câmera); passando o mouse aparecem
// a moldura, configurações, arrastar e expandir, e as bordas para aumentar ou diminuir. Em "Não incomodar"
// o Modo Mini some. Clicar no ícone ou numa câmera volta para o escritório.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Track } from 'livekit-client';
import { STATUS_COLOR, STATUS_LABEL, type Status } from '@office-imp/shared';
import { cx } from '@office-imp/ui';
import { avatarPortrait } from '../game/art/avatar';
import { net } from '../game/net';
import { useGame } from '../game/store';
import { t } from '../lib/i18n';
import { desktop, toast, type MiniAnchor } from '../lib/session';
import { av, useAv } from './av';
import { MOD, STATUS_KEYS, TrackView } from './Hud';
import { Emo } from '../lib/icons';

const TILE_W = 272; // largura padrão: cabe microfone, câmera, tela, status e voltar na barra
/** Abaixo desta largura, os quadros das câmeras viram ícones (para ocupar pouco da tela). */
const TILE_AS_ICON = 230;
const TILE_MAX = 480;
const ICON = 72; // lado padrão do ícone (sozinho na conversa)
const ICON_MIN = 56;
const ICON_MAX = 220;
/** Menor largura de quadro: o ícone correspondente (altura 16:9) fica com o lado mínimo. */
const TILE_MIN = Math.ceil((ICON_MIN * 16) / 9);
const MAX_TILES = 4;
const PIP_W = TILE_W + 32;
const SIZE_KEY = 'oi-mini-size';

type Target = { win: Window; root: HTMLElement; kind: 'desktop' | 'pip' };
type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Sai do Modo Mini e volta para o escritório (a janela principal reaparece). */
export function exitMini() {
  useGame.setState({ mini: false });
  desktop?.setMini(false);
}

/** O "fechar" do Modo Mini: some com ele sem trazer o escritório para a frente. */
let closingQuietly = false;
export function closeMini() {
  if (desktop?.closeMini) {
    // o app fecha a janela mini e deixa a principal minimizada; ele mesmo avisa a página que o Modo Mini acabou
    closingQuietly = true;
    desktop.closeMini();
    setTimeout(() => (closingQuietly = false), 1500);
  } else exitMini(); // navegador (fecha a janela PiP) ou app antigo
}

function loadSizes(): { icon: number; tile: number } {
  try {
    const v = JSON.parse(localStorage.getItem(SIZE_KEY) ?? '{}');
    return {
      icon: Number.isFinite(v.icon) ? clamp(v.icon, ICON_MIN, ICON_MAX) : ICON,
      tile: Number.isFinite(v.tile) ? clamp(v.tile, TILE_MIN, TILE_MAX) : TILE_W,
    };
  } catch {
    return { icon: ICON, tile: TILE_W };
  }
}
function saveSizes(v: { icon: number; tile: number }) {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(v));
  } catch {}
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(v)));

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
  // no app o conteúdo encosta no canto de baixo à direita: é o canto que fica parado quando o tamanho muda
  style.textContent =
    kind === 'desktop'
      ? 'html,body{background:transparent!important;margin:0;overflow:hidden;width:100%;height:100%}body{display:flex;align-items:flex-end;justify-content:flex-end}'
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
  const myStatus = useGame((s) => s.players[s.meId]?.status);
  const [target, setTarget] = useState<Target | null>(null);
  const on = mini && phase === 'online';
  const dnd = myStatus === 'DND';

  // o app desktop usa o status para esconder o Modo Mini em "Não incomodar" (inclusive o status que volta
  // do servidor ao entrar, que não passa por net.setStatus)
  useEffect(() => {
    if (myStatus) desktop?.setStatus(myStatus);
  }, [myStatus]);

  // "Não incomodar": no app desktop a janela mini fica escondida (o app cuida disso e ela volta quando o
  // status muda). No navegador a janela PiP não reabre sozinha, então o Modo Mini acaba.
  useEffect(() => {
    if (!on || !dnd || desktop?.closeMini) return;
    exitMini();
    toast(t('mini.dndHidden', 'Em "Não incomodar" o Modo Mini fica escondido.'));
  }, [on, dnd]);

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let opened: Window | null = null;
    const onGone = () => {
      if (cancelled) return;
      setTarget(null);
      useGame.setState({ miniExt: false });
      if (closingQuietly) useGame.setState({ mini: false });
      else if (useGame.getState().mini) exitMini();
    };
    const attach = (w: Window, kind: Target['kind']) => {
      opened = w;
      const tg = prepare(w, kind);
      w.addEventListener('pagehide', onGone);
      useGame.setState({ miniExt: true });
      setTarget(tg);
    };

    if (desktop?.miniWindow) {
      const w = window.open('about:blank', 'oi-mini', `width=${TILE_W + 20},height=${TILE_H(TILE_W) + 70}`);
      if (w) attach(w, 'desktop');
    } else if (!desktop && canPip()) {
      // a abertura precisa do clique da pessoa: este efeito roda logo depois do clique em "Modo Mini"
      (window as any).documentPictureInPicture
        .requestWindow({ width: PIP_W, height: TILE_H(TILE_W) * 2 + 90 })
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

const TILE_H = (w: number) => Math.round((w * 9) / 16);

/**
 * Moldura do Modo Mini no app desktop: mostra os controles com o mouse em cima, arrasta a janela pela alça
 * e aumenta/diminui pelas bordas. O tamanho da janela acompanha o conteúdo; durante o redimensionamento o
 * canto oposto à borda puxada fica parado.
 */
function useMiniFrame(target: Target, boxRef: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  const desk = target.kind === 'desktop';
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false); // arrastando ou redimensionando
  const leaveTimer = useRef<number | undefined>(undefined);
  const anchor = useRef<MiniAnchor | undefined>(undefined);

  // a janela do app desktop acompanha o tamanho do conteúdo
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || !desk) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      desktop?.setMiniSize?.(Math.ceil(r.width), Math.ceil(r.height), anchor.current);
    };
    report();
    // o ResizeObserver precisa ser o da própria janela mini: o da página principal não vê mudanças em
    // elementos de outro documento (o tamanho só era enviado uma vez)
    const RO: typeof ResizeObserver = (target.win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver ?? ResizeObserver;
    const ro = new RO(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [target, ...deps]);

  useEffect(() => () => target.win.clearTimeout(leaveTimer.current), [target]);

  const enter = () => {
    target.win.clearTimeout(leaveTimer.current);
    setHover(true);
  };
  const leave = () => {
    target.win.clearTimeout(leaveTimer.current);
    leaveTimer.current = target.win.setTimeout(() => setHover(false), 450);
  };

  /** Gesto com o ponteiro preso ao elemento (continua mesmo saindo da janela). */
  const gesture = (e: React.PointerEvent, onMove: (dx: number, dy: number) => void, onEnd: () => void) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
    const sx = e.screenX;
    const sy = e.screenY;
    setBusy(true);
    const move = (ev: PointerEvent) => onMove(ev.screenX - sx, ev.screenY - sy);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setBusy(false);
      onEnd();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  /** Alça de arrastar: o app move a janela seguindo o cursor (app antigo: região de arrasto do sistema). */
  const dragProps = (): React.HTMLAttributes<HTMLElement> & { style?: React.CSSProperties } => {
    if (!desk) return {};
    if (!desktop?.miniDrag) return { style: { WebkitAppRegion: 'drag' } as React.CSSProperties };
    return {
      onPointerDown: (e) => {
        desktop?.miniDrag?.('start');
        gesture(
          e,
          () => desktop?.miniDrag?.('move'),
          () => desktop?.miniDrag?.('end'),
        );
      },
    };
  };

  /**
   * Bordas de redimensionar. `value` é o tamanho atual; `perY` converte o arrasto vertical na mesma medida
   * (ex.: largura do quadro a partir da altura).
   */
  const edges = (value: number, perY: number, min: number, max: number, set: (v: number) => void, arcInset = 0) => {
    if (!desk) return null;
    const start = (edge: Edge) => (e: React.PointerEvent) => {
      const v0 = value;
      // o canto oposto à borda puxada fica parado
      anchor.current = `${edge.includes('s') ? 't' : 'b'}${edge.includes('e') ? 'l' : 'r'}` as MiniAnchor;
      gesture(
        e,
        (dx, dy) => {
          const hx = edge.includes('e') ? dx : edge.includes('w') ? -dx : null;
          const hy = edge.includes('s') ? dy * perY : edge.includes('n') ? -dy * perY : null;
          const d = hx !== null && hy !== null ? (Math.abs(hx) > Math.abs(hy) ? hx : hy) : (hx ?? hy ?? 0);
          set(clamp(v0 + d, min, max));
        },
        () => {
          // o próximo ajuste de tamanho (ex.: alguém entra na conversa) volta a crescer a partir do canto de baixo
          target.win.setTimeout(() => (anchor.current = undefined), 200);
        },
      );
    };
    const show = hover || busy;
    const base = 'absolute z-20 touch-none';
    const cursors: Record<Edge, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
    const pos: Record<Edge, string> = {
      n: 'left-3 right-3 top-0 h-1.5',
      s: 'bottom-0 left-3 right-3 h-1.5',
      w: 'bottom-3 left-0 top-3 w-1.5',
      e: 'bottom-3 right-0 top-3 w-1.5',
      nw: 'left-0 top-0 h-4 w-4',
      ne: 'right-0 top-0 h-4 w-4',
      sw: 'bottom-0 left-0 h-4 w-4',
      se: 'bottom-0 right-0 h-4 w-4',
    };
    // linha amarela curva só nos cantos: mostra onde puxar para aumentar ou diminuir
    const rot: Partial<Record<Edge, number>> = { nw: 0, ne: 90, se: 180, sw: 270 };
    const arcPos: Partial<Record<Edge, React.CSSProperties>> = {
      nw: { left: arcInset, top: arcInset },
      ne: { right: arcInset, top: arcInset },
      se: { right: arcInset, bottom: arcInset },
      sw: { left: arcInset, bottom: arcInset },
    };
    return (Object.keys(pos) as Edge[]).map((edge) => (
      <Fragment key={edge}>
        <span
          aria-hidden="true"
          data-testid={`mini-resize-${edge}`}
          onPointerDown={start(edge)}
          className={cx(base, pos[edge], !show && 'pointer-events-none')}
          style={{ cursor: cursors[edge], WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        />
        {rot[edge] !== undefined ? (
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            className={cx('pointer-events-none absolute z-10 text-gold drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] transition-opacity duration-150', show ? 'opacity-100' : 'opacity-0')}
            style={{ ...arcPos[edge], transform: `rotate(${rot[edge]}deg)` }}
            data-testid={`mini-corner-${edge}`}
          >
            <path d="M2 15.5 A13.5 13.5 0 0 1 15.5 2" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : null}
      </Fragment>
    ));
  };

  return { desk, hover: hover || busy, enter, leave, dragProps, edges };
}

function MiniContent({ target }: { target: Target }) {
  const peers = useAv((s) => s.peers);
  const cam = useAv((s) => s.cam);
  const [sizes, setSizes] = useState(loadSizes);
  const setSize = (k: 'icon' | 'tile') => (v: number) =>
    setSizes((prev) => {
      if (prev[k] === v) return prev;
      const next = { ...prev, [k]: v };
      saveSizes(next);
      return next;
    });
  // sozinho, ou ninguém com câmera ou tela aparecendo: ícones pequenos, como no Gather
  const anyVideo = cam || peers.some((p) => p.cam || p.screen);
  if (peers.length === 0 || !anyVideo) return <MiniIcon target={target} size={sizes.icon} setSize={setSize('icon')} max={ICON_MAX} />;
  // com câmeras: diminuindo pelas bordas, os quadros viram ícones (com o vídeo dentro) e voltam ao aumentar.
  // O lado do ícone é a altura do quadro, então a troca não dá salto de tamanho.
  if (sizes.tile < TILE_AS_ICON) {
    const setTile = setSize('tile');
    return <MiniIcon target={target} size={TILE_H(sizes.tile)} setSize={(side) => setTile(clamp((side * 16) / 9, TILE_MIN, TILE_MAX))} max={TILE_H(TILE_AS_ICON) + 8} />;
  }
  return <MiniTiles target={target} tileW={sizes.tile} setTileW={setSize('tile')} />;
}

/** Menu de status (e fechar) usado no ícone e nas câmeras. */
function StatusMenu({ me, onDone, extra }: { me: { status: Status }; onDone: () => void; extra?: React.ReactNode }) {
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;
  return (
    <div className="oi-pop w-[220px] rounded-2xl border border-line bg-panel/95 p-1.5 text-stone-100 shadow-[0_10px_28px_rgba(0,0,0,0.6)] backdrop-blur" style={noDrag} data-testid="mini-status-menu">
      {(['AVAILABLE', 'BUSY', 'DND'] as Status[]).map((s) => (
        <button
          key={s}
          type="button"
          data-testid={`mini-status-${s}`}
          onClick={() => {
            net.setStatus(s);
            onDone();
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
          {s === 'DND' ? <span className="mt-0.5 block pl-5 text-[11px] leading-snug text-muted">{t('mini.dndHelp2', 'Ninguém poderá falar com você e o Modo Mini some.')}</span> : null}
        </button>
      ))}
      {extra}
      <div className="my-1 h-px bg-line" />
      <button type="button" data-testid="mini-back" onClick={exitMini} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium hover:bg-panel-3">
        <ExpandIcon size={13} /> {t('mini.backOffice', 'Voltar ao escritório')}
      </button>
      <button type="button" data-testid="mini-close" onClick={closeMini} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium hover:bg-panel-3">
        <CloseIcon /> {t('mini.close', 'Fechar o Modo Mini')}
      </button>
    </div>
  );
}

/**
 * Sozinho, ou em conversa com todas as câmeras desligadas: um ícone pequeno por pessoa (o seu primeiro,
 * com a sua câmera se estiver ligada e você estiver sozinho).
 */
function MiniIcon({ target, size, setSize, max }: { target: Target; size: number; setSize: (v: number) => void; max: number }) {
  const { localCam, mic, cam, peers, meSpeaking } = useAv();
  const players = useGame((s) => s.players);
  const meId = useGame((s) => s.meId);
  const me = players[meId];
  const [menu, setMenu] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const frame = useMiniFrame(target, boxRef, [menu]);
  const portraits = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of Object.values(players)) out[p.id] = avatarPortrait(p.avatar, 3);
    return out;
  }, [players]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    target.win.addEventListener('keydown', onKey);
    return () => target.win.removeEventListener('keydown', onKey);
  }, [target]);

  if (!me) return null;
  const status: Status | 'AWAY' = me.away ? 'AWAY' : me.status;
  const others = Math.max(0, Object.keys(players).length - 1);
  const show = frame.hover || menu;
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;
  const dot = Math.max(10, Math.round(size / 6));
  const drag = frame.dragProps();
  const faces = peers.slice(0, MAX_TILES - 1);
  const extra = peers.length - faces.length;
  // arrasto vertical: a altura de todos os ícones muda junto
  const perY = 1 / (1 + faces.length);
  const portrait = portraits[meId];

  return (
    <div
      ref={boxRef}
      className={cx('inline-flex select-none flex-col items-end gap-2 text-stone-100', !frame.desk && 'w-full items-center p-3')}
      onPointerEnter={frame.enter}
      onPointerLeave={frame.leave}
      data-testid="mini-window"
    >
      {menu ? (
        <StatusMenu
          me={me}
          onDone={() => setMenu(false)}
          extra={
            <div className="mt-1 flex gap-1 px-1">
              <MiniBtn label={mic ? t('bar.micOff', 'Desligar o microfone') : t('bar.micOn', 'Ligar o microfone')} active={mic} disabled={me.status === 'DND'} onClick={() => void av.setMic(!mic)} testId="mini-mic">
                {mic ? <MicOn /> : <MicOff />}
              </MiniBtn>
              <MiniBtn label={cam ? t('bar.camOff', 'Desligar a câmera') : t('bar.camOn', 'Ligar a câmera')} active={cam} disabled={me.status === 'DND'} onClick={() => void av.setCam(!cam)} testId="mini-cam">
                <CamIcon off={!cam} />
              </MiniBtn>
            </div>
          }
        />
      ) : null}

      <div
        className={cx('relative flex flex-col items-center gap-1.5 rounded-2xl border p-1.5 transition-colors duration-150', show ? 'border-white/15 bg-panel/90 shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur' : 'border-transparent bg-transparent')}
        data-testid="mini-icon"
      >
        {frame.edges(size, perY, ICON_MIN, max, setSize)}
        {/* configurações · arrastar · expandir (aparecem com o mouse em cima) */}
        <div className={cx('flex w-full items-center justify-between gap-1 transition-opacity duration-150', show ? 'opacity-100' : 'pointer-events-none opacity-0')} style={{ minWidth: 84 }}>
          <IconBtn label={t('mini.settings', 'Configurações do Modo Mini')} active={menu} onClick={() => setMenu((v) => !v)} testId="mini-settings">
            <GearIcon />
          </IconBtn>
          {frame.desk ? (
            <span {...drag} className="grid h-6 flex-1 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing" title={t('mini.drag', 'Arraste para mover')} data-testid="mini-drag">
              <DragDots horizontal />
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <IconBtn label={t('bar.exitMini', 'Sair do Modo Mini')} onClick={exitMini} testId="mini-exit">
            <ExpandIcon size={14} />
          </IconBtn>
        </div>

        <button
          type="button"
          onClick={exitMini}
          title={t('mini.back', 'Clique para voltar ao escritório')}
          data-testid="mini-tile-me"
          style={{ ...noDrag, width: size, height: size }}
          className={cx('relative shrink-0 overflow-hidden rounded-2xl border-2 bg-gradient-to-b from-panel-3 to-panel-2 shadow-[0_8px_22px_rgba(0,0,0,0.5)]', mic && meSpeaking ? 'border-ok' : mic ? 'border-ok/50' : 'border-white/10')}
        >
          {cam && localCam ? (
            <TrackView track={localCam} mirror />
          ) : portrait ? (
            <img src={portrait} alt="" className="pixel absolute inset-0 m-auto h-[78%] w-auto object-contain" />
          ) : (
            <span className="text-2xl text-muted">{me.name.slice(0, 1).toUpperCase()}</span>
          )}
          {/* pessoas online no escritório (como no Gather) */}
          {size >= 64 ? (
            <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-md bg-black/65 px-1 py-px text-[10px] font-semibold" title={t('mini.online', 'Outras pessoas online no escritório')} data-testid="mini-online">
              <PeopleIcon /> {others}
            </span>
          ) : null}
          {!mic ? (
            <span className="absolute left-1 top-1 rounded-md bg-black/60 p-0.5">
              <MicOff />
            </span>
          ) : null}
          <span
            className="pointer-events-none absolute rounded-full ring-2 ring-black/70"
            style={{ background: STATUS_COLOR[status], width: dot, height: dot, right: 4, bottom: 4 }}
            title={STATUS_LABEL[status]}
            data-testid="mini-status-dot"
          />
        </button>
        {faces.map((p) => {
          const pl = players[p.id];
          const st: Status | 'AWAY' | null = pl ? (pl.away ? 'AWAY' : pl.status) : null;
          return (
            <button
              key={p.id}
              type="button"
              onClick={exitMini}
              title={p.name}
              data-testid={`mini-face-${p.id}`}
              style={{ ...noDrag, width: size, height: size }}
              className={cx('relative shrink-0 overflow-hidden rounded-2xl border-2 bg-gradient-to-b from-panel-3 to-panel-2 shadow-[0_8px_22px_rgba(0,0,0,0.5)]', p.speaking ? 'border-ok' : 'border-white/10')}
            >
              {p.cam ? (
                <TrackView track={p.cam} />
              ) : portraits[p.id] ? (
                <img src={portraits[p.id]} alt="" className="pixel absolute inset-0 m-auto h-[78%] w-auto object-contain" />
              ) : (
                <span className="text-2xl text-muted">{p.name.slice(0, 1).toUpperCase()}</span>
              )}
              {size >= 64 ? <span className="absolute bottom-1 left-1 max-w-[70%] truncate rounded-md bg-black/65 px-1 py-px text-[10px] font-semibold">{p.name.split(' ')[0]}</span> : null}
              {!p.mic ? (
                <span className="absolute left-1 top-1 rounded-md bg-black/60 p-0.5">
                  <MicOff />
                </span>
              ) : null}
              {st ? <span className="pointer-events-none absolute rounded-full ring-2 ring-black/70" style={{ background: STATUS_COLOR[st], width: dot, height: dot, right: 4, bottom: 4 }} /> : null}
            </button>
          );
        })}
        {extra > 0 ? (
          <button type="button" style={noDrag} onClick={exitMini} title={t('mini.more', '+{{n}} pessoas na conversa', { n: extra })} className="rounded-lg bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-gold shadow-lg">
            +{extra}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Em conversa: as câmeras empilhadas e a barra de controles. */
function MiniTiles({ target, tileW, setTileW }: { target: Target; tileW: number; setTileW: (v: number) => void }) {
  const { peers, localCam, mic, cam, screen, meSpeaking } = useAv();
  const players = useGame((s) => s.players);
  const meId = useGame((s) => s.meId);
  const me = players[meId];
  const [menu, setMenu] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const frame = useMiniFrame(target, boxRef, [menu]);
  const portraits = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of Object.values(players)) out[p.id] = avatarPortrait(p.avatar, 2);
    return out;
  }, [players]);

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
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;
  const desk = frame.desk;
  const tileH = TILE_H(tileW);
  const drag = frame.dragProps();
  // arrasto vertical: a altura de todos os quadros muda junto, convertida para largura (16:9)
  const perY = 16 / 9 / Math.max(1, shown.length);

  return (
    <div
      ref={boxRef}
      className={cx('relative inline-flex select-none flex-col items-stretch gap-2 p-2.5 text-stone-100', !desk && 'w-full')}
      style={{ width: desk ? tileW + 20 : undefined }}
      onPointerEnter={frame.enter}
      onPointerLeave={frame.leave}
      data-testid="mini-window"
    >
      {frame.edges(tileW, perY, TILE_MIN, TILE_MAX, setTileW, 4)}
      {shown.map((tile) => (
        <button
          key={tile.key}
          type="button"
          style={{ ...noDrag, height: desk ? tileH : TILE_H(TILE_W) }}
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
            {tile.screen ? <Emo e="🖥" size={14} /> : tile.mic === false ? <MicOff /> : null}
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
        <div className="flex justify-end">
          <StatusMenu me={me} onDone={() => setMenu(false)} />
        </div>
      ) : null}

      {/* barra de controles: arrastar, microfone, câmera, tela, status e voltar */}
      <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-panel/90 p-1 shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur">
        {desk ? (
          <span {...drag} className="grid h-8 w-5 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing" title={t('mini.drag', 'Arraste para mover')} data-testid="mini-drag">
            <DragDots />
          </span>
        ) : null}
        <MiniBtn label={mic ? t('bar.micOff', 'Desligar o microfone') : t('bar.micOn', 'Ligar o microfone')} active={mic} disabled={dnd} onClick={() => void av.setMic(!mic)} testId="mini-mic">
          {mic ? <MicOn /> : <MicOff />}
        </MiniBtn>
        <MiniBtn label={cam ? t('bar.camOff', 'Desligar a câmera') : t('bar.camOn', 'Ligar a câmera')} active={cam} disabled={dnd} onClick={() => void av.setCam(!cam)} testId="mini-cam">
          <CamIcon off={!cam} />
        </MiniBtn>
        <MiniBtn label={screen ? t('bar.screenOff', 'Parar de compartilhar a tela') : t('bar.screenOn', 'Compartilhar a tela')} active={screen} disabled={dnd} onClick={() => void av.setScreen(!screen)} testId="mini-screen">
          <ScreenIcon />
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
          {!desk || tileW >= 260 ? <span className="truncate whitespace-nowrap">{STATUS_LABEL[status]}</span> : null}
        </button>
        <MiniBtn label={t('bar.exitMini', 'Sair do Modo Mini')} onClick={exitMini} testId="mini-exit">
          <ExpandIcon size={15} />
        </MiniBtn>
      </div>
    </div>
  );
}

/** Botão pequeno e sem fundo da moldura do ícone. */
function IconBtn({ label, active, onClick, children, testId }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-lg text-stone-200 transition-colors hover:bg-panel-3 hover:text-white', active && 'bg-panel-3 text-white')}
    >
      {children}
    </button>
  );
}

const DragDots = ({ horizontal }: { horizontal?: boolean }) =>
  horizontal ? (
    <svg width="14" height="8" viewBox="0 0 14 8" fill="currentColor">
      <circle cx="2" cy="2" r="1.2" />
      <circle cx="7" cy="2" r="1.2" />
      <circle cx="12" cy="2" r="1.2" />
      <circle cx="2" cy="6" r="1.2" />
      <circle cx="7" cy="6" r="1.2" />
      <circle cx="12" cy="6" r="1.2" />
    </svg>
  ) : (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
      <circle cx="2" cy="2" r="1.2" />
      <circle cx="6" cy="2" r="1.2" />
      <circle cx="2" cy="7" r="1.2" />
      <circle cx="6" cy="7" r="1.2" />
      <circle cx="2" cy="12" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
    </svg>
  );
const ExpandIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
  </svg>
);
const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const CloseIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const PeopleIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

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
const ScreenIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4h18v12H3zM8 20h8M12 16v4" />
  </svg>
);
