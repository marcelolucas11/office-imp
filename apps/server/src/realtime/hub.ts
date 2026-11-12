import type { OfficeRoom } from './office-room';

/** Registro das salas ativas (uma por escritório) para a API conversar com o tempo real. */
class Hub {
  private rooms = new Map<string, OfficeRoom>();

  register(room: OfficeRoom) {
    this.rooms.set(room.officeId, room);
  }
  unregister(room: OfficeRoom) {
    if (this.rooms.get(room.officeId) === room) this.rooms.delete(room.officeId);
  }
  room(officeId: string): OfficeRoom | undefined {
    return this.rooms.get(officeId);
  }
  all(): OfficeRoom[] {
    return [...this.rooms.values()];
  }
  onlineCount(officeId: string): number {
    return this.rooms.get(officeId)?.players.size ?? 0;
  }
  broadcastAll(type: string, payload: unknown) {
    for (const r of this.rooms.values()) r.broadcast(type, payload);
  }
  /** Remove alguém de todas as salas (usuário excluído, convite revogado...). */
  kick(subjectId: string, reason: string, officeId?: string) {
    for (const r of this.rooms.values()) {
      if (officeId && r.officeId !== officeId) continue;
      r.kick(subjectId, reason);
    }
  }
  kickInvite(inviteId: string, reason: string) {
    for (const r of this.rooms.values()) r.kickInvite(inviteId, reason);
  }
}

export const hub = new Hub();
