const h = require('./harness');
(async () => {
  const { page, errors, close } = await h.open({ width: 1280, height: 800 });
  await page.waitForSelector('#nf-welcome', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.nf-welcome-ok').click());
  await page.evaluate(() => { const t = { id: 'songAAAAAAA', title: 'L', artist: 'A', duration: 181, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songAAAAAAA' }; MurielCore.playTrack(t, [t], 0); });
  await page.waitForFunction(() => !MurielCore.audio.paused, null, { timeout: 20000 });
  await page.evaluate(() => document.getElementById('btn-open-settings').click()); await page.waitForTimeout(700);
  for (const id of ['slider-speed', 'slider-eq-low', 'slider-reverb']) {
    const b = await page.evaluate((i) => { const e = document.getElementById(i); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; }, id);
    await page.mouse.move(b.x + b.w * 0.5, b.y); await page.mouse.down();
    for (let i = 0; i < 40; i++) { await page.mouse.move(b.x + b.w * (0.5 + 0.4 * Math.sin(i / 3)), b.y); await page.waitForTimeout(8); }
    await page.mouse.move(b.x + b.w * 0.8, b.y); await page.mouse.up();
    await page.waitForTimeout(400);
    const r = await page.evaluate((i) => { const e = document.getElementById(i); const label = e.closest('.audio-row, .slider-row, div').parentElement.textContent.replace(/\s+/g, ' ').slice(0, 60); return { value: e.value, rate: MurielCore.audio.playbackRate, label }; }, id);
    console.log(id, JSON.stringify(r));
  }
  console.log('errors', JSON.stringify(errors.filter((e) => !/TUNNEL|tunnel|fonts|404|Failed to load|ERR_/.test(e))));
  await close(); process.exit(0);
})();
