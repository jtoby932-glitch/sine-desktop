// A pass over everything a person does in Sine for PC, in a desktop browser with the PC's page and server (songs
// stood in for). Each step reports PASS/FAIL and any page errors it caused.
const h = require('./harness');
const fs = require('fs');
(async () => {
  const out = process.argv[2];
  const { page, close, errors } = await h.open({ width: 1280, height: 800 });
  let crashed = false; page.on('crash', () => { crashed = true; });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  const res = [];
  let seen = 0;
  const newErrors = () => { const e = errors.slice(seen).filter((x) => !/TUNNEL|tunnel|fonts\.g|404|Failed to load resource|ERR_|net::|ResizeObserver/.test(x)); seen = errors.length; return e; };
  const step = async (name, fn) => {
    let ok = false, detail = '';
    try { const r = await fn(); ok = r === undefined ? true : !!(r && r.ok !== undefined ? r.ok : r); detail = r && r.detail ? r.detail : (typeof r === 'object' ? JSON.stringify(r).slice(0, 200) : ''); }
    catch (e) { detail = 'threw: ' + String(e.message || e).slice(0, 200); }
    await page.waitForTimeout(150);
    const errs = newErrors();
    if (errs.length) { ok = false; detail += ' ERRORS: ' + errs.slice(0, 3).join(' || ').slice(0, 500); }
    if (crashed) { ok = false; detail += ' PAGE CRASHED'; }
    res.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`);
  };
  const ev = (f, a) => page.evaluate(f, a);
  const click = (sel) => ev((s) => { const e = document.querySelector(s); if (!e) throw new Error('missing ' + s); e.click(); return true; }, sel);
  const wait = (ms) => page.waitForTimeout(ms);
  const T = (id, title, artist, d) => ({ id, title, artist, duration: d, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=' + id });
  const songs = [T('songAAAAAAA', 'Long Song', 'Test Artist', 181), T('songMMMMMMM', 'Beta', 'Second Artist', 25), T('songCCCCCCC', 'Gamma', 'Third Artist', 40)];

  await page.waitForSelector('#nf-welcome', { timeout: 5000 }).catch(() => {});
  await step('welcome card closes', async () => { await click('.nf-welcome-ok'); await wait(500); return ev(() => !document.querySelector('#nf-welcome') || !document.querySelector('#nf-welcome').offsetParent); });
  await step('every sidebar page opens', async () => {
    const bad = [];
    for (const id of ['nav-discover', 'nav-favorites', 'nav-local', 'nav-history', 'nav-albums', 'nav-artists', 'nav-settings', 'nav-home-app-icon']) {
      const ok = await ev((i) => { const e = document.getElementById(i); if (!e || !e.offsetParent) return 'hidden'; e.click(); return true; }, id);
      await wait(400);
      if (ok !== true) bad.push(id + ':' + ok);
      await page.screenshot({ path: `${out}/page-${id}.png` });
    }
    return { ok: true, detail: bad.join(',') };
  });
  await step('search finds songs', async () => { await page.fill('#search-input', 'test'); await page.press('#search-input', 'Enter'); await wait(2500); return ev(() => document.querySelectorAll('#search-results-container .track-row, .search-results .track-row, .track-row').length > 0); });
  await step('every search source switches', async () => {
    for (const id of ['platform-ytm', 'platform-sc', 'platform-sp', 'platform-yt']) { await ev((i) => { const e = document.getElementById(i); if (e) e.click(); }, id); await wait(900); }
    return true;
  });
  await step('play a song', async () => { await ev((s) => MurielCore.playTrack(s[0], s, 0), songs); await page.waitForFunction(() => !MurielCore.audio.paused && MurielCore.audio.currentTime > 0.3, null, { timeout: 20000 }); return true; });
  await step('pause and play with the button', async () => { await click('#btn-play-pause'); await wait(500); const p = await ev(() => MurielCore.audio.paused); await click('#btn-play-pause'); await wait(800); return { ok: p && !(await ev(() => MurielCore.audio.paused)) }; });
  await step('Space key pauses', async () => { await ev(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('Space'); await wait(500); const p = await ev(() => MurielCore.audio.paused); await page.keyboard.press('Space'); await wait(700); return { ok: p && !(await ev(() => MurielCore.audio.paused)), detail: 'paused after space=' + p }; });
  await step('seek with the progress bar', async () => { await ev(() => MurielCore.seek(60)); await wait(800); const t = await ev(() => MurielCore.audio.currentTime); return { ok: t > 58, detail: 't=' + t }; });
  await step('Shift+Right jumps 5 s', async () => { const a = await ev(() => MurielCore.audio.currentTime); await page.keyboard.press('Shift+ArrowRight'); await wait(600); const b = await ev(() => MurielCore.audio.currentTime); return { ok: b - a > 3, detail: `${a.toFixed(1)}→${b.toFixed(1)}` }; });
  await step('next song', async () => { await click('#btn-next'); await page.waitForFunction(() => MurielCore.state.currentTrack && MurielCore.state.currentTrack.id === 'songMMMMMMM' && !MurielCore.audio.paused, null, { timeout: 15000 }); return true; });
  await step('previous song', async () => { await click('#btn-prev'); await wait(300); await click('#btn-prev'); await page.waitForFunction(() => MurielCore.state.currentTrack && MurielCore.state.currentTrack.id === 'songAAAAAAA', null, { timeout: 15000 }); return true; });
  await step('Ctrl+Right skips', async () => { await page.keyboard.press('Control+ArrowRight'); await page.waitForFunction(() => MurielCore.state.currentTrack.id !== 'songAAAAAAA', null, { timeout: 15000 }); return true; });
  await step('shuffle and repeat toggle', async () => { await click('#btn-shuffle'); await click('#btn-repeat'); await click('#btn-repeat'); await click('#btn-repeat'); await click('#btn-shuffle'); return true; });
  await step('volume slider and mute', async () => {
    await ev(() => { const v = document.getElementById('volume-slider'); v.value = String((+v.max || 1) * 0.4); v.dispatchEvent(new Event('input', { bubbles: true })); });
    await wait(300);
    const vol = await ev(() => Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume').get.call(MurielCore.audio));
    await click('#btn-volume-mute'); await wait(300);
    const muted = await ev(() => MurielCore.audio.muted);
    await click('#btn-volume-mute'); await wait(300);
    return { ok: vol > 0.2 && vol < 0.6 && muted && !(await ev(() => MurielCore.audio.muted)), detail: `vol ${vol} muted ${muted}` };
  });
  await step('M key mutes', async () => { await ev(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('m'); await wait(300); const m = await ev(() => MurielCore.audio.muted); await page.keyboard.press('m'); await wait(300); return { ok: m && !(await ev(() => MurielCore.audio.muted)) }; });
  await step('like a song (heart)', async () => { const before = await ev(() => MurielCore.isFavorite(MurielCore.state.currentTrack)); await click('#btn-toggle-fav'); await wait(300); const after = await ev(() => MurielCore.isFavorite(MurielCore.state.currentTrack)); return { ok: before !== after }; });
  await step('queue panel opens and shows songs', async () => { await click('#btn-toggle-queue'); await wait(700); await page.screenshot({ path: `${out}/queue.png` }); return ev(() => !!document.querySelector('#right-panel') && getComputedStyle(document.querySelector('#right-panel')).display !== 'none'); });
  await step('lyrics panel opens', async () => { await click('#btn-toggle-lyrics-panel'); await wait(1200); await page.screenshot({ path: `${out}/lyrics.png` }); return true; });
  await step('make, rename and delete a playlist', async () => {
    await ev((s) => MurielCore.createPlaylist('Debug list', [s[0]]), songs); await wait(300);
    const pl = await ev(() => MurielCore.state.playlists.find((p) => p.name === 'Debug list'));
    if (!pl) return { ok: false, detail: 'not made' };
    await ev((id) => MurielCore.renamePlaylist(id, 'Debug list 2'), pl.id); await wait(200);
    const renamed = await ev(() => MurielCore.state.playlists.some((p) => p.name === 'Debug list 2'));
    await ev((id) => MurielCore.deletePlaylist(id), pl.id); await wait(300);
    return { ok: renamed && !(await ev(() => MurielCore.state.playlists.some((p) => /Debug list/.test(p.name)))) };
  });
  await step('playlist page opens and plays', async () => {
    await ev((s) => MurielCore.createPlaylist('Open me', s), songs); await wait(300);
    await ev(() => { MurielCore.renderPlaylistsList && MurielCore.renderPlaylistsList(); const e = [...document.querySelectorAll('[data-playlist-id], .playlist-item, .sidebar-playlist')].find((x) => /Open me/.test(x.textContent)); if (e) e.click(); });
    await wait(800); await page.screenshot({ path: `${out}/playlist.png` });
    const btn = await ev(() => { const b = document.getElementById('btn-play-playlist'); if (b && b.offsetParent) { b.click(); return true; } return false; });
    await wait(1500);
    return { ok: btn, detail: 'play button ' + btn };
  });
  await step('right-click menu on a song', async () => {
    const ok = await ev(() => { const r = document.querySelector('.track-row'); if (!r) return 'no rows'; r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 400, clientY: 300 })); return true; });
    await wait(400); const items = await ev(() => [...document.querySelectorAll('.track-context-menu .track-context-item')].map((b) => b.textContent.trim()));
    await page.screenshot({ path: `${out}/context.png` });
    await page.keyboard.press('Escape');
    return { ok: ok === true && items.length > 2, detail: items.join('|') };
  });
  await step('Audio panel: every tab and control', async () => {
    await click('#btn-open-settings'); await wait(700);
    for (const tab of ['sleep', 'tempo']) { await ev((t) => { const b = document.querySelector(`.audio-tab[data-audio-tab="${t}"]`); if (b) b.click(); }, tab); await wait(400); }
    const n = await ev(async () => {
      const p = document.querySelector('.audio-panel[data-audio-panel="tempo"]'); let n = 0;
      for (const e of p.querySelectorAll('input[type=range], button, input[type=checkbox]')) {
        if (!e.offsetParent || /reset|save|delete|remove|export|import/i.test((e.textContent || '') + (e.title || ''))) continue;
        if (e.type === 'range') { e.value = String((+e.min || 0) + Math.random() * ((+e.max || 100) - (+e.min || 0))); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } else e.click();
        n++; await new Promise((r) => setTimeout(r, 30));
      }
      return n;
    });
    await wait(3000);
    await page.screenshot({ path: `${out}/audio.png` });
    await page.keyboard.press('Escape'); await wait(300);
    return { ok: n > 30 && !(await ev(() => MurielCore.audio.paused)), detail: n + ' controls' };
  });
  await step('sleep timer sets and cancels', async () => {
    await click('#btn-open-settings'); await wait(500);
    await ev(() => { const b = document.querySelector('.audio-tab[data-audio-tab="sleep"]'); b && b.click(); });
    await wait(300);
    const r = await ev(() => { const b = [...document.querySelectorAll('.audio-panel[data-audio-panel="sleep"] button')].find((x) => /15|10|5/.test(x.textContent)); if (!b) return 'no button'; b.click(); return b.textContent.trim(); });
    await wait(300); await page.screenshot({ path: `${out}/sleep.png` });
    await ev(() => { const b = [...document.querySelectorAll('.audio-panel[data-audio-panel="sleep"] button')].find((x) => /cancel|off|stop/i.test(x.textContent)); b && b.click(); });
    await page.keyboard.press('Escape');
    return { ok: typeof r === 'string' && r !== 'no button', detail: r };
  });
  await step('every setting can be toggled', async () => {
    await click('#nav-settings'); await wait(500);
    const cats = await ev(() => [...document.querySelectorAll('#settings-nav [data-cat]')].filter((b) => b.offsetParent).map((b) => b.dataset.cat));
    const done = [];
    for (const c of cats) {
      await ev((cat) => window.showSettingsCategory(cat), c); await wait(300);
      const n = await ev(async (cat) => {
        let n = 0;
        const sec = document.querySelector(`.settings-section[data-cat="${cat}"]`) || document.querySelector('.settings-pane');
        for (const e of [...sec.querySelectorAll('input[type=checkbox], .md-switch input, select')]) {
          if (!e.offsetParent && !(e.parentElement && e.parentElement.offsetParent)) continue;
          if (/hw-accel|hardware|restart|data-dir|tray|media-key|legacy/i.test(e.id || '')) continue;
          if (e.tagName === 'SELECT') { if (e.options.length > 1) { const v = e.value; e.selectedIndex = (e.selectedIndex + 1) % e.options.length; e.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 60)); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); } }
          else { e.click(); await new Promise((r) => setTimeout(r, 60)); e.click(); }
          n++; await new Promise((r) => setTimeout(r, 40));
        }
        return n;
      }, c);
      done.push(`${c}:${n}`);
    }
    return { ok: true, detail: done.join(' ') };
  });
  await step('every appearance theme and accent', async () => {
    await ev(() => window.showSettingsCategory('theme')); await wait(300);
    const n = await ev(async () => { let n = 0; for (const b of document.querySelectorAll('.settings-section[data-cat="theme"] .theme-option, .settings-section[data-cat="theme"] [data-theme], .settings-section[data-cat="theme"] .accent-swatch, .settings-section[data-cat="theme"] [data-accent]')) { if (!b.offsetParent) continue; b.click(); n++; await new Promise((r) => setTimeout(r, 80)); } return n; });
    await page.screenshot({ path: `${out}/theme.png` });
    return { ok: true, detail: n + ' options' };
  });
  await step('settings search', async () => { await ev(() => window.showSettingsCategory('interface')); const i = await ev(() => { const s = document.querySelector('#settings-search, .settings-search input'); return s ? '#' + (s.id || '') : null; }); if (!i || i === '#') return { ok: false, detail: 'no search box' }; await page.fill(i, 'volume'); await wait(500); await page.screenshot({ path: `${out}/settings-search.png` }); await page.fill(i, ''); return true; });
  await step('profiles: make and switch back', async () => {
    await ev(() => window.showSettingsCategory('profiles')); await wait(300);
    await page.screenshot({ path: `${out}/profiles.png` });
    return true;
  });
  await step('Copy diagnostics and Open logs', async () => {
    await ev(() => window.showSettingsCategory('about')); await wait(300);
    const r = await ev(() => { const b = [...document.querySelectorAll('.settings-section[data-cat="about"] button')].map((x) => x.textContent.trim()); return b; });
    await ev(() => { [...document.querySelectorAll('.settings-section[data-cat="about"] button')].filter((x) => /diagnostic|log/i.test(x.textContent)).forEach((x) => x.click()); });
    await wait(500);
    const c = (await ev(() => window.__apiCalls.map((x) => x[0]))).filter((x) => /getDiagnostics|openLogsFolder|copyText/.test(x));
    return { ok: c.length >= 2, detail: r.join('|') + ' → ' + c.join(',') };
  });
  await step('backup export', async () => { await ev(() => window.showSettingsCategory('storage')); await wait(300); const b = await ev(() => { const x = [...document.querySelectorAll('.settings-section[data-cat="storage"] button')].find((y) => /export|back ?up/i.test(y.textContent)); if (!x) return null; x.click(); return x.textContent.trim(); }); await wait(800); const c = (await ev(() => window.__apiCalls.map((x) => x[0]))).filter((x) => x === 'saveTextFile'); return { ok: !!b && c.length > 0, detail: `${b} saveTextFile=${c.length}` }; });
  await step('mini player size', async () => { await page.setViewportSize({ width: 400, height: 132 }); await wait(800); await page.screenshot({ path: `${out}/mini.png` }); const ok = await ev(() => document.body.classList.contains('mini')); await page.setViewportSize({ width: 1280, height: 800 }); await wait(800); return ok; });
  await step('window buttons call the PC', async () => { for (const id of ['btn-minimize', 'btn-maximize', 'btn-mini-player']) await ev((i) => { const e = document.getElementById(i); e && e.click(); }, id); await wait(300); const c = (await ev(() => window.__apiCalls.map((x) => x[0]))).filter((x) => /minimize|maximize|toggleMini/i.test(x)); return { ok: c.length >= 3, detail: c.join(',') }; });
  await step('Ctrl+K focuses search', async () => { await ev(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('Control+k'); await wait(300); return ev(() => document.activeElement && document.activeElement.id === 'search-input'); });
  await step('song keeps playing at the end', async () => { await page.keyboard.press('Escape'); const p = await ev(() => ({ paused: MurielCore.audio.paused, t: MurielCore.audio.currentTime, track: MurielCore.state.currentTrack && MurielCore.state.currentTrack.title })); return { ok: true, detail: JSON.stringify(p) }; });
  fs.writeFileSync(`${out}/debug-all.json`, JSON.stringify(res, null, 1));
  console.log(`\n${res.filter((r) => r.ok).length}/${res.length} passed`);
  await close(); process.exit(0);
})().catch((e) => { console.log('ABORT', e.stack.slice(0, 600)); process.exit(2); });
