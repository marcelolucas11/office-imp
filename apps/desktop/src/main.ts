// SPDX-License-Identifier: AGPL-3.0-only
// App desktop do office-imp: uma janela Chromium que abre o escritório hospedado no servidor
// (a VPS), com atalhos de status, Modo Mini sempre no topo, bandeja, notificações e atualização.
import { BrowserWindow, Menu, Notification, Tray, app, desktopCapturer, dialog, ipcMain, nativeImage, net, screen, session, shell, systemPreferences, type IpcMainEvent, type MenuItemConstructorOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import fs from 'node:fs';
import path from 'node:path';
import branding from '../branding.json';
import { MacUpdater } from './mac-updater';

declare const __MAC_SIGNED__: boolean;
declare const __SERVER_URL__: string;

type Status = 'AVAILABLE' | 'BUSY' | 'DND';
interface UpdateState {
  status: string;
  version?: string;
  message?: string;
}

const isMac = process.platform === 'darwin';
const DEFAULT_URL = (__SERVER_URL__ || branding.serverUrl).replace(/\/$/, '');
const STATUS_LABEL: Record<Status, string> = { AVAILABLE: 'Disponível', BUSY: 'Ocupado', DND: 'Não incomodar' };
const STATUS_RGB: Record<Status, [number, number, number]> = { AVAILABLE: [52, 211, 153], BUSY: [251, 191, 36], DND: [239, 68, 68] };
const NORMAL_MIN: [number, number] = [940, 600];

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let status: Status = 'AVAILABLE';
let mini = false;
let normalBounds: Electron.Rectangle | null = null;
let quitting = false;
const cfg = { serverUrl: DEFAULT_URL };

// ---------- configuração local (endereço do servidor) ----------
const configFile = () => path.join(app.getPath('userData'), 'config.json');
function loadConfig() {
  try {
    const saved = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    if (typeof saved.serverUrl === 'string' && saved.serverUrl) cfg.serverUrl = saved.serverUrl;
  } catch {}
}
function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
  } catch {}
}
function normalizeUrl(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}
const serverOrigin = () => {
  try {
    return new URL(cfg.serverUrl).origin;
  } catch {
    return '';
  }
};
const isOurs = (url: string) => {
  try {
    return new URL(url).origin === serverOrigin();
  } catch {
    return false;
  }
};
const fromLocalPage = (e: IpcMainEvent) => (e.senderFrame?.url ?? '').startsWith('file:');
const fromApp = (e: IpcMainEvent) => fromLocalPage(e) || isOurs(e.senderFrame?.url ?? '');

// ---------- janela ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: NORMAL_MIN[0],
    minHeight: NORMAL_MIN[1],
    backgroundColor: '#0b0b0d',
    title: branding.productName,
    autoHideMenuBar: true,
    show: false,
    icon: isMac ? undefined : path.join(__dirname, '../assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isOurs(url) || url.startsWith('file:')) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) showLocal('offline', desc);
  });
  win.on('close', (e) => {
    // no Mac, fechar a janela mantém o app (e a conversa) rodando; Cmd+Q encerra
    if (!quitting && isMac) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });
  loadServer();
}

function loadServer() {
  void win?.loadURL(cfg.serverUrl).catch(() => {});
}
function showLocal(reason: 'offline' | 'change', detail = '') {
  void win?.loadFile(path.join(__dirname, '../assets/offline.html'), { query: { reason, url: cfg.serverUrl, detail, name: branding.productName } }).catch(() => {});
}
function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ---------- permissões (só para o endereço do servidor) ----------
const ALLOWED = new Set(['media', 'mediaKeySystem', 'notifications', 'fullscreen', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write', 'speaker-selection', 'window-management']);
function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, cb, details) => cb(ALLOWED.has(permission) && isOurs((details as { requestingUrl?: string }).requestingUrl || wc.getURL())));
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => ALLOWED.has(permission) && isOurs(requestingOrigin));
  ses.setDisplayMediaRequestHandler(
    (request, callback) => {
      const deny = () => {
        try {
          callback({} as Electron.Streams);
        } catch {}
      };
      desktopCapturer
        .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 } })
        .then((sources) => pickSource(sources))
        .then((source) => {
          if (!source) return deny();
          callback({ video: source, ...(process.platform === 'win32' && request.audioRequested ? { audio: 'loopback' as const } : {}) });
        })
        .catch(deny);
    },
    { useSystemPicker: true },
  );
}

