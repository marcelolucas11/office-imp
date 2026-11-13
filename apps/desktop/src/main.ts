// SPDX-License-Identifier: AGPL-3.0-only
// App desktop do office-imp: uma janela Chromium que abre o escritório hospedado no servidor
// (a VPS), com atalhos de status, Modo Mini sempre no topo, bandeja, notificações e atualização.
import { BrowserWindow, Menu, Notification, Tray, app, desktopCapturer, dialog, ipcMain, screen, session, shell, systemPreferences, type IpcMainEvent, type MenuItemConstructorOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import fs from 'node:fs';
import path from 'node:path';
import branding from '../branding.json';
import { MacUpdater } from './mac-updater';
import { trayIcon } from './tray-icon';

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
/** Nome do escritório aberto (null = fora de um escritório). Informado pela página. */
let inOffice: string | null = null;
/** A página sabe abrir o Modo Mini como janela flutuante transparente (cliente web novo). */
let pageMiniWindow = false;
let miniWin: BrowserWindow | null = null;
let trayWin: BrowserWindow | null = null;
let trayHiddenAt = 0;
let autoMiniTimer: NodeJS.Timeout | undefined;
const MINI_FRAME = 'oi-mini';
const cfg: { serverUrl: string; autoMini: boolean; miniCorner: { right: number; bottom: number } | null } = { serverUrl: DEFAULT_URL, autoMini: true, miniCorner: null };

// ---------- configuração local (endereço do servidor) ----------
const configFile = () => path.join(app.getPath('userData'), 'config.json');
function loadConfig() {
  try {
    const saved = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    if (typeof saved.serverUrl === 'string' && saved.serverUrl) cfg.serverUrl = saved.serverUrl;
    if (typeof saved.autoMini === 'boolean') cfg.autoMini = saved.autoMini;
    if (saved.miniCorner && Number.isFinite(saved.miniCorner.right) && Number.isFinite(saved.miniCorner.bottom)) cfg.miniCorner = { right: saved.miniCorner.right, bottom: saved.miniCorner.bottom };
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
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // Modo Mini: a página abre uma janela em branco (mesma origem) e desenha as câmeras nela
    if (frameName === MINI_FRAME && (url === 'about:blank' || url === '') && isOurs(win?.webContents.getURL() ?? '')) {
      return { action: 'allow', overrideBrowserWindowOptions: miniWindowOptions() };
    }
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child, details) => {
    if (details.frameName === MINI_FRAME) setupMiniWindow(child);
    else child.close();
  });
  // Modo Mini automático: ao minimizar ou ir para outro app, só as câmeras ficam flutuando
  win.on('blur', scheduleAutoMini);
  win.on('focus', () => clearTimeout(autoMiniTimer));
  win.on('minimize', () => {
    if (autoMiniReady()) setMini(true, true);
  });
  win.webContents.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => {
    // página nova (recarga, troca de servidor): ela avisa de novo se está num escritório
    if (isMainFrame && !_inPlace) {
      if (miniWin && !miniWin.isDestroyed()) miniWin.close(); // o "closed" sai do Modo Mini e mostra a janela
      else if (mini) setMini(false, false);
      inOffice = null;
      pageMiniWindow = false;
      buildMenu();
    }
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
      if (autoMiniReady()) setMini(true, true);
      else win?.hide();
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
  if (mini && miniWin) return setMini(false, true);
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
function sendStatus(s: Status) {
  // não traz a janela para frente: dá para trocar o status pela barra de menus sem sair do que está fazendo
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
        { label: 'Modo Mini', type: 'checkbox', checked: mini, enabled: Boolean(inOffice) || mini, accelerator: 'CmdOrCtrl+Shift+M', click: () => setMini(!mini, true) },
        { label: 'Modo Mini automático', type: 'checkbox', checked: cfg.autoMini, click: () => setAutoMini(!cfg.autoMini) },
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
  refreshTray();
}

// ---------- Modo Mini ----------
// Cliente web novo: a página abre uma janela própria, sem moldura e transparente, e desenha nela só as
// câmeras (React portal na mesma página, então a conexão de áudio e vídeo é a mesma). A janela principal
// fica escondida até a pessoa clicar numa câmera.
// Cliente web antigo: a própria janela encolhe e fica sempre no topo (comportamento da 1.0).
const MINI_MARGIN = 20;

function miniWindowOptions(): Electron.BrowserWindowConstructorOptions {
  return {
    width: 260,
    height: 210,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: `${branding.productName} — Modo Mini`,
    ...(isMac ? { type: 'panel' as const } : {}),
    webPreferences: { backgroundThrottling: false },
  };
}

function miniArea(): Electron.Rectangle {
  const ref = win ? (win.isVisible() ? win.getBounds() : normalBounds ?? win.getBounds()) : undefined;
  return (ref ? screen.getDisplayMatching(ref) : screen.getPrimaryDisplay()).workArea;
}

/** Canto inferior direito da janela mini (ela cresce para cima e para a esquerda). */
function miniCorner(): { right: number; bottom: number } {
  const c = cfg.miniCorner;
  if (c && screen.getAllDisplays().some((d) => c.right > d.workArea.x + 120 && c.right <= d.workArea.x + d.workArea.width + 1 && c.bottom > d.workArea.y + 120 && c.bottom <= d.workArea.y + d.workArea.height + 1)) return c;
  const a = miniArea();
  return { right: a.x + a.width - MINI_MARGIN, bottom: a.y + a.height - MINI_MARGIN };
}

function placeMini(width: number, height: number) {
  if (!miniWin || miniWin.isDestroyed()) return;
  const { right, bottom } = miniCorner();
  const area = screen.getDisplayNearestPoint({ x: right - 1, y: bottom - 1 }).workArea;
  const w = Math.max(120, Math.min(Math.round(width), 520));
  const h = Math.max(60, Math.min(Math.round(height), area.height - 40));
  const x = Math.max(area.x, right - w);
  const y = Math.max(area.y, bottom - h);
  miniWin.setBounds({ x, y, width: w, height: h });
}

function setupMiniWindow(child: BrowserWindow) {
  if (miniWin && !miniWin.isDestroyed() && miniWin !== child) miniWin.close();
  miniWin = child;
  child.setAlwaysOnTop(true, 'floating');
  child.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const [w, h] = child.getSize();
  placeMini(w, h);
  child.showInactive();
  if (win) {
    if (win.isVisible() && !win.isMinimized()) normalBounds = win.getBounds();
    win.hide();
  }
  let saveTimer: NodeJS.Timeout | undefined;
  child.on('moved', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (child.isDestroyed()) return;
      const b = child.getBounds();
      cfg.miniCorner = { right: b.x + b.width, bottom: b.y + b.height };
      saveConfig();
    }, 300);
  });
  child.on('closed', () => {
    if (miniWin === child) miniWin = null;
    if (mini) {
      mini = false;
      win?.webContents.send('mini-changed', false);
      buildMenu();
    }
    showWindow();
  });
  mini = true;
  buildMenu();
}

