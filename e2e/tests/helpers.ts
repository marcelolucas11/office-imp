// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

/** Código TOTP (RFC 6238) a partir do segredo em base32 mostrado na tela de 2FA. */
export function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretBase32.replace(/=+$/, '').toUpperCase()) {
    const v = alphabet.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const mac = createHmac('sha1', bytes).update(counter).digest();
  const off = mac[mac.length - 1] & 0xf;
  const code = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/** Lê o estado do escritório exposto pelo cliente (window.__oi). */
export function game<T = any>(page: Page, expr: string): Promise<T> {
  return page.evaluate(`(() => { const g = window.__oi.game.getState(); const av = window.__oi.av.getState(); return (${expr}); })()`) as Promise<T>;
}

export async function online(page: Page) {
  await expect(page.locator('[data-testid=office][data-phase=online]')).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => game(page, 'Boolean(g.players[g.meId])')).toBe(true);
}

export function send(page: Page, type: string, data?: unknown) {
  return page.evaluate(([t, d]) => (window as any).__oi.net.send(t, d), [type, data] as const);
}

export const peerIds = (page: Page) => game<string[]>(page, 'g.av.peers.map((p) => p.id)');
export const myId = (page: Page) => game<string>(page, 'g.meId');
