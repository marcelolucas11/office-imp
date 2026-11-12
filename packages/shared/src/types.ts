import type { Role } from './permissions';
import type { Dir } from './map';

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

export interface AvatarConfig {
  skin: number;
  hair: number;
  hairColor: number;
  shirt: number;
  pants: number;
  accessory: number;
}

export const DEFAULT_AVATAR: AvatarConfig = { skin: 1, hair: 1, hairColor: 0, shirt: 0, pants: 0, accessory: 0 };

export const AVATAR_OPTIONS = {
  skin: ['#f6d3b3', '#e8b88f', '#c98d5f', '#9a6238', '#6b4226'],
  hairStyles: ['Careca', 'Curto', 'Médio', 'Longo', 'Topete', 'Rabo de cavalo'],
  hairColor: ['#1c1917', '#4a2c17', '#8a5a2b', '#d7b870', '#b91c1c', '#9ca3af', '#f5f5f4'],
  shirt: ['#d7b870', '#111827', '#f5f5f4', '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#db2777'],
  pants: ['#1f2937', '#374151', '#1e3a8a', '#44403c', '#0f172a', '#78350f'],
  accessories: ['Nenhum', 'Óculos', 'Boné', 'Fones', 'Gravata'],
};

export function sanitizeAvatar(a: any): AvatarConfig {
  const clamp = (v: any, max: number) => (Number.isInteger(v) && v >= 0 && v < max ? v : 0);
  return {
    skin: clamp(a?.skin, AVATAR_OPTIONS.skin.length),
    hair: clamp(a?.hair, AVATAR_OPTIONS.hairStyles.length),
    hairColor: clamp(a?.hairColor, AVATAR_OPTIONS.hairColor.length),
    shirt: clamp(a?.shirt, AVATAR_OPTIONS.shirt.length),
    pants: clamp(a?.pants, AVATAR_OPTIONS.pants.length),
    accessory: clamp(a?.accessory, AVATAR_OPTIONS.accessories.length),
  };
}

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
};

export interface WizardInput {
  name: string;
  size: 'small' | 'medium' | 'custom';
  /** Usado quando size = 'custom'. */
  customCount?: number;
  partners: number;
  partnersShareRoom: boolean;
}
