// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { game, myId, online, peerIds, send, totp } from './helpers';

const LIVEKIT = process.env.E2E_LIVEKIT === '1';
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe.configure({ mode: 'serial' });

let ownerCtx: BrowserContext;
let empCtx: BrowserContext;
let guestCtx: BrowserContext;
let owner: Page;
let emp: Page;
let guest: Page;
let officeId = '';
let slug = '';
let guestInviteId = '';
let ownerId = '';
let empId = '';

test.beforeAll(async ({ browser }) => {
  ownerCtx = await browser.newContext();
  empCtx = await browser.newContext();
  guestCtx = await browser.newContext();
  owner = await ownerCtx.newPage();
  emp = await empCtx.newPage();
  guest = await guestCtx.newPage();
  // avisos e erros do navegador aparecem no log do teste (ajuda a diagnosticar falhas de mídia no CI)
  for (const [name, page] of [['dono', owner], ['func', emp], ['conv', guest]] as const) {
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') console.log(`[${name}] ${m.type()}: ${m.text().slice(0, 400)}`);
    });
    page.on('pageerror', (e) => console.log(`[${name}] pageerror: ${String(e).slice(0, 400)}`));
  }
});

// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, info) => {
  if (info.status === info.expectedStatus) return;
  for (const [name, page] of [['dono', owner], ['func', emp], ['conv', guest]] as const) {
    const st = await page
      .evaluate(() => {
        const oi = (window as any).__oi;
        if (!oi) return null;
        const av = oi.av.getState();
        const g = oi.game.getState();
        return { phase: g.phase, view: g.av, conn: av.conn, room: av.room, mic: av.mic, cam: av.cam, blocked: av.blocked, peers: av.peers.map((p: any) => ({ id: p.id, live: p.live, mic: p.mic, cam: Boolean(p.cam) })) };
      })
      .catch(() => null);
    console.log(`[${name}] estado na falha: ${JSON.stringify(st)}`);
  }
});

test.afterAll(async () => {
  await ownerCtx?.close();
  await empCtx?.close();
  await guestCtx?.close();
});

