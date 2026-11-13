// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from 'react';
import { can, isAdminRole, musicPosition, parseYouTubeUrl, type MusicChannel } from '@office-imp/shared';
import { Badge, Button, Empty, Field, Input, Modal, cx } from '@office-imp/ui';
import { net } from '../game/net';
import { serverNow, useGame } from '../game/store';
import { t } from '../lib/i18n';
import { toast } from '../lib/session';
import { useAv } from './av';
import { Emo, EmoText } from '../lib/icons';

// ---------- YouTube IFrame API ----------
let ytReady: Promise<void> | null = null;
function loadYouTube(): Promise<void> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve();
  ytReady ??= new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return ytReady;
}

/** Lê os IDs dos vídeos de uma playlist usando um player temporário (sem chave de API). */
async function expandPlaylist(listId: string): Promise<string[]> {
  await loadYouTube();
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:200px';
    const inner = document.createElement('div');
    host.appendChild(inner);
    document.body.appendChild(host);
    let done = false;
    let player: any = null;
    const finish = (ids: string[]) => {
      if (done) return;
      done = true;
      try {
        player?.destroy();
      } catch {}
      host.remove();
      resolve(ids);
    };
    const timer = setTimeout(() => finish([]), 9000);
    player = new (window as any).YT.Player(inner, {
      width: 200,
      height: 200,
      playerVars: { listType: 'playlist', list: listId },
      events: {
        onReady: (e: any) => e.target.cuePlaylist({ listType: 'playlist', list: listId }),
        onStateChange: (e: any) => {
          const ids: string[] = e.target.getPlaylist?.() ?? [];
          if (ids.length) {
            clearTimeout(timer);
            finish(ids);
          }
        },
        onError: () => finish([]),
      },
    });
  });
}

const VOL_KEY = 'oi-radio-vol';
const myChannel = (music: MusicChannel[], meId: string) => music.find((c) => c.listeners.includes(meId)) ?? null;

/**
 * Player do rádio. Cada pessoa toca o vídeo no próprio player do YouTube; o servidor só
 * guarda "o que" e "em que ponto" está tocando, e o player corrige a posição quando
 * a diferença passa de 2 segundos. O áudio nunca é retransmitido pelo servidor.
 */
