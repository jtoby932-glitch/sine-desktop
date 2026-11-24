// Walks through the PC version's screens at a given window size: screenshots, and every piece of text that is cut off.
const h = require('./harness');
const fs = require('fs');
(async () => {
  const out = process.argv[2];
  const W = Number(process.argv[3] || 1280), H = Number(process.argv[4] || 720);
  const tag = `${W}x${H}`;
  const { page, close, errors } = await h.open({ width: W, height: H });
  const report = [];
  const cut = async (where) => {
    const items = await page.evaluate(() => {
      const res = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        const clippedX = el.scrollWidth > el.clientWidth + 1 && (cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis');
        const clippedY = el.scrollHeight > el.clientHeight + 2 && cs.overflowY === 'hidden' && cs.webkitLineClamp === 'none';
        if (!clippedX && !clippedY) continue;
        let p = el, hidden = false;
        while (p && p !== document.body) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden') { hidden = true; break; } p = p.parentElement; }
        if (hidden) continue;
        const path = []; let q = el; for (let i = 0; i < 3 && q && q !== document.body; i++) { path.unshift(q.tagName.toLowerCase() + (q.id ? '#' + q.id : '') + (q.className && typeof q.className === 'string' ? '.' + q.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); q = q.parentElement; }
        res.push({ path: path.join(' > '), text: el.textContent.trim().slice(0, 70), w: el.clientWidth, need: el.scrollWidth, h: el.clientHeight, needH: el.scrollHeight, x: Math.round(r.left), y: Math.round(r.top) });
      }
      return res;
    });
    report.push({ where, items });
  };
  const shot = async (name) => { await page.screenshot({ path: `${out}/a-${tag}-${name}.png` }); await cut(name); };
  const click = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel);
  const wait = (ms) => page.waitForTimeout(ms);

  await page.waitForSelector('#nf-welcome', { timeout: 3000 }).catch(() => {});
  await wait(500);
  await shot('welcome');
  await click('.nf-welcome-ok'); await wait(500);
  await shot('home');
  // a playlist with a long name, and a song playing
  await page.evaluate(() => {
    const t = { id: 'songAAAAAAA', title: 'A Very Long Song Title That Goes On (Remastered 2011) [Official Audio]', artist: 'Some Artist feat. Another Artist & A Third', duration: 181, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songAAAAAAA' };
    const pls = JSON.parse(localStorage.getItem('devsize_playlists') || '[]');
    pls.push({ id: 'pl_long', name: 'My Spotify Favourites From Summer 2025', tracks: [t], cover: '' });
    localStorage.setItem('devsize_playlists', JSON.stringify(pls));
    MurielCore.playTrack(t, [t], 0);
  });
  await wait(2500);
  await shot('playing');
  // search box and its source picker
  await page.evaluate(() => { const i = document.getElementById('search-input'); if (i) { i.focus(); } });
  await wait(300);
  await shot('search-focus');
  const pickers = await page.evaluate(() => [...document.querySelectorAll('[id*="platform"], [class*="platform"], [id*="source"]')].filter((e) => e.offsetParent).slice(0, 12).map((e) => `${e.tagName}#${e.id}.${String(e.className).slice(0, 40)} "${e.textContent.trim().slice(0, 30)}"`));
  console.log('pickers:', pickers.join(' | '));
  // create playlist modal and the Spotify import modal (all three modes)
  await click('#btn-create-playlist') || await click('[id*="create-playlist"]'); await wait(500);
  await shot('create-playlist');
  await click('#btn-cpm-spotify'); await wait(600);
  await shot('spotify-link');
  await page.evaluate(() => { const t = document.getElementById('spotify-target-trigger'); if (t) t.click(); }); await wait(300);
  await shot('spotify-target-menu');
  await page.keyboard.press('Escape');
  await click('#sp-modes [data-mode="file"]'); await wait(300);
  await shot('spotify-file');
  await click('#sp-modes [data-mode="login"]'); await wait(300);
  await shot('spotify-login');
  await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => m.classList.add('hidden')); });
  await wait(300);
  // settings: every category
  await click('#nav-settings'); await wait(700);
  const cats = await page.evaluate(() => [...document.querySelectorAll('#settings-nav [data-cat]')].map((b) => b.dataset.cat));
  console.log('settings categories:', cats.join(','));
  for (const c of cats) {
    await page.evaluate((cat) => { const b = document.querySelector(`#settings-nav [data-cat="${cat}"]`); if (b) b.click(); }, c);
    await wait(450);
    await shot(`settings-${c}`);
  }
  // library / playlist page
  await page.evaluate(() => { const b = [...document.querySelectorAll('.playlist-item, [data-playlist-id]')].find((x) => /Summer 2025/.test(x.textContent)); if (b) b.click(); });
  await wait(700);
  await shot('playlist');
  await click('#btn-open-settings'); await wait(700);
  await shot('audio');
  await page.keyboard.press('Escape'); await wait(300);
  fs.writeFileSync(`${out}/audit-${tag}.json`, JSON.stringify({ report, errors }, null, 1));
  for (const r of report) for (const i of r.items) console.log(`[${r.where}] ${i.path} "${i.text}" ${i.w}/${i.need}${i.needH > i.h + 2 ? ` h${i.h}/${i.needH}` : ''} @${i.x},${i.y}`);
  console.log('errors:', JSON.stringify(errors.filter((e) => !/TUNNEL|404|Failed to load resource/.test(e)).slice(0, 10)));
  await close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
