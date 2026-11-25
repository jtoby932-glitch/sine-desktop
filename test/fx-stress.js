// Plays a song and changes every sound control in the Audio panel, quickly and repeatedly, like a person trying
// things out. Reports page crashes, errors, and whether the song is still playing afterwards.
const h = require('./harness');
(async () => {
  const out = process.argv[2];
  const rounds = Number(process.argv[3] || 3);
  const { page, errors, close } = await h.open({ width: 1280, height: 800 });
  let crashed = false;
  page.on('crash', () => { crashed = true; console.log('PAGE CRASHED'); });
  await page.waitForSelector('#nf-welcome', { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
  await page.evaluate(() => { const t = { id: 'songAAAAAAA', title: 'Long Song', artist: 'Test', duration: 181, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songAAAAAAA' }; MurielCore.playTrack(t, [t], 0); });
  await page.waitForFunction(() => !MurielCore.audio.paused && MurielCore.audio.currentTime > 0.5, null, { timeout: 20000 });
  await page.evaluate(() => document.getElementById('btn-open-settings').click());
  await page.waitForTimeout(800);
  const controls = await page.evaluate(() => {
    const p = document.querySelector('.audio-panel[data-audio-panel="tempo"]');
    const list = [];
    p.querySelectorAll('input[type=range]').forEach((e) => { if (e.id) list.push({ k: 'range', sel: '#' + e.id, min: +e.min || 0, max: +e.max || 100 }); });
    p.querySelectorAll('button').forEach((b, i) => { b.dataset.stressId = 's' + i; if (!/reset|save|delete|remove|export|import/i.test(b.textContent + b.title)) list.push({ k: 'btn', sel: `[data-stress-id="s${i}"]`, label: b.textContent.trim().slice(0, 24) }); });
    p.querySelectorAll('input[type=checkbox]').forEach((e) => { if (e.id) list.push({ k: 'check', sel: '#' + e.id }); });
    return list;
  });
  console.log('controls:', controls.length);
  const log = [];
  for (let r = 0; r < rounds && !crashed; r++) {
    for (const c of controls) {
      if (crashed) break;
      try {
        const vis = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }, c.sel);
        if (!vis) continue;
        if (c.k === 'range') {
          const v = c.min + Math.random() * (c.max - c.min);
          await page.evaluate(([s, v]) => { const e = document.querySelector(s); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [c.sel, v]);
        } else {
          await page.click(c.sel, { timeout: 1500 }).catch(() => page.evaluate((s) => document.querySelector(s).click(), c.sel));
        }
        log.push(c.label || c.sel);
        await page.waitForTimeout(60 + Math.random() * 200);
      } catch (e) { if (crashed) break; }
    }
    const st = await page.evaluate(() => ({ t: MurielCore.audio.currentTime.toFixed(1), paused: MurielCore.audio.paused, fx: MurielPhoneFx.getStatus().kind, mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0 })).catch((e) => ({ err: e.message.slice(0, 80) }));
    console.log('round', r, JSON.stringify(st));
  }
  if (!crashed) {
    await page.waitForTimeout(8000);
    const st = await page.evaluate(() => ({ t: MurielCore.audio.currentTime.toFixed(1), paused: MurielCore.audio.paused, fx: MurielPhoneFx.getStatus().kind, rendered: MurielPhoneFx.isPlayingRendered(), mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0 })).catch((e) => ({ err: e.message }));
    console.log('settled', JSON.stringify(st));
    await page.screenshot({ path: `${out}/fx-stress.png` }).catch(() => {});
  }
  console.log('last actions:', log.slice(-6).join(' | '));
  console.log('errors:', JSON.stringify(errors.filter((e) => !/TUNNEL|tunnel|fonts|404|Failed to load resource|ERR_/.test(e)).slice(0, 12), null, 1));
  await close(); process.exit(0);
})().catch((e) => { console.log('ABORT', e.message.slice(0, 500)); process.exit(2); });
