// SPDX-License-Identifier: AGPL-3.0-only
// Ponte entre a página (o cliente web) e o app desktop. Só expõe funções específicas, nunca o Node.
import { contextBridge, ipcRenderer } from 'electron';

const info = ipcRenderer.sendSync('get-info') as { version: string; platform: string };
const on = (channel: string, cb: (...args: any[]) => void) => {
  const handler = (_e: unknown, ...args: any[]) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
};

contextBridge.exposeInMainWorld('officeImp', {
  isDesktop: true,
  platform: info.platform,
  version: info.version,
  setStatus: (status: string) => ipcRenderer.send('set-status', status),
  setMini: (on_: boolean) => ipcRenderer.send('set-mini', on_),
  /** O Modo Mini abre como janela flutuante transparente (só as câmeras). */
  miniWindow: true,
  setOffice: (name: string | null) => ipcRenderer.send('set-office', name),
  /** `anchor`: canto que fica parado durante o redimensionamento pelas bordas ('tl', 'tr', 'bl' ou 'br'). */
  setMiniSize: (width: number, height: number, anchor?: string) => ipcRenderer.send('mini-size', width, height, anchor),
  /** Fecha o Modo Mini sem trazer a janela principal para a frente (ela fica minimizada). */
  closeMini: () => ipcRenderer.send('mini-close'),
  /** Arrastar a janela mini: o app move a janela seguindo o cursor. */
  miniDrag: (phase: 'start' | 'move' | 'end') => ipcRenderer.send('mini-drag', phase),
  onLeaveOffice: (cb: () => void) => on('leave-office', cb),
  onOpenSettings: (cb: () => void) => on('open-settings', cb),
  onStatusShortcut: (cb: (status: string) => void) => on('status-shortcut', cb),
  onMiniChanged: (cb: (on_: boolean) => void) => on('mini-changed', cb),
  /** A janela principal ficou visível (true) ou foi escondida/minimizada (false). */
  onWindowVisible: (cb: (visible: boolean) => void) => on('window-visible', cb),
  checkUpdates: (auto: boolean) => ipcRenderer.send('check-updates', auto),
  installUpdateNow: () => ipcRenderer.send('install-update-now'),
  onUpdateState: (cb: (state: { status: string; version?: string; message?: string }) => void) => on('update-state', cb),
  notify: (title: string, body: string) => ipcRenderer.send('notify', title, body),
  changeServer: () => ipcRenderer.send('change-server'),
});

// usado apenas pela tela local "sem conexão / trocar servidor"
contextBridge.exposeInMainWorld('officeImpLocal', {
  retry: () => ipcRenderer.send('local:retry'),
  setServer: (url: string) => ipcRenderer.send('local:set-server', url),
});
