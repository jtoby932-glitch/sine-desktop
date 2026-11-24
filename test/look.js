const h = require('./harness');
(async () => {
  const { page, errors, close } = await h.open();
  await page.screenshot({ path: process.argv[2] + '/desk-home.png' });
  console.log('errors:', errors.slice(0, 8).join('\n'));
  await close(); process.exit(0);
})().catch((e) => { console.log('ABORT', e.message.slice(0, 500)); process.exit(2); });
