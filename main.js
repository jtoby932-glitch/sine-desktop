// Sine for PC: the window, the in-app server (server.js, the same one the iPhone app runs) and the parts of a
// desktop app a web page can't do itself (window buttons, tray, media keys, files and folders).
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, globalShortcut, nativeImage, clipboard, safeStorage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SMOKE = process.argv.includes('--smoke-test');
if (SMOKE && process.env.SINE_SMOKE_DIR) app.setPath('userData', process.env.SINE_SMOKE_DIR);

// one Sine at a time: opening it again brings the running one forward
if (!SMOKE && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// muriel:// links open in Sine, as on the iPhone: the Spotify login coming back, a shared playlist, listening
// along with a friend, linking a device for sync. Windows starts Sine (or hands the link to the one running) with
// the link on the command line.
let protocolRegistered = false;
if (!SMOKE) {
  try {
    protocolRegistered = process.defaultApp
      ? app.setAsDefaultProtocolClient('muriel', process.execPath, [path.resolve(process.argv[1] || '.')])
      : app.setAsDefaultProtocolClient('muriel');
  } catch (e) {}
}
// the Spotify login comes back to the same address on the PC as on the iPhone (one setting in Spotify's dashboard)
if (protocolRegistered) process.env.SINE_SPOTIFY_REDIRECT = 'muriel://spotify-callback';
const linkIn = (argv) => (argv || []).find((a) => /^muriel:\/\//i.test(String(a))) || null;
let pendingLink = linkIn(process.argv);
function deliverLink(link) {
  if (!link) return;
  if (win && !win.isDestroyed() && pageReady) win.webContents.send('deep-link', link);
  else pendingLink = link;
}
let pageReady = false;

app.setAppUserModelId('io.github.sine.desktop');
// music starts without a click first (the queue carries on after a restart)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const settingsPath = () => path.join(app.getPath('userData'), 'desktop-settings.json');
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (e) { return {}; } }
function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  try { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2)); } catch (e) {}
  return next;
}
if (readSettings().hwAccel === false) app.disableHardwareAcceleration();
// a graphics driver crash must not take Sine down with it: Chromium restarts the graphics process (by default
// Electron quits after a few crashes)
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

// ---- the in-app server ----
// requests from server.js and its YouTube/SoundCloud client: Node's own networking, with a deadline so one
// stalled request can't leave a song loading for ever
globalThis.__murielFetch = (input, init = {}) => {
  const timeout = AbortSignal.timeout(30000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};
// logins server.js keeps (Last.fm): encrypted with Windows' own protection for this user
globalThis.__murielVault = (name) => {
  const file = path.join(app.getPath('userData'), 'secrets', `${String(name).replace(/[^a-z0-9_]/gi, '')}.bin`);
  return {
    read() {
      const raw = fs.readFileSync(file);
      return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8'));
    },
    write(value) {
      // nothing (null) means forget it
      if (value == null) { fs.rmSync(file, { force: true }); return; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const text = JSON.stringify(value);
      fs.writeFileSync(file, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : text, { mode: 0o600 });
    },
  };
};

let server = null;
let serverPort = 0;
let serverToken = '';
let platform = null;
let logger = null;

async function startServer() {
  platform = require('./server/platform');
  logger = require('./server/logger');
  require('./server/ytdlp-emulation').install();
  server = require('./server/server.js');
  serverPort = await server.startServer(38472);
  serverToken = server.getServerToken();
}

// ---- the window ----
let win = null;
let tray = null;
let trayOnClose = false;
let quitting = false;
let normalBounds = null;
let miniLyrics = false;
const MINI = { width: 400, height: 132, lyricsHeight: 300 };

function iconPath(name) {
  const inPackage = path.join(__dirname, 'build', name);
  return fs.existsSync(inPackage) ? inPackage : path.join(process.resourcesPath || __dirname, name);
}

function createWindow() {
  const saved = readSettings().bounds;
  // the first window fits the screen: a laptop at 125-150 % scaling has less than 820 points of height, and the
  // player bar would start below the bottom edge
  const area = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1280, Math.max(800, area.width - 48));
  const height = Math.min(820, Math.max(560, area.height - 48));
  win = new BrowserWindow({
    width,
    height,
    minWidth: 360,
    minHeight: 120,
    ...(saved && visibleOnSomeScreen(saved) ? saved : {}),
    frame: false,
    show: false,
    backgroundColor: '#050507',
    title: 'Sine',
    icon: iconPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // music keeps going (and its timers keep time) while the window is minimised or behind others
      backgroundThrottling: false,
      additionalArguments: [`--sine-port=${serverPort}`, `--sine-token=${serverToken}`],
    },
  });
  if (readSettings().maximized) win.maximize();
  win.webContents.on('did-start-loading', () => { pageReady = false; });
  // if the page's process dies (out of memory, a Chromium crash), say why in the log and bring the page back
  // instead of leaving a blank window
  let lastGone = 0;
  win.webContents.on('render-process-gone', (e, d) => {
    const msg = `page process gone: ${d.reason} (exit ${d.exitCode})`;
    console.error('[sine]', msg);
    if (logger) logger.log('error', msg);
    globalThis.__sineLastCrash = msg;
    if (SMOKE || quitting || !win || win.isDestroyed()) return;
    const now = Date.now();
    if (now - lastGone > 30000) setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.reload(); }, 400);
    lastGone = now;
  });
  win.webContents.on('unresponsive', () => { if (logger) logger.log('warn', 'page unresponsive'); });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  const tell = (visible) => { if (win && !win.isDestroyed()) win.webContents.send('window-visibility', visible); };
  win.on('minimize', () => tell(false));
  win.on('restore', () => tell(true));
  win.on('hide', () => tell(false));
  win.on('show', () => tell(true));
  win.on('maximize', () => writeSettings({ maximized: true }));
  win.on('unmaximize', () => writeSettings({ maximized: false }));
  const saveBounds = () => { if (win && !win.isMaximized() && !win.isMinimized() && !normalBounds) writeSettings({ bounds: win.getBounds() }); };
  win.on('resized', saveBounds);
  win.on('moved', saveBounds);
  win.on('close', (e) => {
    if (!quitting && trayOnClose && !SMOKE) { e.preventDefault(); win.hide(); ensureTray(); }
  });
  win.on('closed', () => { win = null; });

  // links open in the browser, never inside Sine
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
}

