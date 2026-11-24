const h = require('./harness');
(async () => {
  const out = process.argv[2];
  for (const [W, H] of [[1920, 1040], [1536, 864], [1100, 700]]) {
    const { page, close } = await h.open({ width: W, height: H });
    await page.waitForSelector('#nf-welcome', { timeout: 3000 }).catch(() => {});
    await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
    await page.evaluate(() => { const t = { id: 'songAAAAAAA', title: 'A Very Long Song Title That Goes On (Remastered 2011)', artist: 'Some Artist feat. Another Artist', duration: 181, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songAAAAAAA' }; MurielCore.playTrack(t, [t], 0); });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/w-${W}.png` });
    const info = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return `${Math.round(b.left)}+${Math.round(b.width)}`; };
      return { left: r('.playbar-left'), meta: r('.playbar-left .track-meta'), center: r('.playbar-center'), right: r('.playbar-right'), search: r('.search-container') || r('#search-input'), pills: r('.platform-switch-container'), sp: r('#platform-sp') };
    });
    console.log(W, JSON.stringify(info));
    await close();
  }
  process.exit(0);
})();
