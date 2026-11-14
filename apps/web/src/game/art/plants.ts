// SPDX-License-Identifier: AGPL-3.0-only
// Plantas do visual v2 (Fase C3): planta de folhagem e vaso pequeno (os tipos de antes,
// redesenhados), costela-de-adão, espada-de-são-jorge, cacto grande, suculentas em vaso médio,
// palmeira, vaso alto com plumas, samambaia pendurada e jardim vertical (estes dois de parede).
// As de chão com `tall: 1` têm o vaso apoiado no fim do bloco (linhas `top + 13 … top + 29`)
// e a planta subindo para o bloco de cima. A cor da variante é a do vaso (ou da moldura).
// As de parede vão no bloco da parede e ocupam a face dela (linhas 11 a 30), como o relógio.
import { PAL, ramp, type Mat } from './palette';
import { Sprite, mix, noise } from './prim';
import type { PaintInfo, SpritePainter } from './sprites';

const matOf = (info: PaintInfo, fallback: string): Mat => ramp(info.color?.hex ?? fallback);

/** Terra do vaso. */
const SOIL = { dark: '#33231a', base: '#4a3324', light: '#5e4330' };

// ---------- vasos ----------

type PotShape = 'square' | 'taper' | 'round';

/**
 * Vaso visto de frente e um pouco de cima: borda (com a terra aparecendo) e corpo, luz à
 * esquerda e sombra à direita. `x, y` = canto de cima da borda; `w, h` = tamanho total.
 */
function pot(p: Sprite, x: number, y: number, w: number, h: number, m: Mat, shape: PotShape): void {
  const bodyY = y + 3;
  const bodyH = h - 3;
  if (shape === 'taper') {
    p.poly(
      [
        [x + 1, bodyY],
        [x + w - 2, bodyY],
        [x + w - 3, y + h - 1],
        [x + 2, y + h - 1],
      ],
      m.base,
    );
    p.line(x + 2, bodyY + 1, x + 3, y + h - 3, m.light);
    p.line(x + w - 3, bodyY, x + w - 4, y + h - 2, m.dark);
    p.line(x + w - 4, bodyY, x + w - 5, y + h - 2, mix(m.base, m.dark, 0.5));
    p.rect(x + 3, y + h - 1, w - 6, 1, m.dark);
  } else if (shape === 'round') {
    p.rrect(x, bodyY - 1, w, bodyH + 1, m.base, 3);
    p.rect(x + 1, bodyY + 1, 1, bodyH - 4, m.light);
    p.rect(x + w - 3, bodyY, 2, bodyH - 3, m.dark);
    p.rect(x + 3, y + h - 1, w - 6, 1, m.dark);
    p.rect(x + 2, y + h - 2, w - 4, 1, mix(m.base, m.dark, 0.5));
  } else {
    p.rect(x, bodyY, w, bodyH, m.base);
    p.rect(x + 1, bodyY + 1, 1, bodyH - 3, m.light);
    p.rect(x + w - 3, bodyY, 3, bodyH, m.dark);
    p.rect(x + w - 4, bodyY, 1, bodyH, mix(m.base, m.dark, 0.5));
    p.rect(x, y + h - 1, w, 1, m.dark);
  }
  // borda: a quina de cima clara, a terra no meio e a sombra logo abaixo
  p.rect(x, y, w, 3, m.light);
  p.rect(x, y, w, 1, m.hi);
  p.rect(x + 2, y + 1, w - 4, 1, SOIL.base);
  p.rect(x + 3, y + 1, 3, 1, SOIL.light);
  p.rect(x, y + 3, w, 1, m.dark);
}

