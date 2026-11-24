// screenshots of the main desktop screens, playing a song
const h = require('./harness');
(async () => {
  const W = +process.argv[3] || 1536, H = +process.argv[4] || 864, out = process.argv[2];
  const { page, errors, close } = await h.open({ width: W, height: H });
  await page.evaluate(() => { const t = (id, ti, ar, d) => ({ id, title: ti, artist: ar, duration: d, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=' + id }); window.Q = [t('songAAAAAAA', 'Long Song', 'Test Artist', 181), t('songMMMMMMM', 'Beta', 'Second Artist', 25)]; MurielCore.playTrack(Q[0], Q, 0); });
  await page.waitForFunction(() => !MurielCore.state.trackLoading && !MurielCore.audio.paused, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/t-home.png` });
  const shot = async (name, fn) => { await page.evaluate(fn).catch((e) => console.log(name, 'failed', e.message.slice(0, 120))); await page.waitForTimeout(900); await page.screenshot({ path: `${out}/t-${name}.png` }); };
  await shot('nowplaying', () => document.getElementById('btn-toggle-lyrics-panel').click());
  await page.evaluate(() => document.getElementById('btn-toggle-lyrics-panel').click()); await page.waitForTimeout(400);
  await shot('audio', () => document.getElementById('btn-open-settings').click());
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.evaluate(() => { const b = document.getElementById('btn-close-settings'); if (b && b.offsetParent) b.click(); });
  await shot('settings', () => document.getElementById('nav-settings').click());
  console.log('errors:', errors.filter((e) => !/TUNNEL|fonts|404|502/.test(e)).slice(0, 8).join('\n'));
  await close(); process.exit(0);
})().catch((e) => { console.log('ABORT', e.message.slice(0, 500)); process.exit(2); });
