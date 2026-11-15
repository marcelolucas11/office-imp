// SPDX-License-Identifier: AGPL-3.0-only
// Avatar: 32×48 px, 4 direções × 3 quadros (parado e dois passos), sempre com o mesmo formato.
//
// O desenho de antes do visual v2 (camiseta, calça, sapato preto, os 6 cabelos e os acessórios
// 1 a 4) continua exatamente como era, com o `r` e o `shade` aditivo de `tiles.ts`: um avatar
// salvo sai pixel a pixel igual (teste com hash travado em `apps/web/test/objects.test.ts`).
// As opções novas são camadas a mais, que só desenham quando escolhidas, dentro da mesma
// silhueta e da mesma animação. Os desenhos de lado são escritos olhando para a esquerda
// (`s`) e espelhados para a direita, como os de antes.
import { ACC, AVATAR_OPTIONS, DIRS, avatarConfigKey, sanitizeAvatar, type AvatarConfig, type Dir } from '@office-imp/shared';
import { mix, rgba, shade as tint } from './prim';
import { makeCanvas, r, shade, type Ctx } from './tiles';

export const AV_W = 32;
export const AV_H = 48;
export const AV_FRAMES = 3;

type Rect = (x: number, y: number, w: number, h: number, c: string) => void;

const INK = '#111318';
const GOLD = '#d7b870';
const GOLD_DARK = '#b0914b';