/** Cesto de palha trançado (variante "basket" da palmeira). */
function basket(p: Sprite, x: number, y: number, w: number, h: number, m: Mat): void {
  p.rrect(x, y + 2, w, h - 2, m.base, 2);
  for (let yy = y + 4; yy < y + h - 1; yy++) {
    for (let xx = x + 1; xx < x + w - 1; xx++) {
      const row = Math.floor((yy - y - 4) / 2);
      if ((xx + row * 2) % 4 === 0) p.px(xx, yy, m.dark);
      else if ((yy - y) % 2 === 0 && (xx + row * 2) % 4 === 2) p.px(xx, yy, m.light);
    }
  }
  p.rect(x + w - 2, y + 3, 1, h - 5, m.dark);
  p.rect(x, y, w, 3, m.light);
  p.rect(x, y, w, 1, m.hi);
  p.rect(x + 2, y + 1, w - 4, 1, SOIL.base);
  p.rect(x, y + 3, w, 1, m.dark);
}

// ---------- folhas ----------

/** Preenche uma elipse com luz no alto à esquerda e sombra embaixo à direita. */
function shadedBlob(p: Sprite, cx: number, cy: number, rx: number, ry: number, g: Mat, lit = -0.55, dim = 0.8): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const d = dx + dy;
      p.px(x, y, d < lit ? g.light : d > dim ? g.dark : g.base);
    }
  }
}

/**
 * Folha de costela-de-adão: elipse sombreada, nervura central clara e os recortes (frestas que
 * viram traço escuro com o contorno). `base` = ângulo, a partir do centro, de onde sai o talo.
 */
function monsteraLeaf(p: Sprite, cx: number, cy: number, rx: number, ry: number, g: Mat, base: number, cuts: number[]): void {
  shadedBlob(p, cx, cy, rx, ry, g);
  const bx = cx + Math.cos(base) * (rx - 0.5);
  const by = cy + Math.sin(base) * (ry - 0.5);
  p.line(bx, by, cx - Math.cos(base) * rx * 0.55, cy - Math.sin(base) * ry * 0.55, g.hi);
  for (const a of cuts) {
    for (const side of [-1, 1]) {
      const ang = base + side * a;
      p.line(cx + Math.cos(ang) * (rx + 0.6), cy + Math.sin(ang) * (ry + 0.6), cx + Math.cos(ang) * rx * 0.5, cy + Math.sin(ang) * ry * 0.5, null);
    }
  }
  // o "coração": entalhe junto ao talo
  p.px(bx, by, null);
}

/** Talo de 1 px (linha) com um tom. */
function stem(p: Sprite, x0: number, y0: number, x1: number, y1: number, c: string): void {
  p.line(x0, y0, x1, y1, c);
}

// ---------- costela-de-adão ----------

const MON_BACK: Mat = { dark: '#1d4a2a', base: '#2a6437', light: '#377a43', hi: '#5c9d5f' };
const MON: Mat = { dark: '#2a6437', base: '#3a8645', light: '#52a457', hi: '#8ac985' };
const STEM = '#2b4f25';

const monstera: SpritePainter = (s, info) => {
  const m = matOf(info, '#e8e3d9');
  const { top } = info;
  const py = top + 13;
  // talos saindo do vaso para cada folha (sem contorno: são finos e escuros)
  for (const [x, y] of [
    [16, 9],
    [9, 18],
    [23, 17],
    [8, 30],
    [24, 29],
    [16, 25],
  ])
    stem(s, 15 + (x > 16 ? 1 : 0), py + 1, x, y + 4, STEM);
  s.piece((p) => {
    monsteraLeaf(p, 16, 9, 7, 6.5, MON_BACK, Math.PI / 2, [1.2, 1.9]);
    monsteraLeaf(p, 8.5, 18, 7, 6, MON_BACK, Math.PI / 5, [1.2, 1.9]);
    monsteraLeaf(p, 23.5, 17, 7, 6, MON_BACK, Math.PI - Math.PI / 5, [1.2, 1.9]);
  });
  s.piece((p) => {
    monsteraLeaf(p, 8, 30, 6.5, 5.5, MON, 0.25, [1.3, 2.0]);
    monsteraLeaf(p, 24, 29, 6.5, 5.5, MON, Math.PI - 0.25, [1.3, 2.0]);
  });
  s.piece((p) => monsteraLeaf(p, 16, 24, 7, 6, MON, Math.PI / 2, [1.1, 1.8]));
  s.piece((p) => pot(p, 8, py, 16, 17, m, 'square'));
};

