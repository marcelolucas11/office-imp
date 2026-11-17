// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { fitTiles, pickTile, planStage, type LayoutEntry } from '../src/office/videoLayout';

const me: LayoutEntry = { key: 'me:cam', kind: 'cam' };
const ana: LayoutEntry = { key: 'ana:cam', kind: 'cam' };
const bia: LayoutEntry = { key: 'bia:cam', kind: 'cam', speaking: true };
const caio: LayoutEntry = { key: 'caio:cam', kind: 'cam' };
const anaTela: LayoutEntry = { key: 'ana:screen', kind: 'screen' };

describe('planStage', () => {
  it('só a faixa: todos pequenos; clicar num vídeo abre o destaque', () => {
    expect(planStage([me, ana, bia], 'bar', null, null, false)).toEqual({ mode: 'bar', main: [], strip: ['me:cam', 'ana:cam', 'bia:cam'] });
    expect(planStage([me, ana, bia], 'bar', 'ana:cam', null, false)).toEqual({ mode: 'spotlight', main: ['ana:cam'], strip: ['me:cam', 'bia:cam'] });
  });

  it('mosaico: todos do mesmo tamanho, nenhum na faixa', () => {
    expect(planStage([me, ana, bia, caio], 'grid', null, null, false)).toEqual({ mode: 'grid', main: ['me:cam', 'ana:cam', 'bia:cam', 'caio:cam'], strip: [] });
  });

  it('lado a lado: dois grandes (primeiro a tela compartilhada, depois quem fala)', () => {
    expect(planStage([me, ana, anaTela, bia, caio], 'side', null, null, false)).toEqual({ mode: 'side', main: ['ana:screen', 'bia:cam'], strip: ['me:cam', 'ana:cam', 'caio:cam'] });
  });

  it('lado a lado com só uma pessoa: você e ela, sem faixa', () => {
    expect(planStage([me, ana], 'side', null, null, false)).toEqual({ mode: 'side', main: ['ana:cam', 'me:cam'], strip: [] });
  });

  it('respeita os vídeos escolhidos e ignora quem já saiu', () => {
    expect(planStage([me, ana, bia, caio], 'side', 'caio:cam', 'ana:cam', false).main).toEqual(['caio:cam', 'ana:cam']);
    expect(planStage([me, ana, bia], 'spotlight', 'saiu:cam', null, false).main).toEqual(['bia:cam']);
  });

  it('sozinho no mapa: volta para a faixa e não cobre o mapa', () => {
    expect(planStage([me], 'grid', null, null, false).mode).toBe('bar');
    expect(planStage([], 'side', null, null, false).mode).toBe('bar');
  });

  it('visualização simplificada: a faixa vira mosaico', () => {
    expect(planStage([me, ana], 'bar', null, null, true).mode).toBe('grid');
    expect(planStage([me], 'spotlight', null, null, true)).toEqual({ mode: 'spotlight', main: ['me:cam'], strip: [] });
  });
});

describe('pickTile', () => {
  it('no lado a lado o novo entra no lugar do mais antigo', () => {
    expect(pickTile('side', 'caio:cam', 'ana:cam', ['ana:cam', 'bia:cam'])).toEqual({ focus: 'caio:cam', focus2: 'ana:cam' });
    expect(pickTile('side', 'caio:cam', null, ['ana:cam', 'bia:cam'])).toEqual({ focus: 'caio:cam', focus2: 'ana:cam' });
  });
  it('no destaque troca o vídeo grande', () => {
    expect(pickTile('spotlight', 'bia:cam', 'ana:cam', ['ana:cam'])).toEqual({ focus: 'bia:cam', focus2: null });
  });
});

describe('fitTiles', () => {
  it('escolhe o maior tamanho 16:9 que cabe', () => {
    expect(fitTiles(1600, 900, 1, 12)).toEqual({ cols: 1, w: 1600, h: 900 });
    const four = fitTiles(1600, 900, 4, 12);
    expect(four.cols).toBe(2);
    expect(four.w * 2 + 12).toBeLessThanOrEqual(1600);
    expect(four.h * 2 + 12).toBeLessThanOrEqual(900);
  });
  it('lado a lado sempre em duas colunas', () => {
    const side = fitTiles(1200, 900, 2, 12, 2);
    expect(side.cols).toBe(2);
    expect(side.w).toBe(594);
  });
  it('todos cabem, para qualquer quantidade', () => {
    for (let n = 1; n <= 20; n++) {
      const f = fitTiles(1280, 640, n, 12);
      const rows = Math.ceil(n / f.cols);
      expect(f.cols * f.w + (f.cols - 1) * 12).toBeLessThanOrEqual(1280);
      expect(rows * f.h + (rows - 1) * 12).toBeLessThanOrEqual(640);
    }
  });
  it('sem espaço medido ainda, não desenha', () => {
    expect(fitTiles(0, 0, 3, 12).w).toBe(0);
  });
});