/** Luminância aproximada (0 a 1) de uma cor hex. */
function lum(c: string): number {
  const [r, g, b] = rgba(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Duas cores quase iguais (um detalhe numa delas sumiria sobre a outra). */
function sameTone(a: string, b: string): boolean {
  const [ar, ag, ab] = rgba(a);
  const [br, bg, bb] = rgba(b);
  return Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb) < 90;
}

/** Tom de detalhe que se destaca de `c`: escurece cor clara e clareia cor escura. */
function detail(c: string, k: number): string {
  return tint(c, lum(c) > 0.42 ? -k : k);
}

/** Desenha um quadro do avatar em (ox, oy). `cfg` já normalizado por `sanitizeAvatar`. */
export function paintAvatarFrame(ctx: Ctx, ox: number, oy: number, cfg: AvatarConfig, dir: Dir, frame: number) {
  const skin = AVATAR_OPTIONS.skin[cfg.skin] ?? AVATAR_OPTIONS.skin[0];
  const hair = AVATAR_OPTIONS.hairColor[cfg.hairColor] ?? AVATAR_OPTIONS.hairColor[0];
  const shirt = AVATAR_OPTIONS.shirt[cfg.shirt] ?? AVATAR_OPTIONS.shirt[0];
  const pants = AVATAR_OPTIONS.pants[cfg.pants] ?? AVATAR_OPTIONS.pants[0];
  const shoe = AVATAR_OPTIONS.shoeColor[cfg.shoeColor ?? 0] ?? INK;
  const accColor = AVATAR_OPTIONS.accColor[cfg.accColor ?? 0] ?? null;
  const acc = new Set(cfg.accessories);
  const top = cfg.top ?? 0;
  const bottom = cfg.bottom ?? 0;
  const shoes = cfg.shoes ?? 0;
  const p: Rect = (x, y, w, h, c) => r(ctx, ox + x, oy + y, w, h, c);
  /** Como `p`, escrito olhando para a esquerda; espelhado quando olha para a direita. */
  const s: Rect = (x, y, w, h, c) => p(dir === 'right' ? AV_W - x - w : x, y, w, h, c);
  const side = dir === 'left' || dir === 'right';
  const bob = frame === 0 ? 0 : -1;

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(ox + 8, oy + 43, 16, 4);
  ctx.fillRect(ox + 10, oy + 42, 12, 6);

  // pernas (calça de antes; bermuda e saia deixam a perna de fora)
  const lA = frame === 1 ? -2 : 0;
  const lB = frame === 2 ? -2 : 0;
  const leg = (x: number, l: number, cloth: string, bare: string, hem: string) => {
    if (bottom === 2) {
      p(x, 34, 5, 9 + l, bare);
      return;
    }
    p(x, 34, 5, 9 + l, cloth);
    if (bottom === 1) {
      p(x, 38, 5, 1, hem);
      p(x, 39, 5, 4 + l, bare);
    }
  };
  /** Calçado com a sola em `y`; `x` é a perna (o pé de lado avança 1 px para a frente). */
  const foot = (x: number, y: number) => {
    const fx = side && dir === 'left' ? x - 1 : x;
    const w = side ? 6 : 5;
    if (shoes === 3) {
      p(x, y - 2, 5, 2, shoe);
      p(x, y - 2, 5, 1, detail(shoe, 0.22));
    }
    p(fx, y, w, 2, shoe);
    if (shoes === 1) {
      // social: brilho no bico e salto um tom abaixo
      const toe = !side ? fx + 1 : dir === 'left' ? fx + 1 : fx + w - 2;
      p(toe, y, 1, 1, tint(shoe, 0.4));
      if (side) p(dir === 'left' ? fx + w - 2 : fx, y + 1, 2, 1, tint(shoe, -0.35));
    } else if (shoes === 2) {
      // tênis: sola branca e biqueira clara
      const sole = lum(shoe) > 0.8 ? '#c9c3bb' : '#f5f5f4';
      p(fx, y + 1, w, 1, sole);
      if (side) p(dir === 'left' ? fx : fx + w - 1, y, 1, 1, sole);
      else p(fx + 2, y, 1, 1, detail(shoe, 0.3));
    }
  };
  if (side) {
    const f = dir === 'left' ? -1 : 1;
    const xa = 13 + (frame === 1 ? -2 * f : 0);
    const xb = 14 + (frame === 2 ? 2 * f : 0);
    leg(xa, lA, pants, skin, tint(pants, -0.2));
    leg(xb, lB, shade(pants, -0.08), tint(skin, -0.08), tint(pants, -0.28));
    if (shoes === 0) {
      p(xa + (f < 0 ? -1 : 0), 43 + lA, 6, 2, shoe);
      p(xb + (f < 0 ? -1 : 0), 43 + lB, 6, 2, shoe);
    } else {
      foot(xa, 43 + lA);
      foot(xb, 43 + lB);
    }
  } else {
    leg(10, lA, pants, skin, tint(pants, -0.2));
    leg(17, lB, pants, skin, tint(pants, -0.2));
    if (shoes === 0) {
      p(10, 43 + lA, 5, 2, shoe);
      p(17, 43 + lB, 5, 2, shoe);
    } else {
      foot(10, 43 + lA);
      foot(17, 43 + lB);
    }
  }
  if (bottom === 2) {
    // saia: evasê, da cintura até acima do joelho
    const hem = tint(pants, -0.22);
    if (side) {
      s(11, 34, 10, 3, pants);
      s(10, 37, 12, 3, pants);
      s(10, 39, 12, 1, hem);
      s(dir === 'left' ? 13 : 17, 37, 1, 2, tint(pants, -0.12));
    } else {
      p(9, 34, 14, 3, pants);
      p(8, 37, 16, 3, pants);
      p(8, 39, 16, 1, hem);
      p(12, 37, 1, 2, tint(pants, -0.12));
      p(19, 37, 1, 2, tint(pants, -0.12));
    }
  }

  // tronco e braços
  const by = 21 + bob;
  if (side) {
    p(11, by, 10, 14, shirt);
    torsoDetails(p, s, cfg, 'side', by, shirt, skin);
    const swing = frame === 1 ? 2 : frame === 2 ? -2 : 0;
    const ax = 14 + swing * (dir === 'left' ? -1 : 1);
    p(ax, by + 2, 4, 9, shade(shirt, -0.12));
    p(ax, by + 11, 4, 2, skin);
    if (top === 2) p(ax, by + 10, 4, 1, tint(shirt, -0.3));
    if (acc.has(ACC.Watch)) watch(p, ax, by + 10, 4, dir === 'left' ? ax : ax + 3);
    if (acc.has(ACC.Badge)) {
      s(12, by, 1, 5, GOLD_DARK);
      s(10, by + 5, 2, 4, '#f5f5f4');
      s(10, by + 5, 2, 1, GOLD);
      s(10, by + 8, 2, 1, GOLD);
    }
  } else {
    p(9, by, 14, 14, shirt);
    p(6, by + 1, 3, 10 + (frame === 1 ? 1 : 0), shade(shirt, -0.12));
    p(23, by + 1, 3, 10 + (frame === 2 ? 1 : 0), shade(shirt, -0.12));
    p(6, by + 11 + (frame === 1 ? 1 : 0), 3, 2, skin);
    p(23, by + 11 + (frame === 2 ? 1 : 0), 3, 2, skin);
    if (top === 2) {
      // punhos do moletom
      const cuff = tint(shirt, -0.3);
      p(6, by + 10 + (frame === 1 ? 1 : 0), 3, 1, cuff);
      p(23, by + 10 + (frame === 2 ? 1 : 0), 3, 1, cuff);
    }
    torsoDetails(p, s, cfg, dir === 'down' ? 'front' : 'back', by, shirt, skin);
    if (dir === 'down') {
      if (top === 0) p(14, by, 4, 2, shade(shirt, -0.15));
      if (acc.has(ACC.Tie)) {
        // cor escolhida quase igual à da roupa: a gravata escurece (ou clareia, se for escura) para não sumir (a cor original,
        // de antes do visual v2, não muda: avatares antigos saem iguais)
        const tie = accColor ? (sameTone(accColor, shirt) ? tint(accColor, lum(accColor) < 0.25 ? 0.45 : -0.45) : accColor) : '#b91c1c';
        if (top === 3) {
          // no blazer abotoado a gravata só aparece no decote
          p(15, by + 1, 2, 4, tie);
          p(15, by + 5, 2, 1, tint(tie, -0.25));
        } else {
          p(15, by + 1, 2, 8, tie);
          p(14, by + 8, 4, 2, tie);
        }
      }
      if (acc.has(ACC.Badge)) {
        // crachá Impera no cordão
        p(13, by, 1, 2, GOLD_DARK);
        p(18, by, 1, 2, GOLD_DARK);
        p(14, by + 2, 1, 2, GOLD_DARK);
        p(17, by + 2, 1, 2, GOLD_DARK);
        p(14, by + 4, 4, 5, Math.abs(lum(shirt) - lum(GOLD)) < 0.18 ? '#8a6d33' : GOLD);
        p(15, by + 5, 2, 3, '#f5f5f4');
        p(15, by + 5, 1, 1, GOLD_DARK);
        p(15, by + 7, 2, 1, '#b5b0a8');
      }
      if (acc.has(ACC.Watch)) watch(p, 23, by + 10 + (frame === 2 ? 1 : 0), 3, 24);
    } else {
      if (acc.has(ACC.Badge)) p(13, by, 6, 1, GOLD_DARK);
      if (acc.has(ACC.Watch)) watch(p, 6, by + 10 + (frame === 1 ? 1 : 0), 3, -1);
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
  if (cfg.beard) paintBeard(p, s, cfg.beard, dir, hy, hair, skin);

  // cabelo (debaixo do chapéu, só o que fica abaixo da aba; debaixo do boné, os estilos
  // novos não passam do boné — os de antes ficam como eram)
  const style = cfg.hair;
  const clipY = acc.has(ACC.Hat) ? hy + 1 : acc.has(ACC.Cap) && style >= 6 ? hy - 2 : null;
  if (clipY !== null) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy + clipY, AV_W, AV_H - clipY);
    ctx.clip();
  }
  if (style >= 6) paintHair(p, s, style, dir, hy, hair, skin);
  else if (style > 0) {
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
  if (clipY !== null) ctx.restore();

  // acessórios
  if (acc.has(ACC.Earring)) {
    if (side) s(16, hy + 9, 1, 2, GOLD);
    else {
      p(9, hy + 9, 1, 2, GOLD);
      p(22, hy + 9, 1, 2, GOLD);
    }
  }
  if (acc.has(ACC.Glasses) && dir !== 'up') {
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
  }
  if (acc.has(ACC.Sunglasses) && dir !== 'up') {
    const lens = '#16171b';
    const glint = '#6b7a8f';
    if (dir === 'down') {
      p(10, hy + 6, 12, 1, lens);
      p(10, hy + 7, 5, 2, lens);
      p(17, hy + 7, 5, 2, lens);
      p(11, hy + 7, 1, 1, glint);
      p(18, hy + 7, 1, 1, glint);
    } else {
      s(9, hy + 6, 4, 3, lens);
      s(13, hy + 6, 4, 1, lens);
      s(10, hy + 7, 1, 1, glint);
    }
  }
  if (acc.has(ACC.RoundGlasses) && dir !== 'up') {
    const fr = lum(skin) < 0.42 ? '#d2d6dc' : '#2b2320';
    const ring = (x: number) => {
      p(x + 1, hy + 5, 3, 1, fr);
      p(x + 1, hy + 9, 3, 1, fr);
      p(x, hy + 6, 1, 3, fr);
      p(x + 4, hy + 6, 1, 3, fr);
    };
    if (dir === 'down') {
      ring(10);
      ring(17);
      p(15, hy + 6, 2, 1, fr);
    } else {
      s(10, hy + 5, 2, 1, fr);
      s(10, hy + 9, 2, 1, fr);
      s(9, hy + 6, 1, 3, fr);
      s(12, hy + 6, 1, 3, fr);
      s(13, hy + 6, 4, 1, fr);
    }
  }
  if (acc.has(ACC.Cap)) {
    p(8, hy - 3, 16, 5, accColor ?? '#d7b870');
    const brim = accColor ? shade(accColor, -0.15) : '#b0914b';
    if (dir === 'down') p(9, hy + 2, 14, 2, brim);
    else if (dir === 'left') p(4, hy + 1, 8, 2, brim);
    else if (dir === 'right') p(20, hy + 1, 8, 2, brim);
  }
  if (acc.has(ACC.Hat)) paintHat(p, s, dir, hy, accColor ?? '#4a4038');
  if (acc.has(ACC.Headphones)) {
    p(8, hy - 3, 16, 2, '#111318');
    if (dir !== 'right') p(6, hy + 4, 3, 7, '#111318');
    if (dir !== 'left') p(23, hy + 4, 3, 7, '#111318');
  }
  if (acc.has(ACC.Headset)) paintHeadset(p, s, dir, hy, accColor ?? '#22c55e');
}

/** Relógio no pulso: pulseira escura e o mostrador em `face` (−1 = de costas, sem mostrador). */
function watch(p: Rect, x: number, y: number, w: number, face: number) {
  p(x, y, w, 1, '#2a2b31');
  if (face >= 0) p(face, y, 1, 1, '#e8e3d9');
}

/** Estampa e acabamento da roupa de cima (o que não é braço). */
function torsoDetails(p: Rect, s: Rect, cfg: AvatarConfig, view: 'front' | 'back' | 'side', by: number, shirt: string, skin: string) {
  const top = cfg.top ?? 0;
  const pattern = cfg.pattern ?? 0;
  const x0 = view === 'side' ? 11 : 9;
  const w = view === 'side' ? 10 : 14;
  if (pattern === 1) {
    const a = detail(shirt, 0.22);
    for (const dy of [2, 5, 8, 11]) p(x0, by + dy, w, 1, a);
  } else if (pattern === 2) {
    const a = detail(shirt, 0.18);
    const b = detail(shirt, 0.36);
    const cols = view === 'side' ? [13, 18] : [12, 16, 20];
    for (const dy of [3, 7, 11]) p(x0, by + dy, w, 1, a);
    for (const x of cols) {
      p(x, by, 1, 14, a);
      for (const dy of [3, 7, 11]) p(x, by + dy, 1, 1, b);
    }
  } else if (pattern === 3 && view === 'front') {
    // logo Impera no peito (coroa de 5×3, ponta do meio mais alta)
    const c = Math.abs(lum(shirt) - lum(GOLD)) < 0.18 ? '#6e5626' : GOLD;
    p(19, by + 3, 1, 1, c);
    p(17, by + 4, 1, 1, c);
    p(19, by + 4, 1, 1, c);
    p(21, by + 4, 1, 1, c);
    p(17, by + 5, 5, 1, c);
  }
  if (top === 1) {
    // camisa social: gola de pontas (um tom mais clara), carcela e botões
    const col = lum(shirt) > 0.8 ? '#cfcac4' : tint(shirt, 0.42);
    if (view === 'front') {
      p(12, by, 3, 1, col);
      p(17, by, 3, 1, col);
      p(13, by + 1, 2, 1, col);
      p(17, by + 1, 2, 1, col);
      p(14, by + 2, 1, 1, col);
      p(17, by + 2, 1, 1, col);
      p(15, by, 2, 2, mix(skin, '#000000', 0.25));
      p(15, by + 2, 2, 12, tint(shirt, lum(shirt) > 0.42 ? -0.1 : 0.1));
      for (const dy of [4, 7, 10]) p(16, by + dy, 1, 1, lum(shirt) > 0.8 ? '#9a958e' : col);
    } else if (view === 'back') {
      p(12, by, 8, 1, col);
    } else {
      s(15, by, 5, 1, col);
      s(11, by, 2, 1, col);
      s(11, by + 1, 1, 1, col);
    }
  } else if (top === 2) {
    // moletom: capuz, cordão, bolso canguru e barra
    const d = tint(shirt, lum(shirt) > 0.25 ? -0.22 : 0.18);
    const cord = lum(shirt) > 0.6 ? '#4b4f58' : '#e8e3d9';
    p(x0, by + 13, w, 1, d);
    if (view === 'front') {
      p(11, by, 10, 1, d);
      p(11, by + 1, 2, 1, d);
      p(19, by + 1, 2, 1, d);
      p(14, by, 4, 1, tint(shirt, -0.35));
      p(13, by + 1, 1, 3, cord);
      p(18, by + 1, 1, 3, cord);
      p(12, by + 8, 8, 1, d);
      p(11, by + 9, 1, 3, d);
      p(20, by + 9, 1, 3, d);
      p(12, by + 9, 8, 3, tint(shirt, lum(shirt) > 0.25 ? -0.07 : 0.06));
    } else if (view === 'back') {
      p(11, by, 10, 5, tint(shirt, -0.1));
      p(12, by + 5, 8, 1, d);
      p(11, by, 1, 5, d);
      p(20, by, 1, 5, d);
      p(15, by + 1, 2, 3, tint(shirt, -0.18));
    } else {
      s(16, by, 5, 4, tint(shirt, -0.1));
      s(16, by + 4, 4, 1, d);
      s(16, by, 1, 4, d);
      s(11, by + 1, 1, 3, cord);
      s(11, by + 8, 3, 1, d);
    }
  } else if (top === 3) {
    // blazer: decote em V com a camisa por baixo, lapelas, botões e bolsos
    const inner = lum(shirt) > 0.75 ? '#1f2937' : '#f5f5f4';
    const lapel = tint(shirt, lum(shirt) > 0.25 ? -0.2 : 0.16);
    if (view === 'front') {
      p(13, by, 6, 2, inner);
      p(14, by + 2, 4, 2, inner);
      p(15, by + 4, 2, 2, inner);
      p(12, by, 1, 3, lapel);
      p(19, by, 1, 3, lapel);
      p(13, by + 2, 1, 2, lapel);
      p(18, by + 2, 1, 2, lapel);
      p(14, by + 4, 1, 2, lapel);
      p(17, by + 4, 1, 2, lapel);
      p(15, by + 6, 2, 1, lapel);
      p(15, by + 8, 1, 1, INK);
      p(15, by + 11, 1, 1, INK);
      p(10, by + 10, 3, 1, lapel);
      p(19, by + 10, 3, 1, lapel);
    } else if (view === 'back') {
      p(11, by, 10, 1, lapel);
      p(15, by + 9, 1, 5, lapel);
    } else {
      s(11, by, 1, 4, inner);
      s(12, by, 1, 4, lapel);
      s(11, by + 8, 1, 1, INK);
      s(12, by + 10, 3, 1, lapel);
    }
  }
}

/** Barba e bigode na cor do cabelo (de costas não aparecem). */
function paintBeard(p: Rect, s: Rect, kind: number, dir: Dir, hy: number, hair: string, skin: string) {
  if (dir === 'up') return;
  const b = hair;
  const bd = tint(hair, lum(hair) > 0.3 ? -0.18 : 0.12);
  if (kind === 1) {
    const st = mix(skin, hair, 0.42);
    if (dir === 'down') {
      p(9, hy + 9, 2, 3, st);
      p(21, hy + 9, 2, 3, st);
      p(9, hy + 12, 14, 2, st);
      p(13, hy + 10, 6, 1, st);
      p(14, hy + 11, 4, 1, shade(skin, -0.25));
    } else {
      s(14, hy + 9, 2, 3, st);
      s(9, hy + 11, 7, 3, st);
      s(9, hy + 10, 2, 1, st);
    }
  } else if (kind === 2) {
    if (dir === 'down') {
      p(13, hy + 10, 6, 1, b);
      p(13, hy + 11, 1, 1, b);
      p(18, hy + 11, 1, 1, b);
      p(14, hy + 12, 4, 2, b);
      p(15, hy + 13, 2, 1, bd);
    } else {
      s(9, hy + 10, 3, 1, b);
      s(9, hy + 12, 3, 2, b);
      s(9, hy + 11, 1, 1, b);
    }
  } else if (kind === 3) {
    if (dir === 'down') {
      p(13, hy + 10, 6, 1, b);
      p(12, hy + 11, 2, 1, b);
      p(18, hy + 11, 2, 1, b);
    } else {
      s(9, hy + 10, 4, 1, b);
      s(11, hy + 11, 2, 1, b);
    }
  } else if (kind === 4) {
    if (dir === 'down') {
      p(9, hy + 7, 1, 3, b);
      p(22, hy + 7, 1, 3, b);
      p(9, hy + 9, 2, 1, b);
      p(21, hy + 9, 2, 1, b);
      p(9, hy + 10, 14, 4, b);
      p(11, hy + 14, 10, 1, b);
      p(14, hy + 11, 4, 1, mix(skin, '#000000', 0.35));
      p(13, hy + 14, 6, 1, bd);
    } else {
      s(15, hy + 7, 2, 3, b);
      s(9, hy + 10, 8, 4, b);
      s(10, hy + 14, 6, 1, bd);
    }
  }
}

/** Cabelos do visual v2 (ids 6 em diante). */
function paintHair(p: Rect, s: Rect, style: number, dir: Dir, hy: number, hair: string, skin: string) {
  const H = hair;
  const hd = tint(hair, lum(hair) > 0.3 ? -0.16 : 0.14);
  const hl = tint(hair, lum(hair) > 0.75 ? -0.06 : 0.16);
  const down = dir === 'down';
  const up = dir === 'up';
  switch (style) {
    case 6: {
      // raspado: só a sombra do cabelo, rente à cabeça
      const z = mix(skin, hair, 0.55);
      if (up) p(9, hy - 1, 14, 11, z);
      else if (down) {
        p(9, hy - 1, 14, 3, z);
        p(9, hy + 2, 2, 2, z);
        p(21, hy + 2, 2, 2, z);
      } else {
        s(9, hy - 1, 14, 3, z);
        s(15, hy + 2, 8, 6, z);
        s(16, hy + 8, 7, 1, z);
      }
      break;
    }
    case 7: {
      // black power: volume redondo em volta da cabeça
      if (up) {
        p(11, hy - 5, 10, 1, H);
        p(9, hy - 4, 14, 1, H);
        p(7, hy - 3, 18, 12, H);
        p(8, hy + 9, 16, 1, H);
        p(10, hy + 10, 12, 1, H);
      } else if (down) {
        p(11, hy - 5, 10, 1, H);
        p(9, hy - 4, 14, 1, H);
        p(7, hy - 3, 18, 6, H);
        p(7, hy + 3, 3, 6, H);
        p(22, hy + 3, 3, 6, H);
        p(8, hy + 9, 2, 1, H);
        p(22, hy + 9, 2, 1, H);
        p(10, hy + 2, 12, 1, hd);
      } else {
        s(12, hy - 5, 9, 1, H);
        s(10, hy - 4, 13, 1, H);
        s(8, hy - 3, 17, 6, H);
        s(14, hy + 3, 11, 6, H);
        s(15, hy + 9, 9, 1, H);
        s(9, hy + 2, 5, 1, hd);
      }
      for (const [x, y] of [[11, -3], [16, -4], [20, -2], [13, 0], [18, 0], [8, 2], [23, 5], [8, 6]]) {
        if (side(dir) && x < 9) continue;
        (side(dir) ? s : p)(x, hy + y, 1, 1, hd);
      }
      for (const [x, y] of [[13, -4], [19, -3], [10, -1], [22, 1]]) (side(dir) ? s : p)(x, hy + y, 1, 1, hl);
      break;
    }
    case 8: {
      // coque no alto da cabeça
      if (up) {
        p(8, hy - 2, 16, 12, H);
        p(13, hy - 5, 6, 4, H);
        p(14, hy - 6, 4, 1, H);
        p(13, hy - 2, 6, 1, hd);
      } else if (down) {
        p(8, hy - 2, 16, 5, H);
        p(8, hy + 3, 2, 4, H);
        p(22, hy + 3, 2, 4, H);
        p(10, hy + 3, 3, 1, hd);
        p(19, hy + 3, 3, 1, hd);
        p(14, hy - 6, 4, 1, H);
        p(13, hy - 5, 6, 2, H);
        p(14, hy - 3, 4, 1, hd);
        p(14, hy - 5, 2, 1, hl);
      } else {
        s(8, hy - 2, 16, 5, H);
        s(15, hy + 3, 9, 7, H);
        s(18, hy - 6, 4, 1, H);
        s(17, hy - 5, 6, 3, H);
        s(17, hy - 3, 1, 1, hd);
        s(18, hy - 5, 2, 1, hl);
      }
      break;
    }
    case 9: {
      // moicano: crista no meio, laterais raspadas
      const z = mix(skin, hair, 0.5);
      if (up) {
        p(9, hy - 1, 14, 10, z);
        p(13, hy - 4, 6, 15, H);
        p(13, hy - 4, 1, 15, hd);
        p(18, hy - 4, 1, 15, hd);
      } else if (down) {
        p(9, hy - 1, 14, 3, z);
        p(14, hy - 5, 4, 1, H);
        p(13, hy - 4, 6, 6, H);
        p(13, hy - 4, 1, 6, hd);
        p(18, hy - 4, 1, 6, hd);
        p(15, hy - 4, 1, 3, hl);
      } else {
        s(9, hy - 1, 14, 3, z);
        s(15, hy + 2, 8, 5, z);
        s(11, hy - 6, 2, 1, H);
        s(11, hy - 5, 5, 1, H);
        s(11, hy - 4, 9, 1, H);
        s(11, hy - 3, 11, 2, H);
        s(20, hy - 1, 3, 7, H);
        s(12, hy - 4, 1, 3, hl);
      }
      break;
    }
    case 10: {
      // franja reta e corte na altura do queixo
      if (up) {
        p(8, hy - 2, 16, 15, H);
        p(8, hy + 12, 16, 1, hd);
      } else if (down) {
        p(8, hy - 2, 16, 5, H);
        p(9, hy + 3, 14, 3, H);
        p(9, hy + 5, 14, 1, hd);
        p(8, hy + 3, 2, 10, H);
        p(22, hy + 3, 2, 10, H);
        p(10, hy + 11, 1, 2, H);
        p(21, hy + 11, 1, 2, H);
      } else {
        s(8, hy - 2, 16, 5, H);
        s(9, hy + 3, 4, 3, H);
        s(9, hy + 5, 4, 1, hd);
        s(14, hy + 3, 10, 10, H);
        s(14, hy + 12, 10, 1, hd);
      }
      break;
    }
    case 11: {
      // cacheado: volume médio, contorno em ondas (2 px dentro, 1 fora) e cachos em "c"
      const bumps = (x: number, y: number, h: number) => {
        for (let i = 0; i < h; i++) if (i % 3 !== 2) p(x, y + i, 1, 1, H);
      };
      if (up) {
        p(9, hy - 3, 14, 1, H);
        p(8, hy - 2, 16, 13, H);
        bumps(7, hy - 1, 11);
        bumps(24, hy - 1, 11);
        for (let x = 8; x < 24; x += 3) p(x, hy + 11, 2, 1, H);
      } else if (down) {
        p(9, hy - 3, 14, 1, H);
        p(8, hy - 2, 16, 5, H);
        p(8, hy + 3, 2, 8, H);
        p(22, hy + 3, 2, 8, H);
        bumps(7, hy - 1, 11);
        bumps(24, hy - 1, 11);
        p(10, hy + 3, 2, 1, H);
        p(20, hy + 3, 2, 1, H);
        p(8, hy + 11, 1, 1, H);
        p(23, hy + 11, 1, 1, H);
      } else {
        s(9, hy - 3, 14, 1, H);
        s(8, hy - 2, 16, 5, H);
        s(9, hy + 3, 2, 1, H);
        s(14, hy + 3, 10, 8, H);
        bumps(dir === 'left' ? 24 : 7, hy - 1, 11);
        for (let x = 15; x < 24; x += 3) s(x, hy + 11, 2, 1, H);
      }
      const curls = up ? [[10, 0], [15, 2], [19, -1], [11, 5], [18, 6], [14, 9], [21, 8]] : down ? [[11, -2], [16, -1], [20, -2], [13, 1], [18, 1]] : [[11, -2], [16, -1], [20, 0], [17, 4], [21, 7], [16, 8]];
      for (const [x, y] of curls) {
        (side(dir) ? s : p)(x, hy + y, 1, 1, hl);
        (side(dir) ? s : p)(x + 1, hy + y + 1, 1, 1, hd);
      }
      break;
    }
    case 12: {
      // tranças: risca no meio e duas tranças com contas douradas
      const braid = (x: number, y0: number, len: number) => {
        p(x, y0, 2, len, H);
        for (let i = 0; i < len; i++) p(x + (i % 2), y0 + i, 1, 1, hd);
        p(x, y0 + len, 2, 1, GOLD);
      };
      if (up) {
        p(8, hy - 2, 16, 12, H);
        p(15, hy - 2, 2, 6, hd);
        braid(10, hy + 10, 10);
        braid(20, hy + 10, 10);
      } else if (down) {
        p(8, hy - 2, 16, 5, H);
        p(15, hy - 2, 1, 4, hd);
        p(10, hy + 3, 3, 1, hd);
        p(19, hy + 3, 3, 1, hd);
        braid(8, hy + 3, 17);
        braid(22, hy + 3, 17);
      } else {
        s(8, hy - 2, 16, 5, H);
        s(15, hy + 3, 9, 7, H);
        s(19, hy + 10, 2, 10, H);
        for (let i = 0; i < 10; i++) s(19 + (i % 2), hy + 10 + i, 1, 1, hd);
        s(19, hy + 20, 2, 1, GOLD);
      }
      break;
    }
    case 13: {
      // repartido de lado: risca à esquerda e topete caído sobre a testa
      if (up) {
        p(8, hy - 2, 16, 12, H);
        p(18, hy - 2, 1, 4, hd);
      } else if (down) {
        p(8, hy - 2, 16, 5, H);
        p(18, hy - 2, 1, 4, hd);
        p(9, hy + 3, 7, 1, H);
        p(9, hy + 4, 4, 1, H);
        p(8, hy + 3, 2, 4, H);
        p(22, hy + 3, 2, 4, H);
        p(19, hy + 3, 3, 1, hd);
        p(10, hy, 5, 1, hl);
      } else {
        s(8, hy - 2, 16, 5, H);
        s(15, hy + 3, 9, 7, H);
        s(8, hy + 2, 4, 2, H);
        s(9, hy, 4, 1, hl);
      }
      break;
    }
    case 14: {
      // calvície: cabelo só nas laterais e na nuca
      if (up) {
        p(8, hy + 3, 16, 7, H);
        p(8, hy + 1, 2, 2, H);
        p(22, hy + 1, 2, 2, H);
      } else if (down) {
        p(8, hy + 2, 2, 6, H);
        p(22, hy + 2, 2, 6, H);
        p(12, hy, 3, 1, tint(skin, 0.18));
      } else {
        s(15, hy + 2, 9, 7, H);
        s(14, hy + 3, 1, 4, H);
        s(12, hy, 3, 1, tint(skin, 0.18));
      }
      break;
    }
  }
}

function side(dir: Dir): boolean {
  return dir === 'left' || dir === 'right';
}

/** Chapéu (fedora): copa com vinco, faixa escura e aba larga. */
function paintHat(p: Rect, s: Rect, dir: Dir, hy: number, c: string) {
  const band = lum(c) < 0.2 ? GOLD_DARK : tint(c, -0.55);
  const dark = tint(c, -0.25);
  const light = tint(c, 0.14);
  if (dir === 'left' || dir === 'right') {
    s(11, hy - 5, 10, 4, c);
    s(12, hy - 6, 8, 1, c);
    s(14, hy - 6, 2, 1, dark);
    s(11, hy - 2, 10, 1, band);
    s(5, hy - 1, 22, 1, light);
    s(6, hy, 20, 1, dark);
    return;
  }
  p(10, hy - 5, 12, 4, c);
  p(11, hy - 6, 10, 1, c);
  p(15, hy - 6, 2, 2, dark);
  p(10, hy - 2, 12, 1, band);
  p(6, hy - 1, 20, 1, light);
  p(7, hy, 18, 1, dark);
  if (dir === 'down') p(8, hy + 1, 16, 1, tint(c, -0.4));
}

/** Headset gamer: arco, conchas grandes com detalhe colorido e microfone até a boca. */
function paintHeadset(p: Rect, s: Rect, dir: Dir, hy: number, accent: string) {
  const b = '#1f2124';
  const hi = '#3a3d44';
  if (dir === 'left' || dir === 'right') {
    s(13, hy - 3, 7, 2, b);
    s(15, hy - 1, 3, 4, b);
    s(14, hy + 3, 6, 7, b);
    s(15, hy + 4, 4, 5, hi);
    s(16, hy + 5, 2, 3, accent);
    s(13, hy + 9, 1, 2, b);
    s(10, hy + 11, 3, 1, b);
    s(9, hy + 11, 1, 1, accent);
    return;
  }
  p(8, hy - 3, 16, 2, b);
  p(9, hy - 3, 14, 1, hi);
  p(5, hy + 2, 4, 9, b);
  p(23, hy + 2, 4, 9, b);
  p(5, hy + 4, 1, 5, accent);
  p(26, hy + 4, 1, 5, accent);
  if (dir === 'down') {
    p(9, hy + 10, 1, 1, b);
    p(10, hy + 11, 3, 1, b);
    p(13, hy + 11, 1, 1, accent);
  }
}

const cache = new Map<string, HTMLCanvasElement>();

/** Chave da textura do avatar (aceita também o formato antigo, que é normalizado antes). */
export function avatarKey(cfg: AvatarConfig): string {
  return `av:${avatarConfigKey(sanitizeAvatar(cfg))}`;
}

/** Folha de sprites: 4 direções (linhas, na ordem de DIRS) × 3 quadros. */
export function avatarSheet(cfg: AvatarConfig): HTMLCanvasElement {
  const norm = sanitizeAvatar(cfg);
  const key = `av:${avatarConfigKey(norm)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(AV_W * AV_FRAMES, AV_H * DIRS.length);
  const ctx = c.getContext('2d')!;
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < AV_FRAMES; f++) paintAvatarFrame(ctx, f * AV_W, row * AV_H, norm, dir, f);
  });
  if (cache.size > 600) cache.clear();
  cache.set(key, c);
  return c;
}

/** Retratos (data URL) para listas, menus e o editor. */
const portraitCache = new Map<string, string>();

/** Retrato do avatar em data URL (quadro 0 = parado). Em cache: é chamado em toda renderização dos painéis. */
export function avatarPortrait(cfg: AvatarConfig, scale = 2, dir: Dir = 'down', frame = 0): string {
  const key = `${avatarKey(cfg)}@${scale}:${dir}:${frame}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const url = drawPortrait(cfg, scale, dir, frame);
  if (portraitCache.size > 400) portraitCache.clear();
  portraitCache.set(key, url);
  return url;
}

function drawPortrait(cfg: AvatarConfig, scale: number, dir: Dir, frame: number): string {
  const sheet = avatarSheet(cfg);
  const row = Math.max(0, DIRS.indexOf(dir));
  const c = makeCanvas(AV_W * scale, AV_H * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const f = Math.max(0, Math.min(AV_FRAMES - 1, Math.floor(frame)));
  ctx.drawImage(sheet, f * AV_W, row * AV_H, AV_W, AV_H, 0, 0, AV_W * scale, AV_H * scale);
  return c.toDataURL();
}
