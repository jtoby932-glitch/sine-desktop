const h = require('./harness');
(async () => {
  const out = process.argv[2];
  const { page, close } = await h.open({ width: 1536, height: 864 });
  await page.waitForSelector('#nf-welcome', { timeout: 3000 }).catch(() => {});
  await page.screenshot({ path: `${out}/w-welcome.png` });
  await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
  await page.screenshot({ path: `${out}/w-titlebar.png`, clip: { x: 568, y: 0, width: 400, height: 40 } });
  await page.evaluate(() => document.getElementById('btn-open-settings').click()); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/w-audio.png` });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#pfx-jump button')].find((x) => /EQ/.test(x.textContent)); if (b) b.click(); }); await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/w-audio-eq.png` });
  await close(); process.exit(0);
})();