// ---------- espada-de-são-jorge ----------

const SNAKE = { edge: '#d8c862', edgeDark: '#a3943c', back: '#1f3f27', base: '#2b5532', band: '#4a7c48', bandBack: '#33603a' };

/** Uma folha em espada: larga no meio, ponta fina, borda amarela e faixas claras em zigue-zague. */
function sword(p: Sprite, baseX: number, baseY: number, tipX: number, tipY: number, maxHw: number, back: boolean): void {
  const len = baseY - tipY;
  for (let y = tipY; y <= baseY; y++) {
    const t = (y - tipY) / len;
    const cx = tipX + (baseX - tipX) * Math.pow(t, 1.3);
    const hw = t < 0.25 ? maxHw * (0.2 + (0.8 * t) / 0.25) : maxHw * (1 - 0.2 * ((t - 0.25) / 0.75));
    const x0 = Math.round(cx - hw);
    const x1 = Math.max(x0, Math.round(cx + hw));
    for (let x = x0; x <= x1; x++) {
      let c = back ? SNAKE.back : SNAKE.base;
      if (x === x0) c = SNAKE.edge;
      else if (x === x1) c = SNAKE.edgeDark;
      else if ((y + (x - x0)) % 5 === 0 || (y - (x - x0)) % 5 === 0) c = back ? SNAKE.bandBack : SNAKE.band;
      p.px(x, y, c);
    }
  }
}

const snakePlant: SpritePainter = (s, info) => {
  const m = matOf(info, '#34353c');
  const { top } = info;
  const py = top + 15;
  // cada folha numa peça: o contorno separa uma da outra
  const leaves: [number, number, number, number, boolean][] = [
    [13, 8, 3, 2.6, true],
    [19, 24, 2, 2.6, true],
    [10, 3, 15, 2.6, false],
    [22, 28, 13, 2.6, false],
    [14, 12, 6, 2.8, false],
    [18, 19, 8, 2.8, false],
  ];
  for (const [bx, tx, ty, hw, back] of leaves) s.piece((p) => sword(p, bx, py + 1, tx, ty, hw, back));
  s.piece((p) => pot(p, 8, py, 16, 15, m, 'square'));
};

// ---------- cacto grande (mandacaru) ----------

const MANDA: Mat = { dark: '#2c5a46', base: '#3c7a5c', light: '#55977a', hi: '#93c3a5' };
const SPINE = '#ece4bf';

/** Gomo de cacto: coluna com nervuras verticais e espinhos claros. */
function column(p: Sprite, x: number, y: number, w: number, h: number, g: Mat, seed: number): void {
  p.rrect(x, y, w, h, g.base, Math.min(3, Math.floor(w / 2)));
  p.rect(x + 1, y + 2, 1, h - 3, g.light);
  for (let rx = x + 3; rx < x + w - 1; rx += 2) p.rect(rx, y + 2, 1, h - 3, (rx - x) % 4 === 1 ? g.dark : g.light);
  p.rect(x + w - 2, y + 2, 1, h - 3, g.dark);
  p.rect(x + 1, y + 1, Math.max(1, w - 3), 1, g.hi);
  for (let yy = y + 3; yy < y + h - 1; yy += 3) {
    const sx = x + 1 + Math.floor(noise(yy, seed, 61) * (w - 2));
    p.px(sx, yy, SPINE);
  }
}

