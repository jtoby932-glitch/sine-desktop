const h = require('./harness');
(async () => {
  const { page, close } = await h.open({ width: +process.argv[2] || 1536, height: 864 });
  await page.evaluate(() => { const t = (id, ti, ar, d) => ({ id, title: ti, artist: ar, duration: d, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=' + id }); MurielCore.playTrack(t('songAAAAAAA', 'Never Gonna Give You Up', 'Rick Astley', 181), [], 0); });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const q = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: Math.round(b.x), w: Math.round(b.width), maxW: cs.maxWidth, flex: cs.flex, ov: cs.overflow }; };
    const meta = document.querySelector('.track-meta'); const left = meta && meta.parentElement;
    return { left: left && left.className, leftBox: q('.' + (left ? left.className.split(' ')[0] : 'x')), meta: q('.track-meta'), title: q('.track-title'), fav: q('#btn-toggle-fav'), center: q('.player-controls, .playbar-center, .player-center') };
  });
  console.log(JSON.stringify(r, null, 1));
  await close(); process.exit(0);
})();
