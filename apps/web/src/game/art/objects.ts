import { OBJECT_DEFS, objSize, type Dir, type MapObject } from '@office-imp/shared';
import { T, makeCanvas, noise, r, shade, type Ctx } from './tiles';

const WOOD = '#9c6b43';
const GOLD = '#d7b870';

type Painter = (ctx: Ctx, w: number, h: number, top: number, o: MapObject) => void;

function legs(ctx: Ctx, x: number, y: number, w: number, c: string) {
  r(ctx, x + 2, y, 3, 4, c);
  r(ctx, x + w - 5, y, 3, 4, c);
}

function sofaLike(ctx: Ctx, w: number, top: number, dir: Dir | undefined) {
  const base = '#3f4350';
  const cushion = '#565b6b';
  const y = top;
  r(ctx, 1, y + 4, w - 2, 26, shade(base, -0.08));
  r(ctx, 1, y + 4, w - 2, 24, base);
  if (dir === 'up') {
    r(ctx, 1, y + 20, w - 2, 9, shade(base, -0.12)); // encosto embaixo (de costas para a câmera)
    r(ctx, 5, y + 7, w - 10, 12, cushion);
  } else {
    r(ctx, 1, y + 3, w - 2, 9, shade(base, 0.06));
    r(ctx, 5, y + 13, w - 10, 13, cushion);
  }
  r(ctx, 1, y + 6, 4, 22, shade(base, -0.05));
  r(ctx, w - 5, y + 6, 4, 22, shade(base, -0.05));
  for (let x = 5 + 26; x < w - 8; x += 27) r(ctx, x, y + (dir === 'up' ? 7 : 13), 1, 12, shade(cushion, -0.12));
  r(ctx, 5, y + (dir === 'up' ? 7 : 13), w - 10, 1, GOLD);
}