const cactus: SpritePainter = (s, info) => {
  const m = matOf(info, PAL.terracotta.base);
  const { top } = info;
  const py = top + 14;
  s.piece((p) => {
    // braço esquerdo: sai baixo e sobe
    p.rect(6, 31, 7, 5, MANDA.base);
    p.rect(6, 31, 7, 1, MANDA.light);
    p.rect(6, 35, 7, 1, MANDA.dark);
    column(p, 4, 16, 6, 20, MANDA, 1);
  });
  s.piece((p) => {
    // braço direito: sai mais alto
    p.rect(19, 24, 6, 5, MANDA.base);
    p.rect(19, 24, 6, 1, MANDA.light);
    p.rect(19, 28, 6, 1, MANDA.dark);
    column(p, 22, 9, 6, 20, MANDA, 2);
  });
  s.piece((p) => column(p, 11, 5, 10, py - 4, MANDA, 3));
  s.piece((p) => {
    // flor branca no alto do tronco
    p.rect(14, 3, 4, 3, '#f4f1ea');
    p.px(13, 4, '#f4f1ea');
    p.px(18, 4, '#f4f1ea');
    p.rect(15, 4, 2, 1, '#f2c94c');
    p.px(15, 2, '#d8d2c4');
  });
  s.piece((p) => pot(p, 8, py, 16, 16, m, 'taper'));
};

// ---------- suculentas em vaso médio ----------

const ECHE = { dark: '#5b8f86', base: '#82b3a5', light: '#a8cfc0', hi: '#d3ebe0', tip: '#cf7f93' };
const JADE: Mat = { dark: '#3d6e3a', base: '#56904a', light: '#74ab5c', hi: '#a5cc84' };

/** Pétala pontuda saindo do centro (triângulo). */
function petal(p: Sprite, cx: number, cy: number, a: number, len: number, wid: number, c: string): void {
  const ex = cx + Math.cos(a) * len;
  const ey = cy + Math.sin(a) * len * 0.75;
  const nx = -Math.sin(a) * wid;
  const ny = Math.cos(a) * wid * 0.75;
  p.poly(
    [
      [cx + nx, cy + ny],
      [ex, ey],
      [cx - nx, cy - ny],
    ],
    c,
  );
}

/** Roseta (echevéria) vista um pouco de cima: anel de pétalas de pontas rosadas e o miolo claro. */
function rosette(p: Sprite, cx: number, cy: number, r: number): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    petal(p, cx, cy, a, r, r * 0.42, Math.sin(a) > 0.2 ? ECHE.dark : ECHE.base);
    p.px(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75, ECHE.tip);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.7;
    petal(p, cx, cy, a, r * 0.62, r * 0.32, Math.cos(a) + Math.sin(a) < 0 ? ECHE.hi : ECHE.light);
  }
  p.rect(cx - 1, cy - 1, 2, 2, ECHE.base);
  p.px(cx - 1, cy - 1, ECHE.hi);
}

const succulentBowl: SpritePainter = (s, info) => {
  const m = matOf(info, '#e8e3d9');
  s.piece((p) => {
    // jade ao fundo: galhinhos com folhas gordinhas
    p.line(22, 19, 21, 10, '#6b4a30');
    p.line(22, 15, 26, 11, '#6b4a30');
    for (const [x, y] of [
      [18, 7],
      [22, 6],
      [24, 9],
      [19, 11],
      [26, 13],
    ]) {
      p.ellipse(x, y, 4, 3, JADE.base);
      p.px(x + 1, y, JADE.hi);
      p.px(x + 3, y + 2, JADE.dark);
    }
  });
  s.piece((p) => rosette(p, 10, 15, 5.5));
  s.piece((p) => rosette(p, 20, 16, 4.5));
  s.piece((p) => rosette(p, 14, 19, 3.6));
  s.piece((p) => {
    // vaso largo e baixo, de boca larga
    p.rrect(5, 20, 22, 10, m.base, 3);
    p.rect(6, 23, 1, 4, m.light);
    p.rect(24, 22, 2, 5, m.dark);
    p.rect(8, 29, 16, 1, m.dark);
    p.rect(5, 20, 22, 2, m.light);
    p.rect(6, 20, 20, 1, m.hi);
    p.rect(5, 22, 22, 1, m.dark);
  });
  s.piece((p) => {
    // colar-de-pérolas caindo pela borda
    for (let i = 0; i < 4; i++) p.px(6 - (i % 2), 22 + i * 2, JADE.light);
    for (let i = 0; i < 3; i++) p.px(26 + (i % 2), 23 + i * 2, JADE.light);
  });
};

// ---------- palmeira (areca) ----------

