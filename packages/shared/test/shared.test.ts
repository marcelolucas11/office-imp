import { describe, expect, it } from 'vitest';
import {
  aggregateAnalytics,
  avEdges,
  can,
  canAssignRole,
  canManageUser,
  canAdminOffice,
  computeAv,
  dayRange,
  dayStart,
  findPath,
  localDate,
  musicPosition,
  parseYouTubeUrl,
  requiresTwoFactor,
  tilesToRects,
  unionMs,
  volumeForDistance,
  type Actor,
  type ProxPlayer,
} from '../src';

describe('permissões', () => {
  const owner: Actor = { id: 'o', role: 'OWNER', officeIds: [] };
  const admin: Actor = { id: 'a', role: 'ADMIN', officeIds: ['of1'] };
  const emp: Actor = { id: 'e', role: 'EMPLOYEE', officeIds: ['of1'] };
  it('matriz básica', () => {
    expect(can('OWNER', 'office.delete')).toBe(true);
    expect(can('ADMIN', 'office.delete')).toBe(false);
    expect(can('ADMIN', 'office.create')).toBe(true);
    expect(can('EMPLOYEE', 'office.create')).toBe(false);
    expect(can('ADMIN', 'server.update')).toBe(false);
    expect(can('OWNER', 'server.update')).toBe(true);
    expect(can('ADMIN', 'clients.update')).toBe(true);
    expect(can('EMPLOYEE', 'spotlight.use')).toBe(false);
    expect(can('GUEST', 'office.basic')).toBe(true);
    expect(can('GUEST', 'music.dj')).toBe(false);
    expect(can('EMPLOYEE', 'music.dj')).toBe(true);
    expect(can('GUEST', 'area.staffOnly')).toBe(false);
    expect(can('GUEST', 'build.ownDesk')).toBe(false);
    expect(can('EMPLOYEE', 'analytics.view')).toBe(false);
    expect(can('ADMIN', 'user.promote')).toBe(false);
    expect(can(null, 'office.basic')).toBe(false);
  });
  it('gestão de usuários', () => {
    expect(canManageUser(owner, { id: 'x', role: 'ADMIN', officeIds: [] })).toBe(true);
    expect(canManageUser(admin, { id: 'x', role: 'EMPLOYEE', officeIds: ['of1'] })).toBe(true);
    expect(canManageUser(admin, { id: 'x', role: 'EMPLOYEE', officeIds: ['of2'] })).toBe(false);
    expect(canManageUser(admin, { id: 'x', role: 'ADMIN', officeIds: ['of1'] })).toBe(false);
    expect(canManageUser(emp, { id: 'x', role: 'EMPLOYEE', officeIds: ['of1'] })).toBe(false);
    expect(canAssignRole(admin, 'ADMIN')).toBe(false);
    expect(canAssignRole(admin, 'EMPLOYEE')).toBe(true);
    expect(canAssignRole(owner, 'OWNER')).toBe(true);
    expect(canAssignRole(owner, 'GUEST')).toBe(false);
    expect(canAdminOffice(admin, 'of2')).toBe(false);
    expect(canAdminOffice(owner, 'of2')).toBe(true);
    expect(requiresTwoFactor('ADMIN')).toBe(true);
    expect(requiresTwoFactor('EMPLOYEE')).toBe(false);
  });
});

describe('proximidade', () => {
  const p = (id: string, x: number, y: number, extra: Partial<ProxPlayer> = {}): ProxPlayer => ({ id, x, y, status: 'AVAILABLE', distance: 5, areaId: null, spotlight: false, ...extra });
  it('conecta quem está perto e desconecta quem está longe', () => {
    const v = computeAv([p('a', 0, 0), p('b', 3, 0), p('c', 20, 0)]);
    expect(v.get('a')!.peers.map((x) => x.id)).toEqual(['b']);
    expect(v.get('c')!.peers).toEqual([]);
    expect(avEdges(v).size).toBe(1);
  });
  it('usa o menor raio entre os dois', () => {
    const v = computeAv([p('a', 0, 0, { distance: 2 }), p('b', 3, 0, { distance: 8 })]);
    expect(v.get('a')!.peers).toEqual([]);
    expect(v.get('b')!.peers).toEqual([]);
  });
  it('área privada isola e ignora distância', () => {
    const v = computeAv([p('a', 0, 0, { areaId: 'r1' }), p('b', 30, 0, { areaId: 'r1' }), p('c', 1, 0), p('d', 0, 1, { areaId: 'r2' })]);
    expect(v.get('a')!.room).toBe('r1');
    expect(v.get('a')!.peers.map((x) => x.id)).toEqual(['b']);
    expect(v.get('c')!.peers).toEqual([]);
    expect(v.get('d')!.peers).toEqual([]);
  });
  it('não incomodar bloqueia qualquer conexão', () => {
    const v = computeAv([p('a', 0, 0, { status: 'DND' }), p('b', 1, 0), p('c', 1, 1, { spotlight: true })]);
    expect(v.get('a')).toEqual({ room: 'none', peers: [], spotlight: [] });
    expect(v.get('b')!.peers.map((x) => x.id)).toEqual(['c']);
  });
  it('spotlight alcança todo mundo', () => {
    const v = computeAv([p('s', 0, 0, { spotlight: true }), p('far', 50, 50), p('room', 9, 9, { areaId: 'r1' })]);
    expect(v.get('far')!.spotlight).toEqual(['s']);
    expect(v.get('room')!.spotlight).toEqual(['s']);
    expect(v.get('s')!.spotlight).toEqual([]);
  });
  it('volume diminui com a distância', () => {
    expect(volumeForDistance(1, 5)).toBe(1);
    expect(volumeForDistance(5, 5)).toBe(0.25);
    expect(volumeForDistance(3, 5)).toBeLessThan(1);
  });
});

