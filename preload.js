// window.electronAPI: what the page (app.js) asks the PC for. Same names as the original desktop app and the
// iPhone version's stand-in (mobile/electron-api.js).
const { contextBridge, ipcRenderer } = require('electron');

const arg = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : ''; };
const port = Number(arg('sine-port')) || 38472;
const token = arg('sine-token');
const call = (name) => (...args) => ipcRenderer.invoke(name, ...args);
const listen = (channel) => (cb) => { if (typeof cb === 'function') ipcRenderer.on(channel, (e, ...a) => cb(...a)); };
const none = () => {};

contextBridge.exposeInMainWorld('electronAPI', {
  isWindows: process.platform === 'win32',
  isMobile: false,
  isSineDesktop: true,
  serverToken: token,
  getServerPort: async () => port,

  minimizeWindow: call('window:minimize'),
  maximizeWindow: call('window:maximize'),
  closeWindow: call('window:close'),
  setZoomFactor: call('window:zoom'),
  getZoomFactor: call('window:get-zoom'),
  toggleMiniWindow: call('window:mini'),
  setMiniLyrics: call('window:mini-lyrics'),
  onWindowVisibility: listen('window-visibility'),

  setTrayOnClose: call('app:tray-on-close'),
  setMediaKeys: call('app:media-keys'),
  mediaKeysActive: call('app:media-keys-active'),
  onMediaCommand: listen('media-command'),
  getAppVersion: call('app:version'),
  restartApp: call('app:restart'),
  getGpuCompositing: call('app:gpu'),
  getHwAccel: call('app:hw-accel'),
  setHwAccel: call('app:set-hw-accel'),
  trimMemory: call('app:trim-memory'),
  openExternal: call('app:open-external'),
  logError: call('app:log-error'),
  openLogsFolder: call('app:open-logs'),
  getDiagnostics: call('app:diagnostics'),
  copyText: (text) => ipcRenderer.invoke('app:copy-text', text).then(() => true),
  // muriel:// links (desktop.js turns them into the page's muriel:deeplink events)
  onDeepLink: listen('deep-link'),
  pageReady: call('app:page-ready'),
  setQuality: call('app:set-quality'),
  // the secrets store (globalThis.__murielVault in desktop.js): read and written straight away, like on the iPhone
  vaultRead: (name) => ipcRenderer.sendSync('vault:read', String(name)),
  vaultWrite: (name, value) => ipcRenderer.sendSync('vault:write', String(name), value == null ? null : JSON.parse(JSON.stringify(value))),
  getLauncherInfo: async () => ({ platform: process.platform, canInstall: false, installed: true }),
  welcomeFinish: none,
  onWelcomeResult: none,

  saveTextFile: call('files:save-text'),
  pickMedia: call('files:pick-media'),
  pruneMedia: async () => {},
  importAudioFiles: call('files:import-audio'),
  // no share sheet on a PC: the text goes on the clipboard (app.js says "copied")
  shareText: (title, text) => ipcRenderer.invoke('app:copy-text', text),

  getCacheSize: call('cache:size'),
  clearCache: call('cache:clear'),
  getDataDir: call('data:get-dir'),
  pickDataDir: call('data:pick-dir'),
  setDataDir: call('data:set-dir'),
  getDownloadDir: call('downloads:get-dir'),
  pickDownloadDir: call('downloads:pick-dir'),
  setDownloadDir: call('downloads:set-dir'),
  resetDownloadDir: call('downloads:reset-dir'),

  // parts of the original desktop app Sine doesn't have (themes and plugins folders, Discord status, Google login)
  // are left out, so the page hides them as it does on the iPhone
  getAudioOutputInfo: async () => null,
});
