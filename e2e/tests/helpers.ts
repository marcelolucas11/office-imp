// SPDX-License-Identifier: AGPL-3.0-only
import net from 'node:net';
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

/** Servidor SMTP mínimo, só para os testes: aceita tudo e guarda as mensagens recebidas. */
export async function smtpSink(): Promise<{ port: number; mails: string[]; close: () => Promise<void> }> {
  const mails: string[] = [];
  const server = net.createServer((sock) => {
    let inData = false;
    let buf = '';
    sock.on('error', () => {});
    sock.write('220 office-imp-e2e ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          mails.push(buf.slice(0, end));
          buf = buf.slice(end + 5);
          inData = false;
          sock.write('250 OK\r\n');
          continue;
        }
        const nl = buf.indexOf('\r\n');
        if (nl < 0) return;
        const cmd = buf.slice(0, nl).slice(0, 4).toUpperCase();
        buf = buf.slice(nl + 2);
        if (cmd === 'EHLO') sock.write('250-office-imp-e2e\r\n250 SIZE 10485760\r\n');
        else if (cmd === 'DATA') {
          inData = true;
          sock.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (cmd === 'QUIT') {
          sock.write('221 Bye\r\n');
          sock.end();
        } else sock.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return { port, mails, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
