const h = require('./harness');
(async () => {
  const { page, close } = await h.open({ width: 1280, height: 800 });
  await page.waitForSelector('#nf-welcome', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.nf-welcome-ok').click());
  const T = (id, title, d) => ({ id, title, artist: 'A', duration: d, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=' + id });
  const songs = [T('songAAAAAAA', 'Long', 181), T('songMMMMMMM', 'Beta', 25), T('songCCCCCCC', 'Gamma', 40)];
  await page.evaluate((s) => MurielCore.playTrack(s[0], s, 0), songs);
  await page.waitForFunction(() => !MurielCore.audio.paused, null, { timeout: 20000 });
  const st = () => page.evaluate(() => ({ cur: MurielCore.state.currentTrack.id, idx: MurielCore.state.queueIndex, q: (MurielCore.state.queue || []).map((t) => t.id.slice(4, 5)).join(''), t: MurielCore.audio.currentTime.toFixed(1), paused: MurielCore.audio.paused, loading: MurielCore.state.trackLoading }));
  console.log('start', JSON.stringify(await st()));
  await page.click('#btn-next'); await page.waitForTimeout(3000); console.log('after next', JSON.stringify(await st()));
  await page.click('#btn-prev'); await page.waitForTimeout(400); console.log('prev1', JSON.stringify(await st()));
  await page.click('#btn-prev'); await page.waitForTimeout(3000); console.log('prev2', JSON.stringify(await st()));
  await page.keyboard.press('Control+ArrowRight'); await page.waitForTimeout(3000); console.log('ctrl+right', JSON.stringify(await st()));
  await close(); process.exit(0);
})();
