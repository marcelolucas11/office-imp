// SPDX-License-Identifier: AGPL-3.0-only
import { Room, RoomEvent, ScreenSharePresets, Track, VideoPresets, type LocalTrack, type RemoteParticipant, type RemoteTrackPublication } from 'livekit-client';
import { create } from 'zustand';
import { DEFAULT_INTERACTION_DISTANCE, volumeForDistance, type AvView } from '@office-imp/shared';
import { bus } from '../game/bus';
import { net } from '../game/net';
import { useGame } from '../game/store';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { toast } from '../lib/session';
import { AudioNotStarted, MicMeter, NoiseReducer, type MicFilter } from './micAudio';

export interface PeerMedia {
  id: string;
  name: string;
  cam: Track | null;
  screen: Track | null;
  mic: boolean;
  speaking: boolean;
  /** Ouvido/visto por estar no palco (Spotlight), não por proximidade. */
  spotlight: boolean;
  /** Conectado ao servidor de mídia. */
  live: boolean;
  /** Câmera ligada (mesmo que oculta para você). */
  camOn: boolean;
  /** Compartilhando a tela (mesmo que oculta para você). */
  screenOn: boolean;
  /** A tela compartilhada tem áudio. */
  screenAudio: boolean;
  /** Ajustes só seus para esta pessoa. */
  pref: PeerPref;
}

/** O que cada pessoa ajusta só para si sobre outra pessoa da conversa. */
export interface PeerPref {
  /** Volume da voz, de 0 a 1. */
  vol: number;
  /** Voz silenciada só para você. */
  mute: boolean;
  /** Volume do áudio da tela compartilhada, de 0 a 1. */
  svol: number;
  /** Áudio da tela silenciado só para você. */
  smute: boolean;
  /** Vídeo da câmera oculto só para você (deixa de baixar o vídeo). */
  hideCam: boolean;
  /** Tela compartilhada oculta só para você. */
  hideScreen: boolean;
}

export const DEFAULT_PEER: PeerPref = { vol: 1, mute: false, svol: 1, smute: false, hideCam: false, hideScreen: false };

interface Prefs {
  hearNearby: boolean;
  hd: boolean;
  micId: string;
  camId: string;
  outId: string;
  /** Filtro de voz forte no microfone (corte de graves + rede neural + portão de voz). */
  noiseReduce: boolean;
  /** Quanto o portão de voz corta o que não está perto do microfone. */
  micFilter: MicFilter;
}

interface AvState extends Prefs {
  conn: 'off' | 'connecting' | 'on' | 'error';
  room: string;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  localCam: Track | null;
  localScreen: Track | null;
  peers: PeerMedia[];
  /** O navegador bloqueou o áudio até a pessoa clicar na página. */
  blocked: boolean;
  focus: string | null;
  /** Você está falando agora (medido no seu próprio microfone). */
  meSpeaking: boolean;
  /** Ajustes só seus por pessoa (volume, silenciar, ocultar vídeo). */
  peerPrefs: Record<string, PeerPref>;
}

/** Restrições do microfone. Com o filtro forte: sem ganho automático e mono. */
function micConstraints(st: Pick<Prefs, 'micId' | 'noiseReduce'>) {
  return {
    deviceId: st.micId || undefined,
    echoCancellation: true, // tira o som que sai das suas caixas (as vozes da call e o que o app toca)
    noiseSuppression: true,
    autoGainControl: !st.noiseReduce,
    voiceIsolation: st.noiseReduce, // isolamento de voz do sistema, onde o navegador suporta
    channelCount: 1,
  };
}

const PREF_KEY = 'oi-av';
function loadPrefs(): Prefs {
  const base: Prefs = { hearNearby: true, hd: false, micId: '', camId: '', outId: '', noiseReduce: true, micFilter: 'normal' };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') };
  } catch {
    return base;
  }
}

