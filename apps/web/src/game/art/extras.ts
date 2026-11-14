// SPDX-License-Identifier: AGPL-3.0-only
// Os 10 extras do visual v2 (Fase C2): cafeteira expresso com moedor, microfone de podcast,
// ring light, impressora multifuncional, máquina de snacks, aquário, quadro de cortiça,
// relógio de parede, letreiro neon (texto editável) e ar-condicionado split.
// Os de parede (cortiça, relógio, neon, split) ficam no próprio bloco da parede: o desenho
// ocupa a face dela (linhas 11 a 30; as 10 primeiras são o topo da parede).
// O relógio é estático (10h10); a Fase F troca os ponteiros por quadros pré-gerados.
import { GOLD, PAL, ramp, type Mat } from './palette';
import { Sprite, mix, noise } from './prim';
import { FONT_ADVANCE, FONT_H, drawText, textWidth } from './pixfont';
import type { PaintInfo, SpritePainter } from './sprites';

const B = PAL.plasticBlack;
const M = PAL.metal;
const matOf = (info: PaintInfo, fallback: string): Mat => ramp(info.color?.hex ?? fallback);

// ---------- cafeteira expresso com moedor, sobre um gabinete ----------

const espresso: SpritePainter = (s, info) => {
  const m = matOf(info, M.base);
  const { top } = info;
  const W = PAL.woodLight;
  s.piece((p) => {
    // gabinete com tampo de pedra clara e duas portas
    p.rect(1, top + 6, 30, 24, W.base);
    p.rect(1, top + 6, 30, 1, W.dark);
    p.rect(15, top + 7, 1, 22, W.dark);
    p.rect(2, top + 7, 1, 22, W.light);
    p.rect(12, top + 15, 1, 4, M.hi);
    p.rect(18, top + 15, 1, 4, M.hi);
    p.rect(1, top + 29, 30, 1, W.dark);
    p.rect(1, top + 1, 30, 5, PAL.ceramic.base);
    p.rect(1, top + 1, 30, 1, PAL.ceramic.hi);
    p.rect(1, top + 5, 30, 1, PAL.ceramic.dark);
  });
  s.piece((p) => {
    // corpo da máquina
    p.rrect(2, top - 15, 18, 19, m.base, 1);
    p.rect(3, top - 15, 16, 1, m.hi);
    p.rect(2, top - 13, 1, 15, m.light);
    p.rect(19, top - 13, 1, 16, m.dark);
    // manômetro
    p.rect(5, top - 12, 3, 3, PAL.paper.base);
    p.px(6, top - 11, B.base);
    // vão do grupo, porta-filtro e bandeja
    p.rect(5, top - 6, 13, 9, mix(m.dark, '#000000', 0.35));
    p.rect(9, top - 6, 5, 2, M.light);
    p.rect(13, top - 5, 5, 1, B.base);
    p.rect(9, top - 2, 4, 3, PAL.paper.hi);
    p.rect(10, top - 1, 2, 1, '#6b4128');
    p.rect(5, top + 2, 13, 1, M.hi);
    // vaporizador
    p.rect(3, top - 6, 1, 6, M.hi);
    // xícara em cima, no aquecedor
    p.rect(11, top - 18, 4, 3, PAL.paper.base);
    p.px(15, top - 17, PAL.paper.base);
  });
  s.piece((p) => {
    // moedor: reservatório de grãos e corpo
    p.poly(
      [
        [21, top - 18],
        [29, top - 18],
        [27, top - 8],
        [23, top - 8],
      ],
      '#c8a27a',
    );
    for (let i = 0; i < 8; i++) p.px(22 + Math.floor(noise(i, 3, 41) * 6), top - 16 + Math.floor(noise(i, 5, 42) * 7), '#5a3523');
    p.rect(21, top - 20, 9, 2, B.base);
    p.rect(22, top - 20, 7, 1, B.hi);
    p.rect(22, top - 8, 7, 12, B.light);
    p.rect(22, top - 8, 1, 12, B.hi);
    p.rect(23, top - 3, 5, 3, B.dark);
    p.px(27, top - 6, GOLD);
  });
};

// ---------- microfone de podcast com braço articulado (preso na borda de trás da mesa) ----------