const PALM: Mat = { dark: '#2f5a26', base: '#4f8a3a', light: '#6fa94c', hi: '#9cca6c' };
const PALM_BACK: Mat = { dark: '#244a20', base: '#3a6c30', light: '#4f8a3a', hi: '#6fa94c' };

/** Apaga a margem de 1 px do sprite: o contorno precisa desse espaço. */
function keepMargin(p: Sprite): void {
  p.clear(0, 0, p.w, 1);
  p.clear(0, p.h - 1, p.w, 1);
  p.clear(0, 0, 1, p.h);
  p.clear(p.w - 1, 0, 1, p.h);
}

/**
 * Folha de palmeira (ou fronde de samambaia): a raque em curva (Bézier de `s` a `e`, puxada para
 * `c`) com folíolos de 1 px caindo dos dois lados, mais curtos perto da ponta. O vão entre um
 * folíolo e outro vira traço escuro com o contorno, o que dá o aspecto de pente.
 */
function frond(p: Sprite, sx: number, sy: number, cx: number, cy: number, ex: number, ey: number, maxL: number, g: Mat, from = 0.15): void {
  const at = (t: number): [number, number] => [(1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ey];
  const n = Math.ceil(Math.hypot(cx - sx, cy - sy) + Math.hypot(ex - cx, ey - cy));
  const spine: [number, number][] = [];
  for (let i = 0; i <= n * 2; i++) spine.push(at(i / (n * 2)));
  let k = 0;
  for (let i = 0; i < spine.length - 1; i += 3) {
    const t = i / (spine.length - 1);
    if (t < from) continue;
    const [x, y] = spine[i];
    const [x2, y2] = spine[i + 1];
    const tl = Math.hypot(x2 - x, y2 - y) || 1;
    const len = maxL * (1 - 0.6 * t);
    for (const side of [-1, 1]) {
      let dx = (-(y2 - y) / tl) * side * 0.75;
      let dy = ((x2 - x) / tl) * side * 0.75 + 0.75;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      p.line(x, y, x + dx * len, y + dy * len, (k + (side > 0 ? 1 : 0)) % 2 ? g.light : g.base);
    }
    k++;
  }
  for (let i = Math.round((spine.length - 1) * from * 0.5); i < spine.length - 1; i++) p.line(spine[i][0], spine[i][1], spine[i + 1][0], spine[i + 1][1], g.dark);
  p.px(ex, ey, g.hi);
  keepMargin(p);
}

const palm: SpritePainter = (s, info) => {
  const id = info.color?.id ?? 'basket';
  const m = matOf(info, '#b8925a');
  const { top } = info;
  const py = top + 14;
  // caules finos saindo do vaso (sem contorno)
  s.line(14, py + 1, 15, py - 11, '#4e4021');
  s.line(17, py + 1, 17, py - 10, '#5a4a26');
  s.line(16, py + 1, 16, py - 12, '#4e4021');
  // folhas em fonte: as de trás sobem, as da frente arqueiam e caem para os lados
  const y0 = py - 12;
  s.piece((p) => frond(p, 16, y0, 15, 14, 15, 2, 5, PALM_BACK));
  s.piece((p) => frond(p, 15, y0, 6, 8, 2, 19, 5, PALM_BACK));
  s.piece((p) => frond(p, 17, y0, 26, 8, 30, 19, 5, PALM_BACK));
  s.piece((p) => frond(p, 15, y0 + 1, 4, 20, 2, 37, 5, PALM));
  s.piece((p) => frond(p, 17, y0 + 1, 28, 20, 30, 37, 5, PALM));
  s.piece((p) => frond(p, 16, y0, 9, 14, 6, 29, 4.5, PALM));
  s.piece((p) => frond(p, 16, y0, 23, 14, 26, 29, 4.5, PALM));
  s.piece((p) => (id === 'basket' ? basket(p, 8, py, 16, 16, m) : pot(p, 8, py, 16, 16, m, 'round')));
};

// ---------- vaso alto com plumas (capim-dos-pampas) ----------

const PLUME = { dark: '#bda57a', base: '#d9c7a0', light: '#ebdec0', hi: '#f7f0de' };

/** Pluma: espiga fofa ao longo de uma reta, mais larga no meio. */
function plume(p: Sprite, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const hw = 2.2 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    for (let k = -Math.round(hw); k <= Math.round(hw); k++) {
      const v = noise(i, k + 5, seed);
      p.px(x + k, y, k === -Math.round(hw) || v > 0.8 ? PLUME.light : k === Math.round(hw) || v < 0.15 ? PLUME.dark : PLUME.base);
    }
  }
  p.px(x1, y1, PLUME.hi);
}