// volume e silenciar ficam guardados por pessoa (como em outros apps de chamada); ocultar vídeo vale só nesta sessão
const PEER_KEY = 'oi-av-peers';
function loadPeerPrefs(): Record<string, PeerPref> {
  try {
    const raw = JSON.parse(localStorage.getItem(PEER_KEY) ?? '{}') as Record<string, Partial<PeerPref>>;
    const out: Record<string, PeerPref> = {};
    for (const [id, p] of Object.entries(raw)) {
      out[id] = { ...DEFAULT_PEER, vol: clamp01(p.vol), mute: Boolean(p.mute), svol: clamp01(p.svol), smute: Boolean(p.smute) };
    }
    return out;
  } catch {
    return {};
  }
}
function clamp01(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}
function savePeerPrefs() {
  const out: Record<string, Partial<PeerPref>> = {};
  for (const [id, p] of Object.entries(useAv.getState().peerPrefs)) {
    if (p.vol !== 1 || p.mute || p.svol !== 1 || p.smute) out[id] = { vol: p.vol, mute: p.mute, svol: p.svol, smute: p.smute };
  }
  try {
    localStorage.setItem(PEER_KEY, JSON.stringify(out));
  } catch {}
}

export const useAv = create<AvState>(() => ({ ...loadPrefs(), conn: 'off', room: 'none', mic: false, cam: false, screen: false, localCam: null, localScreen: null, peers: [], blocked: false, focus: null, meSpeaking: false, peerPrefs: loadPeerPrefs() }));

function savePrefs() {
  const s = useAv.getState();
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ hearNearby: s.hearNearby, hd: s.hd, micId: s.micId, camId: s.camId, outId: s.outId, noiseReduce: s.noiseReduce, micFilter: s.micFilter }));
  } catch {}
}

const NO_VIEW: AvView = { room: 'none', peers: [], spotlight: [] };

/**
 * Áudio e vídeo. O servidor do escritório decide com quem cada pessoa está conectada
 * (mensagem "av"); aqui só seguimos essa decisão:
 *  - área aberta: uma sala LiveKit por escritório, assinando apenas quem está no raio;
 *  - área privada: uma sala LiveKit separada (o token só sai se o servidor confirmar a posição);
 *  - Spotlight: quem está em área privada abre uma segunda conexão, só de escuta, com o palco.
 */
class AvManager {
  private main: Room | null = null;
  private aux: Room | null = null;
  private current = '';
  private view: AvView = NO_VIEW;
  private active = false;
  private meter = new MicMeter((v) => useAv.setState({ meSpeaking: v }));
  private nrBusy = false;
  private chain: Promise<void> = Promise.resolve();
  private want = { mic: false, cam: false };
  private offs: (() => void)[] = [];
  private retry: number | null = null;
  private wanted = new WeakMap<RemoteTrackPublication, boolean>();
  private audioEls = new Set<HTMLMediaElement>();
  private lastMedia = '';
  /** Microfone e câmera que continuam abertos durante a troca de sala (área aberta ↔ área privada). */
  private carried: { mic: LocalTrack | null; cam: LocalTrack | null } = { mic: null, cam: null };

  start() {
    if (this.active) return;
    this.active = true;
    this.view = useGame.getState().phase === 'online' ? useGame.getState().av : NO_VIEW;
    this.offs.push(
      bus.on('av', (v: AvView) => {
        this.view = v;
        this.queue();
      }),
      bus.on('net:down', () => {
        this.view = NO_VIEW;
        this.queue();
      }),
      bus.on('av:muted', (d: { kind: 'mic' | 'cam' | 'screen'; name: string }) => void this.onRemoteMute(d)),
      useGame.subscribe((s, prev) => {
        const me = s.players[s.meId];
        const before = prev.players[prev.meId];
        if (me && before && me.status !== before.status && me.status === 'BUSY') void this.setMic(false);
        if (me && before && me.distance !== before.distance) this.applyVolumes();
        if (me && before && me.areaId !== before.areaId) this.onAreaChange(before.areaId, me.areaId);
        if (s.players !== prev.players) this.refreshSoon();
      }),
    );
    this.queue();
  }