/** Janela para escolher a tela ou a janela a compartilhar. */
function pickSource(sources: Electron.DesktopCapturerSource[]): Promise<Electron.DesktopCapturerSource | null> {
  return new Promise((resolve) => {
    if (!win || !sources.length) return resolve(null);
    if (sources.length === 1) return resolve(sources[0]);
    const picker = new BrowserWindow({
      parent: win,
      modal: true,
      width: 760,
      height: 560,
      backgroundColor: '#0b0b0d',
      title: 'Compartilhar tela',
      autoHideMenuBar: true,
      minimizable: false,
      maximizable: false,
      webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    let done = false;
    const finish = (s: Electron.DesktopCapturerSource | null) => {
      if (done) return;
      done = true;
      ipcMain.removeHandler('picker:list');
      ipcMain.removeListener('picker:choose', onChoose);
      if (!picker.isDestroyed()) picker.close();
      resolve(s);
    };
    const onChoose = (e: IpcMainEvent, id: string | null) => {
      if (e.sender !== picker.webContents) return;
      finish(sources.find((s) => s.id === id) ?? null);
    };
    ipcMain.handle('picker:list', () => sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL(), screen: s.id.startsWith('screen:') })));
    ipcMain.on('picker:choose', onChoose);
    picker.on('closed', () => finish(null));
    void picker.loadFile(path.join(__dirname, '../assets/picker.html'));
  });
}

// ---------- status, menu e bandeja ----------
function dot([r, g, b]: [number, number, number]): Electron.NativeImage {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      const a = d <= 10 ? 255 : d <= 11.5 ? Math.round(255 * (11.5 - d)) : 0;
      const i = (y * size + x) * 4;
      // BGRA pré-multiplicado
      buf[i] = Math.round((b * a) / 255);
      buf[i + 1] = Math.round((g * a) / 255);
      buf[i + 2] = Math.round((r * a) / 255);
      buf[i + 3] = a;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 });
}

function sendStatus(s: Status) {
  showWindow();
  win?.webContents.send('status-shortcut', s);
}

