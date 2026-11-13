// SPDX-License-Identifier: AGPL-3.0-only
import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorklet from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasm from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasm from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

/**
 * Medidor do próprio microfone: diz se a pessoa está falando agora, para acender o
 * anel verde no próprio vídeo. Mede no navegador (não depende do servidor), então
 * responde na hora e mostra que o microfone está mesmo captando som.
 */
export class MicMeter {
  private ctx: AudioContext | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private track: MediaStreamTrack | null = null;
  private timer: number | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private lastLoud = 0;
  private speaking = false;

  constructor(private onChange: (speaking: boolean) => void) {}

  /** Passa a medir esta faixa (ou para, com null). */
  watch(track: MediaStreamTrack | null) {
    if (track === this.track) return;
    this.stopSource();
    this.track = track;
    if (!track) {
      this.set(false);
      return;
    }
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume().catch(() => {});
      this.src = this.ctx.createMediaStreamSource(new MediaStream([track]));
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.buf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
      this.src.connect(this.analyser);
      this.timer = window.setInterval(() => this.tick(), 80);
    } catch (e) {
      console.warn('[av] medidor do microfone', e);
    }
  }

  private tick() {
    const a = this.analyser;
    const buf = this.buf;
    if (!a || !buf) return;
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {});
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
    const db = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-8);
    const now = performance.now();
    // abre com voz (~-45 dB), segura 350 ms para o anel não piscar entre as sílabas
    if (db > -45) this.lastLoud = now;
    this.set(now - this.lastLoud < 350);
  }

  private set(v: boolean) {
    if (v === this.speaking) return;
    this.speaking = v;
    this.onChange(v);
  }

  private stopSource() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.src?.disconnect();
    this.analyser?.disconnect();
    this.src = null;
    this.analyser = null;
  }
}

let wasm: Promise<ArrayBuffer> | null = null;
const loadWasm = () => (wasm ??= loadRnnoise({ url: rnnoiseWasm, simdUrl: rnnoiseSimdWasm }).catch((e) => {
  wasm = null;
  throw e;
}));

/**
 * Redução de ruído forte (RNNoise, rede neural open source) aplicada ao microfone antes
 * de enviar: tira teclado, ventilador, trânsito, latido etc. Roda tudo no computador da
 * pessoa, sem serviço externo.
 */
export class NoiseReducer implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'oi-rnnoise';
  processedTrack?: MediaStreamTrack;
  private ctx: AudioContext | null = null;
  private loaded = false;
  private src: MediaStreamAudioSourceNode | null = null;
  private node: RnnoiseWorkletNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;

  async init(opts: AudioProcessorOptions) {
    await this.build(opts.track);
  }

  async restart(opts: AudioProcessorOptions) {
    this.teardown();
    await this.build(opts.track);
  }

  async destroy() {
    this.teardown();
    const ctx = this.ctx;
    this.ctx = null;
    this.loaded = false;
    await ctx?.close().catch(() => {});
  }

  private async build(track: MediaStreamTrack) {
    const wasmBinary = await loadWasm();
    // o RNNoise trabalha em 48 kHz
    this.ctx ??= new AudioContext({ sampleRate: 48000 });
    if (!this.loaded) {
      await this.ctx.audioWorklet.addModule(rnnoiseWorklet);
      this.loaded = true;
    }
    await this.ctx.resume().catch(() => {});
    if (this.ctx.state !== 'running') throw new Error('AudioContext não iniciou');
    this.src = this.ctx.createMediaStreamSource(new MediaStream([track]));
    this.node = new RnnoiseWorkletNode(this.ctx, { maxChannels: 1, wasmBinary });
    this.dest = this.ctx.createMediaStreamDestination();
    this.src.connect(this.node).connect(this.dest);
    this.processedTrack = this.dest.stream.getAudioTracks()[0];
  }

  private teardown() {
    this.src?.disconnect();
    this.node?.disconnect();
    this.node?.destroy();
    this.processedTrack?.stop();
    this.src = null;
    this.node = null;
    this.dest = null;
    this.processedTrack = undefined;
  }
}