  stop() {
    this.active = false;
    for (const off of this.offs) off();
    this.offs = [];
    if (this.retry) clearTimeout(this.retry);
    this.want = { mic: false, cam: false };
    this.queue();
  }

  private queue() {
    this.chain = this.chain.then(() => this.reconcile()).catch((e) => console.warn('[av] falha', e));
  }

  /** A câmera foi ligada sozinha ao chegar numa mesa (e desliga sozinha ao sair, se a pessoa não mexeu nela). */
  private autoCam = false;

  private onAreaChange(prevId: string | null, nextId: string | null) {
    const areas = useGame.getState().map?.areas ?? [];
    const prev = prevId ? areas.find((a) => a.id === prevId) : undefined;
    const next = nextId ? areas.find((a) => a.id === nextId) : undefined;
    if (next?.desk) {
      if (!this.want.cam && useGame.getState().me()?.status !== 'DND') {
        this.want.cam = true;
        this.autoCam = true;
        this.queue();
      }
    } else if (prev?.desk && this.autoCam) {
      this.autoCam = false;
      this.want.cam = false;
      this.queue();
    }
  }

  private refreshTimer: number | null = null;
  private refreshSoon() {
    if (this.refreshTimer) return;
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, 250);
  }

  private async reconcile() {
    const g = useGame.getState();
    const office = g.office;
    if (!this.active || !office || g.phase !== 'online') {
      await this.leaveAux();
      await this.leaveMain();
      this.dropCarried();
      this.current = '';
      useAv.setState({ conn: 'off', room: 'none', peers: [] });
      this.pushLocal();
      return;
    }
    const want = this.view.room;
    if (want !== this.current || (want !== 'none' && !this.main)) {
      // trocando de uma sala para outra: mantém microfone e câmera abertos (sem desligar e religar)
      await this.leaveMain(want !== 'none');
      if (want === 'none') {
        this.current = 'none';
        this.want = { mic: false, cam: false };
        useAv.setState({ conn: 'off', room: 'none' });
        this.pushLocal();
      } else {
        useAv.setState({ conn: 'connecting', room: want });
        try {
          await this.joinMain(office.id, want);
          this.current = want;
          useAv.setState({ conn: 'on' });
        } catch (e) {
          console.warn('[av] não conectou', errMsg(e));
          this.main = null;
          this.current = '';
          useAv.setState({ conn: 'error' });
          this.scheduleRetry();
        }
      }
    }
    // câmera ligada/desligada sozinha pela mesa, sem troca de sala pendente
    if (this.main && this.main.localParticipant.isCameraEnabled !== this.want.cam) {
      await this.main.localParticipant.setCameraEnabled(this.want.cam).catch((e) => this.deviceError(e, 'cam'));
      this.pushLocal();
    }
    const needAux = Boolean(this.main) && this.current !== 'open' && this.current !== 'none' && this.view.spotlight.length > 0;
    if (needAux && !this.aux) await this.joinAux(office.id).catch(() => {});
    if (!needAux && this.aux) await this.leaveAux();
    this.applySubs();
    this.refresh();
  }

  private scheduleRetry() {
    if (this.retry || !this.active) return;
    this.retry = window.setTimeout(() => {
      this.retry = null;
      this.queue();
    }, 4000);
  }

  private newRoom(): Room {
    const st = useAv.getState();
    return new Room({
      // pixelDensity 'screen': em telas Retina (2x) o padrão contava 1 pixel por pixel CSS e pedia ao servidor
      // a camada de 540p da tela compartilhada mesmo ampliada, deixando o texto borrado
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      audioCaptureDefaults: micConstraints(st),
      videoCaptureDefaults: { deviceId: st.camId || undefined, resolution: (st.hd ? VideoPresets.h720 : VideoPresets.h360).resolution },
      ...(st.outId ? { audioOutput: { deviceId: st.outId } } : {}),
    });
  }

  private async joinMain(officeId: string, roomId: string) {
    const { token, url } = await api.post('/api/livekit/token', { officeId, room: roomId });
    const room = this.newRoom();
    this.bind(room, false);
    await room.connect(url, token, { autoSubscribe: roomId !== 'open' });
    this.main = room;
    useAv.setState({ blocked: !room.canPlaybackAudio });
    const { mic, cam } = this.carried;
    this.carried = { mic: null, cam: null };
    const lp = room.localParticipant;
    if (this.want.mic) {
      if (mic) await lp.publishTrack(mic, { source: Track.Source.Microphone }).catch(async () => {
        mic.stop();
        await lp.setMicrophoneEnabled(true).catch((e) => this.deviceError(e, 'mic'));
      });
      else await lp.setMicrophoneEnabled(true).catch((e) => this.deviceError(e, 'mic'));
    } else mic?.stop();
    if (this.want.cam) {
      if (cam) await lp.publishTrack(cam, { source: Track.Source.Camera }).catch(async () => {
        cam.stop();
        await lp.setCameraEnabled(true).catch((e) => this.deviceError(e, 'cam'));
      });
      else await lp.setCameraEnabled(true).catch((e) => this.deviceError(e, 'cam'));
    } else cam?.stop();
    this.pushLocal();
  }

  private async joinAux(officeId: string) {
    const { token, url } = await api.post('/api/livekit/token', { officeId, room: 'open', aux: true });
    const room = this.newRoom();
    this.bind(room, true);
    await room.connect(url, token, { autoSubscribe: false });
    this.aux = room;
  }

  private async leaveMain(keep = false) {
    const room = this.main;
    this.main = null;
    if (room || !keep) this.dropCarried();
    if (room) {
      const lp = room.localParticipant;
      const live = (src: Track.Source): LocalTrack | null => {
        const tr = lp.getTrackPublication(src)?.track as LocalTrack | undefined;
        return tr && !tr.isMuted && tr.mediaStreamTrack?.readyState === 'live' ? tr : null;
      };
      const mic = keep && this.want.mic ? live(Track.Source.Microphone) : null;
      const cam = keep && this.want.cam ? live(Track.Source.Camera) : null;
      const all = [...lp.trackPublications.values()].map((pub) => pub.track).filter(Boolean) as LocalTrack[];
      // sem parar as faixas: as que seguem para a próxima sala continuam capturando
      await room.disconnect(false).catch(() => {});
      for (const tr of all) if (tr !== mic && tr !== cam) tr.stop();
      this.carried = { mic, cam };
    }
    this.meter.watch(null);
    for (const el of this.audioEls) el.remove();
    this.audioEls.clear();
    useAv.setState({ focus: null });
  }

  private dropCarried() {
    this.carried.mic?.stop();
    this.carried.cam?.stop();
    this.carried = { mic: null, cam: null };
  }

  private async leaveAux() {
    const room = this.aux;
    this.aux = null;
    if (room) await room.disconnect().catch(() => {});
  }

  private bind(room: Room, aux: boolean) {
    const again = () => {
      this.applySubs();
      this.refresh();
    };
    room
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = 'none';
          document.body.appendChild(el);
          this.audioEls.add(el);
        }
        again();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        for (const el of track.detach()) {
          this.audioEls.delete(el);
          if (el.tagName === 'AUDIO') el.remove();
        }
        again();
      })
      .on(RoomEvent.TrackPublished, again)
      .on(RoomEvent.TrackUnpublished, again)
      .on(RoomEvent.TrackMuted, (pub, p) => {
        if (p.isLocal) {
          // desligado por outra pessoa (pelo servidor de mídia): não religar sozinho na próxima troca de sala
          if (pub.source === Track.Source.Microphone) this.want.mic = false;
          if (pub.source === Track.Source.Camera) {
            this.want.cam = false;
            this.autoCam = false;
          }
          this.pushLocal();
        }
        this.refresh();
      })
      .on(RoomEvent.TrackUnmuted, (pub, p) => {
        if (p.isLocal) {
          // o que se quer acompanha o estado real (ex.: o sistema devolveu a câmera depois de uma interrupção)
          if (pub.source === Track.Source.Microphone) this.want.mic = true;
          if (pub.source === Track.Source.Camera) this.want.cam = true;
          this.pushLocal();
        }
        this.refresh();
      })
      .on(RoomEvent.ParticipantConnected, again)
      .on(RoomEvent.ParticipantDisconnected, again)
      .on(RoomEvent.ActiveSpeakersChanged, () => this.refresh())
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.source === Track.Source.Microphone) void this.applyNoise();
        this.pushLocal();
      })
      .on(RoomEvent.LocalTrackUnpublished, () => this.pushLocal())
      .on(RoomEvent.AudioPlaybackStatusChanged, () => useAv.setState({ blocked: !room.canPlaybackAudio }))
      .on(RoomEvent.Disconnected, () => {
        if (aux) {
          if (this.aux === room) this.aux = null;
          return;
        }
        if (this.main !== room) return;
        // queda inesperada: tenta de novo
        this.main = null;
        this.current = '';
        useAv.setState({ conn: 'connecting' });
        this.pushLocal();
        this.scheduleRetry();
      });
  }

  private applySubs() {
    const v = this.view;
    const set = (pub: RemoteTrackPublication, ok: boolean) => {
      if (this.wanted.get(pub) === ok) return;
      this.wanted.set(pub, ok);
      pub.setSubscribed(ok);
    };
    // vídeo oculto só para você: deixa de baixar a faixa (economiza a rede), o áudio segue normal
    const hidden = (id: string, pub: RemoteTrackPublication) => {
      const pref = useAv.getState().peerPrefs[id];
      if (!pref) return false;
      return (pub.source === Track.Source.Camera && pref.hideCam) || (pub.source === Track.Source.ScreenShare && pref.hideScreen);
    };
    if (this.main) {
      const open = this.current === 'open';
      const allow = new Set([...v.peers.map((p) => p.id), ...v.spotlight]);
      for (const p of this.main.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (open) set(pub, allow.has(p.identity) && !hidden(p.identity, pub));
          // área privada: tudo assinado automaticamente; só mexe no que você ocultou ou voltou a mostrar
          else if (hidden(p.identity, pub) || this.wanted.get(pub) === false) set(pub, !hidden(p.identity, pub));
        }
      }
    }
    if (this.aux) {
      for (const p of this.aux.remoteParticipants.values()) for (const pub of p.trackPublications.values()) set(pub, v.spotlight.includes(p.identity) && !hidden(p.identity, pub));
    }
    this.applyVolumes();
  }

  applyVolumes() {
    const g = useGame.getState();
    const radius = g.players[g.meId]?.distance ?? DEFAULT_INTERACTION_DISTANCE;
    const hear = useAv.getState().hearNearby;
    const v = this.view;
    const prefs = useAv.getState().peerPrefs;
    // volume da proximidade × o volume que você escolheu para a pessoa (voz e tela separados)
    const vol = (p: RemoteParticipant, value: number) => {
      const pref = prefs[p.identity] ?? DEFAULT_PEER;
      p.setVolume(pref.mute ? 0 : value * pref.vol, Track.Source.Microphone);
      p.setVolume(pref.smute ? 0 : value * pref.svol, Track.Source.ScreenShareAudio);
    };
    if (this.main) {
      for (const p of this.main.remoteParticipants.values()) {
        if (this.current !== 'open') {
          vol(p, 1);
          continue;
        }
        const peer = v.peers.find((x) => x.id === p.identity);
        if (peer) vol(p, hear ? volumeForDistance(peer.d, radius) : 0);
        else vol(p, v.spotlight.includes(p.identity) ? 1 : 0);
      }
    }
    if (this.aux) for (const p of this.aux.remoteParticipants.values()) vol(p, v.spotlight.includes(p.identity) ? 1 : 0);
  }

  private refresh() {
    const g = useGame.getState();
    const v = this.view;
    const st0 = useAv.getState();
    const out: PeerMedia[] = [];
    const ids = [...v.peers.map((p) => ({ id: p.id, spot: false })), ...v.spotlight.map((id) => ({ id, spot: true }))];
    for (const { id, spot } of ids) {
      const p = (spot && this.aux ? this.aux.remoteParticipants.get(id) : undefined) ?? this.main?.remoteParticipants.get(id);
      const cam = p?.getTrackPublication(Track.Source.Camera);
      const scr = p?.getTrackPublication(Track.Source.ScreenShare);
      const mic = p?.getTrackPublication(Track.Source.Microphone);
      const sAudio = p?.getTrackPublication(Track.Source.ScreenShareAudio);
      const pref = st0.peerPrefs[id] ?? DEFAULT_PEER;
      out.push({
        id,
        name: g.players[id]?.name ?? p?.name ?? id,
        cam: cam?.track && !cam.isMuted && !pref.hideCam ? cam.track : null,
        screen: scr?.track && !scr.isMuted && !pref.hideScreen ? scr.track : null,
        camOn: Boolean(cam && !cam.isMuted),
        screenOn: Boolean(scr && !scr.isMuted),
        screenAudio: Boolean(sAudio && !sAudio.isMuted),
        pref,
        mic: Boolean(mic && !mic.isMuted),
        speaking: Boolean(p?.isSpeaking),
        spotlight: spot,
        live: Boolean(p),
      });
    }
    const st = useAv.getState();
    useAv.setState({ peers: out, ...(st.focus && !out.some((p) => st.focus === `${p.id}:screen` || st.focus === `${p.id}:cam`) && !st.focus.startsWith('me:') ? { focus: null } : {}) });
  }

  private pushLocal() {
    const lp = this.main?.localParticipant;
    const cam = lp?.getTrackPublication(Track.Source.Camera);
    const scr = lp?.getTrackPublication(Track.Source.ScreenShare);
    const st = { mic: Boolean(lp?.isMicrophoneEnabled), cam: Boolean(lp?.isCameraEnabled), screen: Boolean(lp?.isScreenShareEnabled) };
    useAv.setState({ ...st, localCam: cam?.track && !cam.isMuted ? cam.track : null, localScreen: scr?.track ?? null });
    const mic = lp?.getTrackPublication(Track.Source.Microphone);
    this.meter.watch(st.mic && mic?.track && !mic.isMuted ? mic.track.mediaStreamTrack : null);
    const key = JSON.stringify(st);
    if (key !== this.lastMedia) {
      this.lastMedia = key;
      net.send('media', st);
    }
  }

  private deviceError(e: unknown, kind: 'mic' | 'cam') {
    console.warn('[av] dispositivo', e);
    if (kind === 'mic') this.want.mic = false;
    else this.want.cam = false;
    toast(kind === 'mic' ? t('av.micError', 'Não foi possível usar o microfone. Confira a permissão do navegador ou do sistema.') : t('av.camError', 'Não foi possível usar a câmera. Confira a permissão do navegador ou do sistema.'), 'error');
  }

  private notConnected(): boolean {
    if (this.main) return false;
    const me = useGame.getState().me();
    toast(me?.status === 'DND' ? t('av.dnd', 'Em “Não incomodar” o áudio e o vídeo ficam desligados.') : t('av.offline', 'O servidor de áudio e vídeo ainda está conectando. Tente de novo em instantes.'), 'info');
    return true;
  }

  async setMic(on: boolean) {
    this.want.mic = on;
    if (!this.main) {
      if (on) this.notConnected();
      return;
    }
    await this.main.localParticipant.setMicrophoneEnabled(on).catch((e) => this.deviceError(e, 'mic'));
    this.pushLocal();
  }

  async setCam(on: boolean) {
    this.autoCam = false;
    this.want.cam = on;
    if (!this.main) {
      if (on) this.notConnected();
      return;
    }
    await this.main.localParticipant.setCameraEnabled(on).catch((e) => this.deviceError(e, 'cam'));
    this.pushLocal();
  }

  async setScreen(on: boolean) {
    if (this.notConnected()) return;
    try {
      // 1080p a 30 qps e até 5 Mbps (o padrão era 15 qps e 2,5 Mbps); 'detail' faz o codificador priorizar a
      // nitidez do texto em vez do movimento
      await this.main!.localParticipant.setScreenShareEnabled(
        on,
        { audio: true, contentHint: 'detail', resolution: ScreenSharePresets.h1080fps30.resolution },
        { screenShareEncoding: ScreenSharePresets.h1080fps30.encoding },
      );
    } catch (e) {
      // cancelar a escolha da tela não é erro
      if (!/Permission|NotAllowed|cancel/i.test(errMsg(e))) toast(t('av.screenError', 'Não foi possível compartilhar a tela.'), 'error');
    }
    this.pushLocal();
  }

  /** Ajuste só seu para uma pessoa da conversa: volume, silenciar, ocultar vídeo ou tela. */
  setPeer(id: string, patch: Partial<PeerPref>) {
    const cur = useAv.getState().peerPrefs[id] ?? DEFAULT_PEER;
    const next = { ...cur, ...patch };
    if (patch.vol !== undefined) next.vol = clamp01(patch.vol);
    if (patch.svol !== undefined) next.svol = clamp01(patch.svol);
    // subir o volume tira o "silenciado"
    if (patch.vol !== undefined && patch.vol > 0 && patch.mute === undefined) next.mute = false;
    if (patch.svol !== undefined && patch.svol > 0 && patch.smute === undefined) next.smute = false;
    const focus = useAv.getState().focus;
    const unfocus = (patch.hideCam && focus === `${id}:cam`) || (patch.hideScreen && focus === `${id}:screen`);
    useAv.setState((s) => ({ peerPrefs: { ...s.peerPrefs, [id]: next }, ...(unfocus ? { focus: null } : {}) }));
    savePeerPrefs();
    this.applySubs();
    this.refresh();
  }

  /** Desliga para todos o microfone, a câmera ou a tela de alguém (só a pessoa religa). */
  muteForAll(id: string, kind: 'mic' | 'cam' | 'screen') {
    net.send('av:mute', { to: id, kind });
  }

  /** Alguém desligou seu microfone, câmera ou tela para todos (o servidor de mídia já silenciou a faixa). */
  private async onRemoteMute(d: { kind: 'mic' | 'cam' | 'screen'; name: string }) {
    if (!this.main) return;
    if (d.kind === 'mic') {
      await this.setMic(false);
      toast(t('av.mutedBy', '{{name}} desligou o seu microfone. Clique no microfone para religar.', { name: d.name }), 'info', undefined, 8000);
    } else if (d.kind === 'cam') {
      await this.setCam(false);
      toast(t('av.camOffBy', '{{name}} desligou a sua câmera. Clique na câmera para religar.', { name: d.name }), 'info', undefined, 8000);
    } else {
      await this.setScreen(false);
      toast(t('av.screenOffBy', '{{name}} parou o seu compartilhamento de tela.', { name: d.name }), 'info', undefined, 8000);
    }
  }

  async unblock() {
    await this.main?.startAudio().catch(() => {});
    await this.aux?.startAudio().catch(() => {});
    useAv.setState({ blocked: false });
  }

  async setDevice(kind: 'audioinput' | 'videoinput' | 'audiooutput', id: string) {
    useAv.setState(kind === 'audioinput' ? { micId: id } : kind === 'videoinput' ? { camId: id } : { outId: id });
    savePrefs();
    await this.main?.switchActiveDevice(kind, id).catch(() => {});
    this.pushLocal();
  }

  /** Liga ou desliga o filtro de voz forte na faixa do microfone já publicada. */
  private async applyNoise() {
    if (this.nrBusy) return;
    const track = this.main?.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
    if (!track) return;
    const st = useAv.getState();
    const want = st.noiseReduce;
    const has = track.getProcessor()?.name === 'oi-rnnoise';
    if (want === has) return;
    this.nrBusy = true;
    let failed = false;
    try {
      // com o filtro forte, o ganho automático do navegador fica desligado: ele aumentava
      // o microfone quando a pessoa se afastava e trazia o barulho distante junto
      await track.restartTrack(micConstraints(st)).catch((e) => console.warn('[av] restartTrack', e));
      if (want) await track.setProcessor(new NoiseReducer(st.micFilter));
      else await track.stopProcessor();
    } catch (e) {
      console.warn('[av] redução de ruído', e);
      failed = true;
      await track.stopProcessor().catch(() => {});
      if (want && e instanceof AudioNotStarted) this.retryNoiseOnGesture();
      else if (want) toast(t('av.noiseError', 'Não foi possível ligar a redução de ruído neste navegador. O microfone segue com o filtro padrão.'), 'info');
    } finally {
      this.nrBusy = false;
    }
    this.pushLocal();
    // a preferência pode ter mudado enquanto aplicava
    if (!failed && useAv.getState().noiseReduce !== (track.getProcessor()?.name === 'oi-rnnoise')) void this.applyNoise();
  }

  async setNoiseReduce(on: boolean) {
    useAv.setState({ noiseReduce: on });
    savePrefs();
    await this.applyNoise();
  }

  /** Intensidade do filtro: muda na hora, sem reiniciar o microfone. */
  setMicFilter(f: MicFilter) {
    useAv.setState({ micFilter: f });
    savePrefs();
    const proc = this.main?.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack?.getProcessor();
    if (proc instanceof NoiseReducer) proc.setFilter(f);
  }

  /** O navegador só deixa o áudio iniciar depois de um clique/tecla: tenta de novo nesse momento. */
  private gestureRetry = false;
  private retryNoiseOnGesture() {
    if (this.gestureRetry) return;
    this.gestureRetry = true;
    const go = () => {
      window.removeEventListener('pointerdown', go, true);
      window.removeEventListener('keydown', go, true);
      this.gestureRetry = false;
      void this.applyNoise();
    };
    window.addEventListener('pointerdown', go, true);
    window.addEventListener('keydown', go, true);
  }

  async setPrefs(p: Partial<Pick<Prefs, 'hearNearby' | 'hd'>>) {
    const hdChanged = p.hd !== undefined && p.hd !== useAv.getState().hd;
    useAv.setState(p);
    savePrefs();
    this.applyVolumes();
    if (hdChanged && useAv.getState().cam && this.main) {
      // reabre a câmera na nova resolução
      const res = (useAv.getState().hd ? VideoPresets.h720 : VideoPresets.h360).resolution;
      await this.main.localParticipant.setCameraEnabled(false).catch(() => {});
      await this.main.localParticipant.setCameraEnabled(true, { resolution: res, deviceId: useAv.getState().camId || undefined }).catch((e) => this.deviceError(e, 'cam'));
      this.pushLocal();
    }
  }

  devices(kind: MediaDeviceKind) {
    return Room.getLocalDevices(kind).catch(() => [] as MediaDeviceInfo[]);
  }
}

export const av = new AvManager();
