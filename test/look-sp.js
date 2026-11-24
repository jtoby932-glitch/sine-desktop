const h = require('./harness');
(async () => {
  const out = process.argv[2];
  const { page, close } = await h.open({ width: 1280, height: 720 });
  await page.waitForSelector('#nf-welcome', { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('nav-settings').click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.showSettingsCategory('integrations'));
  await page.waitForTimeout(300);
  await page.evaluate(() => { const b = [...document.querySelectorAll('.settings-section[data-cat="integrations"] button')].find((x) => /Import/.test(x.textContent)); b.click(); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/sp-link.png` });
  await page.evaluate(() => document.querySelector('#sp-modes [data-mode="login"]').click());
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/sp-login.png` });
  await close(); process.exit(0);
})();
