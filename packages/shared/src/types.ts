// SPDX-License-Identifier: AGPL-3.0-only
import type { Role } from './permissions';
import type { Dir } from './map';
import { DEFAULT_INTERACTION_DISTANCE } from './constants';
import type { AvatarConfig } from './avatar';

export type Status = 'AVAILABLE' | 'BUSY' | 'DND';
export type TrackedStatus = Status | 'AWAY';

export const STATUS_LABEL: Record<TrackedStatus, string> = {
  AVAILABLE: 'Disponível',
  BUSY: 'Ocupado',
  DND: 'Não incomodar',
  AWAY: 'Ausente',
};

export const STATUS_COLOR: Record<TrackedStatus, string> = {
  AVAILABLE: '#34d399',
  BUSY: '#facc15',
  DND: '#ef4444',
  AWAY: '#9ca3af',
};

export interface CustomStatus {
  emoji: string;
  text: string;
  /** Epoch ms de expiração (opcional). */
  until?: number | null;
}

export interface Profile {
  title?: string;
  about?: string;
  timezone?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  role: Role;
  x: number;
  y: number;
  dir: Dir;
  status: Status;
  away: boolean;
  customStatus: CustomStatus | null;
  avatar: AvatarConfig;
  hand: boolean;
  areaId: string | null;
  spotlight: boolean;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  deskId: string | null;
  distance: number;
  profile: Profile;
}

export type ChatScope = 'near' | 'all' | 'dm';

export interface ChatMessage {
  id: string;
  scope: ChatScope;
  fromId: string;
  fromName: string;
  toId?: string | null;
  text: string;
  at: number;
}

export interface DeskInfo {
  id: string;
  userId: string | null;
  userName: string | null;
  online?: boolean;
}

export interface DeskItem {
  id: string;
  deskId: string;
  kind: 'note' | 'gift';
  authorName: string;
  content: string;
  emoji?: string | null;
  at: number;
  seen: boolean;
}

export interface MusicTrack {
  videoId: string;
  title?: string;
  addedBy: string;
}

export interface MusicChannel {
  id: string;
  name: string;
  djId: string;
  djName: string;
  queue: MusicTrack[];
  index: number;
  playing: boolean;
  /** Posição (s) no momento de `updatedAt`. */
  position: number;
  /** Epoch ms (relógio do servidor) da última mudança de estado. */
  updatedAt: number;
  locked: boolean;
  listeners: string[];
}

/** Posição esperada (s) de um canal no instante `now` (relógio do servidor). */
export function musicPosition(ch: Pick<MusicChannel, 'playing' | 'position' | 'updatedAt'>, now: number): number {
  return ch.playing ? ch.position + (now - ch.updatedAt) / 1000 : ch.position;
}

export interface AvPeer {
  id: string;
  /** Distância em tiles (0 dentro de área privada). */
  d: number;
}

export interface AvView {
  /** 'none' (não incomodar), 'open' ou o id da área privada. */
  room: string;
  peers: AvPeer[];
  spotlight: string[];
}

export interface OfficeSummary {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  deskCapacity: number;
  desksUsed?: number;
  online?: number;
  activated?: boolean;
}

export interface OfficeSettings {
  awayMinutes: number;
  chatRetentionDays: number;
  audioRetentionDays: number;
  notesRestrictedToAdmins: boolean;
  notesRecipients: string[];
  monitoringNotice: string;
  /** Raio de proximidade do escritório (tiles), igual para todos. */
  interactionDistance: number;
}

export const DEFAULT_MONITORING_NOTICE =
  'Para a gestão da equipe, este escritório virtual registra o seu tempo online, os seus status (Disponível, Ocupado, Não incomodar e Ausente) e o tempo em chamadas, incluindo com quem. Esses dados são vistos pela administração. O conteúdo das conversas não é gravado, exceto quando alguém inicia as "Notas de reunião" em uma sala de reunião — nesse caso, um aviso vermelho fica visível para todos na sala.';

export const DEFAULT_OFFICE_SETTINGS: OfficeSettings = {
  awayMinutes: 10,
  chatRetentionDays: 90,
  audioRetentionDays: 30,
  notesRestrictedToAdmins: false,
  notesRecipients: [],
  monitoringNotice: DEFAULT_MONITORING_NOTICE,
  interactionDistance: DEFAULT_INTERACTION_DISTANCE,
};

export interface WizardInput {
  name: string;
  size: 'small' | 'medium' | 'custom';
  /** Usado quando size = 'custom'. */
  customCount?: number;
  partners: number;
  partnersShareRoom: boolean;
}