export function RadioDock() {
  const meId = useGame((s) => s.meId);
  const music = useGame((s) => s.music);
  const inCall = useAv((s) => s.peers.length > 0);
  const ch = myChannel(music, meId);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const ready = useRef(false);
  const loaded = useRef('');
  const chRef = useRef<MusicChannel | null>(ch);
  const [volume, setVolume] = useState(() => Number(localStorage.getItem(VOL_KEY) ?? 60));
  const [small, setSmall] = useState(false);
  chRef.current = ch;
  const track = ch?.queue[ch.index];

  const sync = () => {
    const p = player.current;
    const c = chRef.current;
    if (!p || !ready.current || !c) return;
    const tr = c.queue[c.index];
    if (!tr) return;
    const expected = Math.max(0, musicPosition(c, serverNow()));
    if (loaded.current !== tr.videoId) {
      loaded.current = tr.videoId;
      if (c.playing) p.loadVideoById({ videoId: tr.videoId, startSeconds: expected });
      else p.cueVideoById({ videoId: tr.videoId, startSeconds: expected });
      return;
    }
    const state = p.getPlayerState?.();
    const cur = Number(p.getCurrentTime?.() ?? 0);
    if (c.playing) {
      if (state === 2 || state === 5 || state === -1) p.playVideo();
      if (state !== 3 && Math.abs(cur - expected) > 2) p.seekTo(expected, true);
    } else {
      if (state === 1 || state === 3) p.pauseVideo();
      if (Math.abs(cur - expected) > 2) p.seekTo(expected, true);
    }
  };

  // cria o player quando entro em um canal e destrói quando saio
  useEffect(() => {
    if (!ch?.id) return;
    let dead = false;
    void loadYouTube().then(() => {
      if (dead || !host.current) return;
      const el = document.createElement('div');
      host.current.appendChild(el);
      player.current = new (window as any).YT.Player(el, {
        width: 240,
        height: 135,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: () => {
            ready.current = true;
            sync();
          },
          onStateChange: (e: any) => {
            const c = chRef.current;
            const tr = c?.queue[c.index];
            if (!c || !tr) return;
            if (e.data === 0) net.send('music:ended', { id: c.id, videoId: tr.videoId });
            if (e.data === 1 && !tr.title) {
              const title = e.target.getVideoData?.()?.title;
              if (title) net.send('music:meta', { id: c.id, videoId: tr.videoId, title });
            }
          },
          onError: () => {
            // vídeo indisponível ou sem permissão para tocar fora do YouTube: pula depois de alguns segundos
            const c = chRef.current;
            const tr = c?.queue[c.index];
            if (c && tr) setTimeout(() => net.send('music:ended', { id: c.id, videoId: tr.videoId }), 6000);
          },
        },
      });
    });
    return () => {
      dead = true;
      ready.current = false;
      loaded.current = '';
      try {
        player.current?.destroy();
      } catch {}
      player.current = null;
    };
  }, [ch?.id]);

  useEffect(() => {
    sync();
    const id = window.setInterval(sync, 2000);
    return () => clearInterval(id);
  }, [ch?.id, ch?.index, ch?.playing, ch?.updatedAt]);

  // volume local, com redução automática durante conversas ("ducking")
  useEffect(() => {
    try {
      localStorage.setItem(VOL_KEY, String(volume));
      if (ready.current) player.current?.setVolume(Math.round(volume * (inCall ? 0.2 : 1)));
    } catch {}
  }, [volume, inCall, ch?.index, ch?.id]);

  if (!ch) return null;
  return (
    <div className="absolute bottom-20 left-3 z-30 w-[256px] overflow-hidden rounded-2xl border border-line bg-panel/97 shadow-2xl" data-testid="radio-dock">
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <Emo e="🎵" size={18} className={cx(ch.playing && 'oi-pulse')} />
        <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold text-gold" onClick={() => useGame.setState({ modal: { kind: 'radio' } })} title={t('radio.open', 'Abrir o rádio')}>
          {ch.name}
        </button>
        <button type="button" className="text-muted hover:text-stone-100" onClick={() => setSmall(!small)} title={small ? t('radio.expand', 'Mostrar o vídeo') : t('radio.shrink', 'Reduzir')}>
          {small ? '▢' : '—'}
        </button>
        <button type="button" className="text-muted hover:text-danger" onClick={() => net.send('music:leave')} title={t('radio.leave', 'Parar de ouvir')}>
          ✕
        </button>
      </div>
      <div ref={host} className={cx('mx-2 overflow-hidden rounded-lg bg-black', small ? 'h-0' : 'h-[135px]')} />
      <div className="space-y-1 px-3 py-2">
        <p className="truncate text-xs" data-testid="radio-track">
          {track?.title ?? track?.videoId ?? '—'}
        </p>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <Emo e="🔈" size={16} />
          <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-full accent-[#d7b870]" aria-label={t('radio.volume', 'Volume')} />
          {inCall ? <span title={t('radio.duck', 'Volume reduzido durante a conversa')}>↓</span> : null}
        </div>
      </div>
    </div>
  );
}

