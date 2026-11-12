// SPDX-License-Identifier: AGPL-3.0-only
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('picker', {
  list: () => ipcRenderer.invoke('picker:list'),
  choose: (id: string | null) => ipcRenderer.send('picker:choose', id),
});