const tallVase: SpritePainter = (s, info) => {
  const m = matOf(info, '#e8e3d9');
  const { top } = info;
  const neck = top - 12;
  s.piece((p) => {
    // hastes
    p.line(15, neck + 1, 8, 9, '#a68d5e');
    p.line(16, neck + 1, 17, 6, '#a68d5e');
    p.line(17, neck + 1, 24, 10, '#a68d5e');
  });
  s.piece((p) => {
    plume(p, 9, 12, 5, 2, 1);
    plume(p, 24, 13, 27, 3, 2);
  });
  s.piece((p) => plume(p, 17, 9, 16, 1, 3));
  s.piece((p) => {
    // vaso: boca, pescoço, ombro largo e base mais estreita
    const bottom = top + 29;
    for (let y = neck; y <= bottom; y++) {
      const t = (y - neck) / (bottom - neck);
      let hw: number;
      if (y <= neck + 1) hw = 4;
      else if (t < 0.12) hw = 3;
      else if (t < 0.32) hw = 3 + ((t - 0.12) / 0.2) * 4.5;
      else if (t < 0.8) hw = 7.5;
      else hw = 7.5 - ((t - 0.8) / 0.2) * 2;
      const x0 = Math.round(16 - hw);
      const x1 = Math.round(15 + hw);
      p.rect(x0, y, x1 - x0 + 1, 1, m.base);
      p.px(x0 + 1, y, m.light);
      p.rect(x1 - 1, y, 2, 1, m.dark);
      if (y <= neck + 1) p.rect(x0, y, x1 - x0 + 1, 1, y === neck ? m.hi : m.light);
    }
    // frisos decorativos
    for (const y of [top + 4, top + 6]) {
      p.rect(9, y, 14, 1, mix(m.base, m.dark, 0.6));
    }
    p.rect(13, neck, 6, 1, SOIL.dark);
  });
};

// ---------- samambaia pendurada (parede) ----------

const FERN: Mat = { dark: '#2f6229', base: '#4f9442', light: '#6cb352', hi: '#9fd277' };
const FERN_BACK: Mat = { dark: '#244d22', base: '#3d7a36', light: '#4f9442', hi: '#6cb352' };

