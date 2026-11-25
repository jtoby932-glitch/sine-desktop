// Drags every slider in the Audio panel back and forth fast (a real mouse drag sends an input event every frame).
const h = require('./harness');
(async () => {
  const { page, errors, close } = await h.open({ width: 1280, height: 800 });
  let crashed = false; page.on('crash', () => { crashed = true; console.log('PAGE CRASHED'); });
  await page.waitForSelector('#nf-welcome', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.nf-welcome-ok').click());
  await page.evaluate(() => {
    window.__ctx = 0; window.__off = 0; window.__offLive = 0; window.__offMax = 0; window.__offSec = 0;
    const O = window.OfflineAudioContext;
    window.OfflineAudioContext = class extends O { constructor(c, len, sr) { super(c, len, sr); window.__off++; if (len > 1) window.__offSec += len / sr; const sR = this.startRendering.bind(this); this.startRendering = () => { window.__offLive++; window.__offMax = Math.max(window.__offMax, window.__offLive); return sR().finally(() => window.__offLive--); }; } };
    const t = { id: 'songAAAAAAA', title: 'Long', artist: 'A', duration: 181, thumbnail: '', platform: 'youtube', url: 'https://www.youtube.com/watch?v=songAAAAAAA' }; MurielCore.playTrack(t, [t], 0);
  });
  await page.waitForFunction(() => !MurielCore.audio.paused && MurielCore.audio.currentTime > 0.5, null, { timeout: 20000 });
  await page.evaluate(() => document.getElementById('btn-open-settings').click());
  await page.waitForTimeout(800);
  const cdp = await page.context().newCDPSession(page);
  const trail = [];
  const poll = setInterval(async () => {
    try {
      const d = await page.evaluate(() => { const d = MurielPhoneFx.debugSound(); return { fx: MurielPhoneFx.getStatus().kind, live: d.live, helper: d.helper, swap: d.swap, renders: d.renderCount, gen: d.generation, off: window.__off, offLive: window.__offLive }; });
      const m = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
      const g = (n) => { const x = m.metrics.find((y) => y.name === n); return x ? Math.round(x.value / 1e6) : 0; };
      trail.push(JSON.stringify({ ...d, heap: g('JSHeapUsedSize') }));
      if (trail.length > 8) trail.shift();
    } catch (e) {}
  }, 300);
  page.on('crash', () => { console.log('LAST STATES BEFORE CRASH:\n' + trail.join('\n')); });
  await cdp.send('Performance.enable');
  const ids = await page.evaluate(() => [...document.querySelectorAll('.audio-panel[data-audio-panel="tempo"] input[type=range]')].filter((e) => e.id).map((e) => e.id));
  console.log('sliders:', ids.join(','));
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  for (const id of (only ? Array(Number(process.env.REPS || 4)).fill(only).flat() : ids)) {
    if (crashed) break;
    console.log('drag', id);
    const box = await page.evaluate((i) => { const e = document.getElementById(i); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return b.width ? { x: b.left, y: b.top + b.height / 2, w: b.width } : null; }, id);
    if (!box) continue;
    await page.mouse.move(box.x + box.w * 0.5, box.y); await page.mouse.down();
    for (let i = 0; i < 60; i++) { await page.mouse.move(box.x + box.w * (0.5 + 0.45 * Math.sin(i / 3)), box.y); await page.waitForTimeout(16); }
    await page.mouse.up();
    const st = await page.evaluate(() => ({ t: MurielCore.audio.currentTime.toFixed(1), paused: MurielCore.audio.paused, fx: MurielPhoneFx.getStatus().kind, off: window.__off, live: window.__offLive, max: window.__offMax, sec: Math.round(window.__offSec), mb: Math.round(performance.memory.usedJSHeapSize / 1e6) })).catch((e) => ({ err: e.message.slice(0, 60) }));
    console.log(id, JSON.stringify(st));
  }
  await page.waitForTimeout(6000);
  console.log('end', JSON.stringify(await page.evaluate(() => ({ t: MurielCore.audio.currentTime.toFixed(1), paused: MurielCore.audio.paused, fx: MurielPhoneFx.getStatus().kind, ctx: window.__ctx, dbg: (() => { const d = MurielPhoneFx.debugSound(); delete d.liveOut; delete d.ctx; return d; })() })).catch((e) => e.message)));
  console.log('errors:', JSON.stringify(errors.filter((e) => !/TUNNEL|tunnel|fonts|404|Failed to load|ERR_/.test(e)).slice(0, 8)));
  await close(); process.exit(0);
})().catch((e) => { console.log('ABORT', e.message.slice(0, 300)); process.exit(2); });