const painters: Record<string, Painter> = {
  desk(ctx, w, _h, top) {
    const y = top;
    // tampo
    r(ctx, 0, y + 4, w, 20, WOOD);
    r(ctx, 0, y + 4, w, 2, shade(WOOD, 0.12));
    r(ctx, 0, y + 24, w, 5, shade(WOOD, -0.18));
    r(ctx, 2, y + 29, 4, 3, shade(WOOD, -0.3));
    r(ctx, w - 6, y + 29, 4, 3, shade(WOOD, -0.3));
    // monitor (sobe para o tile de cima)
    r(ctx, 13, y - 2, 6, 8, '#111318');
    r(ctx, 9, y + 5, 14, 2, '#111318');
    r(ctx, 2, y - 20, 28, 19, '#111318');
    r(ctx, 4, y - 18, 24, 15, '#1e293b');
    r(ctx, 6, y - 16, 12, 2, '#60a5fa');
    r(ctx, 6, y - 12, 18, 1, '#94a3b8');
    r(ctx, 6, y - 9, 14, 1, '#94a3b8');
    r(ctx, 6, y - 6, 9, 1, GOLD);
    // teclado, mouse e caneca
    r(ctx, 5, y + 10, 20, 6, '#d1d5db');
    r(ctx, 6, y + 11, 18, 1, '#9ca3af');
    r(ctx, 6, y + 13, 18, 1, '#9ca3af');
    r(ctx, 28, y + 11, 4, 5, '#e5e7eb');
    r(ctx, 40, y + 8, 14, 10, '#f3f4f6');
    r(ctx, 42, y + 10, 10, 1, '#9ca3af');
    r(ctx, 42, y + 13, 7, 1, '#9ca3af');
    r(ctx, 56, y + 9, 5, 6, '#111318');
    r(ctx, 57, y + 10, 3, 2, '#7c4a1e');
  },
  chair(ctx, _w, _h, top, o) {
    const c = '#2b2f3a';
    const seat = '#3b4252';
    const y = top;
    const dir = o.dir ?? 'up';
    r(ctx, 9, y + 9, 14, 14, seat);
    r(ctx, 9, y + 9, 14, 1, shade(seat, 0.12));
    if (dir === 'up') r(ctx, 8, y + 21, 16, 6, c);
    else if (dir === 'down') r(ctx, 8, y + 4, 16, 6, c);
    else if (dir === 'left') r(ctx, 21, y + 7, 5, 18, c);
    else r(ctx, 6, y + 7, 5, 18, c);
    r(ctx, 11, y + 26, 2, 3, '#111318');
    r(ctx, 19, y + 26, 2, 3, '#111318');
  },
  table(ctx, w, h, top) {
    const hh = h * T;
    const y = top;
    r(ctx, 2, y + 3, w - 4, hh - 8, WOOD);
    r(ctx, 2, y + 3, w - 4, 2, shade(WOOD, 0.14));
    r(ctx, 2, y + hh - 5, w - 4, 5, shade(WOOD, -0.2));
    for (let x = 8; x < w - 8; x += 13) r(ctx, x, y + 8 + Math.floor(noise(x, 3) * (hh - 22)), 6, 1, shade(WOOD, -0.07));
    r(ctx, 6, y + 5, w - 12, 1, shade(WOOD, 0.06));
    r(ctx, Math.floor(w / 2) - 10, y + Math.floor(hh / 2) - 7, 20, 3, '#e5e7eb');
    r(ctx, Math.floor(w / 2) - 10, y + Math.floor(hh / 2) - 4, 20, 1, '#9ca3af');
  },
  table_round(ctx, _w, _h, top) {
    const y = top;
    const rows = [10, 16, 20, 22, 24, 24, 26, 26, 26, 26, 26, 26, 24, 24, 22, 20, 16, 10];
    rows.forEach((len, i) => r(ctx, 16 - len / 2, y + 5 + i, len, 1, i > 13 ? shade(WOOD, -0.18) : WOOD));
    r(ctx, 9, y + 8, 10, 1, shade(WOOD, 0.14));
    r(ctx, 14, y + 12, 4, 4, '#f3f4f6');
    r(ctx, 13, y + 23, 6, 6, shade(WOOD, -0.3));
  },
  counter(ctx, w, h, top) {
    const hh = h * T;
    r(ctx, 0, top + 2, w, hh - 4, '#44403c');
    r(ctx, 0, top + 2, w, Math.max(10, hh - 14), '#d6d3d1');
    r(ctx, 0, top + 2, w, 2, '#f5f5f4');
    r(ctx, 0, top + hh - 4, w, 2, '#292524');
    for (let x = 6; x < w - 4; x += 16) r(ctx, x, top + hh - 10, 6, 1, GOLD);
  },
  sofa(ctx, w, _h, top, o) {
    sofaLike(ctx, w, top, o.dir);
  },
  armchair(ctx, w, _h, top, o) {
    sofaLike(ctx, w, top, o.dir === 'up' ? 'up' : 'down');
  },
  bookshelf(ctx, w, _h, top) {
    const y = top - T;
    r(ctx, 2, y + 4, w - 4, 58, '#4a2f20');
    const colors = ['#b91c1c', '#1d4ed8', GOLD, '#15803d', '#7c3aed', '#e5e7eb', '#ea580c'];
    for (let s = 0; s < 3; s++) {
      const sy = y + 8 + s * 18;
      r(ctx, 4, sy, w - 8, 14, '#2a1a12');
      let x = 5;
      let i = 0;
      while (x < w - 8) {
        const bw = 2 + Math.floor(noise(s, i, 4) * 3);
        const bh = 9 + Math.floor(noise(i, s, 6) * 5);
        r(ctx, x, sy + 14 - bh, bw, bh, colors[Math.floor(noise(s * 7, i * 3, 2) * colors.length)]);
        x += bw + 1;
        i++;
      }
    }
    r(ctx, 2, y + 4, w - 4, 2, '#6b4530');
  },
  cabinet(ctx, w, _h, top) {
    r(ctx, 3, top + 4, w - 6, 26, '#57534e');
    r(ctx, 3, top + 4, w - 6, 2, '#78716c');
    r(ctx, 5, top + 9, w - 10, 8, '#44403c');
    r(ctx, 5, top + 19, w - 10, 8, '#44403c');
    r(ctx, 14, top + 12, 4, 1, GOLD);
    r(ctx, 14, top + 22, 4, 1, GOLD);
  },
  coffee(ctx, w, _h, top) {
    r(ctx, 1, top + 6, w - 2, 24, '#44403c');
    r(ctx, 1, top + 6, w - 2, 3, '#d6d3d1');
    const y = top - 18;
    r(ctx, 7, y + 2, 18, 22, '#16181d');
    r(ctx, 9, y + 4, 14, 5, '#30343f');
    r(ctx, 20, y + 5, 2, 2, '#ef4444');
    r(ctx, 11, y + 12, 10, 9, '#0b0c0f');
    r(ctx, 13, y + 16, 6, 5, '#f5f5f4');
    r(ctx, 14, y + 17, 4, 1, '#7c4a1e');
  },
  cooler(ctx, _w, _h, top) {
    const y = top - 22;
    r(ctx, 10, y + 2, 12, 16, '#7dd3fc');
    r(ctx, 11, y + 3, 3, 12, '#bae6fd');
    r(ctx, 12, y, 8, 3, '#38bdf8');
    r(ctx, 8, y + 18, 16, 32, '#e5e7eb');
    r(ctx, 8, y + 18, 16, 2, '#f9fafb');
    r(ctx, 11, y + 24, 3, 3, '#3b82f6');
    r(ctx, 18, y + 24, 3, 3, '#ef4444');
    r(ctx, 8, y + 46, 16, 4, '#9ca3af');
  },
  fridge(ctx, _w, _h, top) {
    const y = top - 26;
    r(ctx, 4, y + 2, 24, 54, '#cbd5e1');
    r(ctx, 4, y + 2, 24, 2, '#f1f5f9');
    r(ctx, 4, y + 22, 24, 1, '#64748b');
    r(ctx, 23, y + 8, 2, 10, '#475569');
    r(ctx, 23, y + 27, 2, 14, '#475569');
    r(ctx, 4, y + 52, 24, 4, '#64748b');
  },
  plant(ctx, _w, _h, top) {
    const y = top - 20;
    const g = ['#166534', '#15803d', '#22c55e'];
    const blobs: [number, number, number, number, number][] = [
      [9, 6, 14, 12, 1],
      [4, 14, 10, 12, 0],
      [18, 12, 10, 14, 0],
      [11, 2, 9, 9, 2],
      [8, 20, 16, 10, 1],
    ];
    for (const [x, by, w, h, c] of blobs) r(ctx, x, y + by, w, h, g[c]);
    r(ctx, 13, y + 9, 3, 3, g[2]);
    r(ctx, 20, y + 17, 3, 3, g[2]);
    r(ctx, 7, y + 18, 2, 2, g[2]);
    r(ctx, 15, y + 28, 2, 8, '#365314');
    r(ctx, 9, y + 34, 14, 14, '#9a3412');
    r(ctx, 8, y + 34, 16, 3, '#c2410c');
    r(ctx, 11, y + 46, 10, 2, '#7c2d12');
  },
  plant_small(ctx, _w, _h, top) {
    const y = top;
    r(ctx, 12, y + 6, 8, 6, '#15803d');
    r(ctx, 10, y + 9, 5, 5, '#166534');
    r(ctx, 17, y + 8, 5, 6, '#22c55e');
    r(ctx, 12, y + 14, 8, 7, '#9a3412');
    r(ctx, 11, y + 14, 10, 2, '#c2410c');
  },
  lamp(ctx, _w, _h, top) {
    const y = top - 20;
    r(ctx, 8, y + 2, 16, 12, '#fde68a');
    r(ctx, 10, y, 12, 3, '#fcd34d');
    r(ctx, 15, y + 14, 2, 30, '#44403c');
    r(ctx, 10, y + 44, 12, 4, '#292524');
  },
  frame(ctx, _w, _h, top) {
    r(ctx, 9, top + 6, 14, 14, '#7c5a2e');
    r(ctx, 11, top + 8, 10, 10, '#bfdbfe');
    r(ctx, 11, top + 14, 10, 4, '#4ade80');
    r(ctx, 17, top + 9, 3, 3, '#fde047');
  },
  photo(ctx, _w, _h, top) {
    r(ctx, 10, top + 8, 12, 13, '#1f2937');
    r(ctx, 12, top + 10, 8, 9, '#fef3c7');
    r(ctx, 14, top + 11, 4, 4, '#e8b88f');
    r(ctx, 13, top + 15, 6, 4, '#2563eb');
  },
  trophy(ctx, _w, _h, top) {
    r(ctx, 11, top + 6, 10, 8, GOLD);
    r(ctx, 8, top + 7, 3, 4, shade(GOLD, -0.1));
    r(ctx, 21, top + 7, 3, 4, shade(GOLD, -0.1));
    r(ctx, 13, top + 14, 6, 2, shade(GOLD, -0.1));
    r(ctx, 15, top + 16, 2, 4, GOLD);
    r(ctx, 11, top + 20, 10, 3, '#292524');
    r(ctx, 13, top + 8, 2, 4, '#f5e6b8');
  },
  rug(ctx, w, h, top) {
    const hh = h * T;
    r(ctx, 3, top + 3, w - 6, hh - 6, '#22232b');
    r(ctx, 5, top + 5, w - 10, 1, GOLD);
    r(ctx, 5, top + hh - 6, w - 10, 1, GOLD);
    r(ctx, 5, top + 5, 1, hh - 10, GOLD);
    r(ctx, w - 6, top + 5, 1, hh - 10, GOLD);
    for (let x = 12; x < w - 12; x += 8) for (let y = 12; y < hh - 10; y += 8) r(ctx, x, top + y, 2, 2, '#34363f');
  },
  rug_logo(ctx, w, h, top) {
    painters.rug(ctx, w, h, top, {} as MapObject);
    // coroa dourada genérica no centro
    const cx = Math.floor(w / 2);
    const cy = top + Math.floor((h * T) / 2);
    r(ctx, cx - 16, cy + 4, 32, 6, GOLD);
    for (const dx of [-16, -8, 0, 8]) {
      r(ctx, cx + dx, cy - 4, 8, 8, GOLD);
      r(ctx, cx + dx + 2, cy - 8, 4, 4, GOLD);
    }
    r(ctx, cx - 2, cy - 12, 4, 4, '#f5e6b8');
    r(ctx, cx - 14, cy + 6, 28, 1, shade(GOLD, -0.2));
  },
  podium(ctx, _w, _h, top) {
    r(ctx, 9, top + 6, 14, 22, '#4a2f20');
    r(ctx, 7, top + 4, 18, 5, '#6b4530');
    r(ctx, 7, top + 4, 18, 1, GOLD);
    r(ctx, 14, top + 14, 4, 4, GOLD);
  },
  door(ctx, _w, _h, top) {
    r(ctx, 0, top, 3, T, '#5b3a29');
    r(ctx, T - 3, top, 3, T, '#5b3a29');
    r(ctx, 3, top, 4, T, '#8a5a3a');
    r(ctx, 3, top + 14, 3, 3, GOLD);
  },
  portal(ctx, _w, _h, top) {
    const rings = ['#0e7490', '#22d3ee', '#a5f3fc'];
    rings.forEach((c, i) => {
      const s = 26 - i * 8;
      r(ctx, 16 - s / 2, top + 16 - s / 4, s, s / 2, c);
    });
    r(ctx, 14, top + 14, 4, 4, '#ffffff');
  },
  whiteboard(ctx, w, _h, top) {
    const y = top - 24;
    r(ctx, 2, y + 2, w - 4, 38, '#9ca3af');
    r(ctx, 4, y + 4, w - 8, 34, '#f9fafb');
    r(ctx, 8, y + 9, 22, 2, '#2563eb');
    r(ctx, 8, y + 14, 30, 2, '#111827');
    r(ctx, 8, y + 19, 16, 2, '#111827');
    r(ctx, 36, y + 22, 18, 10, '#fecaca');
    r(ctx, 38, y + 24, 14, 1, '#dc2626');
    r(ctx, 10, y + 26, 8, 8, GOLD);
    r(ctx, 6, y + 40, w - 12, 3, '#6b7280');
    r(ctx, 8, y + 43, 3, 11, '#4b5563');
    r(ctx, w - 11, y + 43, 3, 11, '#4b5563');
  },
  tv(ctx, w, _h, top) {
    const y = top - 24;
    r(ctx, 2, y + 2, w - 4, 36, '#0b0c0f');
    r(ctx, 4, y + 4, w - 8, 32, '#1e293b');
    r(ctx, 4, y + 4, w - 8, 10, '#273449');
    // ícone de play
    for (let i = 0; i < 7; i++) r(ctx, w / 2 - 5 + i, y + 13 + i, 2, 14 - i * 2, '#f87171');
    r(ctx, w / 2 - 3, y + 38, 6, 8, '#111318');
    r(ctx, w / 2 - 12, y + 46, 24, 4, '#111318');
    r(ctx, 6, y + 46, w - 12, 8, '#3f3f46');
    r(ctx, 6, y + 46, w - 12, 1, '#52525b');
  },
  kiosk(ctx, _w, _h, top) {
    const y = top - 20;
    r(ctx, 5, y + 2, 22, 20, '#111318');
    r(ctx, 7, y + 4, 18, 16, '#0ea5e9');
    r(ctx, 12, y + 7, 8, 10, '#bae6fd');
    r(ctx, 15, y + 7, 2, 10, '#0369a1');
    r(ctx, 12, y + 11, 8, 2, '#0369a1');
    r(ctx, 13, y + 22, 6, 18, '#3f3f46');
    r(ctx, 8, y + 40, 16, 8, '#27272a');
  },
  arcade(ctx, _w, _h, top) {
    const y = top - 24;
    r(ctx, 5, y + 2, 22, 52, '#3b0764');
    r(ctx, 5, y + 2, 22, 6, '#facc15');
    r(ctx, 7, y + 10, 18, 14, '#0b0c0f');
    r(ctx, 9, y + 12, 5, 4, '#22c55e');
    r(ctx, 17, y + 17, 5, 4, '#ef4444');
    r(ctx, 5, y + 26, 22, 8, '#581c87');
    r(ctx, 10, y + 27, 2, 5, '#e5e7eb');
    r(ctx, 9, y + 26, 4, 2, '#ef4444');
    r(ctx, 18, y + 29, 3, 3, '#3b82f6');
    r(ctx, 22, y + 28, 3, 3, '#facc15');
    r(ctx, 5, y + 50, 22, 4, '#1e0535');
  },
  poster(ctx, _w, _h, top) {
    r(ctx, 6, top + 3, 20, 26, '#1f2937');
    r(ctx, 8, top + 5, 16, 22, '#fef3c7');
    r(ctx, 10, top + 7, 12, 8, '#f97316');
    r(ctx, 10, top + 17, 12, 2, '#374151');
    r(ctx, 10, top + 21, 8, 2, '#374151');
  },
  note(ctx, _w, _h, top) {
    r(ctx, 15, top + 16, 2, 12, '#57534e');
    r(ctx, 7, top + 4, 18, 14, '#fde68a');
    r(ctx, 7, top + 4, 18, 2, '#facc15');
    r(ctx, 10, top + 9, 12, 1, '#78716c');
    r(ctx, 10, top + 12, 9, 1, '#78716c');
    r(ctx, 10, top + 15, 11, 1, '#78716c');
  },
};