function statusItems(): MenuItemConstructorOptions[] {
  const key: Record<Status, string> = { AVAILABLE: 'O', BUSY: 'I', DND: 'U' };
  return (Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ label: STATUS_LABEL[s], type: 'radio' as const, checked: status === s, accelerator: `CmdOrCtrl+${key[s]}`, click: () => sendStatus(s) }));
}

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { label: 'Status', submenu: statusItems() },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { label: 'Modo Mini', type: 'checkbox', checked: mini, accelerator: 'CmdOrCtrl+Shift+M', click: () => setMini(!mini, true) },
        { type: 'separator' },
        { role: 'reload', label: 'Recarregar' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        { role: 'resetZoom', label: 'Tamanho real' },
        { role: 'zoomIn', label: 'Aumentar' },
        { role: 'zoomOut', label: 'Diminuir' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
      ],
    },
    { role: 'windowMenu', label: 'Janela' },
    {
      label: 'Ajuda',
      submenu: [
        { label: `${branding.productName} ${app.getVersion()}`, enabled: false },
        { label: 'Procurar atualizações…', click: () => void checkUpdates(true, true) },
        { label: 'Trocar servidor…', click: () => showLocal('change') },
        { label: 'Código-fonte (GitHub)', click: () => void shell.openExternal(`https://github.com/${branding.github}`) },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const, label: 'Sair' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  if (tray) {
    tray.setImage(dot(STATUS_RGB[status]));
    tray.setToolTip(`${branding.productName} — ${STATUS_LABEL[status]}`);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...statusItems().map((i) => ({ ...i, accelerator: undefined })),
        { type: 'separator' },
        { label: 'Abrir', click: showWindow },
        {
          label: 'Sair',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
  }
}

function setMini(on: boolean, notifyPage: boolean) {
  if (!win || mini === on) return;
  mini = on;
  if (on) {
    if (win.isFullScreen()) win.setFullScreen(false);
    normalBounds = win.getBounds();
    const area = screen.getDisplayMatching(normalBounds).workArea;
    win.setMinimumSize(320, 300);
    win.setBounds({ width: 380, height: 460, x: area.x + area.width - 400, y: area.y + area.height - 480 });
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setAlwaysOnTop(false);
    win.setVisibleOnAllWorkspaces(false);
    win.setMinimumSize(...NORMAL_MIN);
    if (normalBounds) win.setBounds(normalBounds);
  }
  if (notifyPage) win.webContents.send('mini-changed', on);
  buildMenu();
}

// ---------- atualizações ----------
// Windows (e Mac com assinatura da Apple): electron-updater pelo GitHub Releases.
// Mac sem assinatura: o Squirrel.Mac recusa apps ad-hoc, então usamos o MacUpdater (src/mac-updater.ts),
// que baixa, confere, troca o app e apaga os arquivos da atualização sozinho.
const canAutoUpdate = () => app.isPackaged && (!isMac || __MAC_SIGNED__);
let downloaded = false;
let installWhenReady = false;
let notifiedVersion = '';
const sendUpdate = (s: UpdateState) => win?.webContents.send('update-state', s);

function notifyDownloaded(version: string) {
  if (notifiedVersion === version || !Notification.isSupported()) return;
  notifiedVersion = version;
  new Notification({ title: branding.productName, body: `Versão ${version} baixada. Ela será instalada quando você fechar o app.` }).show();
}

const macUpdater =
  isMac && !__MAC_SIGNED__
    ? new MacUpdater(branding.github, branding.appId, {
        onChecking: () => sendUpdate({ status: 'procurando' }),
        onAvailable: (version) => sendUpdate({ status: 'disponível', version }),
        onNotAvailable: () => {
          installWhenReady = false;
          sendUpdate({ status: 'atualizado' });
        },
        onProgress: (p) => sendUpdate({ status: 'baixando', message: `${p}%` }),
        onDownloaded: (version) => {
          downloaded = true;
          sendUpdate({ status: 'pronta para instalar', version });
          if (installWhenReady) installMacNow();
          else notifyDownloaded(version);
        },
        onError: (message) => {
          installWhenReady = false;
          sendUpdate({ status: 'erro', message });
        },
      })
    : null;

function installMacNow() {
  if (!macUpdater?.install(true)) return;
  quitting = true;
  app.quit();
}

function setupUpdater() {
  if (macUpdater) {
    if (app.isPackaged) macUpdater.cleanup();
    return;
  }
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ status: 'procurando' }));
  autoUpdater.on('update-available', (i) => sendUpdate({ status: 'disponível', version: i.version }));
  autoUpdater.on('update-not-available', () => {
    installWhenReady = false;
    sendUpdate({ status: 'atualizado' });
  });
  autoUpdater.on('download-progress', (p) => sendUpdate({ status: 'baixando', message: `${Math.round(p.percent)}%` }));
  autoUpdater.on('update-downloaded', (i) => {
    downloaded = true;
    sendUpdate({ status: 'pronta para instalar', version: i.version });
    if (installWhenReady) {
      quitting = true;
      autoUpdater.quitAndInstall(true, true);
    } else notifyDownloaded(i.version);
  });
  autoUpdater.on('error', (e) => {
    installWhenReady = false;
    sendUpdate({ status: 'erro', message: e.message });
  });
}

