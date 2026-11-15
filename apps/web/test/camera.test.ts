// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { TILE } from '@office-imp/shared';
import { CAMERA_MARGIN, EXTERIOR_MARGIN_MAX, cameraBounds, exteriorMarginFor, grassStrips } from '../src/game/camera';
import { EXTERIOR_MARGIN } from '../src/game/art/exterior';

describe('limites da câmera (exterior visível)', () => {
  it('mapa maior que a tela: a câmera anda a margem para fora de cada lado', () => {
    const b = cameraBounds(60, 40, 960, 540);
    const m = CAMERA_MARGIN * TILE;
    expect(b).toEqual({ x: -m, y: -m, w: 60 * TILE + 2 * m, h: 40 * TILE + 2 * m });
  });

  it('mapa com a margem menor que a tela: fica centralizado naquele eixo', () => {
    const b = cameraBounds(10, 40, 1920, 540);
    expect(b.w).toBe(1920);
    // centro dos limites = centro do mapa
    expect(b.x + b.w / 2).toBe((10 * TILE) / 2);
    expect(b.y).toBe(-CAMERA_MARGIN * TILE);
  });

  it('os limites sempre contêm o mapa inteiro e nunca são menores que a tela', () => {
    for (const [mw, mh, vw, vh] of [
      [20, 14, 640, 360],
      [34, 26, 1280, 720],
      [100, 100, 960, 540],
      [8, 8, 3840, 2160],
    ] as const) {
      const b = cameraBounds(mw, mh, vw, vh);
      expect(b.x).toBeLessThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(0);
      expect(b.x + b.w).toBeGreaterThanOrEqual(mw * TILE);
      expect(b.y + b.h).toBeGreaterThanOrEqual(mh * TILE);
      expect(b.w).toBeGreaterThanOrEqual(vw);
      expect(b.h).toBeGreaterThanOrEqual(vh);
    }
  });

  it('margem 0 = comportamento de antes (câmera presa ao mapa)', () => {
    expect(cameraBounds(60, 40, 960, 540, 0)).toEqual({ x: 0, y: 0, w: 60 * TILE, h: 40 * TILE });
  });

  it('a margem da câmera cabe dentro da faixa que tem árvores', () => {
    expect(CAMERA_MARGIN).toBeGreaterThanOrEqual(6);
    expect(CAMERA_MARGIN).toBeLessThanOrEqual(EXTERIOR_MARGIN);
  });

  it('faixa com árvores: a de sempre no mapa grande, maior no escritório pequeno em tela grande, com teto', () => {
    // mapa maior que a tela: a câmera só mostra 7 blocos de fora
    expect(exteriorMarginFor(100, 100, 960, 540, EXTERIOR_MARGIN)).toBe(EXTERIOR_MARGIN);
    // 34×21 blocos numa tela de 2560×1440 no zoom 1: sobram 23 blocos de cada lado
    expect(exteriorMarginFor(34, 21, 2560, 1440, EXTERIOR_MARGIN)).toBe(24);
    // tela absurda: para no teto
    expect(exteriorMarginFor(10, 10, 20000, 12000, EXTERIOR_MARGIN)).toBe(EXTERIOR_MARGIN_MAX);
  });
});

describe('faixas de grama fora do mapa (sem pintar a tela duas vezes)', () => {
  const area = (r: { w: number; h: number } | null) => (r ? r.w * r.h : 0);
  const inter = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

  it('câmera toda dentro do mapa (longe das bordas): nenhuma faixa', () => {
    expect(grassStrips(100, 100, 1200, 1200, 640, 360)).toEqual([null, null, null, null]);
  });

  it('as faixas cobrem tudo o que a tela mostra fora do mapa, sem entrar nele e sem se sobrepor', () => {
    const mapW = 34;
    const mapH = 21;
    const map = { x: 0, y: 0, w: mapW * TILE, h: mapH * TILE };
    for (const [vx, vy, vw, vh] of [
      [-224, -224, 960, 540],
      [300, 400, 960, 540],
      [-700, -500, 2560, 1440],
      [900, -100, 427, 240],
      [5000, 5000, 640, 360],
    ] as const) {
      const view = { x: vx, y: vy, w: vw, h: vh };
      const strips = grassStrips(mapW, mapH, vx, vy, vw, vh).filter((s) => s !== null);
      let covered = 0;
      for (const s of strips) {
        expect(inter(s, map), 'faixa dentro do mapa').toBe(0);
        covered += inter(s, view);
        // alinhada ao mundo: o deslocamento do padrão é a posição módulo 256
        expect(s.tx).toBe(((s.x % 256) + 256) % 256);
        expect(s.ty).toBe(((s.y % 256) + 256) % 256);
      }
      for (let i = 0; i < strips.length; i++) for (let j = i + 1; j < strips.length; j++) expect(inter(strips[i], strips[j]), 'faixas sobrepostas').toBe(0);
      expect(covered).toBe(area(view) - inter(view, map));
    }
  });

  it('o tamanho das faixas só muda quando a câmera cruza a grade de 256 px', () => {
    const a = grassStrips(34, 21, -100, -100, 960, 540);
    const b = grassStrips(34, 21, -60, -90, 960, 540);
    expect(b).toEqual(a);
  });
});
