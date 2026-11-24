const h = require('./harness');
(async () => {
  const out = process.argv[2];
  const { page, close, errors } = await h.open({ width: 1280, height: 820 });
  await page.waitForSelector('#nf-welcome', { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
  await page.evaluate(() => { const t = { id: 'songAAAAAAA', title: 'Long Song', artist: 'Test Artist', duration: 181, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songAAAAAAA' }; MurielCore.playTrack(t, [t], 0); });
  await page.waitForFunction(() => !MurielCore.audio.paused && MurielCore.audio.currentTime > 0.5, null, { timeout: 20000 });
  await page.setViewportSize({ width: 400, height: 132 }); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/m-mini.png` });
  await page.setViewportSize({ width: 400, height: 300 }); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/m-mini-tall.png` });
  console.log('mini class:', await page.evaluate(() => document.body.classList.contains('mini')));
  console.log('errors:', JSON.stringify(errors.filter((e) => !/TUNNEL|404/.test(e))));
  await close(); process.exit(0);
})();