function setMini(on: boolean, notifyPage: boolean) {
  if (!win || mini === on) return;
  if (on && !inOffice && pageMiniWindow) return;
  mini = on;
  if (pageMiniWindow) {
    if (on) {
      if (win.isFullScreen()) win.setFullScreen(false);
    } else if (miniWin && !miniWin.isDestroyed()) {
      miniWin.close(); // o "closed" mostra a janela principal de novo
    } else {
      showWindow();
    }
  } else if (on) {
    if (win.isFullScreen()) win.setFullScreen(false);
    if (win.isMinimized()) win.restore();
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

function setAutoMini(on: boolean) {
  cfg.autoMini = on;
  saveConfig();
  buildMenu();
}

/** Dá para entrar no Modo Mini automático agora? */
function autoMiniReady() {
  return Boolean(win && !mini && cfg.autoMini && inOffice && pageMiniWindow && !win.isFullScreen());
}

function scheduleAutoMini() {
  clearTimeout(autoMiniTimer);
  autoMiniTimer = setTimeout(() => {
    if (!autoMiniReady() || !win?.isVisible() || win.isMinimized()) return;
    // o foco foi para outra janela do próprio app (escolher tela, caixinha da barra de menus): não entra
    if (BrowserWindow.getFocusedWindow()) return;
    setMini(true, true);
  }, 700);
}

// ---------- ícone e caixinha na barra de menus / bandeja ----------
function trayState() {
  return { office: inOffice, status, autoMini: cfg.autoMini, mini, version: app.getVersion(), productName: branding.productName, platform: process.platform };
}

function refreshTray() {
  if (tray) {
    tray.setImage(trayIcon(inOffice ? STATUS_RGB[status] : null));
    tray.setToolTip(inOffice ? `${branding.productName} — ${inOffice} · ${STATUS_LABEL[status]}` : branding.productName);
  }
  if (trayWin && !trayWin.isDestroyed()) trayWin.webContents.send('tray:state', trayState());
}

const TRAY_W = 320;
function createTrayWindow() {
  trayWin = new BrowserWindow({
    width: TRAY_W,
    height: 420,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: branding.productName,
    ...(isMac ? { type: 'panel' as const } : {}),
    webPreferences: { preload: path.join(__dirname, 'tray-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  trayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  trayWin.on('blur', hideTrayWindow);
  trayWin.on('closed', () => {
    trayWin = null;
  });
  void trayWin.loadFile(path.join(__dirname, '../assets/tray.html'));
}

function hideTrayWindow() {
  if (!trayWin || trayWin.isDestroyed() || !trayWin.isVisible()) return;
  trayWin.hide();
  trayHiddenAt = Date.now();
}

function placeTrayWindow() {
  if (!tray || !trayWin) return;
  const t = tray.getBounds();
  const [w, h] = trayWin.getSize();
  const display = screen.getDisplayNearestPoint({ x: Math.round(t.x + t.width / 2), y: Math.round(t.y + t.height / 2) });
  const a = display.workArea;
  let x = Math.round(t.x + t.width / 2 - w / 2);
  // barra no topo (Mac) → abre para baixo; barra de tarefas embaixo (Windows) → abre para cima
  let y = t.y < display.bounds.y + display.bounds.height / 2 ? Math.round(t.y + t.height + 2) : Math.round(t.y - h - 2);
  if (!t.width) {
    // alguns ambientes não informam a posição do ícone: canto da área de trabalho
    x = a.x + a.width - w - 8;
    y = isMac ? a.y + 4 : a.y + a.height - h - 8;
  }
  x = Math.max(a.x + 4, Math.min(x, a.x + a.width - w - 4));
  y = Math.max(a.y, Math.min(y, a.y + a.height - h));
  trayWin.setPosition(x, y);
}

function toggleTrayWindow() {
  if (!trayWin || trayWin.isDestroyed()) createTrayWindow();
  if (!trayWin) return;
  if (trayWin.isVisible()) return hideTrayWindow();
  // o clique no ícone tira o foco da caixinha (que se fecha) antes de chegar aqui: não reabre
  if (Date.now() - trayHiddenAt < 300) return;
  trayWin.webContents.send('tray:state', trayState());
  placeTrayWindow();
  trayWin.show();
  trayWin.focus();
}

/** "Fechar tudo": encerra o app por completo (janela, Modo Mini, bandeja e processos em segundo plano). */
function quitAll() {
  quitting = true;
  hideTrayWindow();
  app.quit();
  // se alguma janela segurar o fechamento, força a saída em seguida
  setTimeout(() => app.exit(0), 3000);
}

function setupTray() {
  try {
    tray = new Tray(trayIcon(null));
  } catch {
    return;
  }
  tray.on('click', toggleTrayWindow);
  tray.on('right-click', toggleTrayWindow);
  createTrayWindow();
  ipcMain.handle('tray:state', (e) => (e.sender === trayWin?.webContents ? trayState() : null));
  ipcMain.on('tray:action', (e, action: string, arg?: unknown) => {
    if (!trayWin || e.sender !== trayWin.webContents) return;
    switch (action) {
      case 'status':
        if (inOffice && typeof arg === 'string' && arg in STATUS_LABEL) sendStatus(arg as Status);
        break;
      case 'auto-mini':
        setAutoMini(Boolean(arg));
        break;
      case 'mini':
        if (inOffice || mini) setMini(Boolean(arg), true);
        break;
      case 'leave':
        hideTrayWindow();
        if (mini) setMini(false, true);
        else showWindow();
        win?.webContents.send('leave-office');
        break;
      case 'open':
        hideTrayWindow();
        showWindow();
        break;
      case 'settings':
        hideTrayWindow();
        showWindow();
        win?.webContents.send('open-settings');
        break;
      case 'updates':
        hideTrayWindow();
        showWindow();
        void checkUpdates(true, true);
        break;
      case 'quit':
        quitAll();
        break;
      case 'close':
        hideTrayWindow();
        break;
      case 'resize': {
        const h = Math.round(Number(arg));
        if (!Number.isFinite(h) || h < 100 || h > 900) return;
        const [w, cur] = trayWin.getSize();
        if (cur === h) return;
        trayWin.setSize(w, h);
        if (trayWin.isVisible()) placeTrayWindow();
        break;
      }
    }
  });
}

// ---------- atualizações ----------
// Windows (e Mac com assinatura da Apple): electron-updater pelo GitHub Releases.
// Mac sem assinatura: o Squirrel.Mac recusa apps ad-hoc, então usamos o MacUpdater (src/mac-updater.ts),
// que baixa, confere, troca o app e apaga os arquivos da atualização sozinho.
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
  // a página informa em que escritório está (null = saiu); só o cliente novo manda isto
  ipcMain.on('set-office', (e, name: unknown) => {
    if (!fromApp(e) || e.sender !== win?.webContents) return;
    inOffice = typeof name === 'string' && name ? name.slice(0, 80) : null;
    pageMiniWindow = true;
    if (!inOffice && mini) setMini(false, true);
    buildMenu();
  });
  ipcMain.on('mini-size', (e, w: number, h: number) => {
    if (!fromApp(e) || e.sender !== win?.webContents || !Number.isFinite(w) || !Number.isFinite(h)) return;
    placeMini(w, h);
  });
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
// Áudio da call: o filtro de voz do microfone (rede neural) pode iniciar sem esperar um clique,
// e o cancelamento de eco cobre tudo o que o app toca (não só a aba), para não vazar na call.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'ChromeWideEchoCancellation');

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
    setupTray();
    buildMenu();
    createWindow();
    if (isMac) {
      // pede câmera e microfone ao sistema já na primeira abertura
      await systemPreferences.askForMediaAccess('microphone').catch(() => false);
      await systemPreferences.askForMediaAccess('camera').catch(() => false);
    }
    app.on('activate', () => (mini ? setMini(false, true) : showWindow()));
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
