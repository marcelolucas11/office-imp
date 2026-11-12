import type { AddressInfo } from 'node:net';
import { Client, type Room } from 'colyseus.js';
import { attachRealtime, buildApp } from '../src/app';
import { closeDb, initDb } from '../src/db';
import { totpCode } from '../src/lib/crypto';
import { registerMeetingJobs } from '../src/services/meetings';

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  await initDb({ pgliteDir: null });
  registerMeetingJobs();
  const app = await buildApp();
  await app.ready();
  const gs = await attachRealtime(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  return {
    url,
    close: async () => {
      await gs.gracefullyShutdown(false).catch(() => {});
      await app.close();
      await closeDb();
    },
  };
}

/** Sessão HTTP com pote de cookies. */
export class Http {
  cookie = '';
  constructor(private base: string) {}
  async call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any; text: string }> {
    const res = await fetch(this.base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(';');
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  }
  get = (p: string) => this.call('GET', p);
  post = (p: string, b: unknown = {}) => this.call('POST', p, b);
  patch = (p: string, b: unknown = {}) => this.call('PATCH', p, b);
  put = (p: string, b: unknown = {}) => this.call('PUT', p, b);
  del = (p: string) => this.call('DELETE', p);

  /** Faz login completo: troca a senha temporária e configura o 2FA quando exigido. */
  async login(username: string, password: string, opts: { newPassword?: string; totpSecret?: string } = {}): Promise<{ totpSecret?: string; password: string }> {
    let r = await this.post('/api/auth/login', { username, password });
    if (r.json?.needTotp) r = await this.post('/api/auth/login', { username, password, code: totpCode(opts.totpSecret!) });
    if (r.status !== 200) throw new Error(`login falhou: ${r.text}`);
    let me = (await this.get('/api/auth/me')).json;
    let current = password;
    if (me.mustChangePassword) {
      const next = opts.newPassword ?? `${password}-nova`;
      const c = await this.post('/api/auth/change-password', { current: password, next });
      if (c.status !== 200) throw new Error(`troca de senha falhou: ${c.text}`);
      current = next;
      me = (await this.get('/api/auth/me')).json;
    }
    let totpSecret = opts.totpSecret;
    if (me.mustSetupTotp) {
      const b = await this.post('/api/auth/totp/begin');
      totpSecret = b.json.secret;
      const e = await this.post('/api/auth/totp/enable', { code: totpCode(totpSecret!) });
      if (e.status !== 200) throw new Error(`2FA falhou: ${e.text}`);
    }
    return { totpSecret, password: current };
  }
}

/** Cliente de tempo real para testes, com fila de mensagens por tipo. */
export class Rt {
  room!: Room;
  log: { type: string; data: any }[] = [];
  private waiters: { type: string; pred: (d: any) => boolean; resolve: (d: any) => void }[] = [];

  static async join(base: string, http: Http, slug: string): Promise<Rt> {
    const enter = await http.post(`/api/offices/${slug}/enter`);
    if (enter.status !== 200) throw new Error(`enter falhou: ${enter.text}`);
    const rt = new Rt();
    const client = new Client(`${base}/rt`);
    rt.room = await client.joinOrCreate('office', { officeId: enter.json.office.id, ticket: enter.json.ticket });
    rt.room.onMessage('*', (type, data) => {
      const t = String(type);
      rt.log.push({ type: t, data });
      for (const w of [...rt.waiters]) {
        if (w.type === t && w.pred(data)) {
          rt.waiters.splice(rt.waiters.indexOf(w), 1);
          w.resolve(data);
        }
      }
    });
    await rt.next('init');
    return rt;
  }

  /** Espera a próxima mensagem do tipo (considera também as já recebidas e ainda não consumidas). */
  next<T = any>(type: string, pred: (d: any) => boolean = () => true, ms = 4000): Promise<T> {
    const i = this.log.findIndex((m) => m.type === type && pred(m.data));
    if (i >= 0) {
      const [m] = this.log.splice(i, 1);
      return Promise.resolve(m.data);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout esperando "${type}"`)), ms);
      this.waiters.push({
        type,
        pred,
        resolve: (d) => {
          clearTimeout(timer);
          const j = this.log.findIndex((m) => m.type === type && m.data === d);
          if (j >= 0) this.log.splice(j, 1);
          resolve(d);
        },
      });
    });
  }

  last<T = any>(type: string): T | undefined {
    for (let i = this.log.length - 1; i >= 0; i--) if (this.log[i].type === type) return this.log[i].data;
    return undefined;
  }

  clear() {
    this.log = [];
  }

  send(type: string, data: unknown = {}) {
    this.room.send(type, data);
  }

  async leave() {
    await this.room.leave(true);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
