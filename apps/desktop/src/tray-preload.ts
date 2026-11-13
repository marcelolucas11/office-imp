// SPDX-License-Identifier: AGPL-3.0-only
// Ponte da caixinha da barra de menus (assets/tray.html). Só ações específicas, nunca o Node.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tray', {
  getState: () => ipcRenderer.invoke('tray:state'),
  onState: (cb: (state: unknown) => void) => {
    ipcRenderer.on('tray:state', (_e, s) => cb(s));
  },
  status: (s: string) => ipcRenderer.send('tray:action', 'status', s),
  setAutoMini: (on: boolean) => ipcRenderer.send('tray:action', 'auto-mini', on),
  setMini: (on: boolean) => ipcRenderer.send('tray:action', 'mini', on),
  leave: () => ipcRenderer.send('tray:action', 'leave'),
  open: () => ipcRenderer.send('tray:action', 'open'),
  settings: () => ipcRenderer.send('tray:action', 'settings'),
  updates: () => ipcRenderer.send('tray:action', 'updates'),
  quit: () => ipcRenderer.send('tray:action', 'quit'),
  close: () => ipcRenderer.send('tray:action', 'close'),
  resize: (h: number) => ipcRenderer.send('tray:action', 'resize', h),
});
