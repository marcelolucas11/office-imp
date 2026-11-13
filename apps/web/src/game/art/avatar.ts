// SPDX-License-Identifier: AGPL-3.0-only
import { AVATAR_OPTIONS, DIRS, type AvatarConfig, type Dir } from '@office-imp/shared';
import { makeCanvas, r, shade, type Ctx } from './tiles';

export const AV_W = 32;
export const AV_H = 48;
export const AV_FRAMES = 3;

function drawFrame(ctx: Ctx, ox: number, oy: number, cfg: AvatarConfig, dir: Dir, frame: number) {
  const skin = AVATAR_OPTIONS.skin[cfg.skin] ?? AVATAR_OPTIONS.skin[0];
  const hair = AVATAR_OPTIONS.hairColor[cfg.hairColor] ?? AVATAR_OPTIONS.hairColor[0];
  const shirt = AVATAR_OPTIONS.shirt[cfg.shirt] ?? AVATAR_OPTIONS.shirt[0];
  const pants = AVATAR_OPTIONS.pants[cfg.pants] ?? AVATAR_OPTIONS.pants[0];
  const p = (x: number, y: number, w: number, h: number, c: string) => r(ctx, ox + x, oy + y, w, h, c);
  const side = dir === 'left' || dir === 'right';
  const bob = frame === 0 ? 0 : -1;

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(ox + 8, oy + 43, 16, 4);
  ctx.fillRect(ox + 10, oy + 42, 12, 6);

  // pernas
  const lA = frame === 1 ? -2 : 0;
  const lB = frame === 2 ? -2 : 0;
  if (side) {
    const f = dir === 'left' ? -1 : 1;
    p(13 + (frame === 1 ? -2 * f : 0), 34, 5, 9 + lA, pants);
    p(14 + (frame === 2 ? 2 * f : 0), 34, 5, 9 + lB, shade(pants, -0.08));
    p(13 + (frame === 1 ? -2 * f : 0) + (f < 0 ? -1 : 0), 43 + lA, 6, 2, '#111318');
    p(14 + (frame === 2 ? 2 * f : 0) + (f < 0 ? -1 : 0), 43 + lB, 6, 2, '#111318');
  } else {
    p(10, 34, 5, 9 + lA, pants);
    p(17, 34, 5, 9 + lB, pants);
    p(10, 43 + lA, 5, 2, '#111318');
    p(17, 43 + lB, 5, 2, '#111318');
  }

  // tronco e braços
  const by = 21 + bob;
  if (side) {
    p(11, by, 10, 14, shirt);
    const swing = frame === 1 ? 2 : frame === 2 ? -2 : 0;
    p(14 + swing * (dir === 'left' ? -1 : 1), by + 2, 4, 9, shade(shirt, -0.12));
    p(14 + swing * (dir === 'left' ? -1 : 1), by + 11, 4, 2, skin);
  } else {
    p(9, by, 14, 14, shirt);
    p(6, by + 1, 3, 10 + (frame === 1 ? 1 : 0), shade(shirt, -0.12));
    p(23, by + 1, 3, 10 + (frame === 2 ? 1 : 0), shade(shirt, -0.12));
    p(6, by + 11 + (frame === 1 ? 1 : 0), 3, 2, skin);
    p(23, by + 11 + (frame === 2 ? 1 : 0), 3, 2, skin);
    if (dir === 'down') {
      p(14, by, 4, 2, shade(shirt, -0.15));
      if (cfg.accessory === 4) {
        p(15, by + 1, 2, 8, '#b91c1c');
        p(14, by + 8, 4, 2, '#b91c1c');
      }
    }
  }

  // cabeça
  const hy = 7 + bob;
  p(9, hy, 14, 14, skin);
  p(9, hy + 13, 14, 1, shade(skin, -0.12));
  if (dir === 'down') {
    p(12, hy + 7, 2, 2, '#1f2937');
    p(18, hy + 7, 2, 2, '#1f2937');
    p(14, hy + 11, 4, 1, shade(skin, -0.25));
  } else if (dir === 'left') {
    p(11, hy + 7, 2, 2, '#1f2937');
  } else if (dir === 'right') {
    p(19, hy + 7, 2, 2, '#1f2937');
  }

  // cabelo
  const style = cfg.hair;
  if (style > 0) {
    const hd = shade(hair, -0.1);
    if (dir === 'up') {
      p(8, hy - 2, 16, style === 3 ? 20 : style === 2 ? 15 : 12, hair);
      if (style === 5) p(14, hy + 9, 4, 10, hd);
    } else {
      p(8, hy - 2, 16, 5, hair);
      if (style === 4) p(10, hy - 5, 12, 4, hair);
      const sideLen = style === 1 ? 4 : style === 2 ? 9 : style === 3 ? 17 : style === 4 ? 4 : 6;
      if (dir === 'down') {
        p(8, hy + 3, 2, sideLen, hair);
        p(22, hy + 3, 2, sideLen, hair);
        p(10, hy + 3, 3, 1, hd);
        p(19, hy + 3, 3, 1, hd);
      } else if (dir === 'left') {
        p(15, hy + 3, 9, Math.min(sideLen + 3, 18), hair);
        if (style === 5) p(23, hy + 6, 4, 9, hd);
      } else {
        p(8, hy + 3, 9, Math.min(sideLen + 3, 18), hair);
        if (style === 5) p(5, hy + 6, 4, 9, hd);
      }
    }
  }

  // acessórios
  if (cfg.accessory === 1 && dir !== 'up') {
    if (dir === 'down') {
      p(10, hy + 6, 5, 4, '#111318');
      p(17, hy + 6, 5, 4, '#111318');
      p(15, hy + 7, 2, 1, '#111318');
      p(11, hy + 7, 3, 2, '#93c5fd');
      p(18, hy + 7, 3, 2, '#93c5fd');
    } else {
      const x = dir === 'left' ? 9 : 18;
      p(x, hy + 6, 5, 4, '#111318');
      p(x + 1, hy + 7, 3, 2, '#93c5fd');
    }
  } else if (cfg.accessory === 2) {
    p(8, hy - 3, 16, 5, '#d7b870');
    if (dir === 'down') p(9, hy + 2, 14, 2, '#b0914b');
    else if (dir === 'left') p(4, hy + 1, 8, 2, '#b0914b');
    else if (dir === 'right') p(20, hy + 1, 8, 2, '#b0914b');
  } else if (cfg.accessory === 3) {
    p(8, hy - 3, 16, 2, '#111318');
    if (dir !== 'right') p(6, hy + 4, 3, 7, '#111318');
    if (dir !== 'left') p(23, hy + 4, 3, 7, '#111318');
  }
}

