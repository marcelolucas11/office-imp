import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { areaCenter, mapDesks, type AvView, type MapArea, type OfficeMap } from '@office-imp/shared';
import { config } from '../src/config';
import { totpCode } from '../src/lib/crypto';
import { setMailTestMode, testOutbox } from '../src/lib/mailer';
import { hub } from '../src/realtime/hub';
import { recorder } from '../src/services/meetings';
import { transcriber } from '../src/services/transcribe';
import { resetLoginLimiter } from '../src/routes/auth';
import { Http, Rt, sleep, startTestServer, type TestServer } from './helpers';

let srv: TestServer;
const owner = { http: null as unknown as Http, totp: '' };
const admin = { http: null as unknown as Http, totp: '', id: '' };
const ana = { http: null as unknown as Http, id: '' };
const bia = { http: null as unknown as Http, id: '' };
let officeId = '';
let slug = '';
let map: OfficeMap;
let meetingArea: MapArea;
let employeeInvite = '';

beforeAll(async () => {
  srv = await startTestServer();
  setMailTestMode(true);
});
afterAll(async () => {
  await srv.close();
});

describe('configuração inicial e contas', () => {
  it('cria os dois Donos uma única vez', async () => {
    const h = new Http(srv.url);
    expect((await h.get('/api/version')).json.needsSetup).toBe(true);
    const owners = [
      { username: 'marcelo', displayName: 'Marcelo', password: 'senha-forte-1' },
      { username: 'socio', displayName: 'Sócio', password: 'senha-forte-2' },
    ];
    expect((await h.post('/api/setup', { token: 'errado', owners })).status).toBe(403);
    expect((await h.post('/api/setup', { token: 'token-de-teste', owners })).status).toBe(200);
    expect((await new Http(srv.url).post('/api/setup', { token: 'token-de-teste', owners })).status).toBe(409);
    expect((await h.get('/api/version')).json.needsSetup).toBe(false);
  });

  it('Dono fica restrito até configurar o 2FA; depois o login exige o código', async () => {
    const h = new Http(srv.url);
    expect((await h.post('/api/auth/login', { username: 'marcelo', password: 'senha-forte-1' })).status).toBe(200);
    const me = (await h.get('/api/auth/me')).json;
    expect(me.role).toBe('OWNER');
    expect(me.mustSetupTotp).toBe(true);
    expect((await h.get('/api/offices')).status).toBe(403);
    const begin = (await h.post('/api/auth/totp/begin')).json;
    expect((await h.post('/api/auth/totp/enable', { code: '000000' })).status).toBe(400);
    const enabled = await h.post('/api/auth/totp/enable', { code: totpCode(begin.secret) });
    expect(enabled.json.recoveryCodes).toHaveLength(10);
    expect((await h.get('/api/offices')).status).toBe(200);

    const h2 = new Http(srv.url);
    expect((await h2.post('/api/auth/login', { username: 'marcelo', password: 'senha-forte-1' })).json.needTotp).toBe(true);
    expect((await h2.post('/api/auth/login', { username: 'marcelo', password: 'senha-forte-1', code: '123456' })).status).toBe(401);
    // código de recuperação funciona uma única vez
    const rc = enabled.json.recoveryCodes[0];
    expect((await h2.post('/api/auth/login', { username: 'marcelo', password: 'senha-forte-1', code: rc })).status).toBe(200);
    expect((await new Http(srv.url).post('/api/auth/login', { username: 'marcelo', password: 'senha-forte-1', code: rc })).status).toBe(401);
    owner.http = h;
    owner.totp = begin.secret;
  });

  it('limita tentativas de login (5 falhas em 15 min)', async () => {
    const h = new Http(srv.url);
    for (let i = 0; i < 5; i++) expect((await h.post('/api/auth/login', { username: 'socio', password: 'errada' })).status).toBe(401);
    expect((await h.post('/api/auth/login', { username: 'socio', password: 'senha-forte-2' })).status).toBe(429);
    resetLoginLimiter();
  });

  it('Dono cria escritório pelo assistente', async () => {
    const input = { name: 'Impera Services', size: 'small', partners: 2, partnersShareRoom: true };
    const preview = await owner.http.post('/api/offices/preview', input);
    expect(preview.status).toBe(200);
    expect(preview.json.desks).toBe(14);
    const created = await owner.http.post('/api/offices', input);
    expect(created.status).toBe(200);
    officeId = created.json.id;
    slug = created.json.slug;
    expect(slug).toBe('impera-services');
    const list = (await owner.http.get('/api/offices')).json;
    expect(list[0].deskCapacity).toBe(14);
  });

  it('hierarquia: Dono cria Admin; Admin só cria Funcionário nos escritórios dele', async () => {
    expect((await owner.http.post('/api/users', { username: 'gestora', displayName: 'Gestora', password: 'temporaria-1', role: 'ADMIN', officeIds: [officeId] })).status).toBe(200);
    const h = new Http(srv.url);
    const res = await h.login('gestora', 'temporaria-1');
    admin.http = h;
    admin.totp = res.totpSecret!;
    admin.id = (await h.get('/api/auth/me')).json.id;

    expect((await h.post('/api/users', { username: 'outroadmin', displayName: 'X', password: 'temporaria-1', role: 'ADMIN', officeIds: [officeId] })).status).toBe(403);
    expect((await h.post('/api/users', { username: 'solto', displayName: 'X', password: 'temporaria-1', role: 'EMPLOYEE', officeIds: ['outro-escritorio'] })).status).toBe(403);
    const a = await h.post('/api/users', { username: 'ana', displayName: 'Ana', password: 'temporaria-1', role: 'EMPLOYEE', officeIds: [officeId] });
    const b = await h.post('/api/users', { username: 'bia', displayName: 'Bia', password: 'temporaria-1', role: 'EMPLOYEE', officeIds: [officeId] });
    expect(a.status).toBe(200);
    ana.id = a.json.id;
    bia.id = b.json.id;
    expect((await h.post('/api/users', { username: 'ana', displayName: 'Ana 2', password: 'temporaria-1', role: 'EMPLOYEE', officeIds: [officeId] })).status).toBe(409);
    // Admin não gerencia o Dono nem exclui escritório
    const users = (await h.get('/api/users')).json;
    expect(users.find((u: any) => u.username === 'marcelo')).toBeUndefined();
    expect((await h.del(`/api/offices/${officeId}`)).status).toBe(403);
    expect((await h.post('/api/admin/update/server')).status).toBe(403);
  });

  it('funcionário troca a senha no primeiro login e não acessa nada de admin', async () => {
    const h = new Http(srv.url);
    await h.post('/api/auth/login', { username: 'ana', password: 'temporaria-1' });
    expect((await h.get('/api/auth/me')).json.mustChangePassword).toBe(true);
    expect((await h.get('/api/offices')).status).toBe(403);
    expect((await h.post('/api/auth/change-password', { current: 'temporaria-1', next: 'minha-senha-nova' })).status).toBe(200);
    const me = (await h.get('/api/auth/me')).json;
    expect(me.mustChangePassword).toBe(false);
    expect(me.mustSetupTotp).toBe(false);
    expect(me.monitoringAccepted).toBe(false);
    expect((await h.post('/api/auth/accept-monitoring')).status).toBe(200);
    expect((await h.get('/api/auth/me')).json.monitoringAccepted).toBe(true);
    for (const p of ['/api/users', `/api/offices/${officeId}/analytics`, `/api/offices/${officeId}/invites`, '/api/audit', '/api/admin/settings', `/api/offices/${officeId}/meetings`]) {
      expect((await h.get(p)).status, p).toBe(403);
    }
    expect((await h.post('/api/offices', { name: 'Meu', size: 'small', partners: 0, partnersShareRoom: true })).status).toBe(403);
    ana.http = h;
    const hb = new Http(srv.url);
    await hb.login('bia', 'temporaria-1');
    bia.http = hb;
  });
});

