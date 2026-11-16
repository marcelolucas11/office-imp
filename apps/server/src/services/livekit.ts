// SPDX-License-Identifier: AGPL-3.0-only
import { AccessToken, EgressClient, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { config } from '../config';

export function lkRoomName(officeId: string, room: string): string {
  return `oi_${officeId}_${room}`;
}

export async function createLkToken(opts: { identity: string; name: string; room: string; canPublish: boolean }): Promise<string> {
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, { identity: opts.identity, name: opts.name, ttl: 600 });
  at.addGrant({ roomJoin: true, room: opts.room, canPublish: opts.canPublish, canSubscribe: true, canPublishData: false });
  return at.toJwt();
}

let roomSvc: RoomServiceClient | null = null;
let egressSvc: EgressClient | null = null;

export function roomService(): RoomServiceClient {
  roomSvc ??= new RoomServiceClient(config.livekit.apiUrl, config.livekit.apiKey, config.livekit.apiSecret);
  return roomSvc;
}

export function egressService(): EgressClient {
  egressSvc ??= new EgressClient(config.livekit.apiUrl, config.livekit.apiKey, config.livekit.apiSecret);
  return egressSvc;
}

/** Tira alguém de uma sala do LiveKit (ex.: saiu da área privada). Falhas são ignoradas. */
export async function removeFromLkRoom(room: string, identity: string): Promise<void> {
  try {
    await roomService().removeParticipant(room, identity);
  } catch {}
}

export type RemoteMuteKind = 'mic' | 'cam' | 'screen';
const MUTE_SOURCES: Record<RemoteMuteKind, TrackSource[]> = {
  mic: [TrackSource.MICROPHONE],
  cam: [TrackSource.CAMERA],
  screen: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
};

/**
 * Desliga para todos o microfone, a câmera ou a tela de alguém, direto no servidor de mídia: a faixa fica
 * muda para a sala inteira mesmo que o app da pessoa não obedeça ao aviso. Para religar, só a própria pessoa.
 * Devolve quantas faixas foram silenciadas (0 = nada publicado ou falha).
 */
export async function muteInLkRoom(room: string, identity: string, kind: RemoteMuteKind): Promise<number> {
  try {
    const p = await roomService().getParticipant(room, identity);
    const tracks = p.tracks.filter((t) => MUTE_SOURCES[kind].includes(t.source) && !t.muted);
    for (const t of tracks) await roomService().mutePublishedTrack(room, identity, t.sid, true);
    return tracks.length;
  } catch {
    return 0;
  }
}
