// Test harness for Sine for PC: the real server (in Node, with the test song catalogue) and the real page in
// Chromium, with window.electronAPI standing in for preload.js.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

async function startServer(userDir) {
  const p = spawn(process.execPath, [path.join(__dirname, 'run-server.js')], {
    env: { ...process.env, SINE_USER_DIR: userDir, SINE_FAKE_EXTRACT: path.join(__dirname, 'fake-extract.js'), SINE_TEST_MEDIA: process.env.SINE_TEST_MEDIA },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  p.stderr.on('data', (d) => { out += d; });
  const info = await new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => { out += d; const m = out.match(/^\{.*\}$/m); if (m) resolve(JSON.parse(m[0])); });
    p.on('exit', (c) => reject(new Error('server exited ' + c + ': ' + out)));
    setTimeout(() => reject(new Error('server did not start: ' + out)), 15000);
  });
  return { proc: p, ...info, log: () => out };
}

async function open({ width = 1280, height = 820, userDir } = {}) {
  userDir = userDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sine-desk-'));
  const server = await startServer(userDir);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(({ port, token }) => {
    const calls = [];
    window.__apiCalls = calls;
    const rec = (name, ret) => (...a) => { calls.push([name, ...a]); return Promise.resolve(typeof ret === 'function' ? ret(...a) : ret); };
    window.electronAPI = {
      isWindows: true, isMobile: false, isSineDesktop: true, serverToken: token, getServerPort: async () => port,
      minimizeWindow: rec('minimizeWindow'), maximizeWindow: rec('maximizeWindow'), closeWindow: rec('closeWindow'),
      setZoomFactor: rec('setZoomFactor'), getZoomFactor: rec('getZoomFactor', 1), toggleMiniWindow: rec('toggleMiniWindow', false), setMiniLyrics: rec('setMiniLyrics'),
      onWindowVisibility: (cb) => { window.__visibility = cb; }, setTrayOnClose: rec('setTrayOnClose'), setMediaKeys: rec('setMediaKeys', true), mediaKeysActive: rec('mediaKeysActive', true),
      onMediaCommand: (cb) => { window.__mediaCommand = cb; }, getAppVersion: rec('getAppVersion', '2.10.4'), restartApp: rec('restartApp'), getGpuCompositing: rec('getGpuCompositing', 'enabled'),
      getHwAccel: rec('getHwAccel', true), setHwAccel: rec('setHwAccel'), trimMemory: rec('trimMemory'), openExternal: rec('openExternal'), logError: rec('logError'),
      getLauncherInfo: rec('getLauncherInfo', { platform: 'win32', canInstall: false, installed: true }), welcomeFinish: () => {}, onWelcomeResult: () => {},
      saveTextFile: rec('saveTextFile', { success: true }), pickMedia: rec('pickMedia', null), pruneMedia: rec('pruneMedia'), importAudioFiles: rec('importAudioFiles', []), shareText: rec('shareText', 'copied'),
      getCacheSize: rec('getCacheSize', { audio: 1000, web: 0, total: 1000 }), clearCache: rec('clearCache', true), getDataDir: rec('getDataDir', { dir: 'C:\\Users\\Toby\\AppData\\Roaming\\Sine\\Music library', defaultDir: 'x', isCustom: false }),
      pickDataDir: rec('pickDataDir', null), setDataDir: rec('setDataDir', { success: true }), getDownloadDir: rec('getDownloadDir', { dir: 'C:\\Users\\Toby\\Music\\Sine', isCustom: false }),
      pickDownloadDir: rec('pickDownloadDir', null), setDownloadDir: rec('setDownloadDir', { success: true }), resetDownloadDir: rec('resetDownloadDir', { success: true }),
      getAudioOutputInfo: async () => null, listThemes: async () => [], listPlugins: async () => [], importThemes: async () => [], getAppCss: async () => '',
      setThemeEnabled: async () => false, setPluginEnabled: async () => false, removeTheme: async () => false, removePlugin: async () => false, disableAllThemes: async () => {}, disableAllPlugins: async () => {},
      discordPresenceUpdate: () => {}, discordPresenceClear: () => {}, googleImportLibrary: async () => ({ success: false }),
    };
    try { if (!localStorage.getItem('nocturne_seen_version')) localStorage.setItem('nocturne_seen_version', '2.10.4'); } catch (e) {}
    try { if (sessionStorage.getItem('__cold') !== '1') sessionStorage.setItem('sine_opened', '1'); } catch (e) {}
  }, { port: server.port, token: server.token });
  await page.goto('file://' + path.join(__dirname, '..', 'renderer', 'index.html'));
  await page.waitForFunction(() => window.MurielCore && window.NocturneExtras, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  return { browser, page, errors, server, userDir, close: async () => { await browser.close(); server.proc.kill(); } };
}
module.exports = { open };
