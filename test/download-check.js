// Download a song as MP3 (and WAV, and with Sine's effects on) the way the PC does: decode, render, encode.
const h = require('./harness');
const fs = require('fs');
const path = require('path');
(async () => {
  const { page, close, errors, userDir } = await h.open({ width: 1280, height: 800 });
  const results = [];
  const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(detail).slice(0, 400)}`); };
  await page.waitForSelector('#nf-welcome', { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
  await page.evaluate(() => { const t = { id: 'songMMMMMMM', title: 'Short Song', artist: 'Tester', duration: 25, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songMMMMMMM' }; MurielCore.playTrack(t, [t], 0); });
  await page.waitForFunction(() => MurielCore.audio.currentTime > 0.5, null, { timeout: 20000 });
  const dlDir = path.join(userDir, 'music', 'Sine');
  const tryFormat = async (fmt, effects) => {
    await page.evaluate(() => document.getElementById('btn-playbar-more').click());
    await page.waitForTimeout(600);
    await page.evaluate((f) => { const c = document.querySelector(`#format-chips-grid [data-format="${f}"]`); if (c) c.click(); }, fmt);
    await page.evaluate((on) => { const c = document.getElementById('download-apply-effects'); if (c && c.checked !== on) c.click(); }, effects);
    await page.evaluate(() => document.getElementById('btn-confirm-download').click());
    const t0 = Date.now();
    let file = null;
    while (Date.now() - t0 < 40000) {
      try { file = fs.readdirSync(dlDir).find((n) => n.endsWith('.' + fmt)); } catch (e) {}
      if (file) break;
      await page.waitForTimeout(500);
    }
    const toast = await page.evaluate(() => [...document.querySelectorAll('.toast, .snackbar, [class*=toast]')].map((t) => t.textContent.trim()).filter(Boolean).slice(-2).join(' | '));
    return { file, size: file ? fs.statSync(path.join(dlDir, file)).size : 0, toast };
  };
  let r = await tryFormat('mp3', false);
  check('download as MP3', r.file && r.size > 100000, r);
  fs.readdirSync(dlDir).forEach((n) => { if (n.endsWith('.mp3')) fs.unlinkSync(path.join(dlDir, n)); });
  // Sine's effects on (bass boost), then download with effects
  await page.evaluate(() => { const fx = window.MurielPhoneFx; window.__fxOn = fx && typeof fx.current === 'function'; });
  await page.evaluate(() => { try { localStorage.setItem('nocturne_phone_fx', JSON.stringify({ ...(JSON.parse(localStorage.getItem('nocturne_phone_fx') || '{}')), bassEnh: 6 })); } catch (e) {} });
  r = await tryFormat('wav', true);
  check('download as WAV with effects', r.file && r.size > 1000000, r);
  const errs = errors.filter((e) => !/TUNNEL|tunnel|404|Failed to load resource|ERR_/.test(e));
  check('no page errors', errs.length === 0, errs);
  console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAILED');
  await close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