const cache = new Map<string, HTMLCanvasElement>();

export function objectKey(o: MapObject): string {
  const { w, h } = objSize(o);
  return `${o.type}:${w}x${h}:${o.dir ?? ''}`;
}

/** Sprite do objeto. A altura inclui a parte "alta" (tall) acima do footprint. */
export function objectSprite(o: MapObject): HTMLCanvasElement {
  const key = objectKey(o);
  const hit = cache.get(key);
  if (hit) return hit;
  const def = OBJECT_DEFS[o.type];
  const { w, h } = objSize(o);
  const tall = def?.tall ?? 0;
  const c = makeCanvas(w * T, (h + tall) * T);
  const ctx = c.getContext('2d')!;
  const paint = painters[o.type];
  if (paint) paint(ctx, w * T, h, tall * T, o);
  else r(ctx, 4, tall * T + 4, w * T - 8, h * T - 8, '#be185d');
  cache.set(key, c);
  return c;
}

export function objectTall(type: string): number {
  return OBJECT_DEFS[type]?.tall ?? 0;
}

/** Ícone 32×32 do objeto (paleta do Mapmaker e da Build Tool). */
export function objectIcon(type: string): string {
  const def = OBJECT_DEFS[type];
  const sprite = objectSprite({ id: 'icon', type, x: 0, y: 0 });
  const c = makeCanvas(40, 40);
  const ctx = c.getContext('2d')!;
  const scale = Math.min(40 / sprite.width, 40 / sprite.height, 1.25);
  const dw = sprite.width * scale;
  const dh = sprite.height * scale;
  ctx.drawImage(sprite, (40 - dw) / 2, (40 - dh) / 2, dw, dh);
  void def;
  return c.toDataURL();
}
