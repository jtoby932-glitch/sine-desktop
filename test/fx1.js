const h = require('./harness');
(async () => {
  const { page, errors, close } = await h.open({ width: 1536, height: 864 });
  console.log('engine on:', await page.evaluate(() => !!window.MurielPhoneFx && typeof MurielPhoneFx.debugSound === 'function' && MurielPhoneFx.getStatus().kind));
  await page.evaluate(() => { const t = (id, ti, ar, d) => ({ id, title: ti, artist: ar, duration: d, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=' + id }); window.Q = [t('songAAAAAAA', 'Long Song', 'Test Artist', 181), t('songMMMMMMM', 'Beta', 'Second Artist', 25)]; MurielCore.playTrack(Q[0], Q, 0); });
  await page.waitForFunction(() => !MurielCore.state.trackLoading && !MurielCore.audio.paused, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  console.log('plain:', JSON.stringify(await page.evaluate(() => ({ t: MurielCore.audio.currentTime.toFixed(1), rendered: MurielPhoneFx.isPlayingRendered(), st: MurielPhoneFx.getStatus().kind }))));
  await page.evaluate(() => { const e = document.getElementById('slider-echo'); e.value = '40'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => MurielPhoneFx.getStatus().kind === 'done' && MurielPhoneFx.isPlayingRendered(), null, { timeout: 30000 }).catch(() => {});
  console.log('reverb on:', JSON.stringify(await page.evaluate(() => ({ t: MurielCore.audio.currentTime.toFixed(1), rendered: MurielPhoneFx.isPlayingRendered(), st: MurielPhoneFx.getStatus().kind, paused: MurielCore.audio.paused }))));
  // volume
  await page.evaluate(() => { const v = document.getElementById('volume-slider') || document.querySelector('input[type=range][id*=volume]'); if (v) { v.value = v.max ? String(v.max / 2) : '50'; v.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.waitForTimeout(300);
  console.log('volume:', await page.evaluate(() => { const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume'); return d.get.call(MurielCore.audio).toFixed(2) + ' (app ' + MurielCore.audio.volume + ')'; }));
  console.log('errors:', errors.filter((e) => !/TUNNEL|fonts|404|502/.test(e)).slice(0, 8).join('\n'));
  await close(); process.exit(0);
})().catch((e) => { console.log('ABORT', e.message.slice(0, 500)); process.exit(2); });