export function RadioModal() {
  const meId = useGame((s) => s.meId);
  const me = useGame((s) => s.players[s.meId]);
  const music = useGame((s) => s.music);
  const mine = myChannel(music, meId);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [add, setAdd] = useState('');
  const [busy, setBusy] = useState(false);
  const canDj = can(me?.role, 'music.dj');
  const control = mine && (mine.djId === meId || isAdminRole(me?.role));
  const ctl = (action: string, value?: number) => mine && net.send('music:control', { id: mine.id, action, value });

  const resolve = async (link: string): Promise<{ url: string; videoIds: string[] } | null> => {
    const ref = parseYouTubeUrl(link);
    if (!ref) {
      toast(t('radio.badLink', 'Cole um link do YouTube ou do YouTube Music (vídeo ou playlist).'), 'error');
      return null;
    }
    let videoIds: string[] = [];
    if (ref.listId) {
      setBusy(true);
      videoIds = await expandPlaylist(ref.listId).catch(() => []);
      setBusy(false);
      if (!videoIds.length && !ref.videoId) {
        toast(t('radio.badPlaylist', 'Não consegui ler essa playlist (ela é privada?). Tente o link de um vídeo.'), 'error');
        return null;
      }
    }
    return { url: link, videoIds };
  };
  const open = async () => {
    const r = await resolve(url);
    if (!r) return;
    net.send('music:open', { name: name.trim(), ...r });
    setUrl('');
    setName('');
  };
  const addTrack = async () => {
    if (!mine) return;
    const r = await resolve(add);
    if (!r) return;
    net.send('music:add', { id: mine.id, ...r });
    setAdd('');
  };

  return (
    <Modal title={t('radio.title', 'Rádio do escritório')} wide onClose={() => useGame.setState({ modal: null })}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t('radio.channels', 'Canais tocando agora')}</h3>
          {music.length === 0 ? <Empty>{t('radio.none', 'Nenhum canal aberto. Abra um para ouvir junto com a equipe.')}</Empty> : null}
          {music.map((c) => {
            const cur = c.queue[c.index];
            const on = c.listeners.includes(meId);
            return (
              <div key={c.id} className={cx('rounded-xl border p-3', on ? 'border-gold bg-gold/5' : 'border-line bg-panel-2')} data-testid={`channel-${c.name}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold">{c.name}</p>
                  <Badge color={c.playing ? 'green' : 'gray'}>{c.playing ? t('radio.playing', 'tocando') : t('radio.paused', 'pausado')}</Badge>
                </div>
                <p className="truncate text-xs text-muted">
                  <Emo e="🎧" /> {t('radio.dj', 'DJ: {{name}}', { name: c.djName })} · {t('radio.listeners', '{{n}} ouvindo', { n: c.listeners.length })}
                </p>
                <p className="mt-1 truncate text-sm"><Emo e="🎵" /> {cur?.title ?? cur?.videoId}</p>
                <div className="mt-2">
                  {on ? (
                    <Button small variant="subtle" onClick={() => net.send('music:leave')}>
                      {t('radio.leave', 'Parar de ouvir')}
                    </Button>
                  ) : (
                    <Button small data-testid="radio-join" onClick={() => net.send('music:join', { id: c.id })}>
                      {t('radio.join', 'Ouvir junto')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {canDj ? (
            <div className="space-y-2 rounded-xl border border-dashed border-line p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{t('radio.new', 'Abrir um canal')}</h4>
              <Field label={t('radio.name', 'Nome do canal (opcional)')}>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Lo-fi" />
              </Field>
              <Field label={t('radio.link', 'Link do YouTube ou YouTube Music')}>
                <Input data-testid="radio-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://music.youtube.com/watch?v=…" />
              </Field>
              <Button data-testid="radio-open" onClick={() => void open()} disabled={busy || !url.trim()}>
                {busy ? t('radio.reading', 'Lendo a playlist…') : t('radio.start', 'Abrir canal')}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted">{t('radio.guest', 'Convidados podem ouvir, mas não abrir canais.')}</p>
          )}
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t('radio.queue', 'Fila do seu canal')}</h3>
          {!mine ? (
            <Empty>{t('radio.notListening', 'Entre em um canal para ver a fila.')}</Empty>
          ) : (
            <>
              {control ? (
                <div className="flex flex-wrap gap-2">
                  <Button small variant="subtle" onClick={() => ctl('prev')}>
                    <Emo e="⏮" size={20} />
                  </Button>
                  <Button small onClick={() => ctl(mine.playing ? 'pause' : 'play')}>
                    <Emo e={mine.playing ? '⏸' : '▶'} size={18} />
                  </Button>
                  <Button small variant="subtle" onClick={() => ctl('next')}>
                    <Emo e="⏭" size={20} />
                  </Button>
                  <Button small variant="ghost" onClick={() => ctl(mine.locked ? 'unlock' : 'lock')}>
                    <EmoText text={mine.locked ? t('radio.unlock', '🔓 Liberar a fila') : t('radio.lock', '🔒 Bloquear a fila')} />
                  </Button>
                  <Button small variant="danger" onClick={() => ctl('close')}>
                    {t('radio.close', 'Fechar canal')}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted">{t('radio.onlyDj', 'Só o DJ e os administradores controlam a reprodução.')}</p>
              )}
              <ol className="max-h-64 space-y-1 overflow-auto text-sm">
                {mine.queue.map((q, i) => (
                  <li key={`${q.videoId}-${i}`} className={cx('flex items-center gap-2 rounded-lg px-2 py-1', i === mine.index ? 'bg-gold/15 text-gold' : 'hover:bg-panel-2')}>
                    <span className="w-5 text-right text-xs text-muted">{i + 1}</span>
                    <button type="button" disabled={!control} className="min-w-0 flex-1 truncate text-left disabled:cursor-default" onClick={() => ctl('jump', i)}>
                      {q.title ?? q.videoId}
                    </button>
                    <span className="shrink-0 text-[10px] text-muted">{q.addedBy}</span>
                    {control && i !== mine.index ? (
                      <button type="button" className="text-muted hover:text-danger" onClick={() => ctl('remove', i)}>
                        ✕
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
              <div className="flex gap-2">
                <Input value={add} onChange={(e) => setAdd(e.target.value)} placeholder={t('radio.addPh', 'Adicionar um link à fila…')} />
                <Button variant="ghost" onClick={() => void addTrack()} disabled={busy || !add.trim()}>
                  {t('radio.add', 'Adicionar')}
                </Button>
              </div>
              <p className="text-[11px] text-muted">{t('radio.note', 'Cada pessoa ouve pelo próprio player do YouTube, sincronizado. Anúncios do YouTube podem atrasar alguns segundos; o player se ajusta sozinho.')}</p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
