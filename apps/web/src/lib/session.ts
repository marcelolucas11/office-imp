// SPDX-License-Identifier: AGPL-3.0-only
import { create } from 'zustand';
import type { AvatarConfig, OfficeSummary, Profile, Role } from '@office-imp/shared';
import { api, ApiError } from './api';

export interface Me {
  kind: 'user' | 'guest';
  id: string;
  name: string;
  role: Role;
  username: string | null;
  mustChangePassword: boolean;
  mustSetupTotp: boolean;
  monitoringAccepted: boolean;
  monitoringNotice: string;
  profile: Profile;
  avatar: AvatarConfig;
  interactionDistance: number;
  offices: OfficeSummary[];
  version: string;
  autoUpdateOnOpen: boolean;
  calendar: { available: boolean; connected: boolean };
}

interface SessionState {
  me: Me | null;
  loading: boolean;
  needsSetup: boolean;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  me: null,
  loading: true,
  needsSetup: false,
  refresh: async () => {
    try {
      const me = await api.get<Me>('/api/auth/me');
      set({ me, loading: false });
      return me;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        let needsSetup = false;
        try {
          needsSetup = (await api.get('/api/version')).needsSetup;
        } catch {}
        set({ me: null, loading: false, needsSetup });
        return null;
      }
      set({ loading: false });
      throw e;
    }
  },
  logout: async () => {
    await api.post('/api/auth/logout').catch(() => {});
    set({ me: null });
  },
}));

// ---- avisos rápidos (toasts) ----
export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'ok';
  action?: { label: string; run: () => void };
}
interface ToastState {
  toasts: Toast[];
  push: (text: string, kind?: Toast['kind'], action?: Toast['action'], ms?: number) => void;
  dismiss: (id: number) => void;
}
let nextToast = 1;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, kind = 'info', action, ms = 5000) => {
    const id = nextToast++;
    set({ toasts: [...get().toasts.slice(-4), { id, text, kind, action }] });
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
export const toast = (text: string, kind: Toast['kind'] = 'info', action?: Toast['action'], ms?: number) => useToasts.getState().push(text, kind, action, ms);

/** Canto da janela mini que fica parado quando ela muda de tamanho (t/b = cima/baixo, l/r = esquerda/direita). */
export type MiniAnchor = 'tl' | 'tr' | 'bl' | 'br';

/** Ponte com o app desktop (Electron). Ausente no navegador. */
export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  version: string;
  setStatus: (status: string) => void;
  setMini: (on: boolean) => void;
  /** Versões novas do app: o Modo Mini abre numa janela flutuante transparente. */
  miniWindow?: boolean;
  setOffice?: (name: string | null) => void;
  setMiniSize?: (width: number, height: number, anchor?: MiniAnchor) => void;
  /** Versões novas do app: fecha o Modo Mini sem trazer a janela principal para a frente. */
  closeMini?: () => void;
  /** Versões novas do app: move a janela mini seguindo o cursor (início, movimento e fim do arrasto). */
  miniDrag?: (phase: 'start' | 'move' | 'end') => void;
  onLeaveOffice?: (cb: () => void) => () => void;
  onOpenSettings?: (cb: () => void) => () => void;
  onStatusShortcut: (cb: (status: string) => void) => () => void;
  onMiniChanged: (cb: (on: boolean) => void) => () => void;
  /** Versões novas do app: a janela principal ficou visível ou foi escondida/minimizada. */
  onWindowVisible?: (cb: (visible: boolean) => void) => () => void;
  /** Versões novas do app: o computador vai dormir (tampa, suspensão, desligar) ou acordou. */
  onPower?: (cb: (ev: { type: 'suspend'; reason: string; idleSec: number } | { type: 'resume' }) => void) => () => void;
  /** Versões novas do app: a cada 15 s, se a pessoa está sem usar o computador há 5 min ou mais. */
  onIdle?: (cb: (s: { idle: boolean; idleSec: number }) => void) => () => void;
  checkUpdates: (auto: boolean) => void;
  installUpdateNow: () => void;
  onUpdateState: (cb: (state: { status: string; version?: string; message?: string }) => void) => () => void;
  notify: (title: string, body: string) => void;
  changeServer: () => void;
}
export const desktop: DesktopBridge | null = (window as any).officeImp ?? null;