async function api(page: Page, method: 'get' | 'post' | 'patch' | 'delete', url: string, data?: unknown) {
  const res = await page.request[method](url, data === undefined ? undefined : { data });
  expect(res.ok(), `${method.toUpperCase()} ${url} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

test('configuração inicial cria os dois Donos e exige 2FA', async () => {
  await owner.goto('/');
  await expect(owner).toHaveURL(/\/setup/);
  const inputs = owner.locator('form input:not([type=checkbox])');
  await inputs.nth(0).fill('e2e-setup-token');
  await inputs.nth(1).fill('Marcelo');
  await inputs.nth(2).fill('marcelo');
  await inputs.nth(3).fill('senha-do-dono-1');
  await inputs.nth(4).fill('Sócio');
  await inputs.nth(5).fill('socio');
  await inputs.nth(6).fill('senha-do-dono-2');
  await owner.getByRole('button', { name: 'Criar contas e continuar' }).click();

  // 2FA obrigatório para Dono
  const secret = (await owner.getByTestId('totp-secret').innerText()).trim();
  await owner.locator('input[name=code]').fill(totp(secret));
  await owner.getByRole('button', { name: 'Ativar' }).click();
  await expect(owner.getByTestId('recovery-codes')).toBeVisible();
  await owner.getByRole('button', { name: 'Já guardei, continuar' }).click();

  // aviso de transparência
  await owner.getByRole('button', { name: 'Entendi' }).click();
  await expect(owner.getByRole('heading', { name: 'Seus escritórios' })).toBeVisible();

  // a tela de configuração se desativa
  const res = await owner.request.post('/api/setup', { data: { token: 'e2e-setup-token', owners: [{ username: 'intruso', displayName: 'Intruso', password: 'senha-qualquer-1' }] } });
  expect(res.ok()).toBeFalsy();
});

test('assistente cria um escritório pronto (1 a 10, dois sócios na mesma sala)', async () => {
  await owner.goto('/admin/escritorios');
  await owner.getByTestId('new-office').click();
  await owner.locator('input[name=officeName]').fill('Impera');
  await owner.getByTestId('size-small').click();
  await owner.locator('input[name=partners]').fill('2');
  await expect(owner.getByTestId('map-preview')).toBeVisible();
  await owner.getByTestId('wiz-create').click();
  await expect(owner.getByRole('button', { name: 'Entrar no escritório' })).toBeVisible();

  const offices = await api(owner, 'get', '/api/offices');
  expect(offices).toHaveLength(1);
  officeId = offices[0].id;
  slug = offices[0].slug;
  expect(offices[0].deskCapacity).toBeGreaterThanOrEqual(12); // 10 funcionários + 2 sócios
});

test('funcionário entra com conta criada pelo ADM, troca a senha e ativa o acesso pelo link', async () => {
  await api(owner, 'post', '/api/users', { username: 'ana', displayName: 'Ana Lima', password: 'temporaria-123', role: 'EMPLOYEE', officeIds: [officeId] });
  const invite = await api(owner, 'post', `/api/offices/${officeId}/invites`, { kind: 'EMPLOYEE' });

  // sem abrir o link, o escritório aparece bloqueado
  await emp.goto('/login');
  await emp.locator('input[name=username]').fill('ana');
  await emp.locator('input[name=password]').fill('temporaria-123');
  await emp.getByRole('button', { name: 'Entrar', exact: true }).click();
  await emp.locator('input[name=current]').fill('temporaria-123');
  await emp.locator('input[name=next]').fill('senha-nova-da-ana');
  await emp.locator('input[name=again]').fill('senha-nova-da-ana');
  await emp.getByRole('button', { name: 'Salvar e continuar' }).click();
  await emp.getByRole('button', { name: 'Entendi' }).click();
  await expect(emp.getByText('Para entrar pela primeira vez, abra o link de convite')).toBeVisible();
  const blocked = await emp.request.post(`/api/offices/${slug}/enter`);
  expect(blocked.status()).toBe(403);

  await emp.goto(new URL(invite.url).pathname);
  await online(emp);
  empId = await myId(emp);
});

test('Dono entra no escritório e os dois se veem no mapa', async () => {
  await owner.goto(`/o/${slug}`);
  await online(owner);
  ownerId = await myId(owner);
  await expect.poll(() => game(owner, 'Object.keys(g.players).length')).toBe(2);
  await expect.poll(() => game(emp, 'Object.keys(g.players).length')).toBe(2);
  await expect(owner.getByTestId('office-name')).toHaveText('Impera');
});

test('movimento com o teclado é validado pelo servidor e chega ao outro cliente', async () => {
  const before = await game<{ x: number; y: number }>(owner, '({ x: g.players[g.meId].x, y: g.players[g.meId].y })');
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
    await owner.keyboard.down(key);
    await owner.waitForTimeout(450);
    await owner.keyboard.up(key);
  }
  await owner.keyboard.down('ArrowRight');
  await owner.waitForTimeout(600);
  await owner.keyboard.up('ArrowRight');
  await owner.waitForTimeout(400);
  const after = await game<{ x: number; y: number }>(owner, '({ x: g.players[g.meId].x, y: g.players[g.meId].y })');
  expect(after.x !== before.x || after.y !== before.y).toBeTruthy();
  // o funcionário enxerga o Dono na mesma posição
  await expect.poll(() => game(emp, `({ x: g.players['${ownerId}'].x, y: g.players['${ownerId}'].y })`)).toEqual(after);
});

test('proximidade: perto conecta, longe desconecta', async () => {
  // longe: o Dono vai para a mesa mais distante do funcionário
  const far = await game<{ x: number; y: number }>(
    owner,
    `(() => { const e = g.players['${empId}']; const desks = g.map.objects.filter((o) => o.type === 'desk'); desks.sort((a, b) => Math.hypot(b.x - e.x, b.y - e.y) - Math.hypot(a.x - e.x, a.y - e.y)); return { x: desks[0].x, y: desks[0].y + 1 }; })()`,
  );
  await send(owner, 'teleport', far);
  await expect.poll(() => peerIds(owner)).not.toContain(empId);
  await expect.poll(() => peerIds(emp)).not.toContain(ownerId);

  // perto: vai até o funcionário
  await owner.evaluate((id) => (window as any).__oi.net.gotoPlayer(id), empId);
  await expect.poll(() => peerIds(owner)).toContain(empId);
  await expect.poll(() => peerIds(emp)).toContain(ownerId);

  if (LIVEKIT) {
    await expect.poll(() => game(owner, 'av.conn'), { timeout: 30_000 }).toBe('on');
    await expect.poll(() => game(emp, 'av.conn'), { timeout: 30_000 }).toBe('on');
    // entra mutado; ao ligar o microfone e a câmera, o outro lado recebe
    expect(await game(owner, 'av.mic')).toBe(false);
    await owner.getByTestId('btn-mic').click();
    await expect.poll(() => game(owner, 'av.mic'), { timeout: 30_000 }).toBe(true);
    await owner.getByTestId('btn-cam').click();
    await expect.poll(() => game(owner, 'av.cam'), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => game(emp, `av.peers.find((p) => p.id === '${ownerId}')?.mic === true`), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => game(emp, `Boolean(av.peers.find((p) => p.id === '${ownerId}')?.cam)`), { timeout: 30_000 }).toBe(true);
    await expect(emp.getByTestId(`tile-${ownerId}:cam`).locator('video')).toBeVisible();
  }
});

test('sala privada: quem está fora não participa; quem entra, sim', async () => {
  const room = await game<{ id: string; x: number; y: number }>(owner, `(() => { const a = g.map.areas.find((a) => a.kind === 'private' && a.meeting); const r = a.rects[0]; return { id: a.id, x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) }; })()`);
  await send(owner, 'teleport', { x: room.x, y: room.y });
  await expect.poll(() => game(owner, 'g.players[g.meId].areaId')).toBe(room.id);
  await expect.poll(() => game(owner, 'g.av.room')).toBe(room.id);
  await expect.poll(() => peerIds(owner)).toEqual([]);
  await expect.poll(() => peerIds(emp)).not.toContain(ownerId);
  await expect(owner.getByTestId('area-badge')).toBeVisible();
  await expect(owner.getByTestId('notes-toggle')).toBeVisible();

  // o token de vídeo da sala só sai para quem está dentro dela
  const denied = await emp.request.post('/api/livekit/token', { data: { officeId, room: room.id } });
  expect(denied.status()).toBe(403);

  await send(emp, 'teleport', { x: room.x, y: room.y });
  await expect.poll(() => game(emp, 'g.av.room')).toBe(room.id);
  await expect.poll(() => peerIds(owner)).toEqual([empId]);
  await expect.poll(() => peerIds(emp)).toEqual([ownerId]);
  const allowed = await emp.request.post('/api/livekit/token', { data: { officeId, room: room.id } });
  expect(allowed.ok()).toBeTruthy();

  if (LIVEKIT) {
    await expect.poll(() => game(emp, 'av.conn'), { timeout: 30_000 }).toBe('on');
    await expect.poll(() => game(emp, `av.peers.find((p) => p.id === '${ownerId}')?.live === true`), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => game(emp, `av.peers.find((p) => p.id === '${ownerId}')?.mic === true`), { timeout: 30_000 }).toBe(true);
  }
});

test('status: menu, atalhos e Não incomodar bloqueando a conexão', async () => {
  await emp.getByTestId('status-button').click();
  await expect(emp.getByTestId('status-menu')).toContainText('Ninguém poderá falar com você. Use esta opção quando estiver em outra ligação.');
  await emp.getByTestId('status-BUSY').click();
  await expect(emp.getByTestId('status-label')).toHaveText('Ocupado');
  await expect.poll(() => game(owner, `g.players['${empId}'].status`)).toBe('BUSY');
  await expect.poll(() => peerIds(owner)).toEqual([empId]); // ocupado ainda conecta

  await emp.keyboard.press(`${MOD}+u`);
  await expect(emp.getByTestId('status-label')).toHaveText('Não incomodar');
  await expect.poll(() => game(emp, 'g.av.room')).toBe('none');
  await expect.poll(() => peerIds(owner)).toEqual([]);
  if (LIVEKIT) await expect.poll(() => game(emp, 'av.conn')).toBe('off');

  await emp.keyboard.press(`${MOD}+o`);
  await expect(emp.getByTestId('status-label')).toHaveText('Disponível');
  await expect.poll(() => peerIds(owner)).toEqual([empId]);
});

test('convidado entra só com o nome, vê o aviso e não entra em área da equipe', async () => {
  const inv = await api(owner, 'post', `/api/offices/${officeId}/invites`, { kind: 'GUEST', label: 'Cliente', expiresAt: Date.now() + 3600_000 });
  guestInviteId = inv.id;
  await guest.goto(new URL(inv.url).pathname);
  await guest.locator('input[name=displayName]').fill('Visitante');
  await guest.locator('input[name=agree]').check();
  await guest.getByRole('button', { name: 'Entrar no escritório' }).click();
  await online(guest);
  await expect.poll(() => game(owner, 'Object.keys(g.players).length')).toBe(3);
  expect(await game(guest, 'g.players[g.meId].role')).toBe('GUEST');

  // tenta se teletransportar para a Sala dos Sócios (somente equipe)
  const staff = await game<{ id: string; x: number; y: number } | null>(guest, `(() => { const a = g.map.areas.find((a) => a.staffOnly); if (!a) return null; const r = a.rects[0]; return { id: a.id, x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) }; })()`);
  expect(staff).not.toBeNull();
  await send(guest, 'teleport', { x: staff!.x, y: staff!.y });
  await guest.waitForTimeout(800);
  expect(await game(guest, 'g.players[g.meId].areaId')).not.toBe(staff!.id);
});

test('chat para todos chega aos outros', async () => {
  await owner.getByTestId('btn-chat').click();
  await owner.getByRole('button', { name: 'Todos' }).click();
  await owner.getByTestId('chat-input').fill('Bom dia, equipe!');
  await owner.getByTestId('chat-input').press('Enter');
  await emp.getByTestId('btn-chat').click();
  await emp.getByRole('button', { name: 'Todos' }).click();
  await expect(emp.getByTestId('chat-list')).toContainText('Bom dia, equipe!');
  await expect.poll(() => game(guest, `g.chat.some((m) => m.text === 'Bom dia, equipe!')`)).toBe(true);
  await owner.getByTestId('btn-chat').click();
  await emp.getByTestId('btn-chat').click();
});

test('rádio: o canal aberto por um aparece para o outro com o mesmo ponto da música', async () => {
  await send(owner, 'music:open', { name: 'Lo-fi', url: 'https://music.youtube.com/watch?v=jfKfPfyJRdk', videoIds: [] });
  await expect.poll(() => game(emp, 'g.music.length')).toBe(1);
  const id = await game<string>(emp, 'g.music[0].id');
  await send(emp, 'music:join', { id });
  await expect(emp.getByTestId('radio-dock')).toBeVisible();
  await expect.poll(() => game(owner, 'g.music[0].listeners.length')).toBe(2);
  const a = await game(owner, '({ v: g.music[0].queue[g.music[0].index].videoId, p: g.music[0].position, u: g.music[0].updatedAt, playing: g.music[0].playing })');
  const b = await game(emp, '({ v: g.music[0].queue[g.music[0].index].videoId, p: g.music[0].position, u: g.music[0].updatedAt, playing: g.music[0].playing })');
  expect(a).toEqual(b);
  expect(a.v).toBe('jfKfPfyJRdk');
  await send(owner, 'music:control', { id, action: 'close' });
  await expect.poll(() => game(emp, 'g.music.length')).toBe(0);
});

test('Mapmaker: publicar uma mudança atualiza o mapa de quem está online', async () => {
  const rev = await game<number>(emp, 'g.mapRev');
  const spawn = await game<{ x: number; y: number }>(owner, 'g.map.spawns[0]');
  await owner.goto(`/o/${slug}?mapmaker=1`);
  await online(owner);
  await expect(owner.getByTestId('mapmaker')).toBeVisible();
  await owner.getByTestId('obj-rug').click();
  await owner.getByTestId('mm-canvas').click({ position: { x: spawn.x * 32 + 16, y: spawn.y * 32 + 16 } });
  await owner.getByTestId('mm-publish').click();
  await expect(owner.getByText('Mapa publicado.')).toBeVisible();
  await expect.poll(() => game<number>(emp, 'g.mapRev')).toBeGreaterThan(rev);
  await expect.poll(() => game(emp, `g.map.objects.some((o) => o.type === 'rug' && o.x === ${spawn.x} && o.y === ${spawn.y})`)).toBe(true);
});

test('revogar o link desconecta o convidado na hora', async () => {
  await api(owner, 'post', `/api/offices/${officeId}/invites/${guestInviteId}/revoke`);
  await expect(guest.getByTestId('office-blocked')).toBeVisible();
  await expect.poll(() => game(emp, 'Object.keys(g.players).length')).toBe(2);
});

test('expansão: aprovar cria uma ala nova sem mexer no que existe', async () => {
  const before = await api(owner, 'get', `/api/offices/${officeId}/admin`);
  const mapBefore = await game<{ width: number; floor: number[] }>(emp, '({ width: g.map.width, floor: g.map.layers.floor })');
  await owner.goto('/admin/escritorios');
  await owner.getByTestId('exp-extra').fill('12');
  await owner.getByTestId('exp-preview').click();
  await expect(owner.getByTestId('map-preview')).toBeVisible();
  await owner.getByTestId('exp-approve').click();
  await expect(owner.getByText('Nova ala criada.')).toBeVisible();
  const after = await api(owner, 'get', `/api/offices/${officeId}/admin`);
  expect(after.expansion.capacity).toBeGreaterThanOrEqual(before.expansion.capacity + 12);

  // quem está online recebe o mapa novo, e a parte antiga continua idêntica
  // (só a parede leste, por onde passa o corredor da nova ala, muda)
  await expect.poll(() => game<number>(emp, 'g.map.width')).toBeGreaterThan(mapBefore.width);
  const same = await game<boolean>(emp, `(() => { const old = ${JSON.stringify(mapBefore.floor)}; const w0 = ${mapBefore.width}; const m = g.map; for (let i = 0; i < old.length; i++) { const x = i % w0; const y = (i / w0) | 0; if (x < w0 - 1 && m.layers.floor[y * m.width + x] !== old[i]) return false; } return true; })()`);
  expect(same).toBe(true);
});

test('painel do ADM mostra horas, status e calls de todos, inclusive do Dono', async () => {
  await owner.goto('/admin/painel');
  const table = owner.getByTestId('analytics-table');
  await expect(table).toContainText('Ana Lima');
  await expect(table).toContainText('Marcelo');
  await expect(table).toContainText('Visitante');
  const data = await api(owner, 'get', `/api/offices/${officeId}/analytics`);
  const ana = data.rows.find((r: any) => r.name === 'Ana Lima');
  expect(ana.onlineMs).toBeGreaterThan(0);
  expect(ana.status.BUSY + ana.status.DND).toBeGreaterThan(0);
  expect(ana.callMs).toBeGreaterThan(0); // esteve na sala de reunião com o Dono
  expect(ana.callWith.some((c: any) => c.name === 'Marcelo')).toBe(true);
  // funcionário não acessa o painel
  const denied = await emp.request.get(`/api/offices/${officeId}/analytics`);
  expect(denied.status()).toBe(403);
});

test('“Atualizar todos agora” avisa quem está conectado', async () => {
  const r = await api(owner, 'post', '/api/admin/update/clients');
  expect(r.online).toBeGreaterThanOrEqual(1);
  await expect(emp.getByTestId('force-update')).toBeVisible();
});
