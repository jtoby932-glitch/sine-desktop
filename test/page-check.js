// The page's side of the PC fixes: Spotify keys reach the secrets store, links open in Sine, the player bar's
// "more" menu, and nothing errors.
const h = require('./harness');
(async () => {
  const out = process.argv[2];
  const { page, close, errors } = await h.open({ width: 1280, height: 720 });
  const results = [];
  const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(detail).slice(0, 300)}`); };
  await page.waitForSelector('#nf-welcome', { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('.nf-welcome-ok'); if (b) b.click(); });
  await page.waitForTimeout(500);
  // Spotify developer keys: Settings → Integrations
  await page.evaluate(() => { document.getElementById('nav-settings').click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.showSettingsCategory && window.showSettingsCategory('integrations'));
  await page.waitForTimeout(300);
  await page.fill('#spotify-key-id', 'abc'); await page.fill('#spotify-key-secret', 'def');
  await page.click('#spotify-keys-save');
  await page.waitForTimeout(1500);
  const saved = await page.evaluate(() => ({ vault: window.__vault, status: document.getElementById('spotify-keys-status').textContent, calls: window.__apiCalls.filter((c) => c[0] === 'vaultWrite') }));
  check('keys go to the secrets store', saved.vault && saved.vault.spotify_app && saved.vault.spotify_app.id === 'abc', saved);
  console.log('  status after save:', saved.status);
  await page.evaluate(() => { window.__vault = { spotify_app: { id: 'abc', secret: 'def' } }; document.getElementById('spotify-keys-remove').hidden = false; document.getElementById('spotify-keys-remove').click(); });
  await page.waitForTimeout(200);
  const removed = await page.evaluate(() => window.__vault && window.__vault.spotify_app);
  check('Remove forgets the keys', removed === undefined, removed);
  // the Spotify login note names the PC's way
  const note = await page.evaluate(() => { const p = document.querySelector('.sp-pane[data-mode="login"]'); return p && p.firstElementChild && p.firstElementChild.textContent; });
  check('login note talks about the browser, not Safari', /browser opens/.test(note || '') && /muriel:\/\/spotify-callback/.test(note || ''), note);
  // a muriel:// link (a sync code) opens Settings → Sync and starts joining
  await page.evaluate(() => window.__deepLink('muriel://link?code=K7M29QXP'));
  await page.waitForTimeout(800);
  const sync = await page.evaluate(() => ({ cat: document.querySelector('#settings-nav .active') && document.querySelector('#settings-nav .active').dataset.cat, text: (document.querySelector('.sync-section') || {}).textContent || '' }));
  check('a muriel://link opens Sync and starts linking', sync.cat === 'sync' && /Linking|No device|Couldn/.test(sync.text), { cat: sync.cat, text: sync.text.slice(0, 200) });
  // dead parts are gone
  const hidden = await page.evaluate(() => ['tools-row', 'setting-airpods', 'setting-discord-row'].map((id) => { const e = document.getElementById(id); return [id, !e || !e.offsetParent]; }).concat([['plugins', !document.querySelector('#settings-nav [data-cat="plugins"]').offsetParent]]));
  check('dead settings hidden', hidden.every(([, h]) => h), hidden);
  // player bar: more menu
  await page.evaluate(() => { const t = { id: 'songAAAAAAA', title: 'A Very Long Song Title That Goes On (Remastered)', artist: 'Some Artist', duration: 181, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songAAAAAAA' }; MurielCore.playTrack(t, [t], 0); document.getElementById('nav-home') && document.getElementById('nav-home').click(); });
  await page.waitForTimeout(2000);
  const vis = await page.evaluate(() => ['btn-playbar-overflow', 'btn-playbar-share', 'btn-toggle-fav'].map((id) => [id, getComputedStyle(document.getElementById(id)).display]));
  check('narrow bar: heart and More shown, share folded away', vis[0][1] !== 'none' && vis[1][1] === 'none' && vis[2][1] !== 'none', vis);
  await page.click('#btn-playbar-overflow');
  await page.waitForTimeout(300);
  const items = await page.evaluate(() => [...document.querySelectorAll('.track-context-menu .track-context-item')].map((b) => b.textContent));
  check('More lists edit, download and share', items.join('|') === 'Edit title and artist|Download…|Share', items);
  await page.screenshot({ path: `${out}/p-more.png` });
  await page.evaluate(() => [...document.querySelectorAll('.track-context-menu .track-context-item')].find((b) => /Edit/.test(b.textContent)).click());
  await page.waitForTimeout(400);
  const modal = await page.evaluate(() => { const m = document.getElementById('rename-track-modal'); return m && !m.classList.contains('hidden'); });
  check('Edit opens the rename dialog', modal, modal);
  const errs = errors.filter((e) => !/TUNNEL|tunnel|404|Failed to load resource|ERR_/.test(e));
  check('no page errors', errs.length === 0, errs);
  console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAILED');
  await close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
