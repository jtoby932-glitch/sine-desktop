const h = require('./harness');
(async () => {
  const { page, errors, close } = await h.open({ width: 1536, height: 864 });
  const btns = await page.evaluate(() => [...document.querySelectorAll('.player-bar button, .playbar button, footer button')].map((b) => `${b.id || b.className}:${b.title || b.getAttribute('aria-label') || ''}`).slice(0, 30));
  console.log(btns.join(' | '));
  const target = process.argv[3];
  if (target) { await page.click('#' + target).catch((e) => console.log('click failed', e.message.slice(0, 100))); await page.waitForTimeout(900); }
  await page.screenshot({ path: process.argv[2] + '/desk-panel.png' });
  const vis = await page.evaluate(() => [...document.querySelectorAll('[id^="pfx-"]')].filter((e) => e.offsetParent).map((e) => e.id).slice(0, 20));
  console.log('visible pfx:', vis.join(' '));
  await close(); process.exit(0);
})().catch((e) => { console.log('ABORT', e.message.slice(0, 500)); process.exit(2); });
