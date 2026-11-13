// SPDX-License-Identifier: AGPL-3.0-only
// Fábrica de canvas injetável. No navegador usa `document.createElement`; em Node
// (`pnpm art:sheet` e testes) injeta-se a do @napi-rs/canvas com `setCanvasFactory`.
// Os módulos de arte só dependem da interface de canvas 2D (getContext('2d'), fillRect,
// createImageData/getImageData/putImageData, drawImage).

export type CanvasFactory = (w: number, h: number) => HTMLCanvasElement;

const domFactory: CanvasFactory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

let factory: CanvasFactory = domFactory;

/** Troca a fábrica de canvas (Node). Sem argumento, volta para a do navegador. */
export function setCanvasFactory(f?: CanvasFactory): void {
  factory = f ?? domFactory;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = factory(w, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return c;
}
