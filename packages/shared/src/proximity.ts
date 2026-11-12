// SPDX-License-Identifier: AGPL-3.0-only
import type { AvView, Status } from './types';

export interface ProxPlayer {
  id: string;
  x: number;
  y: number;
  status: Status;
  distance: number;
  areaId: string | null;
  spotlight: boolean;
}

export function tileDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Calcula, para cada jogador, com quem ele está conectado em áudio/vídeo.
 * Regras:
 *  - "Não incomodar": nenhuma conexão (room = 'none').
 *  - Dentro de área privada: conecta com todos da mesma área, sem atenuação.
 *  - Fora: conecta com quem está fora de áreas privadas e dentro do raio
 *    (o menor entre os raios dos dois, para a conexão ser sempre mútua).
 *  - Spotlight: quem está no palco é ouvido/visto por todos (menos por quem está em "Não incomodar").
 */
export function computeAv(players: ProxPlayer[]): Map<string, AvView> {
  const out = new Map<string, AvView>();
  const spotlight = players.filter((p) => p.spotlight && p.status !== 'DND').map((p) => p.id);
  for (const p of players) {
    if (p.status === 'DND') {
      out.set(p.id, { room: 'none', peers: [], spotlight: [] });
      continue;
    }
    const view: AvView = { room: p.areaId ?? 'open', peers: [], spotlight: spotlight.filter((id) => id !== p.id) };
    for (const q of players) {
      if (q.id === p.id || q.status === 'DND') continue;
      if (p.areaId) {
        if (q.areaId === p.areaId) view.peers.push({ id: q.id, d: 0 });
      } else if (!q.areaId) {
        const d = tileDistance(p, q);
        if (d <= Math.min(p.distance, q.distance)) view.peers.push({ id: q.id, d: Math.round(d * 10) / 10 });
      }
    }
    view.peers.sort((a, b) => (a.id < b.id ? -1 : 1));
    // quem já é par direto não precisa aparecer como spotlight
    view.spotlight = view.spotlight.filter((id) => !view.peers.some((x) => x.id === id)).sort();
    out.set(p.id, view);
  }
  return out;
}

/** Chave canônica de um par (ordem alfabética). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Conjunto de pares conectados (arestas do grafo de chamadas). */
export function avEdges(views: Map<string, AvView>): Map<string, { a: string; b: string; room: string }> {
  const edges = new Map<string, { a: string; b: string; room: string }>();
  for (const [id, v] of views) {
    for (const p of v.peers) {
      const key = pairKey(id, p.id);
      if (!edges.has(key)) {
        const [a, b] = key.split('|');
        edges.set(key, { a, b, room: v.room });
      }
    }
  }
  return edges;
}

/** Volume (0–1) em função da distância e do raio de interação. */
export function volumeForDistance(d: number, radius: number): number {
  if (d <= 1.5) return 1;
  if (d >= radius) return 0.25;
  const t = (d - 1.5) / Math.max(0.001, radius - 1.5);
  return Math.round((1 - 0.75 * t) * 100) / 100;
}

export function avViewEquals(a: AvView | undefined, b: AvView | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.room !== b.room || a.peers.length !== b.peers.length || a.spotlight.length !== b.spotlight.length) return false;
  for (let i = 0; i < a.peers.length; i++) if (a.peers[i].id !== b.peers[i].id || a.peers[i].d !== b.peers[i].d) return false;
  for (let i = 0; i < a.spotlight.length; i++) if (a.spotlight[i] !== b.spotlight[i]) return false;
  return true;
}
