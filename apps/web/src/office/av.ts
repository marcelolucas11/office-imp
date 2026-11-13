// SPDX-License-Identifier: AGPL-3.0-only
import { Room, RoomEvent, Track, VideoPresets, type RemoteParticipant, type RemoteTrackPublication } from 'livekit-client';
import { create } from 'zustand';
import { volumeForDistance, type AvView } from '@office-imp/shared';
import { bus } from '../game/bus';
import { net } from '../game/net';
import { useGame } from '../game/store';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { toast } from '../lib/session';
import { MicMeter, NoiseReducer } from './micAudio';

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
}

interface Prefs {
  hearNearby: boolean;
  hd: boolean;
  micId: string;
  camId: string;
  outId: string;
  /** Redução de ruído forte (RNNoise) no microfone. */
  noiseReduce: boolean;
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
}

const PREF_KEY = 'oi-av';
function loadPrefs(): Prefs {
  const base: Prefs = { hearNearby: true, hd: false, micId: '', camId: '', outId: '', noiseReduce: true };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') };
  } catch {
    return base;
  }
}

export const useAv = create<AvState>(() => ({ ...loadPrefs(), conn: 'off', room: 'none', mic: false, cam: false, screen: false, localCam: null, localScreen: null, peers: [], blocked: false, focus: null, meSpeaking: false }));

function savePrefs() {
  const s = useAv.getState();
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ hearNearby: s.hearNearby, hd: s.hd, micId: s.micId, camId: s.camId, outId: s.outId, noiseReduce: s.noiseReduce }));
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
      useGame.subscribe((s, prev) => {
        const me = s.players[s.meId];
        const before = prev.players[prev.meId];
        if (me && before && me.status !== before.status && me.status === 'BUSY') void this.setMic(false);
        if (me && before && me.distance !== before.distance) this.applyVolumes();
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
      this.current = '';
      useAv.setState({ conn: 'off', room: 'none', peers: [] });
      this.pushLocal();
      return;
    }
    const want = this.view.room;
    if (want !== this.current || (want !== 'none' && !this.main)) {
      await this.leaveMain();
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
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { deviceId: st.micId || undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
    if (this.want.mic) await room.localParticipant.setMicrophoneEnabled(true).catch((e) => this.deviceError(e, 'mic'));
    if (this.want.cam) await room.localParticipant.setCameraEnabled(true).catch((e) => this.deviceError(e, 'cam'));
    this.pushLocal();
  }

  private async joinAux(officeId: string) {
    const { token, url } = await api.post('/api/livekit/token', { officeId, room: 'open', aux: true });
    const room = this.newRoom();
    this.bind(room, true);
    await room.connect(url, token, { autoSubscribe: false });
    this.aux = room;
  }

  private async leaveMain() {
    const room = this.main;
    this.main = null;
    if (room) await room.disconnect().catch(() => {});
    this.meter.watch(null);
    for (const el of this.audioEls) el.remove();
    this.audioEls.clear();
    useAv.setState({ focus: null });
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
      .on(RoomEvent.TrackMuted, (_pub, p) => {
        if (p.isLocal) this.pushLocal();
        this.refresh();
      })
      .on(RoomEvent.TrackUnmuted, (_pub, p) => {
        if (p.isLocal) this.pushLocal();
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
    if (this.main && this.current === 'open') {
      const allow = new Set([...v.peers.map((p) => p.id), ...v.spotlight]);
      for (const p of this.main.remoteParticipants.values()) for (const pub of p.trackPublications.values()) set(pub, allow.has(p.identity));
    }
    if (this.aux) {
      for (const p of this.aux.remoteParticipants.values()) for (const pub of p.trackPublications.values()) set(pub, v.spotlight.includes(p.identity));
    }
    this.applyVolumes();
  }

  applyVolumes() {
    const g = useGame.getState();
    const radius = g.players[g.meId]?.distance ?? 5;
    const hear = useAv.getState().hearNearby;
    const v = this.view;
    const vol = (p: RemoteParticipant, value: number) => {
      p.setVolume(value, Track.Source.Microphone);
      p.setVolume(value, Track.Source.ScreenShareAudio);
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
    const out: PeerMedia[] = [];
    const ids = [...v.peers.map((p) => ({ id: p.id, spot: false })), ...v.spotlight.map((id) => ({ id, spot: true }))];
    for (const { id, spot } of ids) {
      const p = (spot && this.aux ? this.aux.remoteParticipants.get(id) : undefined) ?? this.main?.remoteParticipants.get(id);
      const cam = p?.getTrackPublication(Track.Source.Camera);
      const scr = p?.getTrackPublication(Track.Source.ScreenShare);
      const mic = p?.getTrackPublication(Track.Source.Microphone);
      out.push({
        id,
        name: g.players[id]?.name ?? p?.name ?? id,
        cam: cam?.track && !cam.isMuted ? cam.track : null,
        screen: scr?.track ?? null,
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
      await this.main!.localParticipant.setScreenShareEnabled(on, { audio: true });
    } catch (e) {
      // cancelar a escolha da tela não é erro
      if (!/Permission|NotAllowed|cancel/i.test(errMsg(e))) toast(t('av.screenError', 'Não foi possível compartilhar a tela.'), 'error');
    }
    this.pushLocal();
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

  /** Liga ou desliga a redução de ruído forte na faixa do microfone já publicada. */
  private async applyNoise() {
    if (this.nrBusy) return;
    const track = this.main?.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
    if (!track) return;
    const want = useAv.getState().noiseReduce;
    const has = track.getProcessor()?.name === 'oi-rnnoise';
    if (want === has) return;
    this.nrBusy = true;
    let failed = false;
    try {
      if (want) await track.setProcessor(new NoiseReducer());
      else await track.stopProcessor();
    } catch (e) {
      console.warn('[av] redução de ruído', e);
      failed = true;
      await track.stopProcessor().catch(() => {});
      if (want) toast(t('av.noiseError', 'Não foi possível ligar a redução de ruído neste navegador. O microfone segue com o filtro padrão.'), 'info');
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
