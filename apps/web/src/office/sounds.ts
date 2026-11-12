// SPDX-License-Identifier: AGPL-3.0-only
// Sons curtos gerados por código (sem arquivos de áudio).
let ctx: AudioContext | null = null;

function tone(freq: number, at: number, dur: number, gain = 0.07, type: OscillatorType = 'sine') {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + at);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + at);
  osc.stop(ctx.currentTime + at + dur + 0.02);
}

export function playSound(kind: 'wave' | 'rec' | 'msg' | 'join') {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (kind === 'wave') {
      tone(660, 0, 0.16);
      tone(880, 0.14, 0.22);
    } else if (kind === 'rec') {
      tone(520, 0, 0.12, 0.08, 'triangle');
      tone(520, 0.2, 0.12, 0.08, 'triangle');
    } else if (kind === 'msg') tone(740, 0, 0.1, 0.05);
    else tone(440, 0, 0.12, 0.04);
  } catch {}
}
