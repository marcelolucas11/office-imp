// SPDX-License-Identifier: AGPL-3.0-only
// Portão de voz (AudioWorklet), depois da rede neural de ruído.
// Só deixa passar som PERTO do microfone: mede o nível a cada 10 ms, acompanha o piso de
// ruído do ambiente e abre só quando o som passa bem acima dele E acima de um nível mínimo
// (voz de quem está em frente ao computador). Som distante, carro passando lá fora, TV na
// outra sala e conversas ao fundo ficam abaixo e saem mudos.
// Arquivo JS puro (sem imports): o navegador carrega direto com audioWorklet.addModule.

const FRAME = 480; // 10 ms a 48 kHz
const FLOOR_MIN = -90;
const FLOOR_MAX = -40;

class VoiceGate extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.open = typeof o.openDb === 'number' ? o.openDb : -48; // nível mínimo para abrir
    this.margin = 14; // dB acima do piso de ruído
    this.holdMs = 320; // segura aberto entre sílabas
    this.floor = -70;
    this.acc = 0;
    this.n = 0;
    this.isOpen = false;
    this.holdLeft = 0;
    this.gain = 0;
    this.target = 0;
    const sr = sampleRate;
    this.attack = 1 - Math.exp(-1 / (0.004 * sr)); // abre em ~4 ms
    this.release = 1 - Math.exp(-1 / (0.09 * sr)); // fecha em ~90 ms
    // 10 ms de "olhar à frente": o som sai atrasado um quadro, então o começo da palavra não é cortado
    this.delay = new Float32Array(FRAME);
    this.di = 0;
    this.floorRise = 0.03; // dB por quadro (~3 dB/s): o piso sobe devagar
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.openDb === 'number') this.open = e.data.openDb;
    };
  }

  frame(db) {
    // piso de ruído: desce rápido, sobe devagar (só segue o "chão" do ambiente)
    if (db < this.floor) this.floor = this.floor * 0.6 + db * 0.4;
    else this.floor += this.floorRise;
    if (this.floor < FLOOR_MIN) this.floor = FLOOR_MIN;
    if (this.floor > FLOOR_MAX) this.floor = FLOOR_MAX;

    const openAt = Math.max(this.open, this.floor + this.margin);
    const closeAt = openAt - 6;
    if (db >= openAt) {
      this.isOpen = true;
      this.holdLeft = this.holdMs;
    } else if (this.isOpen) {
      if (db >= closeAt) this.holdLeft = this.holdMs;
      else {
        this.holdLeft -= 10;
        if (this.holdLeft <= 0) this.isOpen = false;
      }
    }
    this.target = this.isOpen ? 1 : 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output.length) return true;
    const inp = input && input.length ? input[0] : null;
    const out0 = output[0];
    for (let i = 0; i < out0.length; i++) {
      const x = inp ? inp[i] : 0;
      this.acc += x * x;
      if (++this.n >= FRAME) {
        const db = 10 * Math.log10(this.acc / this.n + 1e-12);
        this.acc = 0;
        this.n = 0;
        this.frame(db);
      }
      this.gain += (this.target - this.gain) * (this.target > this.gain ? this.attack : this.release);
      const d = this.delay[this.di];
      this.delay[this.di] = x;
      this.di = (this.di + 1) % FRAME;
      const y = d * this.gain;
      for (let c = 0; c < output.length; c++) output[c][i] = y;
    }
    return true;
  }
}

registerProcessor('oi-voice-gate', VoiceGate);
