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

/** Ponte com o app desktop (Electron). Ausente no navegador. */
export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  version: string;
  setStatus: (status: string) => void;
  setMini: (on: boolean) => void;
  onStatusShortcut: (cb: (status: string) => void) => () => void;
  onMiniChanged: (cb: (on: boolean) => void) => () => void;
  checkUpdates: (auto: boolean) => void;
  installUpdateNow: () => void;
  onUpdateState: (cb: (state: { status: string; version?: string; message?: string }) => void) => () => void;
  notify: (title: string, body: string) => void;
  changeServer: () => void;
}
export const desktop: DesktopBridge | null = (window as any).officeImp ?? null;