const hangingFern: SpritePainter = (s, info) => {
  const id = info.color?.id ?? 'macrame';
  const m = matOf(info, '#e6dcc6');
  const macrame = id === 'macrame';
  const rope = macrame ? m.dark : PAL.metalDark.light;
  const potMat = macrame ? ramp('#d9cdb3') : m;
  s.piece((p) => {
    // gancho na parede e as cordas (ou correntes) até o vaso
    p.rect(15, 10, 2, 2, PAL.metalDark.base);
    p.line(15, 12, 11, 16, rope);
    p.line(16, 12, 20, 16, rope);
  });
  // frondes de trás (mais escuras): para os lados e por baixo do vaso
  s.piece((p) => {
    frond(p, 13, 17, 8, 9, 3, 15, 3, FERN_BACK, 0.05);
    frond(p, 18, 17, 24, 9, 29, 15, 3, FERN_BACK, 0.05);
  });
  s.piece((p) => {
    frond(p, 12, 18, 4, 17, 2, 28, 3, FERN_BACK, 0.05);
    frond(p, 19, 18, 27, 17, 29, 28, 3, FERN_BACK, 0.05);
  });
  s.piece((p) => {
    frond(p, 14, 21, 13, 25, 12, 30, 2.5, FERN_BACK, 0.05);
    frond(p, 17, 21, 19, 25, 20, 30, 2.5, FERN_BACK, 0.05);
  });
  s.piece((p) => {
    // vaso redondo pendurado
    p.rrect(10, 16, 12, 7, potMat.base, 3);
    p.rect(10, 16, 12, 2, potMat.light);
    p.rect(11, 16, 10, 1, potMat.hi);
    p.rect(19, 18, 2, 3, potMat.dark);
    p.rect(13, 22, 6, 1, potMat.dark);
    if (macrame) {
      // nós do macramê por cima do vaso
      for (const x of [12, 16, 20]) p.rect(x - 1, 19, 2, 2, m.light);
      p.line(11, 21, 13, 22, m.dark);
      p.line(21, 21, 19, 22, m.dark);
    }
  });
  // frondes da frente: um tufo no alto e as que caem por cima da borda do vaso
  s.piece((p) => frond(p, 15, 16, 13, 12, 10, 11, 2, FERN, 0.05));
  s.piece((p) => frond(p, 16, 16, 18, 12, 21, 11, 2, FERN, 0.05));
  s.piece((p) => frond(p, 12, 16, 7, 13, 5, 24, 3.2, FERN, 0.05));
  s.piece((p) => frond(p, 19, 16, 25, 13, 27, 24, 3.2, FERN, 0.05));
  s.piece((p) => frond(p, 11, 18, 8, 22, 7, 30, 2.6, FERN, 0.05));
  s.piece((p) => frond(p, 20, 18, 23, 22, 24, 30, 2.6, FERN, 0.05));
};

// ---------- jardim vertical (parede) ----------

const LEAVES = ['#2f6b3a', '#3e8247', '#4f9a55', '#6fb56f', '#5a8f3c', '#7ab34e'];

const wallGarden: SpritePainter = (s, info) => {
  const m = matOf(info, '#8f6340');
  const { w } = info;
  s.piece((p) => {
    // moldura e fundo de musgo
    p.rect(2, 11, w - 4, 19, m.base);
    p.rect(2, 11, w - 4, 1, m.hi);
    p.rect(2, 29, w - 4, 1, m.dark);
    p.rect(w - 3, 12, 1, 17, m.dark);
    p.rect(4, 13, w - 8, 15, '#24381f');
    // folhagem densa: folhinhas de 3×2 em seis verdes, com luz no alto
    for (let y = 13; y < 28; y += 2) {
      for (let x = 4 + ((y / 2) % 2) * 2; x < w - 5; x += 3) {
        const n = noise(x, y, 33);
        const c = LEAVES[Math.floor(n * LEAVES.length)];
        p.rect(x, y, 3, 2, c);
        p.px(x, y, mix(c, '#ffffff', 0.25));
        if (n > 0.55) p.px(x + 2, y + 1, mix(c, '#000000', 0.25));
      }
    }
    // florzinhas
    for (let i = 0; i < Math.round(w / 12); i++) {
      const fx = 6 + Math.floor(noise(i, 1, 34) * (w - 13));
      const fy = 14 + Math.floor(noise(i, 2, 35) * 12);
      p.px(fx, fy, i % 2 ? '#f4f1ea' : '#e88aa8');
    }
  });
  s.piece((p) => {
    // folhas pendendo por cima da borda de baixo
    for (let x = 6; x < w - 6; x += 5) {
      const h = 2 + Math.floor(noise(x, 3, 36) * 3);
      const c = LEAVES[Math.floor(noise(x, 4, 37) * 4) + 1];
      p.rect(x, 27, 2, h, c);
      p.px(x, 27, mix(c, '#ffffff', 0.25));
    }
  });
};

// ---------- planta de folhagem (redesenho de `plant`) ----------

const BUSH_BACK: Mat = { dark: '#244f2c', base: '#2f6638', light: '#3c7c44', hi: '#55945a' };
const BUSH: Mat = { dark: '#2f6b3a', base: '#3e8247', light: '#529b55', hi: '#7cbb72' };