const podcastMic: SpritePainter = (s, info) => {
  const m = matOf(info, '#2a2b30');
  const { top } = info;
  s.piece((p) => {
    // grampo na borda de trás do tampo e a coluna
    p.rect(5, top + 2, 5, 4, m.dark);
    p.rect(5, top + 2, 5, 1, m.light);
    p.rect(6, top - 14, 2, 17, m.base);
    p.rect(6, top - 14, 1, 17, m.light);
  });
  s.piece((p) => {
    // dois braços de 2 px com as molas, e a articulação do meio
    for (let i = 0; i <= 10; i++) {
      const x = 7 + i;
      const y = top - 15 - Math.round(i * 0.9);
      p.rect(x, y, 1, 2, m.base);
      if (i % 3 === 1) p.px(x, y - 1, m.light);
    }
    for (let i = 0; i <= 8; i++) {
      const x = 17 + Math.round(i * 0.5);
      const y = top - 24 + i;
      p.rect(x, y, 2, 1, m.base);
    }
    p.rect(16, top - 26, 3, 3, m.dark);
    p.px(17, top - 25, m.hi);
  });
  s.piece((p) => {
    // cápsula com grade e o suporte antivibração
    p.rrect(18, top - 16, 7, 13, m.base, 2);
    p.rect(19, top - 16, 5, 1, m.hi);
    for (let y = top - 14; y < top - 9; y += 2) p.rect(19, y, 5, 1, m.light);
    p.rect(19, top - 7, 5, 3, m.dark);
    p.rect(17, top - 10, 9, 2, B.base);
    p.rect(17, top - 10, 9, 1, B.light);
    p.px(21, top - 6, '#e0525a');
  });
};

// ---------- ring light no tripé ----------

const ringLight: SpritePainter = (s, info) => {
  const light = matOf(info, '#f6e3a8');
  const { top } = info;
  s.piece((p) => {
    // tripé e coluna
    p.line(15, top + 18, 6, top + 29, B.light);
    p.line(16, top + 18, 25, top + 29, B.light);
    p.line(16, top + 19, 17, top + 27, B.base);
    p.rect(5, top + 29, 3, 1, B.base);
    p.rect(24, top + 29, 3, 1, B.base);
    p.rect(15, top - 8, 2, 28, B.base);
    p.rect(15, top - 8, 1, 28, B.light);
    p.rect(14, top + 4, 4, 3, B.dark);
  });
  s.piece((p) => {
    // anel: carcaça, a luz e o miolo vazado
    p.ellipse(5, top - 31, 22, 22, B.base);
    p.ellipse(6, top - 30, 20, 20, light.light);
    p.ellipse(7, top - 29, 18, 18, mix(light.hi, '#ffffff', 0.4));
    p.ellipse(10, top - 26, 12, 12, light.dark);
    p.ellipse(11, top - 25, 10, 10, null);
  });
  s.piece((p) => {
    // suporte do celular no meio do anel
    p.rect(15, top - 14, 2, 5, B.base);
    p.rrect(13, top - 22, 6, 9, B.base, 1);
    p.rect(14, top - 21, 4, 6, '#2c3a55');
    p.px(15, top - 20, '#9fb4d9');
  });
};

// ---------- impressora multifuncional de escritório (de chão) ----------

const printer: SpritePainter = (s, info) => {
  const m = matOf(info, '#d9dce0');
  const { top } = info;
  const trim = mix(m.dark, '#000000', 0.25);
  s.piece((p) => {
    // corpo, gavetas de papel e rodapé
    p.rect(2, top - 12, 28, 41, m.base);
    p.rect(2, top - 12, 1, 41, m.light);
    p.rect(29, top - 12, 1, 41, m.dark);
    for (const y of [top + 6, top + 14]) {
      p.rect(3, y, 26, 7, m.light);
      p.rect(3, y + 6, 26, 1, m.dark);
      p.rect(13, y + 2, 6, 1, trim);
    }
    p.rect(2, top + 22, 28, 6, trim);
    p.rect(4, top + 28, 3, 2, B.base);
    p.rect(25, top + 28, 3, 2, B.base);
    // saída de papel
    p.rect(4, top - 2, 24, 6, mix(m.dark, '#000000', 0.15));
    p.rect(7, top - 1, 16, 4, PAL.paper.hi);
    p.rect(9, top, 10, 1, PAL.paper.dark);
  });
  s.piece((p) => {
    // scanner com alimentador de folhas e o painel
    p.rect(2, top - 20, 28, 8, m.light);
    p.rect(2, top - 20, 28, 1, m.hi);
    p.rect(2, top - 13, 28, 1, m.dark);
    p.rect(6, top - 24, 18, 4, m.base);
    p.rect(8, top - 26, 13, 3, PAL.paper.base);
    p.rect(9, top - 25, 9, 1, PAL.paper.dark);
    p.rect(18, top - 11, 10, 5, trim);
    p.rect(19, top - 10, 5, 3, '#4fb3a9');
    p.px(26, top - 10, '#58d27a');
    p.px(26, top - 8, PAL.metal.hi);
  });
};

