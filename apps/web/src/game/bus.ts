// SPDX-License-Identifier: AGPL-3.0-only
type Handler = (payload: any) => void;

/** Barramento de eventos entre a rede, a cena do Phaser e a interface React. */
class Bus {
  private map = new Map<string, Set<Handler>>();
  on(type: string, fn: Handler): () => void {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type)!.add(fn);
    return () => this.map.get(type)?.delete(fn);
  }
  emit(type: string, payload?: unknown) {
    for (const fn of [...(this.map.get(type) ?? [])]) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[bus] erro em ${type}`, e);
      }
    }
  }
}

export const bus = new Bus();