async function checkUpdates(auto: boolean, interactive = false) {
  if (!app.isPackaged) return sendUpdate({ status: 'modo de desenvolvimento' });
  if (macUpdater) {
    await macUpdater.check(auto || interactive);
    if (interactive && win) {
      const v = macUpdater.downloadedVersion;
      if (v) {
        const r = await dialog.showMessageBox(win, {
          type: 'info',
          buttons: ['Reiniciar agora', 'Ao fechar o app'],
          defaultId: 0,
          cancelId: 1,
          message: `Versão ${v} pronta para instalar`,
          detail: 'O app fecha, atualiza e abre de novo em alguns segundos.',
        });
        if (r.response === 0) installMacNow();
      } else if (!downloaded) void dialog.showMessageBox(win, { type: 'info', message: 'Você já está na versão mais recente.' });
    }
    return;
  }
  autoUpdater.autoDownload = auto || interactive;
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    sendUpdate({ status: 'erro', message: (e as Error).message });
  }
}

/** "Atualizar todos agora": recarrega o cliente na hora e, se houver, instala a nova versão do app. */
function installUpdateNow() {
  win?.webContents.reloadIgnoringCache();
  if (!app.isPackaged) return;
  if (macUpdater) {
    if (macUpdater.downloadedVersion) return installMacNow();
    installWhenReady = true;
    void macUpdater.check(true);
    return;
  }
  if (downloaded) {
    quitting = true;
    autoUpdater.quitAndInstall(true, true);
    return;
  }
  installWhenReady = true;
  autoUpdater.autoDownload = true;
  autoUpdater.checkForUpdates().catch(() => {
    installWhenReady = false;
  });
}

// ---------- mensagens da página ----------
function setupIpc() {
  ipcMain.on('get-info', (e) => {
    e.returnValue = { version: app.getVersion(), platform: process.platform };
  });
  ipcMain.on('set-status', (e, s: Status) => {
    if (!fromApp(e) || !(s in STATUS_LABEL)) return;
    status = s;
    buildMenu();
  });
  ipcMain.on('set-mini', (e, on: boolean) => fromApp(e) && setMini(Boolean(on), false));
  ipcMain.on('check-updates', (e, auto: boolean) => fromApp(e) && void checkUpdates(Boolean(auto)));
  ipcMain.on('install-update-now', (e) => fromApp(e) && installUpdateNow());
  ipcMain.on('notify', (e, title: string, body: string) => {
    if (!fromApp(e) || !Notification.isSupported() || win?.isFocused()) return;
    const n = new Notification({ title: String(title).slice(0, 80), body: String(body).slice(0, 240) });
    n.on('click', showWindow);
    n.show();
  });
  ipcMain.on('change-server', (e) => fromApp(e) && showLocal('change'));
  // só as páginas locais do app (tela offline) podem trocar o endereço do servidor
  ipcMain.on('local:retry', (e) => fromLocalPage(e) && loadServer());
  ipcMain.on('local:set-server', (e, url: string) => {
    if (!fromLocalPage(e)) return;
    const next = normalizeUrl(String(url));
    if (!next) return;
    cfg.serverUrl = next;
    saveConfig();
    loadServer();
  });
}

// ---------- ciclo de vida ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.setAppUserModelId(branding.appId);
  void app.whenReady().then(async () => {
    loadConfig();
    setupPermissions();
    setupIpc();
    setupUpdater();
    try {
      tray = new Tray(dot(STATUS_RGB[status]));
      tray.on('click', showWindow);
    } catch {}
    buildMenu();
    createWindow();
    if (isMac) {
      // pede câmera e microfone ao sistema já na primeira abertura
      await systemPreferences.askForMediaAccess('microphone').catch(() => false);
      await systemPreferences.askForMediaAccess('camera').catch(() => false);
    }
    app.on('activate', showWindow);
  });
  app.on('before-quit', () => {
    quitting = true;
    // Mac sem assinatura: atualização baixada é instalada ao fechar, como no Windows
    macUpdater?.install(false);
  });
  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
