// SPDX-License-Identifier: AGPL-3.0-only
// Primitivas de pixel art do visual v2 (traço de 1 px, sem anti-aliasing).
//
// Um `Sprite` é um buffer RGBA puro (não depende de canvas): cada primitiva grava
// pixels inteiros, então elipses e polígonos saem nítidos (o `arc`/`fill` do canvas 2D
// suavizaria as bordas). Só `toCanvas`/`drawTo` tocam em canvas, pela fábrica injetável
// de `canvas.ts`, e por isso o mesmo código roda no navegador e em Node.
//
// Convenções:
// - coordenadas em pixels de arte, inteiras (valores quebrados são arredondados);
// - cor é hex `#rgb`, `#rrggbb` ou `#rrggbbaa`; `null`/`'transparent'` apaga o pixel;
// - as primitivas SUBSTITUEM o pixel (sem mistura); `paste` é quem compõe com alfa;
// - nada de `Math.random`: use `noise(x, y, seed)`.
import { makeCanvas } from './canvas';

export type Color = string;
export type MaybeColor = Color | null;
export type RGBA = readonly [number, number, number, number];

/** Cor do contorno estilo Stardew e quanto dela entra na mistura com a cor vizinha. */
export const OUTLINE: Color = '#1d1519';
export const OUTLINE_MIX = 0.78;

const TRANSPARENT: RGBA = [0, 0, 0, 0];
const parsed = new Map<string, RGBA>();

/** Converte a cor em [r, g, b, a] (0–255). Aceita `#rgb`, `#rrggbb`, `#rrggbbaa`, `transparent` e `null`. */
export function rgba(c: MaybeColor): RGBA {
  if (c === null || c === 'transparent') return TRANSPARENT;
  const hit = parsed.get(c);
  if (hit) return hit;
  let s = c.startsWith('#') ? c.slice(1) : c;
  if (s.length === 3 || s.length === 4) s = [...s].map((ch) => ch + ch).join('');
  const n = parseInt(s.slice(0, 6), 16);
  if ((s.length !== 6 && s.length !== 8) || Number.isNaN(n)) throw new Error(`cor inválida: ${c}`);
  const out: RGBA = [(n >> 16) & 255, (n >> 8) & 255, n & 255, s.length === 8 ? parseInt(s.slice(6, 8), 16) : 255];
  parsed.set(c, out);
  return out;
}

const h2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

/** Monta a cor hex a partir dos canais (alfa só aparece quando < 255). */
export function hex(r: number, g: number, b: number, a = 255): Color {
  return `#${h2(r)}${h2(g)}${h2(b)}${a >= 255 ? '' : h2(a)}`;
}

/** Mistura linear: `t = 0` devolve `a`, `t = 1` devolve `b`. */
export function mix(a: Color, b: Color, t: number): Color {
  const p = rgba(a);
  const q = rgba(b);
  const k = Math.max(0, Math.min(1, t));
  return hex(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k, p[3] + (q[3] - p[3]) * k);
}

/** Clareia (`amt > 0`, em direção ao branco) ou escurece (`amt < 0`, em direção ao preto). `amt` em −1..1. */
export function shade(c: Color, amt: number): Color {
  const [r, g, b, a] = rgba(c);
  const f = amt >= 0 ? (v: number) => v + (255 - v) * amt : (v: number) => v * (1 + amt);
  return hex(f(r), f(g), f(b), a);
}

/** Ruído determinístico 0..1 por coordenada inteira (mesma entrada, mesmo valor). */
export function noise(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}

export interface OutlineOptions {
  /** Cor do contorno (padrão `OUTLINE`). */
  color?: Color;
  /** Quanto da cor do contorno entra na mistura com o pixel vizinho (padrão 0.78). */
  amount?: number;
}

type Ctx2D = CanvasRenderingContext2D;

export class Sprite {
  readonly w: number;
  readonly h: number;
  /** RGBA, 4 bytes por pixel, linha a linha. */
  readonly data: Uint8ClampedArray;
  private canvas: HTMLCanvasElement | null = null;

  constructor(w: number, h: number) {
    this.w = Math.max(1, Math.round(w));
    this.h = Math.max(1, Math.round(h));
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }

  private set(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
    this.canvas = null;
  }

