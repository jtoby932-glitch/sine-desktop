const h = require('./harness');
(async () => {
  const W = +process.argv[3] || 1536, H = +process.argv[4] || 864;
  const { page, errors, close } = await h.open({ width: W, height: H });
  await page.fill('#search-input', 'test').catch(() => {});
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${process.argv[2]}/desk-search-${W}.png` });
  // play the second result
  await page.evaluate(() => { const t = (id, ti, ar, d) => ({ id, title: ti, artist: ar, duration: d, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=' + id }); window.Q = [t('songAAAAAAA', 'Long Song', 'Test Artist', 181), t('songMMMMMMM', 'Beta', 'Second Artist', 25)]; MurielCore.playTrack(Q[0], Q, 0); });
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({ playing: MurielCore.state.isPlaying, track: MurielCore.state.currentTrack && MurielCore.state.currentTrack.title, src: (MurielCore.audio.currentSrc || '').slice(0, 80), t: MurielCore.audio.currentTime }));
  console.log(JSON.stringify(state));
  if (!state.track) { await page.evaluate(() => { const r = window.__lastResults; }); }
  await page.waitForTimeout(2500);
  console.log(JSON.stringify(await page.evaluate(() => ({ playing: MurielCore.state.isPlaying, paused: MurielCore.audio.paused, t: MurielCore.audio.currentTime.toFixed(1), track: MurielCore.state.currentTrack && MurielCore.state.currentTrack.title }))));
  await page.screenshot({ path: `${process.argv[2]}/desk-playing-${W}.png` });
  console.log('errors:', errors.filter((e) => !/TUNNEL|fonts/.test(e)).slice(0, 8).join('\n'));
  await close(); process.exit(0);
})().catch((e) => { console.log('ABORT', e.message.slice(0, 500)); process.exit(2); });