// ---------- máquina de snacks ----------

const SNACKS = ['#e0525a', '#f2c94c', '#4a86c9', '#58b97a', '#f08a3c', '#b07cff'];

const snackMachine: SpritePainter = (s, info) => {
  const m = matOf(info, '#c8383c');
  const { top } = info;
  const y0 = top - 28;
  s.piece((p) => {
    p.rrect(2, y0, 28, 58, m.base, 1);
    p.rect(3, y0, 26, 1, m.hi);
    p.rect(2, y0 + 2, 1, 54, m.light);
    p.rect(29, y0 + 2, 1, 55, m.dark);
    p.rect(2, y0 + 56, 28, 2, m.dark);
    // letreiro
    p.rect(4, y0 + 2, 24, 7, PAL.paper.hi);
    drawText(p, 'SNACK', 6, y0 + 3, m.dark);
    // vitrine com quatro prateleiras
    const gx = 4;
    const gy = y0 + 11;
    p.rect(gx, gy, 17, 31, '#1d2a33');
    p.rect(gx, gy, 1, 31, '#33495a');
    for (let row = 0; row < 4; row++) {
      const sy = gy + 2 + row * 7;
      for (let col = 0; col < 3; col++) {
        const c = SNACKS[(row * 2 + col) % SNACKS.length];
        p.rect(gx + 2 + col * 5, sy, 4, 4, c);
        p.rect(gx + 2 + col * 5, sy, 4, 1, mix(c, '#ffffff', 0.4));
      }
      p.rect(gx + 1, sy + 5, 15, 1, M.dark);
    }
    p.px(gx + 13, gy + 3, '#e9f4fb');
    p.px(gx + 14, gy + 4, '#e9f4fb');
    // painel: visor, teclado e moedeiro
    p.rect(23, gy, 5, 3, '#14161b');
    p.rect(24, gy + 1, 3, 1, '#58d27a');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) p.px(24 + c * 2, gy + 5 + r * 2, PAL.paper.base);
    p.rect(24, gy + 15, 3, 1, B.base);
    p.rect(24, gy + 18, 3, 3, mix(m.dark, '#000000', 0.3));
    // gaveta de retirada
    p.rect(gx, y0 + 45, 17, 7, B.base);
    p.rect(gx + 1, y0 + 46, 15, 1, B.hi);
    p.rect(gx + 1, y0 + 48, 15, 3, B.dark);
  });
};

// ---------- aquário sobre o móvel ----------

const aquarium: SpritePainter = (s, info) => {
  const m = matOf(info, '#34353c');
  const { w, top } = info;
  const water = { deep: '#2f6f95', base: '#3f8fb8', light: '#6cb6d6' };
  s.piece((p) => {
    // móvel com duas portas
    p.rect(2, top + 7, w - 4, 23, m.base);
    p.rect(2, top + 7, w - 4, 1, m.hi);
    p.rect(Math.floor(w / 2), top + 9, 1, 19, m.dark);
    p.rect(3, top + 9, 1, 19, m.light);
    p.rect(Math.floor(w / 2) - 4, top + 16, 2, 4, M.hi);
    p.rect(Math.floor(w / 2) + 3, top + 16, 2, 4, M.hi);
    p.rect(2, top + 28, w - 4, 2, m.dark);
  });
  s.piece((p) => {
    // vidro e água
    const x0 = 3;
    const x1 = w - 4;
    const yT = top - 20;
    const yB = top + 6;
    p.rect(x0, yT, x1 - x0 + 1, yB - yT + 1, water.base);
    p.rect(x0, yT, x1 - x0 + 1, 3, water.light);
    p.rect(x0, yT + 3, x1 - x0 + 1, 1, mix(water.light, water.base, 0.5));
    p.rect(x0, yB - 9, x1 - x0 + 1, 6, mix(water.base, water.deep, 0.5));
    // cascalho
    for (let x = x0; x <= x1; x++) {
      const h = 3 + Math.floor(noise(x, 1, 77) * 2);
      p.rect(x, yB - h + 1, 1, h, (x + Math.floor(noise(x, 2, 78) * 3)) % 3 ? '#d4b483' : '#a88a5c');
    }
    // pedra e plantas
    p.rrect(Math.floor(w / 2) - 5, yB - 9, 11, 6, '#7d838c', 2);
    p.rect(Math.floor(w / 2) - 4, yB - 9, 6, 1, '#a1a7b0');
    for (const [px0, hgt, c] of [
      [6, 18, '#3e8247'],
      [9, 13, '#4f9a55'],
      [w - 10, 20, '#3e8247'],
      [w - 7, 14, '#6fb56f'],
    ] as const) {
      for (let i = 0; i < hgt; i++) p.px(px0 + (Math.floor(i / 3) % 2), yB - 3 - i, c);
    }
    // peixes: palhaço, amarelo e dois néons
    const fish = (fx: number, fy: number, body: string, stripe: string | null, left: boolean) => {
      p.rect(fx, fy, 5, 3, body);
      p.px(left ? fx + 5 : fx - 1, fy, body);
      p.px(left ? fx + 5 : fx - 1, fy + 2, body);
      if (stripe) p.rect(fx + 2, fy, 1, 3, stripe);
      p.px(left ? fx + 1 : fx + 3, fy + 1, '#14161b');
    };
    fish(16, yT + 7, '#f08a3c', '#ffffff', true);
    fish(w - 26, yT + 12, '#f2d95c', null, false);
    fish(24, yT + 15, '#4fd8f0', '#e0525a', true);
    fish(w - 18, yT + 6, '#4fd8f0', '#e0525a', false);
    // bolhas
    for (const [bx, by] of [
      [w - 14, yT + 16],
      [w - 13, yT + 12],
      [w - 14, yT + 8],
    ])
      p.px(bx, by, '#d6eef8');
    // reflexo no vidro e a moldura
    p.rect(x0 + 1, yT + 5, 1, 12, mix(water.light, '#ffffff', 0.4));
    p.rect(x0, yB + 1, x1 - x0 + 1, 1, B.base);
  });
  s.piece((p) => {
    // tampa (luminária) do aquário
    p.rect(2, top - 23, w - 4, 3, B.base);
    p.rect(2, top - 23, w - 4, 1, B.hi);
  });
};

