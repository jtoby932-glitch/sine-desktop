const h = require('./harness');
(async () => {
  const out = process.argv[2];
  const { page, close, errors } = await h.open({ width: 1536, height: 864 });
  await page.waitForSelector('#nf-welcome', { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
  await page.waitForTimeout(400);
  // play a song so the panel's live parts are awake
  await page.evaluate(() => { const t = { id: 'songAAAAAAA', title: 'Long Song', artist: 'Tester', duration: 181, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songAAAAAAA' }; MurielCore.playTrack(t, [t], 0); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.getElementById('btn-open-settings').click()); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/y-audio.png` });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#pfx-jump button')].find((x) => /EQ/.test(x.textContent)); if (b) b.click(); }); await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/y-audio-eq.png` });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#pfx-jump button')].find((x) => /Effects/.test(x.textContent)); if (b) b.click(); }); await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/y-audio-fx.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  // settings page, scrolled through
  await page.evaluate(() => document.getElementById('nav-settings').click()); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/y-set1.png` });
  for (let i = 2; i <= 5; i++) {
    await page.evaluate(() => { const v = document.querySelector('#view-settings') || document.querySelector('.main-content'); const s = [v, ...v.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)); if (s) s.scrollTop += 640; });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/y-set${i}.png` });
  }
  console.log('errors:', JSON.stringify((errors || []).filter((e) => !/ERR_TUNNEL/.test(e))));
  await close(); process.exit(0);
})();