  private span(x0: number, x1: number, y: number, c: RGBA): void {
    for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.set(x, y, c);
  }

  /** Alfa (0–255) do pixel; 0 fora do sprite. */
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  /** Cor do pixel, ou `null` se transparente ou fora do sprite. */
  get(x: number, y: number): MaybeColor {
    if (this.alpha(x, y) === 0) return null;
    const i = (y * this.w + x) * 4;
    return hex(this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]);
  }

  /** Um pixel. */
  px(x: number, y: number, c: MaybeColor): this {
    this.set(Math.round(x), Math.round(y), rgba(c));
    return this;
  }

  /** Retângulo cheio. */
  rect(x: number, y: number, w: number, h: number, c: MaybeColor): this {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = x0 + Math.round(w) - 1;
    const col = rgba(c);
    for (let yy = y0; yy < y0 + Math.round(h); yy++) this.span(x0, x1, yy, col);
    return this;
  }

  /** Retângulo com cantos em degrau: `r` linhas em cada canto, cada uma 1 px mais recuada. */
  rrect(x: number, y: number, w: number, h: number, c: MaybeColor, r = 1): this {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const ww = Math.round(w);
    const hh = Math.round(h);
    if (ww <= 0 || hh <= 0) return this;
    const rr = Math.max(0, Math.min(Math.round(r), Math.floor((ww - 1) / 2), Math.floor((hh - 1) / 2)));
    const col = rgba(c);
    for (let i = 0; i < hh; i++) {
      const fromEdge = Math.min(i, hh - 1 - i);
      const inset = fromEdge < rr ? rr - fromEdge : 0;
      this.span(x0 + inset, x0 + ww - 1 - inset, y0 + i, col);
    }
    return this;
  }

  /** Elipse cheia inscrita na caixa (x, y, w, h), sem anti-aliasing (teste no centro do pixel). */
  ellipse(x: number, y: number, w: number, h: number, c: MaybeColor): this {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const ww = Math.round(w);
    const hh = Math.round(h);
    if (ww <= 0 || hh <= 0) return this;
    const col = rgba(c);
    const rx = ww / 2;
    const ry = hh / 2;
    for (let j = 0; j < hh; j++) {
      const dy = (j + 0.5 - ry) / ry;
      for (let i = 0; i < ww; i++) {
        const dx = (i + 0.5 - rx) / rx;
        if (dx * dx + dy * dy <= 1) this.set(x0 + i, y0 + j, col);
      }
    }
    return this;
  }

  /** Linha de 1 px (Bresenham), incluindo as duas pontas. */
  line(x0: number, y0: number, x1: number, y1: number, c: MaybeColor): this {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    const col = rgba(c);
    let err = dx + dy;
    for (;;) {
      this.set(x, y, col);
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return this;
  }

  /**
   * Polígono cheio, sem anti-aliasing. Os vértices são pixels (inclusive): o miolo é
   * preenchido por varredura e as arestas são traçadas com `line`.
   */
  poly(points: readonly (readonly [number, number])[], c: MaybeColor): this {
    const pts = points.map(([px, py]) => [Math.round(px), Math.round(py)] as const);
    if (pts.length === 0) return this;
    const col = rgba(c);
    const minY = Math.max(0, Math.min(...pts.map((p) => p[1])));
    const maxY = Math.min(this.h - 1, Math.max(...pts.map((p) => p[1])));
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if (ay === by) continue;
        if (y >= Math.min(ay, by) && y < Math.max(ay, by)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) this.span(Math.round(xs[i]), Math.round(xs[i + 1]), y, col);
    }
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      this.line(ax, ay, bx, by, c);
    }
    return this;
  }

  /** Apaga tudo ou só um retângulo. */
  clear(x = 0, y = 0, w = this.w, h = this.h): this {
    return this.rect(x, y, w, h, null);
  }

  /** Cola outro sprite por cima, compondo com alfa (pixels transparentes da origem não apagam). */
  paste(src: Sprite, x = 0, y = 0): this {
    const ox = Math.round(x);
    const oy = Math.round(y);
    for (let sy = 0; sy < src.h; sy++) {
      const dy = oy + sy;
      if (dy < 0 || dy >= this.h) continue;
      for (let sx = 0; sx < src.w; sx++) {
        const dx = ox + sx;
        if (dx < 0 || dx >= this.w) continue;
        const si = (sy * src.w + sx) * 4;
        const sa = src.data[si + 3];
        if (sa === 0) continue;
        const di = (dy * this.w + dx) * 4;
        const da = this.data[di + 3];
        if (sa === 255 || da === 0) {
          this.data[di] = src.data[si];
          this.data[di + 1] = src.data[si + 1];
          this.data[di + 2] = src.data[si + 2];
          this.data[di + 3] = sa;
          continue;
        }
        const a = sa / 255;
        const b = (da / 255) * (1 - a);
        const o = a + b;
        this.data[di] = Math.round((src.data[si] * a + this.data[di] * b) / o);
        this.data[di + 1] = Math.round((src.data[si + 1] * a + this.data[di + 1] * b) / o);
        this.data[di + 2] = Math.round((src.data[si + 2] * a + this.data[di + 2] * b) / o);
        this.data[di + 3] = Math.round(o * 255);
      }
    }
    this.canvas = null;
    return this;
  }

  /**
   * Contorno automático estilo Stardew: cada pixel transparente encostado (4 vizinhos) num pixel
   * opaco recebe a cor desse vizinho misturada ~78% com `#1d1519`. Deixe 1 px de margem livre em
   * volta do desenho: o contorno não sai do sprite.
   */
  outline(opts: OutlineOptions = {}): this {
    const color = opts.color ?? OUTLINE;
    const amount = opts.amount ?? OUTLINE_MIX;
    const src = this.data.slice();
    const cache = new Map<number, RGBA>();
    const near = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src[(y * this.w + x) * 4 + 3] > 0) continue;
        for (const [dx, dy] of near) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const ni = (ny * this.w + nx) * 4;
          if (src[ni + 3] === 0) continue;
          const key = (src[ni] << 16) | (src[ni + 1] << 8) | src[ni + 2];
          let col = cache.get(key);
          if (!col) {
            col = rgba(mix(hex(src[ni], src[ni + 1], src[ni + 2]), color, amount));
            cache.set(key, col);
          }
          this.set(x, y, col);
          break;
        }
      }
    }
    return this;
  }

  /**
   * Desenha uma peça numa camada do mesmo tamanho, contorna a peça e cola por cima. É assim que
   * peças sobrepostas ganham contorno separado (o monitor em cima da mesa, o encosto na frente do assento).
   */
  piece(draw: (layer: Sprite) => void, opts?: OutlineOptions): this {
    const layer = new Sprite(this.w, this.h);
    draw(layer);
    layer.outline(opts);
    return this.paste(layer);
  }

  /** Cópia espelhada na horizontal. */
  flipX(): Sprite {
    const out = new Sprite(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const si = (y * this.w + x) * 4;
        const di = (y * this.w + (this.w - 1 - x)) * 4;
        out.data[di] = this.data[si];
        out.data[di + 1] = this.data[si + 1];
        out.data[di + 2] = this.data[si + 2];
        out.data[di + 3] = this.data[si + 3];
      }
    }
    return out;
  }

  clone(): Sprite {
    const out = new Sprite(this.w, this.h);
    out.data.set(this.data);
    return out;
  }

  /** Canvas com os pixels do sprite (criado pela fábrica de `canvas.ts`; fica em cache até o sprite mudar). */
  toCanvas(): HTMLCanvasElement {
    if (this.canvas) return this.canvas;
    const c = makeCanvas(this.w, this.h);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    this.canvas = c;
    return c;
  }

  /** Desenha o sprite num contexto 2D respeitando a transparência. */
  drawTo(ctx: Ctx2D, x = 0, y = 0): void {
    ctx.drawImage(this.toCanvas(), Math.round(x), Math.round(y));
  }

  /** Lê os pixels de um canvas (útil para testes e para contornar arte antiga). */
  static fromCanvas(c: HTMLCanvasElement): Sprite {
    const out = new Sprite(c.width, c.height);
    out.data.set(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
    return out;
  }
}

/** Atalho: cria o sprite, desenha e devolve. */
export function sprite(w: number, h: number, draw?: (s: Sprite) => void): Sprite {
  const s = new Sprite(w, h);
  draw?.(s);
  return s;
}