function visibleOnSomeScreen(b) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width - 50 && b.x + b.width > a.x + 50 && b.y < a.y + a.height - 50 && b.y + 30 > a.y;
  });
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function ensureTray() {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(iconPath('icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Sine');
  const send = (cmd) => { if (win) win.webContents.send('media-command', cmd); };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Sine', click: showWindow },
    { type: 'separator' },
    { label: 'Play / pause', click: () => send('toggle') },
    { label: 'Next', click: () => send('next') },
    { label: 'Previous', click: () => send('prev') },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

// media keys on the keyboard (Settings → Media keys). Windows' own media controls go through the page itself.
const MEDIA_KEYS = { MediaPlayPause: 'toggle', MediaNextTrack: 'next', MediaPreviousTrack: 'prev', MediaStop: 'stop' };
let mediaKeysOn = false;
function setMediaKeys(on) {
  globalShortcut.unregisterAll();
  mediaKeysOn = false;
  if (!on) return false;
  for (const [key, cmd] of Object.entries(MEDIA_KEYS)) {
    try { if (globalShortcut.register(key, () => { if (win) win.webContents.send('media-command', cmd); })) mediaKeysOn = true; } catch (e) {}
  }
  return mediaKeysOn;
}

// ---- what the page asks for ----
const handle = (name, fn) => ipcMain.handle(name, (e, ...args) => fn(...args));
const winOf = () => win;

handle('window:minimize', () => win && win.minimize());
handle('window:maximize', () => { if (!win) return; if (win.isMaximized()) win.unmaximize(); else win.maximize(); });
handle('window:close', () => win && win.close());
handle('window:zoom', (f) => { if (win && Number.isFinite(f) && f >= 0.5 && f <= 3) win.webContents.setZoomFactor(f); });
handle('window:get-zoom', () => (win ? win.webContents.getZoomFactor() : 1));
// the mini player is this window, small and on top (app.js switches layout below 520 px wide)
handle('window:mini', () => {
  if (!win) return false;
  if (normalBounds) {
    win.setAlwaysOnTop(false);
    win.setBounds(normalBounds);
    normalBounds = null;
    return false;
  }
  if (win.isMaximized()) win.unmaximize();
  normalBounds = win.getBounds();
  const area = screen.getDisplayMatching(normalBounds).workArea;
  const height = miniLyrics ? MINI.lyricsHeight : MINI.height;
  win.setBounds({ x: area.x + area.width - MINI.width - 24, y: area.y + area.height - height - 24, width: MINI.width, height });
  win.setAlwaysOnTop(true, 'floating');
  return true;
});
handle('window:mini-lyrics', (on) => {
  miniLyrics = !!on;
  if (win && normalBounds) {
    const b = win.getBounds();
    const height = miniLyrics ? MINI.lyricsHeight : MINI.height;
    win.setBounds({ ...b, y: b.y + b.height - height, height });
  }
});
handle('app:tray-on-close', (on) => { trayOnClose = !!on; if (trayOnClose) ensureTray(); });
handle('app:media-keys', (on) => setMediaKeys(!!on));
handle('app:media-keys-active', () => mediaKeysOn);
handle('app:version', () => app.getVersion());
handle('app:restart', () => { quitting = true; app.relaunch(); app.exit(0); });
handle('app:gpu', () => { try { return app.getGPUFeatureStatus().gpu_compositing; } catch (e) { return 'unknown'; } });
handle('app:hw-accel', () => readSettings().hwAccel !== false);
handle('app:set-hw-accel', (on) => writeSettings({ hwAccel: !!on }));
handle('app:trim-memory', () => { if (win) win.webContents.session.clearCache().catch(() => {}); });
handle('app:open-external', (url) => { if (/^https?:\/\//i.test(String(url)) || /^mailto:/i.test(String(url))) shell.openExternal(String(url)); });
handle('app:log-error', (msg) => { if (logger) logger.error(`[page] ${String(msg).slice(0, 2000)}`); });
handle('app:copy-text', (text) => { clipboard.writeText(String(text || '')); return 'copied'; });
handle('app:open-logs', () => { if (logger) shell.openPath(path.dirname(logger.LOG_FILE || path.join(app.getPath('userData'), 'logs', 'sine.log'))); });
handle('app:diagnostics', () => {
  let tail = '';
  try { const t = logger && logger.tail ? logger.tail(120) : ''; tail = Array.isArray(t) ? t.join('\n') : String(t || ''); } catch (e) {}
  return [`Sine for PC ${app.getVersion()} (Electron ${process.versions.electron}, ${process.platform} ${require('os').release()}, ${process.arch})`,
    `Server port ${serverPort}`, `GPU ${(() => { try { return app.getGPUFeatureStatus().gpu_compositing; } catch (e) { return '?'; } })()}`,
    '--- app log ---', tail].join('\n');
});
// the page's first links (Sine opened from one) wait until it is listening
// Settings → Tracks → Streaming quality: which version of a song the downloader fetches (server/ytdlp-emulation.js)
handle('app:set-quality', (tier) => { if (['veryhigh', 'high', 'medium', 'low'].includes(tier)) globalThis.__sineQuality = tier; });
handle('app:page-ready', () => { pageReady = true; const l = pendingLink; pendingLink = null; return l; });
// secrets the page keeps (your Spotify developer keys), in the same encrypted store the server reads them from
ipcMain.on('vault:read', (e, name) => {
  try { e.returnValue = { ok: true, value: globalThis.__murielVault(name).read() }; } catch (err) { e.returnValue = { ok: false }; }
});
ipcMain.on('vault:write', (e, name, value) => {
  try { globalThis.__murielVault(name).write(value); e.returnValue = true; } catch (err) { e.returnValue = false; }
});

handle('files:save-text', async ({ defaultName, content } = {}) => {
  if (typeof content !== 'string') return { success: false, error: 'Nothing to save' };
  const name = String(defaultName || 'sine.json').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 120) || 'sine.json';
  const r = await dialog.showSaveDialog(winOf(), { defaultPath: path.join(app.getPath('documents'), name) });
  if (r.canceled || !r.filePath) return { canceled: true };
  try { fs.writeFileSync(r.filePath, content); return { success: true, path: r.filePath }; } catch (e) { return { success: false, error: e.message }; }
});

// a background picture or video, copied into the music folder so it stays put
handle('files:pick-media', async () => {
  const r = await dialog.showOpenDialog(winOf(), { properties: ['openFile'], filters: [{ name: 'Pictures and videos', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const src = r.filePaths[0];
  const dir = path.join(platform.DATA_DIR, 'backgrounds');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `bg_${Date.now()}${path.extname(src).toLowerCase()}`);
  fs.copyFileSync(src, dest);
  return require('url').pathToFileURL(dest).href;
});

// your own audio files: copied into the library folder as local_<id>.<ext>, like the iPhone version
handle('files:import-audio', async () => {
  const r = await dialog.showOpenDialog(winOf(), { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'flac', 'wav', 'aac', 'ogg', 'opus', 'webm'] }] });
  if (r.canceled) return [];
  const out = [];
  for (const src of r.filePaths) {
    const st = fs.statSync(src);
    const name = path.basename(src);
    const ext = (path.extname(name).slice(1) || 'bin').toLowerCase();
    const id = 'local_' + crypto.createHash('sha1').update(name + st.size).digest('hex').slice(0, 12);
    const file = `${id}.${ext}`;
    const target = path.join(platform.LIBRARY_DIR, file);
    try {
      if (!fs.existsSync(target) || fs.statSync(target).size !== st.size) fs.copyFileSync(src, target);
      out.push({ id, file, ext, name: name.replace(/\.[^.]+$/, '') });
    } catch (e) { if (logger) logger.error(`import ${name}`, e); }
  }
  return out;
});

function dirSize(dir) {
  let total = 0;
  try { for (const n of fs.readdirSync(dir)) { try { total += fs.statSync(path.join(dir, n)).size; } catch (e) {} } } catch (e) {}
  return total;
}
handle('cache:size', async () => {
  const audio = dirSize(platform.CACHE_DIR);
  let web = 0;
  try { web = win ? await win.webContents.session.getCacheSize() : 0; } catch (e) {}
  return { audio, web, total: audio + web };
});
handle('cache:clear', async () => {
  try { await fetch(`http://127.0.0.1:${serverPort}/api/clear-offline-library`, { method: 'POST', headers: { 'X-Muriel-Token': serverToken } }); } catch (e) {}
  try { if (win) await win.webContents.session.clearCache(); } catch (e) {}
  return true;
});

handle('data:get-dir', () => ({ dir: platform.DATA_DIR, defaultDir: platform.DEFAULT_DATA_DIR, isCustom: platform.DATA_DIR !== platform.DEFAULT_DATA_DIR }));
handle('data:pick-dir', async () => {
  const r = await dialog.showOpenDialog(winOf(), { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
// moving the music folder: everything is copied over, then Sine restarts using it
handle('data:set-dir', async (dir) => {
  try {
    const target = dir ? path.resolve(dir) : platform.DEFAULT_DATA_DIR;
    if (target === platform.DATA_DIR) return { success: true };
    platform.copyDirContents(platform.DATA_DIR, target);
    platform.setDataDir(dir ? target : null);
    setTimeout(() => { quitting = true; app.relaunch(); app.exit(0); }, 400);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
handle('downloads:get-dir', () => {
  const chosen = platform.readStartupConfig().downloadDir;
  return { dir: platform.resolveDownloadDir(), isCustom: !!chosen };
});
handle('downloads:pick-dir', async () => {
  const r = await dialog.showOpenDialog(winOf(), { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
handle('downloads:set-dir', (dir) => ({ success: !!platform.setDownloadDir(dir) }));
handle('downloads:reset-dir', () => ({ success: !!platform.setDownloadDir(null) }));

// ---- start ----
app.on('child-process-gone', (e, d) => {
  const msg = `${d.type} process gone: ${d.reason} (exit ${d.exitCode})${d.name ? ' ' + d.name : ''}`;
  console.error('[sine]', msg);
  if (logger) logger.log('error', msg);
  globalThis.__sineLastGpuCrash = d.type === 'GPU' ? msg : globalThis.__sineLastGpuCrash;
  // a graphics driver that keeps crashing: Sine starts without hardware acceleration next time (Settings → Advanced
  // turns it back on)
  if (d.type === 'GPU' && d.reason !== 'clean-exit' && !SMOKE) {
    gpuCrashes += 1;
    if (gpuCrashes >= 2 && readSettings().hwAccel !== false && app.isHardwareAccelerationEnabled()) {
      writeSettings({ hwAccel: false });
      if (logger) logger.log('warn', 'graphics crashed twice: restarting Sine without hardware acceleration');
      // straight away, so it stops crashing now (Settings → Advanced turns it back on)
      setTimeout(() => { quitting = true; app.relaunch(); app.exit(0); }, 300);
    }
  }
});
let gpuCrashes = 0;
app.on('second-instance', (e, argv) => { showWindow(); deliverLink(linkIn(argv)); });
app.on('open-url', (e, url) => { e.preventDefault(); showWindow(); deliverLink(url); });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (server) server.stopServer(); });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (e) {
    dialog.showErrorBox('Sine', `Sine couldn't start its music server:\n${(e && e.message) || e}`);
    app.exit(1);
    return;
  }
  createWindow();
  if (SMOKE) require('./smoke-test')({ app, win, serverPort, serverToken });
});
