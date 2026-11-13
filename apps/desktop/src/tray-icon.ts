// SPDX-License-Identifier: AGPL-3.0-only
// Ícone da barra de menus (Mac) / área de notificação (Windows): o losango do office-imp em dourado
// com uma bolinha da cor do status no canto, desenhado por código para ficar nítido em telas Retina.
import { nativeImage } from 'electron';

export type Rgb = [number, number, number];

const GOLD: Rgb = [215, 184, 112];
const SS = 4; // supersampling por eixo (antialiasing)

/** Gera o ícone em 18 pt (36 px com fator 2). `dot` = cor do status; null = sem bolinha. */
export function trayIcon(dot: Rgb | null): Electron.NativeImage {
  const size = 36;
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2 - 1; // centro do losango, levemente para cima/esquerda (abre espaço para a bolinha)
  const dotC = size - 8.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let gold = 0;
      let dotA = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          // losango (contorno) + quadrado central
          const m = Math.abs(px - c) + Math.abs(py - c);
          const inDiamond = m <= 15 && m >= 10.5;
          const inSquare = Math.abs(px - c) <= 3.6 && Math.abs(py - c) <= 3.6;
          const d = Math.hypot(px - dotC, py - dotC);
          if (dot && d <= 6.2) dotA++;
          else if (dot && d <= 8.6) continue; // anel transparente separa a bolinha do losango
          else if (inDiamond || inSquare) gold++;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      if (dot && dotA) {
        a = dotA / n;
        [r, g, b] = dot;
      } else if (gold) {
        a = gold / n;
        [r, g, b] = GOLD;
      }
      // BGRA pré-multiplicado
      buf[i] = Math.round(b * a);
      buf[i + 1] = Math.round(g * a);
      buf[i + 2] = Math.round(r * a);
      buf[i + 3] = Math.round(255 * a);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 });
}