const cache = new Map<string, HTMLCanvasElement>();

export function avatarKey(cfg: AvatarConfig): string {
  return `av:${cfg.skin}.${cfg.hair}.${cfg.hairColor}.${cfg.shirt}.${cfg.pants}.${cfg.accessory}`;
}

/** Folha de sprites: 4 direções (linhas, na ordem de DIRS) × 3 quadros. */
export function avatarSheet(cfg: AvatarConfig): HTMLCanvasElement {
  const key = avatarKey(cfg);
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(AV_W * AV_FRAMES, AV_H * DIRS.length);
  const ctx = c.getContext('2d')!;
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < AV_FRAMES; f++) drawFrame(ctx, f * AV_W, row * AV_H, cfg, dir, f);
  });
  cache.set(key, c);
  return c;
}

/** Retrato (de frente, parado) para listas e menus. */
const portraitCache = new Map<string, string>();

/** Retrato do avatar em data URL. Em cache: é chamado em toda renderização dos painéis. */
export function avatarPortrait(cfg: AvatarConfig, scale = 2): string {
  const key = `${avatarKey(cfg)}@${scale}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const url = drawPortrait(cfg, scale);
  if (portraitCache.size > 400) portraitCache.clear();
  portraitCache.set(key, url);
  return url;
}

function drawPortrait(cfg: AvatarConfig, scale: number): string {
  const sheet = avatarSheet(cfg);
  const c = makeCanvas(AV_W * scale, AV_H * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, 0, 0, AV_W, AV_H, 0, 0, AV_W * scale, AV_H * scale);
  return c.toDataURL();
}
