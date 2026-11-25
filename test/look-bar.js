const h = require('./harness');
(async () => {
  const out = process.argv[2];
  for (const W of [1280, 1920]) {
    const { page, close } = await h.open({ width: W, height: 800 });
    await page.waitForSelector('#nf-welcome', { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => document.querySelector('.nf-welcome-ok').click());
    await page.evaluate(() => { const t = { id: 'songAAAAAAA', title: 'Long Song', artist: 'Test Artist', duration: 181, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songAAAAAAA' }; MurielCore.playTrack(t, [t], 0); });
    await page.waitForTimeout(6000);
    const where = await page.evaluate(() => { const c = document.getElementById('nf-cava-mini'); return c ? `${c.parentElement.className} on=${c.classList.contains('on')}` : 'none'; });
    console.log(W, where);
    await page.screenshot({ path: `${out}/bar-${W}.png`, clip: { x: 0, y: 690, width: W, height: 110 } });
    await close();
  }
  process.exit(0);
})();