/** Copa de folhinhas: elipse sombreada com "escamas" de folha (luz em cima, sombra embaixo). */
function leafCluster(p: Sprite, cx: number, cy: number, rx: number, ry: number, g: Mat, seed: number): void {
  shadedBlob(p, cx, cy, rx, ry, g, -0.6, 0.6);
  for (let y = Math.floor(cy - ry) + 1; y < cy + ry - 1; y += 3) {
    for (let x = Math.floor(cx - rx) + 1 + (Math.floor(y / 3) % 2) * 2; x < cx + rx - 1; x += 4) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 0.75) continue;
      const lit = dx + dy < 0;
      p.rect(x, y, 2, 1, lit ? g.hi : g.light);
      p.px(x + 2, y + 1, g.dark);
      if (noise(x, y, seed) > 0.6) p.px(x + 1, y + 1, g.dark);
    }
  }
}

const plant: SpritePainter = (s, info) => {
  const m = matOf(info, PAL.terracotta.base);
  const { top } = info;
  const py = top + 14;
  // tronquinho com dois galhos (sem contorno)
  s.rect(15, py - 12, 2, 13, '#4e3422');
  s.line(15, py - 8, 11, py - 13, '#4e3422');
  s.line(17, py - 9, 21, py - 14, '#4e3422');
  s.piece((p) => leafCluster(p, 16, 11, 8.5, 7.5, BUSH_BACK, 1));
  s.piece((p) => {
    leafCluster(p, 8.5, 19, 6.5, 6, BUSH_BACK, 2);
    leafCluster(p, 23.5, 18, 6.5, 6, BUSH_BACK, 3);
  });
  s.piece((p) => leafCluster(p, 16, 21, 7, 6.5, BUSH, 4));
  s.piece((p) => {
    leafCluster(p, 9, 29, 6.5, 5.5, BUSH, 5);
    leafCluster(p, 23, 28, 6.5, 5.5, BUSH, 6);
  });
  s.piece((p) => pot(p, 8, py, 16, 16, m, 'taper'));
};

// ---------- vaso pequeno (redesenho de `plant_small`): jiboia com ramas caindo ----------

const POTHOS: Mat = { dark: '#2f6b3a', base: '#47904a', light: '#64ad5c', hi: '#c7d36a' };

/** Folhinha em coração de jiboia, com a mancha amarela. */
function heartLeaf(p: Sprite, x: number, y: number, flip: boolean): void {
  p.rect(x, y, 4, 3, POTHOS.base);
  p.px(x + (flip ? 3 : 0), y + 3, POTHOS.base);
  p.px(x + (flip ? 2 : 1), y + 3, POTHOS.dark);
  p.px(x + 1, y, POTHOS.light);
  p.px(x + 2, y + 1, POTHOS.hi);
  p.px(x + (flip ? 0 : 3), y + 2, POTHOS.dark);
}

const plantSmall: SpritePainter = (s, info) => {
  const m = matOf(info, PAL.terracotta.base);
  s.piece((p) => {
    for (const [x, y, f] of [
      [10, 4, false],
      [17, 3, true],
      [13, 1, false],
    ] as const)
      heartLeaf(p, x, y, f);
  });
  s.piece((p) => {
    for (const [x, y, f] of [
      [7, 8, false],
      [20, 7, true],
      [12, 6, true],
      [16, 7, false],
    ] as const)
      heartLeaf(p, x, y, f);
    // ramas caindo pela frente do vaso
    p.line(9, 12, 7, 19, POTHOS.dark);
    heartLeaf(p, 5, 16, false);
    p.line(22, 12, 24, 17, POTHOS.dark);
    heartLeaf(p, 22, 15, true);
  });
  s.piece((p) => pot(p, 9, 11, 14, 9, m, 'taper'));
};

export const PLANTS: Record<string, SpritePainter> = {
  plant,
  plant_small: plantSmall,
  monstera,
  snake_plant: snakePlant,
  cactus,
  succulent_bowl: succulentBowl,
  palm,
  tall_vase: tallVase,
  hanging_fern: hangingFern,
  wall_garden: wallGarden,
};
