// SPDX-License-Identifier: AGPL-3.0-only
import { AccessToken, EgressClient, RoomServiceClient } from 'livekit-server-sdk';
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
