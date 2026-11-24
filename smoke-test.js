// `Sine.exe --smoke-test`: the build's own check, run by the build workflow on a real Windows machine. Starts the
// app as you would, checks the server and the page, then tries the real internet (search, and loading a song) and
// writes what happened to SINE_SMOKE_OUT. Exit code 1 if the app itself is broken; the internet parts are reported
// (YouTube can refuse a data centre's address, which says nothing about a home PC).
const fs = require('fs');

module.exports = async function smokeTest({ app, win, serverPort, serverToken }) {
  const page = (code) => win.webContents.executeJavaScript(code);
  const waitIn = async (code, ms, every = 500) => {
    const t0 = Date.now();
    for (;;) {
      const v = await page(code).catch(() => null);
      if (v) return v;
      if (Date.now() - t0 > ms) return null;
      await new Promise((r) => setTimeout(r, every));
    }
  };
  // host: shows a code, waits for the other copy, adds a playlist and checks it arrives there (the other copy
  // reports that); join: enters the code and waits for the playlist
  async function syncTest(role) {
    const codeFile = process.env.SINE_SYNC_CODE;
    const r = { role };
    const T0 = Date.now();
    if (role === 'host') {
      await page('MurielSync.link()');
      const code = await waitIn(`(() => { const c = document.querySelector('.sync-code'); return c && c.textContent.trim(); })()`, 20000);
      const linkError = await page(`(() => { const e = document.querySelector('.sync-error'); return e && e.textContent; })()`).catch(() => null);
      r.code = code; r.linkError = linkError;
      if (!code) return r;
      fs.writeFileSync(codeFile, code);
      r.connected = !!(await waitIn('MurielSync.status().connected.length > 0', 120000));
      r.connectedAfter = Math.round((Date.now() - T0) / 1000);
      if (r.connected) {
        await page(`MurielCore.createPlaylist('Sync test from host', [{ id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artist: 'Rick Astley', platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }])`);
        // and what the other copy adds comes here
        r.gotTheirs = !!(await waitIn(`JSON.parse(localStorage.getItem('devsize_playlists') || '[]').some((p) => p.name === 'Sync test from join')`, 60000));
        await new Promise((res) => setTimeout(res, 8000)); // the other copy's last messages
      }
      r.status = await page('JSON.stringify(MurielSync.status())').catch(() => '');
      return r;
    }
    const t0 = Date.now();
    let code = '';
    while (!code && Date.now() - t0 < 60000) { try { code = fs.readFileSync(codeFile, 'utf8').trim(); } catch (e) {} if (!code) await new Promise((res) => setTimeout(res, 500)); }
    r.code = code;
    if (!code) return r;
    await page(`MurielSync.join(${JSON.stringify(code)})`);
    r.linked = !!(await waitIn('MurielSync.status().group', 40000));
    r.joinNote = await page(`(() => { const e = document.querySelector('.sync-section .sync-note'); return e && e.textContent; })()`).catch(() => null);
    r.connected = !!(await waitIn('MurielSync.status().connected.length > 0', 90000));
    if (r.connected) {
      r.gotHosts = !!(await waitIn(`JSON.parse(localStorage.getItem('devsize_playlists') || '[]').some((p) => p.name === 'Sync test from host')`, 60000));
      r.inApp = await page(`MurielCore.state.playlists.some((p) => p.name === 'Sync test from host')`).catch(() => false);
      await page(`MurielCore.createPlaylist('Sync test from join', [])`);
      await new Promise((res) => setTimeout(res, 10000));
    }
    r.status = await page('JSON.stringify(MurielSync.status())').catch(() => '');
    return r;
  }

  const out = { started: true, checks: [] };
  const check = (name, ok, detail = '') => { out.checks.push({ name, ok: !!ok, detail: String(detail).slice(0, 500) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
  const pageErrors = [];
  win.webContents.on('console-message', (e, level, message) => { if (level >= 3) pageErrors.push(message); });
  const api = (p) => fetch(`http://127.0.0.1:${serverPort}${p}`, { headers: { 'X-Muriel-Token': serverToken } }).then((r) => r.json());
  const finish = (code) => {
    try { if (process.env.SINE_SMOKE_OUT) fs.writeFileSync(process.env.SINE_SMOKE_OUT, JSON.stringify({ ...out, pageErrors }, null, 2)); } catch (e) {}
    setTimeout(() => app.exit(code), 200);
  };
  const timer = setTimeout(() => { check('finished in time', false); finish(1); }, process.env.SINE_SYNC_ROLE ? 280000 : 150000);
  try {
    check('server is listening', serverPort > 0, serverPort);
    const lib = await api('/api/library').catch((e) => ({ error: e.message }));
    check('server answers', lib && !lib.error, JSON.stringify(lib).slice(0, 120));
    // ffmpeg comes with the app (downloads in MP3 and the other formats)
    const ffmpeg = require('./server/platform').resolveBinary('ffmpeg');
    check('ffmpeg is bundled', ffmpeg && /app\.asar\.unpacked|ffmpeg-static/.test(ffmpeg), ffmpeg);

    await new Promise((resolve) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', resolve) : resolve()));
    const ready = await win.webContents.executeJavaScript(`new Promise((resolve) => {
      const t0 = Date.now();
      (function wait() {
        if (window.MurielCore && window.NocturneExtras && window.MurielPhoneFx) return resolve({ ok: true, desktop: document.documentElement.classList.contains('is-desktop'), phoneLayout: document.documentElement.classList.contains('is-mobile') });
        if (Date.now() - t0 > 20000) return resolve({ ok: false });
        setTimeout(wait, 100);
      })();
    })`);
    check('page starts', ready.ok, JSON.stringify(ready));
    check('desktop layout', ready.desktop && !ready.phoneLayout);
    const fatal = pageErrors.filter((m) => !/Failed to load resource|ERR_|net::|ResizeObserver loop/i.test(m));
    check('no errors while starting', fatal.length === 0, fatal.slice(0, 3).join(' | '));

    // sync between two copies of Sine on this machine (the workflow starts a "host" and a "join" copy)
    const role = process.env.SINE_SYNC_ROLE;
    if (role) {
      out.sync = await syncTest(role);
      console.log('sync:', JSON.stringify(out.sync));
      clearTimeout(timer);
      return finish(out.checks.every((c) => c.ok) ? 0 : 1);
    }

    // the real internet
    const search = await api('/api/search?q=' + encodeURIComponent('Rick Astley Never Gonna Give You Up')).catch((e) => ({ error: e.message }));
    const tracks = (search && search.tracks) || [];
    out.search = { ok: tracks.length > 0, count: tracks.length, first: tracks[0] && `${tracks[0].title} — ${tracks[0].artist}`, error: search && (search.error || search.message) };
    console.log('search:', JSON.stringify(out.search));
    if (tracks[0]) {
      const t = tracks[0];
      const info = await api(`/api/stream-info?id=${encodeURIComponent(t.id)}&title=${encodeURIComponent(t.title)}&artist=${encodeURIComponent(t.artist)}&duration=${t.duration || 0}`).catch((e) => ({ error: e.message }));
      out.stream = { ok: !!(info && info.success && info.streamUrl), error: info && (info.error || info.message) };
      if (out.stream.ok) {
        const r = await fetch(info.streamUrl);
        const bytes = (await r.arrayBuffer()).byteLength;
        out.stream.bytes = bytes;
        out.stream.ok = r.ok && bytes > 100000;
        // and played in the page, through Sine's sound engine with an effect on
        const played = await win.webContents.executeJavaScript(`new Promise((resolve) => {
          const t = ${JSON.stringify({ id: t.id, title: t.title, artist: t.artist, duration: t.duration || 0, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=' + t.id })};
          MurielCore.playTrack(t, [t], 0);
          const t0 = Date.now();
          (function wait() {
            const a = MurielCore.audio;
            if (a.currentTime > 3) return resolve({ ok: true, at: a.currentTime });
            if (Date.now() - t0 > 30000) return resolve({ ok: false, at: a.currentTime, error: a.error && a.error.message, paused: a.paused });
            setTimeout(wait, 200);
          })();
        })`);
        out.play = played;
      }
      console.log('stream:', JSON.stringify(out.stream), 'play:', JSON.stringify(out.play || null));
    }
    // Spotify links (report only: Spotify can refuse a data centre too)
    for (const [name, link] of [['song', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x'], ['playlist', 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M']]) {
      const sp = await api(`/api/spotify-import?url=${encodeURIComponent(link)}`).catch((e) => ({ error: e.message }));
      out[`spotify_${name}`] = { ok: !!(sp && sp.success && sp.tracks && sp.tracks.length), name: sp && sp.name, count: sp && sp.tracks && sp.tracks.length, first: sp && sp.tracks && sp.tracks[0], error: sp && (sp.error || sp.code) };
      console.log(`spotify ${name}:`, JSON.stringify(out[`spotify_${name}`]));
    }
    clearTimeout(timer);
    finish(out.checks.every((c) => c.ok) ? 0 : 1);
  } catch (e) {
    check('smoke test ran', false, e && e.stack);
    clearTimeout(timer);
    finish(1);
  }
};