describe('utilitários', () => {
  it('pathfinding desvia de paredes', () => {
    const w = 5;
    const grid = new Uint8Array(25);
    grid[1 * w + 1] = 1;
    grid[1 * w + 2] = 1;
    grid[1 * w + 3] = 1;
    const path = findPath(grid, w, 5, { x: 2, y: 0 }, { x: 2, y: 2 })!;
    expect(path.length).toBe(6);
    expect(path[path.length - 1]).toEqual({ x: 2, y: 2 });
    expect(findPath(grid, w, 5, { x: 0, y: 0 }, { x: 2, y: 1 })).toBeNull();
  });
  it('links do YouTube e YouTube Music', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')!.videoId).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ')).toEqual({ videoId: 'dQw4w9WgXcQ', listId: 'RDAMVMdQw4w9WgXcQ' });
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=3')!.videoId).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PL1234567890abcdef')!.listId).toBe('PL1234567890abcdef');
    expect(parseYouTubeUrl('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeUrl('nada')).toBeNull();
  });
  it('dia no fuso de São Paulo', () => {
    const start = dayStart('2026-11-11', 'America/Sao_Paulo');
    expect(new Date(start).toISOString()).toBe('2026-11-11T03:00:00.000Z');
    expect(localDate(start + 1000, 'America/Sao_Paulo')).toBe('2026-11-11');
    expect(localDate(start - 1000, 'America/Sao_Paulo')).toBe('2026-11-10');
    const [a, b] = dayRange('2026-11-11', '2026-11-12', 'America/Sao_Paulo');
    expect(b - a).toBe(2 * 86400000);
  });
  it('posição da música avança só quando tocando', () => {
    expect(musicPosition({ playing: true, position: 10, updatedAt: 1000 }, 6000)).toBe(15);
    expect(musicPosition({ playing: false, position: 10, updatedAt: 1000 }, 6000)).toBe(10);
  });
  it('tiles viram retângulos', () => {
    expect(tilesToRects([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 5, y: 5 }])).toEqual([
      { x: 1, y: 1, w: 2, h: 2 },
      { x: 5, y: 5, w: 1, h: 1 },
    ]);
  });
});

describe('analytics', () => {
  it('união de intervalos não conta em dobro', () => {
    expect(unionMs([{ s: 0, e: 10 }, { s: 5, e: 15 }, { s: 20, e: 25 }])).toBe(20);
  });
  it('agrega presença, status e chamadas', () => {
    const H = 3600000;
    const rows = aggregateAnalytics({
      from: 0,
      to: 24 * H,
      now: 10 * H,
      presence: [
        { subjectId: 'a', subjectName: 'Ana', role: 'EMPLOYEE', start: 1 * H, end: 5 * H },
        { subjectId: 'b', subjectName: 'Bia', role: 'ADMIN', start: 2 * H, end: null },
        { subjectId: 'c', subjectName: 'Caio', role: 'OWNER', start: -5 * H, end: 2 * H },
      ],
      statuses: [
        { subjectId: 'a', status: 'AVAILABLE', start: 1 * H, end: 3 * H },
        { subjectId: 'a', status: 'BUSY', start: 3 * H, end: 4 * H },
        { subjectId: 'a', status: 'AWAY', start: 4 * H, end: 5 * H },
        { subjectId: 'b', status: 'DND', start: 2 * H, end: null },
      ],
      calls: [
        { a: 'a', b: 'b', areaName: 'Sala de Reunião 1', start: 2 * H, end: 3 * H },
        { a: 'a', b: 'c', areaName: 'Sala de Reunião 1', start: 2.5 * H, end: 3.5 * H },
        { a: 'b', b: 'c', areaName: null, start: 9 * H, end: null },
      ],
    });
    const ana = rows.find((r) => r.id === 'a')!;
    expect(ana.onlineMs).toBe(4 * H);
    expect(ana.activeMs).toBe(3 * H);
    expect(ana.status).toEqual({ AVAILABLE: 2 * H, BUSY: 1 * H, DND: 0, AWAY: 1 * H });
    expect(ana.callMs).toBe(1.5 * H);
    expect(ana.callWith.map((c) => c.name)).toEqual(['Bia', 'Caio']);
    const bia = rows.find((r) => r.id === 'b')!;
    expect(bia.onlineMs).toBe(8 * H);
    expect(bia.status.DND).toBe(8 * H);
    expect(bia.callMs).toBe(2 * H);
    const caio = rows.find((r) => r.id === 'c')!;
    expect(caio.onlineMs).toBe(2 * H);
  });
});
