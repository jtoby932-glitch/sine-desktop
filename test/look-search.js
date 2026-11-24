const h = require('./harness');
(async () => {
  const out = process.argv[2];
  const { page, close, errors } = await h.open({ width: 1280, height: 720 });
  await page.waitForSelector('#nf-welcome', { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.fill('#search-input', 'test song');
  await page.press('#search-input', 'Enter');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/q-search.png` });
  await page.evaluate(() => document.getElementById('platform-sp').click());
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/q-search-sp.png` });
  // queue drawer and Now Playing
  await page.evaluate(() => { const r = document.querySelector('#search-results-container .track-row, .track-row'); if (r) r.click(); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const b = document.getElementById('btn-toggle-queue'); if (b) b.click(); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/q-queue.png` });
  await page.evaluate(() => { const b = document.getElementById('btn-toggle-lyrics-panel') || document.getElementById('btn-toggle-lyrics'); if (b) b.click(); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/q-np.png` });
  console.log('errors:', JSON.stringify(errors.filter((e) => !/TUNNEL|tunnel|404|Failed to load resource|ERR_/.test(e))));
  await close(); process.exit(0);
})();
