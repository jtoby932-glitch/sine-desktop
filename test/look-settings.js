const h = require('./harness');
(async () => {
  const out = process.argv[2];
  const { page, close } = await h.open({ width: 1280, height: 3200 });
  await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
  await page.evaluate(() => document.getElementById('nav-settings').click()); await page.waitForTimeout(700);
  const cats = await page.evaluate(() => [...document.querySelectorAll('#settings-nav [data-cat]')].map((b) => b.dataset.cat));
  for (const c of cats) {
    await page.evaluate((cat) => document.querySelector(`#settings-nav [data-cat="${cat}"]`).click(), c);
    await page.waitForTimeout(500);
    const hgt = await page.evaluate(() => { const p = document.querySelector('.settings-pane'); return Math.ceil(p.getBoundingClientRect().bottom) + 20; });
    await page.screenshot({ path: `${out}/s-${c}.png`, clip: { x: 180, y: 100, width: 1100, height: Math.min(3100, hgt - 100) } });
    console.log(c, hgt);
  }
  await close(); process.exit(0);
})();
