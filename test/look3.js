const h = require('./harness');
(async () => {
  const { page, errors, close } = await h.open({ width: 1536, height: 864 });
  const ids = await page.evaluate(() => [...document.querySelectorAll('button[id]')].map((b) => b.id).filter((id) => /audio|eq|fx|setting|sound/i.test(id)).slice(0, 40));
  console.log(ids.join(' '));
  await page.evaluate(() => { const b = document.getElementById('btn-audio-settings') || document.getElementById('btn-open-audio') || document.querySelector('[data-tooltip*="Audio"],[title*="Audio"]'); if (b) b.click(); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: process.argv[2] + '/desk-audio.png' });
  await page.evaluate(() => { const s = document.querySelector('.audio-settings-body, #audio-settings-modal .modal-body, .audio-panel'); if (s) s.scrollTop = 900; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: process.argv[2] + '/desk-audio2.png' });
  await close(); process.exit(0);
})().catch((e) => { console.log('ABORT', e.message.slice(0, 500)); process.exit(2); });