describe('convites', () => {
  it('funcionário só entra depois de abrir o link de convite', async () => {
    const denied = await ana.http.post(`/api/offices/${slug}/enter`);
    expect(denied.status).toBe(403);
    expect(denied.json.error).toBe('invite_required');
    const inv = await admin.http.post(`/api/offices/${officeId}/invites`, { kind: 'EMPLOYEE' });
    expect(inv.status).toBe(200);
    employeeInvite = inv.json.token;
    expect(inv.json.url).toContain('/convite/');
    const info = await new Http(srv.url).get(`/api/invites/${employeeInvite}`);
    expect(info.json).toMatchObject({ kind: 'EMPLOYEE', state: 'active', office: { slug } });
    expect((await ana.http.post(`/api/invites/${employeeInvite}/accept`)).json.slug).toBe(slug);
    expect((await bia.http.post(`/api/invites/${employeeInvite}/accept`)).status).toBe(200);
    const ok = await ana.http.post(`/api/offices/${slug}/enter`);
    expect(ok.status).toBe(200);
    map = ok.json.map;
    meetingArea = map.areas.find((a) => a.meeting && !a.partners)!;
    expect(ok.json.ticket).toBeTruthy();
    // o banco guarda só o hash do token
    const list = (await admin.http.get(`/api/offices/${officeId}/invites`)).json;
    expect(JSON.stringify(list)).not.toContain(employeeInvite);
    expect(list[0].uses).toBe(2);
  });

  it('convidado entra só com o nome; link expirado, esgotado ou revogado não funciona', async () => {
    const past = await admin.http.post(`/api/offices/${officeId}/invites`, { kind: 'GUEST', expiresAt: Date.now() - 1000 });
    expect(past.status).toBe(400);
    const one = (await admin.http.post(`/api/offices/${officeId}/invites`, { kind: 'GUEST', maxUses: 1, label: 'Cliente X' })).json;
    const g1 = new Http(srv.url);
    expect((await g1.post(`/api/invites/${one.token}/guest`, { displayName: 'Visitante' })).status).toBe(400); // sem aceitar o aviso
    expect((await g1.post(`/api/invites/${one.token}/guest`, { displayName: 'Visitante', acceptNotice: true })).status).toBe(200);
    expect((await g1.get('/api/auth/me')).json).toMatchObject({ kind: 'guest', role: 'GUEST', name: 'Visitante' });
    expect((await g1.post(`/api/offices/${slug}/enter`)).status).toBe(200);
    expect((await g1.get('/api/users')).status).toBe(403);
    expect((await new Http(srv.url).post(`/api/invites/${one.token}/guest`, { displayName: 'Outro', acceptNotice: true })).status).toBe(403);

    // convidado online é derrubado na hora quando o link é revogado
    const rt = await Rt.join(srv.url, g1, slug);
    expect((await admin.http.post(`/api/offices/${officeId}/invites/${one.id}/revoke`)).status).toBe(200);
    expect((await rt.next('kick')).reason).toBe('invite_revoked');
    expect((await g1.get('/api/auth/me')).status).toBe(401);

    // link com prazo: expira sozinho
    const short = (await admin.http.post(`/api/offices/${officeId}/invites`, { kind: 'GUEST', expiresAt: Date.now() + 700 })).json;
    const g2 = new Http(srv.url);
    expect((await g2.post(`/api/invites/${short.token}/guest`, { displayName: 'Rápido', acceptNotice: true })).status).toBe(200);
    await sleep(900);
    expect((await g2.get('/api/auth/me')).status).toBe(401);
    expect((await new Http(srv.url).get(`/api/invites/${short.token}`)).json.state).toBe('expired');
  });
});

