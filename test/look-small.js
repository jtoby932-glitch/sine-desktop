const h = require('./harness');
(async () => {
  const out = process.argv[2];
  for (const [W, H] of [[1280, 690], [1024, 640]]) {
    const { page, close } = await h.open({ width: W, height: H });
    await page.waitForSelector('#nf-welcome', { timeout: 4000 }).catch(() => {});
    await page.screenshot({ path: `${out}/sm-${W}-welcome.png` });
    await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
    await page.evaluate(() => { const t = { id: 'songAAAAAAA', title: 'Long Song Name Here', artist: 'Test Artist', duration: 181, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songAAAAAAA' }; MurielCore.playTrack(t, [t], 0); });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${out}/sm-${W}-home.png` });
    await page.evaluate(() => document.getElementById('nav-settings').click()); await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/sm-${W}-settings.png` });
    await page.evaluate(() => document.getElementById('btn-open-settings').click()); await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/sm-${W}-audio.png` });
    await close();
  }
  process.exit(0);
})();
