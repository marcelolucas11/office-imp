// SPDX-License-Identifier: AGPL-3.0-only
import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';
import { GtcrnWorkletNode, loadGtcrn, loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import gtcrnWorklet from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url';
import gtcrnWasm from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url';
import rnnoiseWorklet from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasm from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasm from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import voiceGateWorklet from './voiceGate.worklet.js?url';

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

/** Quanto o filtro corta o que não está perto do microfone. */
export type MicFilter = 'light' | 'normal' | 'strong';
/** Nível mínimo (dBFS) para o portão de voz abrir, por intensidade do filtro. */
export const GATE_DB: Record<MicFilter, number> = { light: -56, normal: -48, strong: -41 };

const once = <T,>(fn: () => Promise<T>) => {
  let p: Promise<T> | null = null;
  return () =>
    (p ??= fn().catch((e) => {
      p = null;
      throw e;
    }));
};
const loadGtcrnWasm = once(() => loadGtcrn({ url: gtcrnWasm }));
const loadRnnoiseWasm = once(() => loadRnnoise({ url: rnnoiseWasm, simdUrl: rnnoiseSimdWasm }));

/** O AudioContext não pôde iniciar (o navegador pede um clique antes). */
export class AudioNotStarted extends Error {}

/**
 * Filtro de voz do microfone, aplicado antes de enviar. Tudo roda no computador da pessoa:
 *  1. corte de graves (90 Hz): ronco de motor, trânsito, ar-condicionado, batidas na mesa;
 *  2. rede neural GTCRN (cai para RNNoise se não carregar): separa a voz de todo o resto —
 *     carro passando, buzina, teclado, ventilador, música, TV, latido;
 *  3. portão de voz: só abre para som perto do microfone, então o que é distante (inclusive
 *     outras pessoas falando ao fundo) e o resto de ruído que sobrou não passam;
 *  4. compressor com ganho fixo: volume constante sem o ganho automático do navegador, que
 *     aumentava o microfone quando a pessoa se afastava e trazia o fundo junto.
 */
export class NoiseReducer implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'oi-rnnoise';
  processedTrack?: MediaStreamTrack;
  /** Qual rede neural está rodando (para o diagnóstico). */
  engine: 'gtcrn' | 'rnnoise' | null = null;
  private ctx: AudioContext | null = null;
  private loaded = new Set<string>();
  private nodes: AudioNode[] = [];
  private neural: GtcrnWorkletNode | RnnoiseWorkletNode | null = null;
  private gate: AudioWorkletNode | null = null;
  private processed: MediaStreamTrack | null = null;

  constructor(private filter: MicFilter = 'normal') {}

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
    this.loaded.clear();
    await ctx?.close().catch(() => {});
  }

  /** Muda a intensidade do portão sem reiniciar o microfone. */
  setFilter(f: MicFilter) {
    this.filter = f;
    this.gate?.port.postMessage({ openDb: GATE_DB[f] });
  }

  private async addModule(url: string) {
    if (this.loaded.has(url)) return;
    await this.ctx!.audioWorklet.addModule(url);
    this.loaded.add(url);
  }

  private async makeNeural(ctx: AudioContext): Promise<GtcrnWorkletNode | RnnoiseWorkletNode> {
    try {
      const wasmBinary = await loadGtcrnWasm();
      await this.addModule(gtcrnWorklet);
      const n = new GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary });
      this.engine = 'gtcrn';
      return n;
    } catch (e) {
      console.warn('[av] GTCRN indisponível, usando RNNoise', e);
      const wasmBinary = await loadRnnoiseWasm();
      await this.addModule(rnnoiseWorklet);
      this.engine = 'rnnoise';
      return new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
    }
  }

  private async build(track: MediaStreamTrack) {
    // as redes trabalham em 48 kHz
    this.ctx ??= new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    const ctx = this.ctx;
    await ctx.resume().catch(() => {});
    if (ctx.state !== 'running') throw new AudioNotStarted('AudioContext não iniciou');

    const src = ctx.createMediaStreamSource(new MediaStream([track]));

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    hp.Q.value = 0.707;
    // segundo estágio: corte mais íngreme do ronco grave de rua
    const hp2 = ctx.createBiquadFilter();
    hp2.type = 'highpass';
    hp2.frequency.value = 90;
    hp2.Q.value = 0.707;

    this.neural = await this.makeNeural(ctx);

    await this.addModule(voiceGateWorklet);
    this.gate = new AudioWorkletNode(ctx, 'oi-voice-gate', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { openDb: GATE_DB[this.filter] },
    });

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const makeup = ctx.createGain();
    makeup.gain.value = 1.8; // ~+5 dB depois da compressão
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;

    const dest = ctx.createMediaStreamDestination();
    src.connect(hp).connect(hp2).connect(this.neural).connect(this.gate).connect(comp).connect(makeup).connect(limiter).connect(dest);
    this.nodes = [src, hp, hp2, this.neural, this.gate, comp, makeup, limiter, dest];
    this.processed = dest.stream.getAudioTracks()[0] ?? null;
    this.processedTrack = this.processed ?? undefined;
  }

  private teardown() {
    for (const n of this.nodes) n.disconnect();
    this.neural?.destroy();
    this.processed?.stop();
    this.nodes = [];
    this.neural = null;
    this.gate = null;
    this.processed = null;
    this.processedTrack = undefined;
  }
}