describe('tempo real', () => {
  let a: Rt;
  let b: Rt;
  const openSpot = () => {
    const g = map.meta!.gen!;
    return { x: 6, y: g.corridorY + 1 };
  };

  it('dois funcionários entram e se veem', async () => {
    a = await Rt.join(srv.url, ana.http, slug);
    b = await Rt.join(srv.url, bia.http, slug);
    const joined = await a.next('join');
    expect(joined.name).toBe('Bia');
    expect(hub.onlineCount(officeId)).toBe(2);
  });

  it('servidor valida o movimento: passo livre aceito, parede e salto recusados', async () => {
    const spot = openSpot();
    a.send('teleport', spot);
    const tp = await a.next('tp', (d) => d.id === ana.id);
    expect(tp).toMatchObject(spot);
    a.send('step', { x: spot.x + 1, y: spot.y });
    const moves = await b.next('moves', (d) => d.some((m: any) => m[0] === ana.id));
    expect(moves.find((m: any) => m[0] === ana.id).slice(1, 3)).toEqual([spot.x + 1, spot.y]);
    // salto de 5 tiles
    a.send('step', { x: spot.x + 6, y: spot.y });
    expect(await a.next('correct')).toEqual({ x: spot.x + 1, y: spot.y });
    // parede: sobe até a parede do corredor
    a.send('step', { x: spot.x + 1, y: spot.y - 1 });
    await sleep(150);
    a.send('step', { x: spot.x + 1, y: spot.y - 2 });
    const wallIsThere = map.layers.walls[(spot.y - 2) * map.width + spot.x + 1] !== 0;
    if (wallIsThere) expect(await a.next('correct')).toEqual({ x: spot.x + 1, y: spot.y - 1 });
  });

  it('proximidade conecta de perto e desconecta de longe', async () => {
    const spot = openSpot();
    a.send('teleport', spot);
    b.send('teleport', { x: spot.x + 2, y: spot.y });
    const av = await a.next<AvView>('av', (d) => d.peers.length === 1);
    expect(av.room).toBe('open');
    expect(av.peers[0].id).toBe(bia.id);
    b.send('teleport', { x: spot.x + 18, y: spot.y });
    const far = await a.next<AvView>('av', (d) => d.peers.length === 0);
    expect(far.peers).toEqual([]);
    b.send('teleport', { x: spot.x + 2, y: spot.y });
    await a.next('av', (d) => d.peers.length === 1);
  });

  it('"Não incomodar" bloqueia a conexão e o token do LiveKit', async () => {
    a.send('status', { status: 'DND' });
    const av = await a.next<AvView>('av', (d) => d.room === 'none');
    expect(av.peers).toEqual([]);
    await b.next('av', (d) => d.peers.length === 0);
    expect((await ana.http.post('/api/livekit/token', { officeId, room: 'open' })).status).toBe(403);
    b.send('wave', { to: ana.id });
    expect((await b.next('notice')).code).toBe('wave_dnd');
    a.send('status', { status: 'BUSY' });
    await a.next('av', (d) => d.peers.length === 1);
    expect((await ana.http.post('/api/livekit/token', { officeId, room: 'open' })).json.token).toBeTruthy();
    a.send('status', { status: 'AVAILABLE' });
  });

  it('sala privada isola: token só para quem o servidor vê dentro da área', async () => {
    const c = areaCenter(meetingArea);
    expect((await ana.http.post('/api/livekit/token', { officeId, room: meetingArea.id })).status).toBe(403);
    a.send('teleport', { x: meetingArea.rects[0].x, y: meetingArea.rects[0].y + meetingArea.rects[0].h - 1 });
    const av = await a.next<AvView>('av', (d) => d.room === meetingArea.id);
    expect(av.peers).toEqual([]);
    expect((await b.next<AvView>('av', (d) => d.peers.length === 0)).room).toBe('open');
    expect((await ana.http.post('/api/livekit/token', { officeId, room: meetingArea.id })).status).toBe(200);
    expect((await bia.http.post('/api/livekit/token', { officeId, room: meetingArea.id })).status).toBe(403);
    expect((await ana.http.post('/api/livekit/token', { officeId, room: 'open' })).status).toBe(403);
    expect((await ana.http.post('/api/livekit/token', { officeId, room: 'open', aux: true })).status).toBe(200);
    b.send('teleport', { x: c.x + 3, y: meetingArea.rects[0].y + meetingArea.rects[0].h - 1 });
    const both = await a.next<AvView>('av', (d) => d.peers.length === 1);
    expect(both.peers[0]).toEqual({ id: bia.id, d: 0 });
  });

  it('convidado não entra em área "Somente equipe"', async () => {
    const inv = (await admin.http.post(`/api/offices/${officeId}/invites`, { kind: 'GUEST' })).json;
    const g = new Http(srv.url);
    await g.post(`/api/invites/${inv.token}/guest`, { displayName: 'Cliente', acceptNotice: true });
    const rt = await Rt.join(srv.url, g, slug);
    const partners = map.areas.find((x) => x.partners)!;
    const before = hub.room(officeId)!.players.get((await g.get('/api/auth/me')).json.id)!.state;
    const start = { x: before.x, y: before.y };
    rt.send('teleport', areaCenter(partners));
    await sleep(200);
    const after = hub.room(officeId)!.players.get(before.id)!.state;
    expect(after.areaId).toBeNull();
    expect(Math.abs(after.x - start.x) + Math.abs(after.y - start.y)).toBeGreaterThanOrEqual(0);
    // convidado também não vira DJ nem reivindica mesa
    rt.send('music:open', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    rt.send('desk:claim', { deskId: mapDesks(map)[0].id });
    await sleep(200);
    expect(hub.room(officeId)!.music.size).toBe(0);
    expect((await g.get(`/api/offices/${officeId}/desks`)).json.every((d: any) => d.userId === null)).toBe(true);
    await rt.leave();
  });

  it('chat: todos, perto e direto', async () => {
    a.clear();
    b.clear();
    a.send('chat', { scope: 'all', text: 'Bom dia, pessoal!' });
    expect((await b.next('chat')).text).toBe('Bom dia, pessoal!');
    a.send('chat', { scope: 'dm', to: bia.id, text: 'só pra você' });
    expect(await b.next('chat', (d) => d.scope === 'dm')).toMatchObject({ fromName: 'Ana', toId: bia.id });
    a.send('chat', { scope: 'near', text: 'quem está na sala' });
    expect((await b.next('chat', (d) => d.scope === 'near')).text).toBe('quem está na sala');
    await sleep(100);
    const hist = (await bia.http.get(`/api/offices/${officeId}/chat`)).json;
    expect(hist.map((m: any) => m.text)).toEqual(['Bom dia, pessoal!', 'só pra você', 'quem está na sala']);
    const ownerHist = (await owner.http.get(`/api/offices/${officeId}/chat`)).json;
    expect(ownerHist.map((m: any) => m.text)).toEqual(['Bom dia, pessoal!']);
  });

  it('mesas: reivindicar, deixar nota e decorar a própria mesa', async () => {
    const desk = mapDesks(map).find((d) => !d.props?.partner)!;
    a.send('desk:claim', { deskId: desk.id });
    const desks = await b.next('desks', (d) => d.some((x: any) => x.userId === ana.id));
    expect(desks.find((x: any) => x.id === desk.id)).toMatchObject({ userName: 'Ana', online: true });
    b.send('desk:claim', { deskId: desk.id });
    expect((await b.next('notice', (d) => d.code === 'desk_taken')).code).toBe('desk_taken');
    b.send('desk:item', { deskId: desk.id, kind: 'gift', content: 'Parabéns pelo fechamento!', emoji: '🎂' });
    expect(await a.next('deskitem')).toMatchObject({ kind: 'gift', authorName: 'Bia', emoji: '🎂' });
    // decoração: só dentro da zona da própria mesa
    a.send('decor:add', { type: 'plant_small', x: desk.x, y: desk.y });
    const patch = await b.next('map:patch');
    expect(patch.add[0]).toMatchObject({ type: 'plant_small', ownerDeskId: desk.id });
    a.send('decor:add', { type: 'plant_small', x: desk.x + 9, y: desk.y });
    expect((await a.next('notice', (d) => d.code === 'decor_invalid')).code).toBe('decor_invalid');
    b.send('decor:remove', { id: patch.add[0].id });
    await sleep(150);
    expect(hub.room(officeId)!.map.objects.some((o) => o.id === patch.add[0].id)).toBe(true);
  });

  it('rádio: abrir, entrar, fila, controles e troca de DJ', async () => {
    a.send('music:open', { url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', name: 'Lo-fi' });
    let chs = await b.next('music', (d) => d.length === 1);
    expect(chs[0]).toMatchObject({ name: 'Lo-fi', djName: 'Ana', playing: true, index: 0 });
    b.send('music:join', { id: chs[0].id });
    chs = await a.next('music', (d) => d[0]?.listeners.length === 2);
    b.send('music:add', { id: chs[0].id, url: 'https://youtu.be/9bZkp7q19f0' });
    chs = await a.next('music', (d) => d[0]?.queue.length === 2);
    b.send('music:control', { id: chs[0].id, action: 'pause' }); // não é DJ: ignorado
    a.send('music:control', { id: chs[0].id, action: 'lock' });
    chs = await b.next('music', (d) => d[0]?.locked === true);
    expect(chs[0].playing).toBe(true);
    b.send('music:add', { id: chs[0].id, url: 'https://youtu.be/kJQP7kiw5Fk' });
    expect((await b.next('notice', (d) => d.code === 'music_locked')).code).toBe('music_locked');
    a.send('music:control', { id: chs[0].id, action: 'next' });
    chs = await b.next('music', (d) => d[0]?.index === 1);
    a.send('music:leave');
    chs = await b.next('music', (d) => d[0]?.djId === bia.id);
    expect(chs[0].djName).toBe('Bia');
    b.send('music:control', { id: chs[0].id, action: 'close' });
    await a.next('music', (d) => d.length === 0);
  });

  it('notas de reunião: grava, transcreve por falante, envia e-mail e guarda cópia', async () => {
    await admin.http.patch(`/api/offices/${officeId}`, { settings: { notesRecipients: ['diretoria@example.com'] } });
    const dir = path.join(config.meetingsDir);
    const started: string[] = [];
    recorder.listAudioTracks = async () => [
      { identity: ana.id, name: 'Ana', trackSid: 'TR_ana' },
      { identity: bia.id, name: 'Bia', trackSid: 'TR_bia' },
    ];
    recorder.start = async (_room, trackSid, filepath) => {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      fs.writeFileSync(filepath, 'audio-falso');
      started.push(trackSid);
      return `EG_${trackSid}`;
    };
    recorder.stop = async () => {};
    recorder.startTimes = async () => new Map();
    transcriber.transcribeFile = async (file) =>
      file.includes('TR_ana')
        ? [
            { start: 1, end: 3, text: 'Vamos fechar a campanha hoje.' },
            { start: 12, end: 14, text: 'Eu subo os criativos.' },
          ]
        : [{ start: 6, end: 9, text: 'Fechado, eu reviso o orçamento.' }];

    // fora da sala não pode iniciar
    expect((await owner.http.post('/api/meetings/start', { officeId, areaId: meetingArea.id })).status).toBe(403);
    const st = await ana.http.post('/api/meetings/start', { officeId, areaId: meetingArea.id });
    expect(st.status).toBe(200);
    expect(await b.next('rec')).toMatchObject({ areaId: meetingArea.id, active: true });
    expect((await bia.http.post('/api/meetings/start', { officeId, areaId: meetingArea.id })).status).toBe(409);
    await sleep(300);
    expect(started.sort()).toEqual(['TR_ana', 'TR_bia']);
    expect((await bia.http.post('/api/meetings/stop', { officeId, areaId: meetingArea.id })).status).toBe(200);
    expect(await a.next('rec', (d) => d.active === false)).toMatchObject({ areaId: meetingArea.id });

    let detail: any;
    for (let i = 0; i < 40; i++) {
      detail = (await admin.http.get(`/api/meetings/${st.json.meetingId}`)).json;
      if (detail.meeting.status === 'done') break;
      await sleep(100);
    }
    expect(detail.meeting.status).toBe('done');
    const t: string = detail.note.transcript;
    expect(t).toContain('Sala de Reunião 1');
    expect(t).toContain('Participantes:** Ana, Bia');
    expect(t.indexOf('Ana: Vamos fechar')).toBeLessThan(t.indexOf('Bia: Fechado'));
    expect(t.indexOf('Bia: Fechado')).toBeLessThan(t.indexOf('Ana: Eu subo'));
    expect(detail.note.sentTo).toEqual(['diretoria@example.com']);
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0].subject).toContain('Notas da reunião — Sala de Reunião 1');
    expect(testOutbox[0].attachments?.[0].filename).toMatch(/\.md$/);
    // painel do ADM: lista, busca no texto, áudio e download; funcionário não vê
    expect((await admin.http.get(`/api/offices/${officeId}/meetings?q=criativos`)).json).toHaveLength(1);
    expect((await admin.http.get(`/api/offices/${officeId}/meetings?q=inexistente`)).json).toHaveLength(0);
    expect((await admin.http.get(`/api/meetings/${st.json.meetingId}/audio/${detail.tracks[0].id}`)).text).toBe('audio-falso');
    expect((await admin.http.get(`/api/meetings/${st.json.meetingId}/transcript`)).text).toContain('## Transcrição');
    expect((await ana.http.get(`/api/meetings/${st.json.meetingId}`)).status).toBe(403);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('analytics: horas online, status e chamadas por pessoa (inclui admins)', async () => {
    const adm = await Rt.join(srv.url, admin.http, slug);
    await sleep(250);
    const data = (await admin.http.get(`/api/offices/${officeId}/analytics`)).json;
    const row = (name: string) => data.rows.find((r: any) => r.name === name);
    expect(row('Ana').onlineMs).toBeGreaterThan(500);
    expect(row('Ana').status.DND).toBeGreaterThan(0);
    expect(row('Ana').status.BUSY).toBeGreaterThan(0);
    expect(row('Ana').callMs).toBeGreaterThan(0);
    expect(row('Ana').callWith[0].name).toBe('Bia');
    expect(row('Ana').callAreas.map((c: any) => c.name)).toContain('Sala de Reunião 1');
    expect(row('Ana').current).toMatchObject({ status: 'AVAILABLE', area: 'Sala de Reunião 1', inCall: true });
    expect(row('Gestora')).toBeTruthy();
    const csv = await admin.http.get(`/api/offices/${officeId}/analytics.csv`);
    expect(csv.text).toContain('Pessoa;Papel;Online');
    expect(csv.text).toContain('Ana;EMPLOYEE');
    const tl = (await admin.http.get(`/api/offices/${officeId}/analytics/person/${ana.id}`)).json;
    expect(tl.statuses.map((s: any) => s.status)).toEqual(expect.arrayContaining(['AVAILABLE', 'DND', 'BUSY']));
    expect(tl.calls[0].with).toBe('Bia');
    // ausência conta como inativo
    a.send('away', { away: true });
    await sleep(200);
    const again = (await admin.http.get(`/api/offices/${officeId}/analytics`)).json;
    expect(again.rows.find((r: any) => r.name === 'Ana').status.AWAY).toBeGreaterThan(0);
    await adm.leave();
  });

  it('Mapmaker: mapa inválido é recusado; publicar recarrega todos; versões e restauração', async () => {
    const cur = (await admin.http.get(`/api/offices/${officeId}/map`)).json;
    const broken = JSON.parse(JSON.stringify(cur.map));
    broken.spawns = [];
    expect((await admin.http.post(`/api/offices/${officeId}/map`, { map: broken })).status).toBe(400);
    expect((await ana.http.post(`/api/offices/${officeId}/map`, { map: cur.map })).status).toBe(403);
    const edited = JSON.parse(JSON.stringify(cur.map));
    edited.objects.push({ id: 'obj_tv_extra', type: 'tv', x: 2, y: map.meta!.gen!.corridorY + 1, props: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });
    const pub = await admin.http.post(`/api/offices/${officeId}/map`, { map: edited, note: 'TV no corredor' });
    expect(pub.status).toBe(200);
    const msg = await a.next('map');
    expect(msg.map.objects.some((o: any) => o.id === 'obj_tv_extra')).toBe(true);
    const versions = (await admin.http.get(`/api/offices/${officeId}/map/versions`)).json;
    expect(versions[0]).toMatchObject({ note: 'TV no corredor', published: true, authorName: 'Gestora' });
    expect(versions.length).toBe(2);
    const restore = await admin.http.post(`/api/offices/${officeId}/map/versions/${versions[1].id}/restore`);
    expect(restore.status).toBe(200);
    expect((await a.next('map')).map.objects.some((o: any) => o.id === 'obj_tv_extra')).toBe(false);
    expect((await admin.http.get(`/api/offices/${officeId}/map/tiled`)).json.tilewidth).toBe(32);
  });

  it('expansão: sugerida por planejamento, só acontece com aprovação e mantém as mesas', async () => {
    let st = (await admin.http.get(`/api/offices/${officeId}/expansion`)).json;
    expect(st).toMatchObject({ capacity: 14, used: 1, suggested: false });
    await admin.http.patch(`/api/offices/${officeId}`, { plannedHeadcount: 20 });
    st = (await admin.http.get(`/api/offices/${officeId}/expansion`)).json;
    expect(st).toMatchObject({ suggested: true, reason: 'planned', extra: 6 });
    const prev = (await admin.http.post(`/api/offices/${officeId}/expansion/preview`, { extra: st.extra })).json;
    expect(prev.addedDesks).toBe(6);
    expect((await admin.http.get(`/api/offices/${officeId}/expansion`)).json.capacity).toBe(14); // pré-visualizar não muda nada
    expect((await ana.http.post(`/api/offices/${officeId}/expansion/approve`, { extra: 6 })).status).toBe(403);
    const ok = await admin.http.post(`/api/offices/${officeId}/expansion/approve`, { extra: st.extra });
    expect(ok.json.addedDesks).toBe(6);
    const msg = await a.next('map');
    expect(msg.map.width).toBeGreaterThan(map.width);
    st = (await admin.http.get(`/api/offices/${officeId}/expansion`)).json;
    expect(st).toMatchObject({ capacity: 20, used: 1, suggested: false });
    const manual = await admin.http.post(`/api/offices/${officeId}/expansion/approve`, { extra: 6, mode: 'manual' });
    expect(manual.json.addedDesks).toBe(0);
    await a.next('map');
  });

  it('remover funcionário libera a mesa, guarda a decoração e derruba a sessão', async () => {
    const desksBefore = (await admin.http.get(`/api/offices/${officeId}/desks`)).json;
    expect(desksBefore.filter((d: any) => d.userId === ana.id)).toHaveLength(1);
    expect((await admin.http.del(`/api/users/${ana.id}`)).status).toBe(200);
    expect((await a.next('kick')).reason).toBe('removed');
    const desksAfter = (await admin.http.get(`/api/offices/${officeId}/desks`)).json;
    expect(desksAfter.length).toBe(desksBefore.length);
    expect(desksAfter.every((d: any) => d.userId !== ana.id)).toBe(true);
    const lost = (await admin.http.get(`/api/offices/${officeId}/lost-found`)).json;
    expect(lost[0]).toMatchObject({ formerOwner: 'Ana' });
    expect(lost[0].items[0].type).toBe('plant_small');
    expect((await ana.http.get('/api/auth/me')).status).toBe(401);
    expect((await admin.http.del(`/api/users/${admin.id}`)).status).toBe(400);
  });

  it('atualizações e auditoria', async () => {
    expect((await admin.http.patch('/api/admin/settings/global', { autoUpdateOnOpen: false })).json.autoUpdateOnOpen).toBe(false);
    expect((await new Http(srv.url).get('/api/version')).json.autoUpdateOnOpen).toBe(false);
    expect((await admin.http.patch('/api/admin/settings/global', { autoUpdateServer: true })).status).toBe(403);
    b.clear();
    expect((await admin.http.post('/api/admin/update/clients')).json).toMatchObject({ ok: true, seconds: 30 });
    expect((await b.next('forceUpdate')).seconds).toBe(30);
    const log = (await owner.http.get('/api/audit')).json.map((l: any) => l.action);
    for (const action of ['setup.owners', 'office.create', 'user.create', 'invite.create', 'invite.revoke', 'map.publish', 'office.expand', 'user.delete', 'clients.force_update']) {
      expect(log, action).toContain(action);
    }
    // SMTP: a senha nunca volta para o cliente
    await owner.http.put('/api/admin/settings/smtp', { host: 'smtp.exemplo.com', port: 587, secure: false, user: 'u', pass: 'segredo-smtp', from: 'Office <no-reply@exemplo.com>' });
    const s = (await owner.http.get('/api/admin/settings')).json;
    expect(s.smtp.pass).toBe('********');
    expect(JSON.stringify(s)).not.toContain('segredo-smtp');
    await b.leave();
  });

  it('Dono exclui o escritório', async () => {
    expect((await owner.http.del(`/api/offices/${officeId}`)).status).toBe(200);
    expect((await owner.http.get('/api/offices')).json).toEqual([]);
  });
});