// ---------- quadro de cortiça (parede) ----------

const corkboard: SpritePainter = (s, info) => {
  const m = matOf(info, '#8f6340');
  const { w } = info;
  const cork = { base: '#c49a6c', dark: '#a87e52', light: '#d6b084' };
  s.piece((p) => {
    p.rect(3, 11, w - 6, 19, m.base);
    p.rect(3, 11, w - 6, 1, m.hi);
    p.rect(3, 29, w - 6, 1, m.dark);
    p.rect(w - 4, 12, 1, 17, m.dark);
    p.rect(5, 13, w - 10, 15, cork.base);
    for (let y = 13; y < 28; y++) {
      for (let x = 5; x < w - 5; x++) {
        const n = noise(x, y, 91);
        if (n > 0.86) p.px(x, y, cork.dark);
        else if (n < 0.08) p.px(x, y, cork.light);
      }
    }
    // papéis presos com tachinhas
    const paper = (x: number, y: number, pw: number, ph: number, c: string, lines: string | null, pin: string) => {
      if (x + pw > w - 6) return;
      p.rect(x, y, pw, ph, c);
      p.rect(x, y + ph - 1, pw, 1, mix(c, '#000000', 0.15));
      if (lines) for (let ly = y + 3; ly < y + ph - 2; ly += 2) p.rect(x + 1, ly, pw - 3, 1, lines);
      p.px(x + Math.floor(pw / 2), y + 1, pin);
    };
    paper(8, 14, 10, 12, PAL.paper.hi, '#9aa3b5', '#e0525a');
    paper(20, 15, 7, 7, '#f2d95c', '#a68a2a', '#4a86c9');
    // polaroid
    paper(30, 14, 9, 11, PAL.paper.hi, null, '#f2c94c');
    p.rect(31, 16, 7, 6, '#86b3e6');
    p.rect(31, 20, 7, 2, '#58b97a');
    paper(43, 16, 9, 10, '#f08fb4', '#b0507a', '#58b97a');
    if (w >= 96) {
      paper(57, 14, 10, 12, PAL.paper.hi, '#9aa3b5', '#e0525a');
      paper(71, 16, 7, 7, '#9fd67a', '#4f8a35', '#e0525a');
    }
  });
};

// ---------- relógio de parede (10h10, estático) ----------

