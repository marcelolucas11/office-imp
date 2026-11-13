// SPDX-License-Identifier: AGPL-3.0-only
import { create } from 'zustand';
import type { AvView, ChatMessage, DeskInfo, DeskItem, MapObject, MusicChannel, OfficeMap, PlayerState } from '@office-imp/shared';

export type Phase = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'kicked' | 'error';

export interface OfficeInfo {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  settings: { awayMinutes: number; notesRestrictedToAdmins: boolean; monitoringNotice: string; interactionDistance?: number };
}

export type ModalState =
  | { kind: 'object'; object: MapObject }
  | { kind: 'desk'; deskId: string }
  | { kind: 'profile'; playerId: string }
  | { kind: 'settings' }
  | { kind: 'radio' }
  | { kind: 'calendar' }
  | { kind: 'mapmaker' }
  | { kind: 'avatar' }
  | { kind: 'customStatus' }
  | { kind: 'myDesk' }
  | { kind: 'notes' }
  | null;

export interface GameState {
  phase: Phase;
  kickReason: string | null;
  error: string | null;
  errorCode: string | null;
  office: OfficeInfo | null;
  canAdmin: boolean;
  livekitUrl: string;
  map: OfficeMap | null;
  mapRev: number;
  meId: string;
  players: Record<string, PlayerState>;
  av: AvView;
  desks: DeskInfo[];
  deskItems: DeskItem[];
  chat: ChatMessage[];
  unread: number;
  music: MusicChannel[];
  recordings: Record<string, string>;
  /** Portas abertas (id → true). As demais estão fechadas e bloqueiam a passagem. */
  doors: Record<string, true>;
  timeOffset: number;
  forceUpdateAt: number | null;
  panel: 'chat' | 'people' | null;
  chatTab: 'near' | 'all' | 'dm';
  dmWith: string | null;
  simplified: boolean;
  mini: boolean;
  /** O Modo Mini está numa janela à parte (app desktop ou Picture-in-Picture do navegador). */
  miniExt: boolean;
  minimap: boolean;
  buildMode: string | null;
  buildProps: Record<string, any> | null;
  following: string | null;
  modal: ModalState;
  hint: { text: string; object?: MapObject } | null;
  set: (patch: Partial<GameState>) => void;
  me: () => PlayerState | null;
}

const EMPTY_AV: AvView = { room: 'open', peers: [], spotlight: [] };

export const useGame = create<GameState>((set, get) => ({
  phase: 'idle',
  kickReason: null,
  error: null,
  errorCode: null,
  office: null,
  canAdmin: false,
  livekitUrl: '',
  map: null,
  mapRev: 0,
  meId: '',
  players: {},
  av: EMPTY_AV,
  desks: [],
  deskItems: [],
  chat: [],
  unread: 0,
  music: [],
  recordings: {},
  doors: {},
  timeOffset: 0,
  forceUpdateAt: null,
  panel: null,
  chatTab: 'all',
  dmWith: null,
  simplified: false,
  mini: false,
  miniExt: false,
  minimap: true,
  buildMode: null,
  buildProps: null,
  following: null,
  modal: null,
  hint: null,
  set: (patch) => set(patch),
  me: () => get().players[get().meId] ?? null,
}));

export function resetGame() {
  useGame.setState({
    phase: 'idle',
    kickReason: null,
    error: null,
    errorCode: null,
    office: null,
    map: null,
    meId: '',
    players: {},
    av: EMPTY_AV,
    desks: [],
    deskItems: [],
    chat: [],
    unread: 0,
    music: [],
    recordings: {},
    doors: {},
    forceUpdateAt: null,
    panel: null,
    modal: null,
    hint: null,
    following: null,
    buildMode: null,
    buildProps: null,
    simplified: false,
  });
}

export const serverNow = () => Date.now() + useGame.getState().timeOffset;