const wallClock: SpritePainter = (s, info) => {
  const m = matOf(info, '#2a2b30');
  const face = info.color?.id === 'black' || info.color?.id === 'wood' ? '#f4f1ea' : '#fbfaf6';
  const ink = '#2a2b30';
  s.piece((p) => {
    p.ellipse(7, 11, 19, 19, m.base);
    p.ellipse(8, 11, 17, 2, m.hi);
    p.ellipse(9, 13, 15, 15, face);
    // marcas das horas (12, 3, 6, 9) e meias
    p.rect(16, 14, 1, 2, ink);
    p.rect(16, 25, 1, 2, ink);
    p.rect(10, 20, 2, 1, ink);
    p.rect(21, 20, 2, 1, ink);
    for (const [x, y] of [
      [19, 15],
      [21, 17],
      [21, 23],
      [19, 25],
      [13, 25],
      [11, 23],
      [11, 17],
      [13, 15],
    ])
      p.px(x, y, mix(ink, face, 0.5));
    // ponteiros: horas apontando para o 10, minutos para o 2, segundos para baixo
    p.line(16, 20, 13, 18, ink);
    p.line(16, 20, 20, 17, ink);
    p.line(16, 21, 16, 24, '#c8383c');
    p.px(16, 20, GOLD);
  });
};

// ---------- letreiro neon com texto editável ----------

/** Desenha o texto `scale` vezes maior, com o canto superior esquerdo em (x, y). */
function bigText(p: Sprite, text: string, x: number, y: number, scale: number, c: string): void {
  const tmp = new Sprite(textWidth(text) + 1, FONT_H + 1);
  drawText(tmp, text, 0, 0, c);
  for (let ty = 0; ty < tmp.h; ty++) for (let tx = 0; tx < tmp.w; tx++) if (tmp.alpha(tx, ty)) p.rect(x + tx * scale, y + ty * scale, scale, scale, c);
}

const neon: SpritePainter = (s, info) => {
  const m = matOf(info, '#ff5fa8');
  const { w } = info;
  const plate = '#24242b';
  const tube = mix(m.base, '#ffffff', 0.5);
  const halo = mix(m.base, plate, 0.45);
  const raw = info.text ?? '';
  // escala 2 quando cabe; senão escala 1, cortando o que não couber
  const inner = w - 12;
  const scale = textWidth(raw) * 2 <= inner ? 2 : 1;
  const maxChars = Math.max(1, Math.floor((inner + 1) / FONT_ADVANCE));
  const text = scale === 2 ? raw : raw.slice(0, maxChars);
  const tw = textWidth(text) * scale;
  const th = FONT_H * scale;
  s.piece((p) => {
    // placa de acrílico escura com os parafusos
    p.rrect(2, 11, w - 4, 19, plate, 2);
    p.rect(4, 11, w - 8, 1, '#34343d');
    for (const x of [4, w - 5]) {
      p.px(x, 13, '#5a5d66');
      p.px(x, 27, '#5a5d66');
    }
    // moldura de tubo
    p.rect(6, 13, w - 12, 1, m.base);
    p.rect(6, 27, w - 12, 1, m.base);
    p.rect(5, 14, 1, 13, m.base);
    p.rect(w - 6, 14, 1, 13, m.base);
    // texto: tubo claro; no texto pequeno, um halo chapado em volta ajuda a ler
    const x = Math.round((w - tw) / 2);
    const y = 20 - Math.floor(th / 2);
    const letters = new Sprite(w, s.h);
    bigText(letters, text, x, y, scale, tube);
    if (scale === 1) for (let ly = 12; ly < 28; ly++) {
      for (let lx = 6; lx < w - 6; lx++) {
        if (letters.alpha(lx, ly)) continue;
        if (letters.alpha(lx - 1, ly) || letters.alpha(lx + 1, ly) || letters.alpha(lx, ly - 1) || letters.alpha(lx, ly + 1)) p.px(lx, ly, halo);
      }
    }
    p.paste(letters);
  });
};

// ---------- ar-condicionado split (parede) ----------

const splitAc: SpritePainter = (s, info) => {
  const m = matOf(info, '#e9ecf2');
  s.piece((p) => {
    p.rrect(2, 12, 28, 12, m.base, 2);
    p.rect(4, 12, 24, 1, m.hi);
    p.rect(2, 14, 1, 7, m.light);
    // grade de entrada de ar em cima
    for (let x = 5; x < 27; x += 2) p.px(x, 14, m.dark);
    // painel frontal, visor e a aleta de saída
    p.rect(3, 16, 26, 1, m.light);
    p.rect(22, 17, 4, 2, '#1f2a36');
    p.px(23, 17, '#4fd8f0');
    p.rect(4, 21, 24, 2, mix(m.dark, '#000000', 0.35));
    p.rect(5, 21, 22, 1, m.dark);
    p.rect(2, 23, 28, 1, m.dark);
  });
};

export const EXTRAS: Record<string, SpritePainter> = {
  espresso,
  podcast_mic: podcastMic,
  ring_light: ringLight,
  printer,
  snack_machine: snackMachine,
  aquarium,
  corkboard,
  wall_clock: wallClock,
  neon,
  split_ac: splitAc,
};
