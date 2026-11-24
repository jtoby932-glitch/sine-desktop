// Sine: the smaller pieces around the player. Each setup function owns one feature and nothing else.
(() => {
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const readJson = (k, fallback) => { try { const v = JSON.parse(read(k) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; } };
  const $ = (id) => document.getElementById(id);
  const core = () => window.MurielCore;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = (sec) => { const s = Math.max(0, Math.floor(sec || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const toast = (m, type) => { const c = core(); if (c && c.toast) c.toast(m, type); };
  const calm = () => document.body.classList.contains('perf') || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const snack = (text, act, label, ms) => { if (window.NocturneSnack) window.NocturneSnack(text, act, label, ms); };
  const canon = (id) => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const api = (path, opts) => fetch(`${core().base()}${path}`, opts);

  // ---- pieces shared by the settings rows and sheets ----
  function toggleRow(id, name, hint, get, set) {
    const row = document.createElement('div');
    row.className = 'setting-item nf-toggle-row';
    row.id = id;
    row.innerHTML = `<div class="setting-item-top"><div class="nf-row-text"><span class="setting-name">${esc(name)}</span><span class="pfx-hint">${esc(hint)}</span></div><button type="button" class="effect-switch-btn" aria-label="${esc(name)}"><span class="thumb"></span></button></div>`;
    const b = row.querySelector('button');
    const show = () => { const on = !!get(); b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); };
    b.addEventListener('click', () => { set(!get()); show(); });
    show();
    row.refresh = show;
    return row;
  }
  function actionRow(id, name, hint, label, act) {
    const row = document.createElement('div');
    row.className = 'setting-item nf-toggle-row';
    row.id = id;
    row.innerHTML = `<div class="setting-item-top"><div class="nf-row-text"><span class="setting-name">${esc(name)}</span><span class="pfx-hint">${esc(hint)}</span></div><button type="button" class="btn-outline-pill">${esc(label)}</button></div>`;
    row.querySelector('button').addEventListener('click', act);
    return row;
  }
  function openSheet(title) {
    const back = document.createElement('div');
    back.className = 'nf-sheet-back';
    back.innerHTML = `<div class="nf-sheet" role="dialog" aria-label="${esc(title)}"><div class="nf-sheet-head"><h3>${esc(title)}</h3><button type="button" class="nf-sheet-close" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="nf-sheet-body"></div></div>`;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('show'));
    const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 240); if (back.onClosed) back.onClosed(); };
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.querySelector('.nf-sheet-close').addEventListener('click', close);
    return { el: back, body: back.querySelector('.nf-sheet-body'), close };
  }

  // ---- every error says what to do next ----
  const RAW = /\b(TypeError|ReferenceError|undefined|null|NaN|status \d|ENOENT|ENOSPC|ENOTFOUND|getaddrinfo|segment \d|HLS|\[object)\b/;
  const HELP = 'Try again, and if it keeps happening run the health check in Settings, About.';
  window.NocturneExplain = (message) => {
    const m = String(message || '');
    if (/failed to fetch|load failed|network|offline|timed? ?out|getaddrinfo|ENOTFOUND/i.test(m)) return "Couldn't reach the internet. Check your connection and try again.";
    if (/ENOSPC|quota|storage is full|no space/i.test(m)) return 'Your phone is out of room for this. Free up some space in Settings, Storage, then try again.';
    if (/\b(403|410|expired)\b/.test(m)) return 'The link to this song ran out. Try again and Sine will find a fresh one.';
    if (/incomplete download|segment \d|empty HLS|download cancelled/i.test(m)) return 'The download stopped partway. Try again.';
    if (/load audio stream|could not load|no audio|unable to (extract|find)/i.test(m)) return "Couldn't load this song. Try again or skip it. If other songs fail too, run the health check in Settings, About.";
    if (RAW.test(m)) return `Something went wrong. ${HELP}`;
    if (/\b(try|check|tap|open|add|free|ask|pick|set|skip|choose|use|paste|connect)\b/i.test(m)) return m;
    return `${m.replace(/[.\s]+$/, '')}. ${HELP}`;
  };

  // ---- the line under the song title in the mini player: what's loading, then the lyric being sung ----
  const sub = {
    status: '',
    lyric: '',
    el: null,
    meta: null,
    mount() {
      this.meta = document.querySelector('#playbar-artist') && $('playbar-artist').parentElement;
      if (!this.meta || this.el) return;
      this.el = document.createElement('span');
      this.el.className = 'track-artist nf-mini-sub';
      this.el.id = 'nf-mini-sub';
      this.meta.appendChild(this.el);
    },
    render() {
      if (!this.el) return;
      const text = this.status || this.lyric;
      this.meta.classList.toggle('nf-sub-on', !!text);
      if (this.el.textContent !== text) {
        const change = !!text;
        this.el.textContent = text;
        if (change && !this.status) { this.el.classList.remove('in'); void this.el.offsetWidth; this.el.classList.add('in'); }
      }
      this.el.classList.toggle('is-lyric', !this.status && !!this.lyric);
    },
    setStatus(s) { this.status = s; this.render(); const o = $('track-loading-sub'); if (s && o) o.textContent = s; },
    setLyric(s) { this.lyric = s; this.render(); },
  };

  function setupLoadingText() {
    let timer = 0;
    const early = () => window.MurielPhoneFx && window.MurielPhoneFx.isSoundingEarly && window.MurielPhoneFx.isSoundingEarly();
    globalThis.__nocLoad = (target, chunks) => {
      const c = core();
      const song = c && c.state.currentTrack;
      if (!song || !c.state.trackLoading || !chunks || !chunks.length) return;
      if (!(String(target).includes(String(song.id)) || song.url === target)) return;
      clearTimeout(timer);
      if (early()) { sub.setStatus(''); return; }
      let done = 0;
      for (let i = 0; i < chunks.length; i++) if (chunks[i]) done++;
      sub.setStatus(`Downloading ${Math.round((done / chunks.length) * 100)}%`);
    };
    window.addEventListener('muriel:loading', () => {
      clearTimeout(timer);
      if (core().state.trackLoading) timer = setTimeout(() => { if (core().state.trackLoading && !early()) sub.setStatus('Finding the best version'); }, 300);
      else sub.setStatus('');
    });
  }

  function setupMiniLyric() {
    setInterval(() => {
      const c = core();
      if (!c || document.hidden) return;
      const on = document.body.dataset.npLyric !== 'off' && !document.body.classList.contains('np-open') && !c.audio.paused;
      sub.setLyric(on ? c.lyricLineNow() : '');
    }, 500);
  }

  // ---- artwork that travels between the mini player and Now Playing ----
  function setupFly() {
    const panel = $('right-panel');
    const mini = $('playbar-artwork');
    const big = $('right-panel-cover');
    if (!panel || !mini || !big) return;
    let hidden = panel.classList.contains('hidden');
    let flight = null;
    // the mini player is hidden while Now Playing is open, so its place is remembered from when it shows
    let miniAt = null;
    const remember = () => { const r = mini.getBoundingClientRect(); if (r.width) miniAt = { left: r.left, top: r.top, width: r.width, height: r.height }; };
    remember();
    window.addEventListener('resize', () => setTimeout(remember, 200));
    core().audio.addEventListener('playing', remember);
    const land = () => {
      if (!flight) return;
      flight.anim.cancel();
      flight.clone.remove();
      flight = null;
      document.body.classList.remove('nf-flying');
      remember();
    };
    const fly = (opening) => {
      land();
      if (document.body.dataset.npFly === 'off' || calm() || !document.documentElement.classList.contains('is-mobile')) return;
      const src = big.getAttribute('src') || mini.getAttribute('src');
      if (!src) return;
      remember();
      const m = miniAt;
      const b = big.getBoundingClientRect();
      if (!m || !b.width) return;
      // the sheet is still sliding: where the big artwork will be once it has arrived
      const settle = opening ? panel.getBoundingClientRect().top - panel.offsetTop : 0;
      const end = { left: b.left, top: b.top - settle, width: b.width, height: b.height };
      const from = opening ? m : b;
      const to = opening ? end : m;
      const clone = document.createElement('img');
      clone.className = 'nf-fly';
      clone.src = src;
      clone.alt = '';
      Object.assign(clone.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
      document.body.appendChild(clone);
      const sx = from.width / to.width;
      const sy = from.height / to.height;
      const rMini = parseFloat(getComputedStyle(mini).borderTopLeftRadius) || 8;
      const rBig = parseFloat(getComputedStyle(big).borderTopLeftRadius) || 16;
      const anim = clone.animate([
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`, borderRadius: `${(opening ? rMini : rBig) / sx}px` },
        { transform: 'none', borderRadius: `${opening ? rBig : rMini}px` },
      ], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)' });
      document.body.classList.add('nf-flying');
      flight = { clone, anim };
      anim.onfinish = land;
    };
    new MutationObserver(() => {
      const now = panel.classList.contains('hidden');
      if (now === hidden) return;
      hidden = now;
      fly(!now);
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
    window.NocturneExtras.flying = () => !!flight;
  }

  // ---- when the song changes: artwork crossfades, title slides in ----
  function setupSongChange() {
    const watchArt = (img) => {
      if (!img) return;
      let last = img.getAttribute('src');
      let lastSong = null;
      new MutationObserver(() => {
        const now = img.getAttribute('src');
        if (now === last) return;
        const old = last;
        last = now;
        const song = core() && core().state.currentTrack;
        const id = song && song.id;
        const same = id === lastSong;
        lastSong = id;
        if (!old || !now || same || calm()) return;
        const parent = img.parentElement;
        const st = getComputedStyle(img);
        if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
        const ghost = document.createElement('img');
        ghost.className = 'nf-art-ghost';
        ghost.src = old;
        ghost.alt = '';
        ghost.style.borderRadius = st.borderRadius;
        ghost.style.objectFit = st.objectFit;
        parent.appendChild(ghost);
        setTimeout(() => ghost.remove(), 480);
      }).observe(img, { attributes: true, attributeFilter: ['src'] });
    };
    watchArt($('playbar-artwork'));
    watchArt($('right-panel-cover'));
    const watchTitle = (el) => {
      if (!el) return;
      let last = el.textContent;
      new MutationObserver(() => {
        const now = el.textContent;
        if (now === last) return;
        last = now;
        if (calm()) return;
        el.classList.remove('nf-title-in');
        void el.offsetWidth;
        el.classList.add('nf-title-in');
      }).observe(el, { childList: true, characterData: true, subtree: true });
    };
    watchTitle(document.querySelector('.track-title-marquee'));
    watchTitle($('right-panel-title'));
  }

  // ---- the visualizer, in the style of cava: bars that jump to the music and fall back under gravity ----
  // ---- the logo: its ends stay put and the wave ripples between them while music plays ----
  // Drawn on a canvas, so the wave is the only thing that can ever appear there.
  function setupLogoWave() {
    const canvas = $('titlebar-logo-dot');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const W = 200;
    const H = 120;
    const LEFT = 16;
    const RIGHT = 184;
    const HEIGHT = 30;
    const CURVE = (2 * Math.PI) / 96;
    const SPEED = (2 * Math.PI) / 1.4; // one full ripple every 1.4 seconds
    const body = document.body;
    const still = () => body.classList.contains('perf') || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let phase = 0;
    let raf = 0;
    let last = 0;
    let colour = '';
    let colourAt = 0;
    const draw = () => {
      const now = Date.now();
      if (!colour || now - colourAt > 1000) { colour = getComputedStyle(canvas).color || '#fff'; colourAt = now; }
      const scale = Math.min(3, window.devicePixelRatio || 1) * (30 / W);
      const pw = Math.round(W * scale);
      const ph = Math.round(H * scale);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath();
      for (let x = LEFT; ; x = Math.min(RIGHT, x + 2)) {
        const y = 60 + HEIGHT * Math.sin(CURVE * x - phase);
        if (x === LEFT) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        if (x >= RIGHT) break;
      }
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = colour;
      ctx.stroke();
    };
    const frame = (now) => {
      raf = 0;
      if (!body.classList.contains('is-playing') || still()) { last = 0; return; }
      raf = requestAnimationFrame(frame);
      if (last && now - last < 33) return; // 30 times a second is plenty at this size
      if (last) phase = (phase + (SPEED * Math.min(100, now - last)) / 1000) % (2 * Math.PI);
      last = now;
      draw();
    };
    const wake = () => { if (!raf && body.classList.contains('is-playing') && !still()) raf = requestAnimationFrame(frame); };
    const recolour = () => { colour = ''; draw(); };
    new MutationObserver(wake).observe(body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('nocturne:look', recolour);
    new MutationObserver(recolour).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    draw();
    setTimeout(recolour, 600); // the theme's colours may arrive just after this runs
    wake();
  }

  function setupVisualizer() {
    const fx = window.MurielPhoneFx;
    const core0 = core();
    const panel = $('right-panel');
    const bar = document.querySelector('.playbar');
    if (!fx || !fx.spectrumFor || !panel || !bar) return;
    const big = document.createElement('canvas');
    big.id = 'nf-cava';
    big.setAttribute('aria-hidden', 'true');
    panel.appendChild(big);
    const mini = document.createElement('canvas');
    mini.id = 'nf-cava-mini';
    mini.setAttribute('aria-hidden', 'true');
    bar.insertBefore(mini, bar.firstChild);
    const a = core0.audio;
    let spectrum = null;
    let forSong = null;
    let gains = null;
    let heights = null;
    let falls = null;
    let targets = null;
    let raf = 0;
    let lastDraw = 0;
    let failedFor = null;
    let loadTriedAt = 0;
    let colors = null;
    let colorsAt = 0;
    let placedAt = 0;
    const CEILING = 0.8;
    const mode = () => document.body.dataset.npViz || 'both';
    const off = () => mode() === 'off' || document.body.classList.contains('perf');
    const npOpen = () => document.body.classList.contains('np-open');
    const nowPlayingTab = () => { const pane = $('drawer-queue'); return !pane || pane.classList.contains('hidden'); };
    const showsBig = () => !off() && npOpen() && nowPlayingTab();
    const showsMini = () => !off() && mode() === 'both' && !npOpen();
    const visible = () => !document.hidden && (showsBig() || showsMini());
    const refreshGains = () => {
      if (!spectrum) return;
      gains = spectrum.centres.map((hz) => Math.pow(10, fx.eqGainAt(hz) / 42));
    };
    const place = () => {
      // just above the seek bar, measured once the sheet has stopped sliding
      const r = bar.getBoundingClientRect();
      if (!r.height || !npOpen()) return;
      if (panel.getAnimations && panel.getAnimations().length) return;
      const top = Math.round(r.top - panel.getBoundingClientRect().top - (panel.classList.contains('lyrics-empty') ? 84 : 56) - 6);
      if (top > 0 && big.dataset.top !== String(top)) { big.dataset.top = String(top); big.style.top = `${top}px`; }
    };
    // keeps what's on screen when the song changes, so the bars carry on rather than blink out
    const ensureBars = (n) => {
      if (heights && heights.length === n) return;
      heights = new Float32Array(n);
      falls = new Float32Array(n);
      targets = new Float32Array(n);
    };
    const load = async () => {
      const song = core().state.currentTrack;
      const id = song && song.id;
      if (!id || !visible() || forSong === id || failedFor === id) return;
      if (Date.now() - loadTriedAt < 400) return; // the file may not be here yet: look again in a moment
      loadTriedAt = Date.now();
      forSong = id;
      spectrum = null;
      let failed = false;
      const got = await fx.spectrumFor(id).catch(() => { failed = true; return null; });
      if (!core().state.currentTrack || core().state.currentTrack.id !== id) { if (forSong === id) forSong = null; return; }
      if (!got) { forSong = null; if (failed) failedFor = id; wake(); return; }
      spectrum = got;
      ensureBars(got.bars);
      refreshGains();
      wake();
    };
    const size = (c) => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return null;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, w, h };
    };
    const paint = (c) => {
      const s = size(c);
      if (!s) return;
      const { ctx, w, h } = s;
      ctx.clearRect(0, 0, w, h);
      const n = heights.length;
      const look = document.body.dataset.npVizLook || 'solid';
      const gap = look === 'thin' ? Math.max(2, w / n * 0.62) : Math.max(1.5, w / n * 0.22);
      const bw = (w - gap * (n - 1)) / n;
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, colors.from);
      grad.addColorStop(1, colors.to);
      ctx.fillStyle = grad;
      const block = 5;
      for (let b = 0; b < n; b++) {
        const bh = heights[b] * h;
        if (bh < 0.5) continue;
        const x = b * (bw + gap);
        if (look === 'blocks') {
          // the stacked characters of a terminal
          const cells = Math.floor(bh / block);
          for (let i = 0; i < cells; i++) ctx.fillRect(x, h - (i + 1) * block + 1, bw, block - 1);
        } else ctx.fillRect(x, h - bh, bw, bh);
      }
    };
    const frame = (now) => {
      raf = 0;
      if (!visible()) { big.classList.remove('on'); mini.classList.remove('on'); return; }
      if (big.classList.contains('on') !== showsBig()) { big.classList.toggle('on', showsBig()); place(); }
      mini.classList.toggle('on', showsMini());
      if (!spectrum) load();
      ensureBars(spectrum ? spectrum.bars : 48);
      const dt = lastDraw ? Math.min(0.1, (now - lastDraw) / 1000) : 0.033;
      if (lastDraw && now - lastDraw < 30) { raf = requestAnimationFrame(frame); return; }
      lastDraw = now;
      if (now - placedAt > 400) { placedAt = now; place(); }
      if (!colors || now - colorsAt > 2000) {
        const st = getComputedStyle(document.documentElement);
        const from = st.getPropertyValue('--md-sys-color-primary').trim() || '#b69df8';
        colors = { from, to: st.getPropertyValue('--md-sys-color-tertiary').trim() || from };
        colorsAt = now;
        refreshGains();
      }
      const n = heights.length;
      const playing = !a.paused && !a.ended;
      const at = spectrum ? Math.floor((a.currentTime || 0) * spectrum.fps) : 0;
      const row = at * n;
      // the bars for this song are on their way: a low, gentle wave instead of nothing
      const waiting = !spectrum && failedFor !== (core().state.currentTrack && core().state.currentTrack.id) && (playing || core().state.trackLoading);
      for (let b = 0; b < n; b++) {
        const v = spectrum
          ? (playing && row + n <= spectrum.frames.length ? (spectrum.frames[row + b] / 255) * (gains ? gains[b] : 1) : 0)
          : (waiting ? 0.1 + 0.07 * Math.sin(b * 0.38 - now / 280) : 0);
        // an everyday level sits low and only the biggest hits climb, so the bars keep moving instead of pressing against the cap
        targets[b] = CEILING * Math.pow(Math.min(1, v), 1.1);
      }
      // cava's monstercat filter: a tall bar pulls up its neighbours, so the bars read as one shape
      for (let z = 0; z < n; z++) {
        for (let m = z - 1; m >= 0; m--) { const v = targets[z] / Math.pow(2.1, z - m); if (v > targets[m]) targets[m] = v; else break; }
        for (let m = z + 1; m < n; m++) { const v = targets[z] / Math.pow(2.1, m - z); if (v > targets[m]) targets[m] = v; else break; }
      }
      // up quickly, down under gravity, the same at any frame rate
      let moving = playing || waiting;
      for (let b = 0; b < n; b++) {
        const t = targets[b];
        if (t >= heights[b]) { heights[b] += (t - heights[b]) * Math.min(1, dt * 28); falls[b] = 0; } else {
          falls[b] += dt * 5.5;
          heights[b] = Math.max(t, heights[b] - falls[b] * dt);
        }
        if (heights[b] > 0.003) moving = true;
      }
      if (showsBig()) paint(big);
      if (showsMini()) paint(mini);
      if (moving) raf = requestAnimationFrame(frame); else lastDraw = 0;
    };
    const wake = () => {
      place();
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const songChanged = () => { forSong = null; spectrum = null; failedFor = null; loadTriedAt = 0; wake(); };
    window.addEventListener('muriel:track', songChanged);
    a.addEventListener('emptied', () => { const s = core().state.currentTrack; if (!s || s.id !== forSong) songChanged(); });
    ['playing', 'play', 'pause', 'seeked'].forEach((n) => a.addEventListener(n, wake));
    window.addEventListener('muriel:fx', () => { refreshGains(); wake(); });
    window.addEventListener('resize', wake);
    // lyrics arriving or going changes how tall the bars' space is
    new MutationObserver(wake).observe(panel, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', () => { lastDraw = 0; wake(); });
    new MutationObserver(wake).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-np-viz', 'data-np-viz-look'] });
    const queuePane = $('drawer-queue');
    if (queuePane) new MutationObserver(wake).observe(queuePane, { attributes: true, attributeFilter: ['class'] });
    window.NocturneExtras.viz = { get heights() { return heights; }, get spectrum() { return spectrum; }, running: () => !!raf };
    wake();
  }

  // ---- a swipe goes one way ----
  // Sideways rows only pan sideways (extras.css), so the page can't drift during a swipe. A swipe that starts on a row and
  // goes up or down is passed on to the page here, with its momentum, so rows don't become dead spots when scrolling.
  function setupDirectionLock() {
    const ROWS = '.home-pl-row, .fy-row, .sp-row, .chips-row, .genre-chips, .suggestion-chips, .nf-genre-row, .nf-looks, .nf-jump, .multi-select-actions, .audio-tabs, .pfx-jump, .my-wave-tracks-row, .search-albums-row, .palette-style-toggle';
    let g = null;
    let glide = 0;
    const pageOf = (row) => {
      for (let e = row.parentElement; e && e !== document.documentElement; e = e.parentElement) {
        const y = getComputedStyle(e).overflowY;
        if ((y === 'auto' || y === 'scroll') && e.scrollHeight > e.clientHeight + 1) return e;
      }
      return null;
    };
    document.addEventListener('touchstart', (e) => {
      cancelAnimationFrame(glide);
      g = null;
      if (e.touches.length !== 1) return;
      const row = e.target.closest && e.target.closest(ROWS);
      if (!row) return;
      const t = e.touches[0];
      g = { row, x: t.clientX, y: t.clientY, lastY: t.clientY, lastT: e.timeStamp, way: null, page: null, speed: 0 };
    }, { passive: true, capture: true });
    document.addEventListener('touchmove', (e) => {
      if (!g || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!g.way) {
        const dx = Math.abs(t.clientX - g.x);
        const dy = Math.abs(t.clientY - g.y);
        if (dx < 6 && dy < 6) return;
        g.way = dy > dx ? 'y' : 'x';
        if (g.way === 'y') g.page = pageOf(g.row);
      }
      if (g.way !== 'y' || !g.page) return;
      const step = g.lastY - t.clientY;
      const dt = Math.max(1, e.timeStamp - g.lastT);
      g.page.scrollTop += step;
      g.speed = g.speed * 0.6 + (step / dt) * 0.4;
      g.lastY = t.clientY;
      g.lastT = e.timeStamp;
    }, { passive: true, capture: true });
    const end = () => {
      if (!g || g.way !== 'y' || !g.page) { g = null; return; }
      const page = g.page;
      let v = g.speed * 16;
      g = null;
      const run = () => {
        v *= 0.955;
        if (Math.abs(v) < 0.4) return;
        const before = page.scrollTop;
        page.scrollTop += v;
        if (page.scrollTop !== before) glide = requestAnimationFrame(run);
      };
      glide = requestAnimationFrame(run);
    };
    document.addEventListener('touchend', end, { passive: true, capture: true });
    document.addEventListener('touchcancel', () => { g = null; }, { passive: true, capture: true });
  }

  // ---- Home sections in the order you choose ----
  const HOME = [
    { key: 'hero', sel: '#home-hero', name: 'My Wave and Jump back in' },
    { key: 'shortcuts', sel: '#sp-home', name: 'Shortcuts and suggestions' },
    { key: 'playlists', sel: '#section-home-playlists', name: 'Your playlists' },
    { key: 'repeat', sel: '#section-on-repeat', name: 'On repeat' },
    { key: 'foryou', sel: '#section-for-you', name: 'For you' },
  ];
  const homeOrder = () => {
    const saved = readJson('nocturne_home_order', []);
    const known = saved.filter((k) => HOME.some((h) => h.key === k));
    HOME.forEach((h) => { if (!known.includes(h.key)) known.push(h.key); });
    return known;
  };
  function applyHomeOrder() {
    const box = $('discover-empty');
    if (!box) return;
    box.classList.add('nf-home-ordered');
    const orders = new Map();
    homeOrder().forEach((k, i) => {
      const h = HOME.find((x) => x.key === k);
      const el = h && box.querySelector(`:scope > ${h.sel}`);
      if (el) orders.set(el, (i + 1) * 100);
    });
    // anything else stays right after the section it comes after
    let base = 0;
    let extra = 0;
    [...box.children].forEach((c) => {
      if (c.id === 'section-sync-invite') c.style.order = '100000'; // a suggestion, so it waits at the bottom
      else if (orders.has(c)) { base = orders.get(c); extra = 0; c.style.order = String(base); } else { extra++; c.style.order = String(base + extra); }
    });
  }
  function setupHomeOrder() {
    applyHomeOrder();
    const homeBox = $('discover-empty');
    if (homeBox) new MutationObserver(applyHomeOrder).observe(homeBox, { childList: true });
    const heads = [...document.querySelectorAll('#view-settings .settings-group-title')];
    const head = heads.find((t) => /Tabs\s*&\s*Home/i.test(t.textContent));
    const group = head && head.nextElementSibling;
    if (!group) return;
    const item = document.createElement('div');
    item.className = 'setting-item';
    item.id = 'setting-home-order';
    item.innerHTML = '<div class="nf-row-text"><span class="setting-name">Home order</span><span class="pfx-hint">Drag to put what you use first at the top.</span></div><ul class="nf-order-list" id="nf-home-order"></ul>';
    group.appendChild(item);
    const list = item.querySelector('ul');
    const grip = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
    const render = () => {
      list.innerHTML = homeOrder().map((k) => `<li data-key="${k}"><span>${esc(HOME.find((h) => h.key === k).name)}</span><span class="nf-grip" aria-label="Drag to reorder">${grip}</span></li>`).join('');
    };
    render();
    let drag = null;
    list.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.nf-grip');
      if (!handle) return;
      e.preventDefault();
      const li = handle.closest('li');
      drag = { li, startY: e.clientY, id: e.pointerId, base: 0 };
      li.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    });
    list.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      const dy = e.clientY - drag.startY;
      drag.li.style.transform = `translateY(${dy}px)`;
      const rows = [...list.children];
      const at = rows.indexOf(drag.li);
      const r = drag.li.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const below = rows[at + 1];
      const above = rows[at - 1];
      if (below && mid > below.getBoundingClientRect().top + below.offsetHeight / 2) {
        const before = r.top;
        list.insertBefore(below, drag.li);
        drag.startY -= drag.li.getBoundingClientRect().top - before - dy;
        drag.li.style.transform = `translateY(${e.clientY - drag.startY}px)`;
      } else if (above && mid < above.getBoundingClientRect().top + above.offsetHeight / 2) {
        const before = r.top;
        list.insertBefore(drag.li, above);
        drag.startY -= drag.li.getBoundingClientRect().top - before - dy;
        drag.li.style.transform = `translateY(${e.clientY - drag.startY}px)`;
      }
    });
    const drop = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag.li.classList.remove('dragging');
      drag.li.style.transform = '';
      drag = null;
      write('nocturne_home_order', JSON.stringify([...list.children].map((li) => li.dataset.key)));
      applyHomeOrder();
    };
    list.addEventListener('pointerup', drop);
    list.addEventListener('pointercancel', drop);
    if (window.syncSettingsGroupTitles) window.syncSettingsGroupTitles();
  }

  // ---- go back after a skip ----
  function setupGoBack() {
    window.addEventListener('nocturne:skipped', (e) => {
      const { track, at, index } = e.detail || {};
      if (!track) return;
      snack(`Skipped ${track.title || 'song'}`, () => {
        const c = core();
        if (c.state.queue[index] === track) c.state.queueIndex = index;
        c.playTrack(track);
        const until = Date.now() + 20000;
        const t = setInterval(() => {
          if (c.state.currentTrack !== track || Date.now() > until) return clearInterval(t);
          if (!c.state.trackLoading && c.audio.readyState >= 1 && c.audio.duration > 0) { clearInterval(t); c.seek(at); }
        }, 100);
      }, 'Go back', 6000);
    });
  }

  // ---- loop a section ----
  function setupLoop() {
    const panel = document.querySelector('[data-audio-panel="tempo"]');
    if (!panel) return;
    const L = { a: null, b: null, id: null, timer: 0 };
    const card = document.createElement('div');
    card.className = 'setting-item pfx-card';
    card.id = 'nf-loop-card';
    card.innerHTML = '<div class="nf-row-text"><span class="setting-name">Loop a section</span><span class="pfx-hint" id="nf-loop-state">Play to the part you want, then set its start and end.</span></div><div class="tempo-preset-chips"><button type="button" class="chip-btn tempo-preset-chip" id="nf-loop-start">Set start</button><button type="button" class="chip-btn tempo-preset-chip" id="nf-loop-end">Set end</button><button type="button" class="chip-btn tempo-preset-chip" id="nf-loop-clear">Clear</button></div>';
    panel.appendChild(card);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'nf-loop-chip';
    chip.className = 'nf-loop-chip';
    chip.hidden = true;
    const meta = document.querySelector('#right-panel .right-panel-meta');
    if (meta) meta.appendChild(chip);
    const render = () => {
      const set = L.a != null && L.b != null;
      const line = card.querySelector('#nf-loop-state');
      line.textContent = set ? `Looping ${clock(L.a)} to ${clock(L.b)}` : L.a != null ? `Starts at ${clock(L.a)}. Now set the end.` : 'Play to the part you want, then set its start and end.';
      card.querySelector('#nf-loop-start').classList.toggle('active', L.a != null);
      card.querySelector('#nf-loop-end').classList.toggle('active', set);
      chip.hidden = !set;
      chip.textContent = set ? `Loop ${clock(L.a)} to ${clock(L.b)}  ×` : '';
    };
    const stop = () => { clearInterval(L.timer); L.timer = 0; L.a = L.b = L.id = null; render(); };
    const run = () => {
      clearInterval(L.timer);
      L.timer = setInterval(() => {
        const c = core();
        const song = c.state.currentTrack;
        if (!song || song.id !== L.id) return stop();
        if (c.audio.currentTime >= L.b) c.seek(L.a);
      }, 50);
    };
    card.querySelector('#nf-loop-start').addEventListener('click', () => {
      const c = core();
      if (!c.state.currentTrack) return toast('Play a song first, then set where the loop starts', 'info');
      L.a = c.audio.currentTime || 0;
      L.id = c.state.currentTrack.id;
      if (L.b != null && L.b < L.a + 1) { L.b = null; clearInterval(L.timer); L.timer = 0; }
      render();
    });
    card.querySelector('#nf-loop-end').addEventListener('click', () => {
      const c = core();
      if (!c.state.currentTrack) return toast('Play a song first, then set where the loop ends', 'info');
      if (L.a == null || L.id !== c.state.currentTrack.id) { L.a = 0; L.id = c.state.currentTrack.id; }
      const cur = c.audio.currentTime || 0;
      if (cur < L.a + 1) return toast('Set the end at least a second after the start', 'info');
      L.b = Math.min(cur, (c.audio.duration || cur + 1) - 0.25);
      run();
      render();
    });
    card.querySelector('#nf-loop-clear').addEventListener('click', stop);
    chip.addEventListener('click', stop);
    window.NocturneExtras.loop = L;
  }

  // ---- playback settings ----
  function setupPlaybackRows() {
    const anchor = $('setting-autoplay');
    if (!anchor) return;
    const rows = [
      toggleRow('setting-gapless', 'Gapless albums', 'Album songs run straight into each other, with no crossfade.', () => read('nocturne_gapless') !== '0', (v) => write('nocturne_gapless', v ? '1' : '0')),
      toggleRow('setting-smart-shuffle', 'Smart shuffle', 'Avoids the same artist twice in a row and plays songs you like more often.', () => read('nocturne_smart_shuffle') !== '0', (v) => write('nocturne_smart_shuffle', v ? '1' : '0')),
    ];
    const pods = document.createElement('div');
    pods.className = 'setting-item nf-toggle-row';
    pods.id = 'setting-airpods';
    pods.innerHTML = '<div class="nf-row-text"><span class="setting-name">AirPods and headphones</span><span class="pfx-hint">Press the stem once to play or pause, twice to skip, three times to go back. Works with the screen off too.</span></div>';
    rows.push(pods);
    rows.reverse().forEach((r) => anchor.after(r));
  }

  // ---- Spotify playlists in search: found with your own key, brought in by the same importer as a pasted link ----
  async function searchPlaylists(query, stillCurrent) {
    const box = $('search-playlists-container');
    const chip = document.querySelector('#search-filter-chips [data-filter="playlists"]');
    if (!box || !chip) return;
    box.innerHTML = '';
    chip.hidden = true;
    const showAll = () => { if (chip.classList.contains('active')) { const all = document.querySelector('#search-filter-chips [data-filter="all"]'); if (all) all.click(); } };
    if (!query || query.length < 2 || /^https?:/i.test(query)) { showAll(); return; }
    let found = [];
    try {
      const r = await (await api(`/api/spotify-playlists?q=${encodeURIComponent(query)}`)).json();
      if (r && r.success && Array.isArray(r.playlists)) found = r.playlists;
    } catch (e) {}
    if (stillCurrent && !stillCurrent()) return;
    if (!found.length) { showAll(); return; }
    chip.hidden = false;
    box.innerHTML = `<h3 class="nf-pl-head">Playlists</h3>${found.map((p, i) => `<button type="button" class="nf-pl-result" data-i="${i}">${p.cover ? `<img class="nf-pl-cover" src="${esc(p.cover)}" alt="" loading="lazy">` : '<span class="nf-pl-cover"></span>'}<span class="nf-row-text"><span class="setting-name">${esc(p.name)}</span><span class="pfx-hint">${esc([p.owner && `by ${p.owner}`, p.total ? `${p.total} songs` : ''].filter(Boolean).join(' · '))}</span></span><span class="nf-mini-pill">Add</span></button>`).join('')}`;
    box.onclick = (e) => {
      const row = e.target.closest('.nf-pl-result');
      if (!row) return;
      const p = found[Number(row.dataset.i)];
      // go by where the tap landed: inside a button, what the tap reports as its target varies
      const pill = row.querySelector('.nf-mini-pill').getBoundingClientRect();
      const onAdd = e.clientX >= pill.left - 10 && e.clientX <= pill.right + 10;
      if (onAdd) importPlaylist(p); else openPlaylist(p);
    };
  }
  // the songs right here, playable straight away; Add is what keeps the playlist
  function openPlaylist(p) {
    if (!p || !window.openAlbum) return;
    window.openAlbum({
      id: `spotify_playlist_${p.id || p.url}`,
      type: 'Playlist',
      title: p.name,
      artist: p.owner ? `by ${p.owner}` : 'Spotify',
      cover: p.cover || '',
      trackCount: p.total || 0,
      loadTracks: async () => (await api(`/api/spotify-import?url=${encodeURIComponent(p.url)}`)).json(),
      onSave: () => importPlaylist(p),
    });
  }
  function importPlaylist(p) {
    const open = $('btn-open-spotify-import');
    const url = $('spotify-import-url');
    const go = $('btn-confirm-spotify-import');
    if (!p || !open || !url || !go) return;
    open.click();
    url.value = p.url;
    url.dispatchEvent(new Event('input', { bubbles: true }));
    go.click();
  }

  // ---- search: the most likely song on top ----
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  function bestScore(query, track, index) {
    const nq = norm(query);
    const words = nq.split(' ').filter(Boolean);
    const title = norm(track.title);
    const artist = norm(track.artist);
    const have = new Set(`${title} ${artist}`.split(' '));
    let score = words.filter((w) => have.has(w)).length / (words.length || 1);
    // extra words in a title only count against it when the search was for a title: searching just an artist's name
    // shouldn't favour whichever of their songs has the shortest name
    const titleWords = title.split(' ');
    if (titleWords.some((w) => words.includes(w))) score -= Math.min(0.3, titleWords.filter((w) => !words.includes(w)).length * 0.04);
    score -= index * 0.03;
    if (nq === title || nq === `${artist} ${title}` || nq === `${title} ${artist}`) score += 0.35;
    const version = /\b(live|cover|karaoke|remix|sped up|slowed|nightcore|instrumental|reaction)\b/.exec(title);
    if (version && !nq.includes(version[1])) score -= 0.4;
    return score;
  }
  function bestFirst(query, tracks) {
    if (!Array.isArray(tracks) || tracks.length < 2 || /^https?:/i.test(String(query).trim())) return null;
    let best = -1;
    let top = 0.6;
    tracks.slice(0, 5).forEach((t, i) => { const s = bestScore(query, t, i); if (s > top) { top = s; best = i; } });
    if (best < 0) return null;
    return [tracks[best], ...tracks.filter((_, i) => i !== best)];
  }
  function markBest(list) {
    const row = list.querySelector('.track-row');
    if (!row) return;
    row.classList.add('nf-best-match');
    const info = row.querySelector('.track-row-info');
    if (info && !info.querySelector('.nf-best-label')) info.insertAdjacentHTML('afterbegin', '<span class="nf-best-label">Best match</span>');
  }

  // ---- keep songs offline ----
  const keeper = { running: false, stopped: false, done: 0, total: 0, failed: 0, map: readJson('nocturne_kept_map', {}) };
  const keptPlaylists = () => readJson('nocturne_keep_playlists', []);
  function keptTracks() {
    const s = core().state;
    const out = new Map();
    const add = (t) => { if (t && t.id && t.platform !== 'local' && !out.has(t.id)) out.set(t.id, t); };
    if (read('nocturne_keep_liked') === '1') (s.favorites || []).forEach(add);
    const ids = keptPlaylists();
    (s.playlists || []).forEach((p) => { if (ids.includes(p.id)) (p.tracks || []).forEach(add); });
    return [...out.values()];
  }
  const keeperLine = () => {
    const line = $('nf-keep-state');
    if (!line) return;
    const n = keeper.total;
    line.textContent = !n ? 'Saves them in the background as you add them. Uses your internet connection.'
      : keeper.done >= n ? `All ${n} songs are on this phone.`
        : `${keeper.done} of ${n} on this phone${keeper.failed ? `, ${keeper.failed} couldn't be saved yet` : ''}.`;
  };
  async function runKeeper() {
    if (keeper.running || keeper.stopped) return;
    const c = core();
    const list = keptTracks();
    keeper.total = list.length;
    keeper.done = 0;
    keeper.failed = 0;
    keeperLine();
    if (!list.length) return;
    keeper.running = true;
    try {
      for (const t of list) {
        if (keeper.stopped || navigator.onLine === false) break;
        while (c.state.trackLoading && !keeper.stopped) await wait(1000);
        let song = t;
        if (t.spotifyId && !keeper.map[t.id]) {
          const [hit] = await c.matchTracks([{ title: t.title, artist: t.artist, duration: t.duration }]).catch(() => []);
          if (hit) { keeper.map[t.id] = { id: hit.id, url: hit.url }; write('nocturne_kept_map', JSON.stringify(keeper.map)); }
        }
        if (keeper.map[t.id]) song = { ...t, ...keeper.map[t.id], spotifyId: undefined };
        const isCached = async () => { try { return !!(await (await api(`/api/check-cache?id=${encodeURIComponent(song.id)}`)).json()).cached; } catch (e) { return false; } };
        if (await isCached()) { keeper.done++; keeperLine(); continue; }
        if (!song.url || song.spotifyId) { keeper.failed++; keeperLine(); continue; }
        c.prefetch(song);
        const until = Date.now() + 180000;
        let ok = false;
        while (Date.now() < until && !keeper.stopped) { await wait(1500); if (await isCached()) { ok = true; break; } }
        if (ok) keeper.done++; else keeper.failed++;
        keeperLine();
      }
    } finally {
      keeper.running = false;
    }
  }
  function setupKeeper() {
    globalThis.__murielKeptIds = () => {
      const ids = new Set();
      keptTracks().forEach((t) => { ids.add(canon(t.id)); if (keeper.map[t.id]) ids.add(canon(keeper.map[t.id].id)); });
      return ids;
    };
    const anchor = $('offline-storage-item');
    if (anchor) {
      const row = toggleRow('setting-keep-liked', 'Keep liked songs offline', '', () => read('nocturne_keep_liked') === '1', (v) => { write('nocturne_keep_liked', v ? '1' : '0'); keeper.stopped = false; runKeeper(); });
      const hint = row.querySelector('.pfx-hint');
      hint.id = 'nf-keep-state';
      anchor.after(row);
      keeperLine();
    }
    const clear = $('btn-clear-offline');
    if (clear) clear.addEventListener('click', () => { keeper.stopped = true; });
    let signature = '';
    const check = () => {
      const now = keptTracks().map((t) => t.id).join('|');
      if (now === signature) return;
      signature = now;
      runKeeper();
    };
    setTimeout(check, 8000);
    setInterval(check, 30000);
    window.NocturneExtras.keeper = { state: keeper, run: runKeeper, check };
  }

  // ---- playlist page: its details, and keeping it offline ----
  function setupPlaylistDetails() {
    window.addEventListener('nocturne:playlist-open', (e) => {
      const pl = e.detail;
      const count = $('playlist-detail-count');
      if (!pl || !count) return;
      let box = $('nf-pl-details');
      if (!box) {
        box = document.createElement('div');
        box.id = 'nf-pl-details';
        box.className = 'nf-pl-details';
        count.after(box);
        box.addEventListener('click', (ev) => {
          const keep = ev.target.closest('[data-act="keep"]');
          if (keep) {
            const id = box.dataset.playlist;
            const ids = keptPlaylists();
            const on = ids.includes(id);
            write('nocturne_keep_playlists', JSON.stringify(on ? ids.filter((x) => x !== id) : [...ids, id]));
            keep.classList.toggle('active', !on);
            keep.setAttribute('aria-pressed', String(!on));
            keeper.stopped = false;
            runKeeper();
          }
          if (ev.target.closest('[data-act="review"]')) openReview();
        });
      }
      box.dataset.playlist = pl.id;
      const tally = new Map();
      (pl.tracks || []).forEach((t) => { const a = String(t.artist || '').trim(); if (a) tally.set(a, (tally.get(a) || 0) + 1); });
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a);
      const missing = readJson('nocturne_import_review', []).filter((m) => m.target === pl.id).length;
      const kept = keptPlaylists().includes(pl.id);
      box.innerHTML = `${top.length ? `<span class="nf-pl-artists">Mostly ${esc(top.join(', '))}</span>` : ''}<span class="nf-pl-actions"><button type="button" class="nf-mini-pill${kept ? ' active' : ''}" data-act="keep" aria-pressed="${kept}">Keep offline</button>${missing ? `<button type="button" class="nf-mini-pill" data-act="review">${missing} not found. Review</button>` : ''}</span>`;
    });
  }

  // ---- imports: songs that weren't found, to pick the right version of ----
  const reviewItems = () => readJson('nocturne_import_review', []);
  const saveReview = (items) => { write('nocturne_import_review', JSON.stringify(items.slice(-300))); window.dispatchEvent(new Event('nocturne:review')); };
  function noteNotFound(list, target, name) {
    const items = reviewItems();
    list.forEach((t, i) => {
      if (!t || !t.title) return;
      if (items.some((m) => m.title === t.title && m.artist === t.artist && m.target === (target || ''))) return;
      items.push({ key: `${Date.now().toString(36)}${i}`, title: t.title, artist: t.artist || '', duration: t.duration || 0, target: target || '', targetName: name || '' });
    });
    saveReview(items);
    const n = list.length;
    setTimeout(() => snack(n === 1 ? '1 song wasn\'t found' : `${n} songs weren't found`, openReview, 'Review', 8000), 900);
  }
  function placeFound(item, track) {
    const c = core();
    if (item.target === 'favorites') { if (!c.isFavorite(track)) c.toggleFavorite(track); return; }
    if (item.target) c.addToPlaylist(item.target, track);
  }
  function openReview() {
    const sh = openSheet('Songs not found');
    const render = () => {
      const items = reviewItems();
      if (!items.length) { sh.body.innerHTML = '<p class="nf-empty">Nothing left to review.</p>'; return; }
      sh.body.innerHTML = `<p class="pfx-hint">Search for each one and tap the right version.</p>${items.map((m) => `<div class="nf-review-item" data-key="${esc(m.key)}"><div class="nf-review-head"><div class="nf-row-text"><span class="setting-name">${esc(m.title)}</span><span class="pfx-hint">${esc(m.artist)}${m.targetName ? ` · for ${esc(m.targetName)}` : ''}</span></div><button type="button" class="nf-mini-pill" data-act="find">Find</button><button type="button" class="nf-mini-pill" data-act="drop">Skip</button></div><div class="nf-review-found"></div></div>`).join('')}`;
    };
    render();
    sh.body.addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.nf-review-item');
      if (!itemEl) return;
      const key = itemEl.dataset.key;
      const item = reviewItems().find((m) => m.key === key);
      if (!item) return;
      if (e.target.closest('[data-act="drop"]')) { saveReview(reviewItems().filter((m) => m.key !== key)); render(); return; }
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        placeFound(item, itemEl.found[Number(pick.dataset.pick)]);
        saveReview(reviewItems().filter((m) => m.key !== key));
        render();
        toast(`Added ${item.title}`, 'success');
        return;
      }
      if (e.target.closest('[data-act="find"]')) {
        const box = itemEl.querySelector('.nf-review-found');
        box.textContent = 'Searching…';
        try {
          const c = core();
          const q = encodeURIComponent(`${item.artist} ${item.title}`.trim());
          const search = async (p) => (await (await api(`/api/search?q=${q}&platform=${p}&limit=6`)).json()).tracks || [];
          let found = await search('ytmusic').catch(() => []);
          if (!found.length) found = await search(c.musicSource());
          itemEl.found = found.slice(0, 5);
          box.innerHTML = itemEl.found.length ? itemEl.found.map((t, i) => `<button type="button" class="nf-review-pick" data-pick="${i}"><span class="setting-name">${esc(t.title)}</span><span class="pfx-hint">${esc(t.artist)}${t.duration ? ` · ${clock(t.duration)}` : ''}</span></button>`).join('') : '<p class="nf-empty">Nothing came up. Skip this one, or search for it yourself later.</p>';
        } catch (err) {
          box.innerHTML = '<p class="nf-empty">Couldn\'t search right now. Check your connection and try again.</p>';
        }
      }
    });
  }
  function setupReviewRow() {
    const anchor = $('card-spotify-import');
    if (!anchor) return;
    const row = actionRow('setting-import-review', 'Songs not found', '', 'Review', openReview);
    anchor.after(row);
    const show = () => {
      const n = reviewItems().length;
      row.hidden = !n;
      row.querySelector('.pfx-hint').textContent = n ? `${n} from your imports. Pick the right version of each.` : '';
    };
    show();
    window.addEventListener('nocturne:review', show);
  }

  // ---- share a playlist: link, QR code or image ----
  function qrFor(text) {
    if (typeof window.qrcode !== 'function') return null;
    for (const level of ['M', 'L']) {
      try { const q = window.qrcode(0, level); q.addData(text); q.make(); return q; } catch (e) {}
    }
    return null;
  }
  function posterCanvas(pl, q, count) {
    const W = 1080;
    const H = 1440;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const st = getComputedStyle(document.documentElement);
    const accent = st.getPropertyValue('--md-sys-color-primary').trim() || '#b69df8';
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, accent);
    g.addColorStop(1, '#120c1f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    const box = 760;
    const bx = (W - box) / 2;
    const by = 330;
    ctx.fillRect(bx - 40, by - 40, box + 80, box + 80);
    const n = q.getModuleCount();
    const cell = box / n;
    ctx.fillStyle = '#111';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(bx + c * cell, by + r * cell, Math.ceil(cell), Math.ceil(cell));
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '700 72px system-ui, -apple-system, sans-serif';
    const name = String(pl.name || 'Playlist');
    ctx.fillText(name.length > 24 ? `${name.slice(0, 23)}…` : name, W / 2, 140);
    ctx.font = '400 40px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${count} song${count === 1 ? '' : 's'}`, W / 2, 210);
    ctx.fillText('Scan to open it in Sine', W / 2, 1270);
    return canvas;
  }
  async function shareSheet(pl, shareLink) {
    const S = window.MurielShare;
    const sh = openSheet('Share playlist');
    let link = '';
    let count = 0;
    try { const r = await S.encode({ name: pl.name, tracks: pl.tracks || [] }); link = S.webLink(r.payload); count = r.count; } catch (e) {}
    if (!count) { sh.body.innerHTML = '<p class="nf-empty">Songs from your own files can\'t be shared, and this playlist has nothing else. Add some songs from search first.</p>'; return; }
    const q = qrFor(link);
    sh.body.innerHTML = `${q ? `<div class="nf-qr">${q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div><p class="pfx-hint nf-center">${esc(pl.name)} · ${count} song${count === 1 ? '' : 's'}. Point a phone camera here.</p>` : '<p class="nf-empty">This playlist is too big for a QR code. Share the link instead.</p>'}<div class="nf-sheet-actions"><button type="button" class="btn-pill-primary" data-act="link">Share link</button>${q ? '<button type="button" class="btn-outline-pill" data-act="image">Save image</button>' : ''}</div>`;
    sh.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="link"]')) { sh.close(); shareLink(); return; }
      if (!e.target.closest('[data-act="image"]')) return;
      posterCanvas(pl, q, count).toBlob(async (blob) => {
        if (!blob) return toast("Couldn't make the image. Try again", 'error');
        const fileName = `${String(pl.name || 'playlist').replace(/[^\w -]+/g, '').trim() || 'playlist'}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        try {
          if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
        } catch (err) { if (err && err.name === 'AbortError') return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }, 'image/png');
    });
    sh.el.dataset.link = link;
  }

  // ---- health check ----
  const CHECKS = [
    { id: 'internet', name: 'Internet', run: async () => {
      if (navigator.onLine === false) return { ok: false, text: 'Your phone says it is offline. Turn off airplane mode or join Wi-Fi.' };
      return { ok: true, text: 'Connected' };
    } },
    { id: 'search', name: 'Search', run: async (ctx) => {
      const r = await (await api('/api/search?q=daft%20punk&platform=ytmusic&limit=3')).json();
      if (!r.success || !r.tracks || !r.tracks.length) return { ok: false, text: 'No results came back. Try another source in Settings, or update Sine.' };
      ctx.song = r.tracks[0];
      return { ok: true, text: `Found songs (${r.tracks.length})` };
    } },
    { id: 'downloads', name: 'Downloads', run: async (ctx) => {
      if (!ctx.song) return { skip: true, text: 'Skipped, because search did not work.' };
      const r = await (await api(`/api/stream-info?url=${encodeURIComponent(ctx.song.url || '')}&id=${encodeURIComponent(ctx.song.id || '')}`)).json();
      if (r && r.success === false) return { ok: false, text: 'Couldn\'t get a song file. Try again on another network, or set Source quality to High in Settings, Playback.' };
      return { ok: true, text: 'Songs can be fetched' };
    } },
    { id: 'quality', name: 'Best quality', run: async () => {
      const bad = read('nocturne_opus_bad');
      if (bad) return { warn: true, text: 'Very High files failed on this phone, so Sine is using High. Sound still works.' };
      return { ok: true, text: `Set to ${read('nocturne_quality') || 'high'}` };
    } },
    { id: 'sound', name: 'Sound processing', run: async () => {
      const fx = window.MurielPhoneFx;
      if (!fx || !fx.render) return { ok: false, text: 'The sound engine did not load. Close Sine and open it again.' };
      const buf = new AudioBuffer({ numberOfChannels: 2, length: 22050, sampleRate: 44100 });
      for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / 44100); }
      const out = await fx.renderPart(buf, fx.compose(fx.defaults(), {}, ''), 20000, 0, 0.5);
      const d = out.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < d.length; i += 8) peak = Math.max(peak, Math.abs(d[i]));
      return peak > 0.05 ? { ok: true, text: 'Working' } : { ok: false, text: 'It produced silence. Close Sine and open it again.' };
    } },
    { id: 'storage', name: 'Space', run: async () => {
      if (!navigator.storage || !navigator.storage.estimate) return { ok: true, text: 'Nothing to report' };
      const e = await navigator.storage.estimate();
      const free = (e.quota || 0) - (e.usage || 0);
      return free < 300 * 1048576 ? { warn: true, text: 'Running low. Clear offline songs in Settings, Storage.' } : { ok: true, text: `${Math.round(free / 1073741824 * 10) / 10} GB free for Sine` };
    } },
    { id: 'spotify', name: 'Spotify', run: async () => {
      let keys = null;
      try { keys = globalThis.__murielVault && globalThis.__murielVault('spotify_app').read(); } catch (e) {}
      if (!keys || !keys.id) return { skip: true, text: 'Not set up. Add your keys in Settings, Integrations to search Spotify.' };
      const r = await (await api('/api/search?q=daft%20punk&platform=spotify&limit=3')).json();
      if (!r.success) return { ok: false, text: r.error || 'Spotify did not answer. Check your Client ID and Secret, and that your Spotify account has Premium.' };
      return { ok: true, text: 'Search works' };
    } },
  ];
  async function runHealth(list) {
    const ctx = {};
    const report = [];
    for (const check of CHECKS) {
      const row = list.querySelector(`[data-check="${check.id}"]`);
      row.className = 'nf-check busy';
      row.querySelector('.nf-check-text').textContent = 'Checking…';
      let result;
      try { result = await Promise.race([check.run(ctx), wait(20000).then(() => ({ ok: false, text: 'No answer after 20 seconds. Check your connection and run this again.' }))]); } catch (e) {
        result = { ok: false, text: 'This check failed. Check your connection and run this again.' };
      }
      row.className = `nf-check ${result.ok ? 'ok' : result.warn ? 'warn' : result.skip ? 'skip' : 'bad'}`;
      row.querySelector('.nf-check-text').textContent = result.text;
      report.push(`${check.name}: ${result.text}`);
    }
    return report;
  }
  function openHealth() {
    const sh = openSheet('Health check');
    sh.body.innerHTML = `<div class="nf-checks">${CHECKS.map((c) => `<div class="nf-check" data-check="${c.id}"><span class="nf-check-dot"></span><div class="nf-row-text"><span class="setting-name">${esc(c.name)}</span><span class="pfx-hint nf-check-text">Waiting</span></div></div>`).join('')}</div><div class="nf-sheet-actions"><button type="button" class="btn-pill-primary" data-act="again">Run again</button><button type="button" class="btn-outline-pill" data-act="copy">Copy results</button></div>`;
    const list = sh.body.querySelector('.nf-checks');
    let report = [];
    const go = async () => { report = await runHealth(list); };
    go();
    sh.body.addEventListener('click', async (e) => {
      if (e.target.closest('[data-act="again"]')) go();
      if (e.target.closest('[data-act="copy"]')) {
        try { await navigator.clipboard.writeText(report.join('\n')); toast('Results copied', 'success'); } catch (err) { toast("Couldn't copy them. Try again", 'error'); }
      }
    });
  }

  // ---- what's new, and a notice when a new file is ready ----
  const WHATS_NEW = document.documentElement.classList.contains('is-desktop') ? [
    'Spotify song links work, in Import and pasted into search',
    'Log in to Spotify on the PC with the same Redirect URI as your iPhone (muriel://spotify-callback)',
    'Search Spotify with your own developer key (Settings, Integrations)',
    'Sync, listen-along and shared playlist links open straight in Sine',
    'Downloads in MP3, FLAC, M4A, Opus or WAV, with your sound settings if you like',
    'Streaming quality and your chosen output device now apply to everything Sine plays',
    'The Spotify source button and song names no longer get cut off, and the window fits smaller screens',
  ] : [
    'Taking an AirPod out pauses the song at once, instead of it carrying on through the speaker',
    'A smoother opening animation that starts straight away',
    'Fixed: turning the screen off just after changing the sound no longer stops and starts it a few times',
    'Fixed: the lock screen player sitting at 0:00, and its buttons losing your sound settings',
    'Nocturne is now Sine, with a new icon and opening animation',
    'The visualizer is ready much sooner when the song changes',
    'A sine wave seek bar (Settings, Appearance, Now Playing), and a logo that moves with the music',
    'Nine new moods in the Upscaler, from Afterhours to Cathedral',
    'A cleaner layout on every page',
    'A visualizer in Now Playing and the mini player',
    'Search Spotify for playlists and play them right away, or log in to bring in your own',
    'AirPods: press once to play or pause, twice to skip, three times for the song before',
    'Listen along with a friend (Settings, Sync)',
    'Loop a section, gapless albums, smarter shuffle and a bass enhancer',
    'Keep songs offline, and share playlists by QR code',
    'A health check in Settings, About',
    'Fixed: music stopping with the screen off, songs playing twice, little stutters, and songs on loop losing their sound',
  ];
  const newer = (a, b) => {
    const x = String(a).split('.').map(Number);
    const y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
  };
  function openWhatsNew() {
    const b = window.MURIEL_BUILD || {};
    const sh = openSheet(`New in ${b.version || 'Sine'}`);
    sh.body.innerHTML = `<ul class="nf-new-list">${WHATS_NEW.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  }
  async function checkForUpdate() {
    const b = window.MURIEL_BUILD || {};
    if (!b.updateUrl || !b.version) return;
    const last = Number(read('nocturne_update_checked')) || 0;
    if (Date.now() - last < 6 * 3600 * 1000) return;
    write('nocturne_update_checked', String(Date.now()));
    try {
      const get = globalThis.__murielFetch || fetch;
      const fresh = await (await get(`${b.updateUrl}?t=${Date.now()}`, { cache: 'no-store' })).json();
      if (!fresh || !fresh.version || !newer(fresh.version, b.version)) return;
      const line = $('update-status');
      if (line) line.textContent = `Sine ${fresh.version} is ready`;
      snack(`Sine ${fresh.version} is ready`, () => { if (!fresh.url) return; if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(fresh.url); else window.open(fresh.url, '_blank'); }, fresh.url ? 'Get it' : 'OK', 9000);
    } catch (e) {}
  }
  function setupVersionNotes() {
    const b = window.MURIEL_BUILD || {};
    const seen = read('nocturne_seen_version');
    const veteran = read('nocturne_welcome_v2') && !read('nocturne_first_v25');
    if (b.version && seen !== b.version) {
      write('nocturne_seen_version', b.version);
      if (seen || veteran) setTimeout(() => snack(`Sine is now ${b.version}`, openWhatsNew, "See what's new", 7000), 2500);
    }
    setTimeout(checkForUpdate, 6000);
    const about = $('settings-section-about');
    const group = about && about.querySelector('.m3-group');
    // with nowhere to check, this row could only ever say it's a development build
    const updates = $('update-status');
    const hasUpdates = !!(window.MURIEL_BUILD && window.MURIEL_BUILD.updateUrl);
    if (updates && !hasUpdates && updates.closest('.setting-item')) updates.closest('.setting-item').style.display = 'none';
    if (group) {
      group.appendChild(actionRow('setting-health', 'Health check', 'Tests search, downloads, sound and Spotify, and says how to fix what fails.', 'Run', openHealth));
      group.appendChild(actionRow('setting-whats-new', "What's new", `Everything added in ${b.version || 'this version'}.`, 'Show', openWhatsNew));
    }
  }

  // ---- listen along ----
  const listen = { role: null, peer: null, conns: [], conn: null, code: '', timer: 0, ping: 0, offset: 0, lastId: null, pending: null, sent: 0 };
  const peerOpts = () => ({ debug: 0, ...readJson('muriel_sync_server', {}) });
  const slimTrack = (t) => (t ? { id: t.id, title: t.title, artist: t.artist, url: t.url, platform: t.platform, duration: t.duration, thumbnail: t.thumbnail, spotifyId: t.spotifyId, searchQuery: t.searchQuery } : null);
  function listenState() {
    const c = core();
    const t = c.state.currentTrack;
    return { type: 'state', track: t && t.platform !== 'local' ? slimTrack(t) : null, own: !!(t && t.platform === 'local'), t: c.audio.currentTime || 0, playing: !c.audio.paused, sentAt: Date.now() };
  }
  function broadcast() {
    const m = listenState();
    listen.conns.forEach((c) => { try { if (c.open) c.send(m); } catch (e) {} });
    listen.sent++;
  }
  function renderBar() {
    let bar = $('nf-listen-bar');
    if (!listen.role) { if (bar) bar.remove(); renderListenRow(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nf-listen-bar';
      bar.className = 'nf-listen-bar';
      bar.innerHTML = '<span class="nf-listen-dot"></span><span class="nf-listen-text"></span><button type="button" class="nf-mini-pill" data-act="stop"></button>';
      bar.querySelector('[data-act="stop"]').addEventListener('click', endListen);
      document.body.appendChild(bar);
    }
    const n = listen.conns.length;
    bar.querySelector('.nf-listen-text').textContent = listen.role === 'host'
      ? (n ? `${n} listening with you` : `Waiting for a friend · code ${listen.code.toUpperCase()}`)
      : (listen.note || 'Listening along');
    bar.querySelector('[data-act="stop"]').textContent = listen.role === 'host' ? 'Stop' : 'Leave';
    renderListenRow();
  }
  function endListen() {
    clearInterval(listen.timer);
    clearInterval(listen.ping);
    listen.conns.forEach((c) => { try { c.close(); } catch (e) {} });
    if (listen.conn) { try { listen.conn.close(); } catch (e) {} }
    if (listen.peer) { try { listen.peer.destroy(); } catch (e) {} }
    Object.assign(listen, { role: null, peer: null, conns: [], conn: null, code: '', timer: 0, ping: 0, offset: 0, pending: null, note: '' });
    renderBar();
  }
  const noPeer = () => { toast("Listening along needs the connection service, which didn't load. Close Sine and open it again", 'error'); };
  function startListening() {
    if (listen.role) return;
    if (typeof window.Peer !== 'function') return noPeer();
    const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => letters[b % letters.length]).join('');
    const peer = new window.Peer(`nocturne-listen-${code}`, peerOpts());
    Object.assign(listen, { role: 'host', peer, code, conns: [] });
    const sh = openSheet('Listen together');
    const link = `muriel://listen?code=${code}`;
    const q = qrFor(link);
    sh.body.innerHTML = `${q ? `<div class="nf-qr">${q.createSvgTag({ cellSize: 5, margin: 2, scalable: true })}</div>` : ''}<p class="nf-listen-code">${code.toUpperCase()}</p><p class="pfx-hint nf-center">Your friend scans this or types the code in Settings, Sync. They hear what you play, from their own phone.</p><div class="nf-sheet-actions"><button type="button" class="btn-pill-primary" data-act="invite">Send invite</button></div>`;
    sh.body.querySelector('[data-act="invite"]').addEventListener('click', async () => {
      const api2 = window.electronAPI;
      const text = `Listen along with me on Sine. Code: ${code.toUpperCase()} ${link}`;
      if (api2 && api2.shareText) { if (await api2.shareText('Listen together', text) === 'copied') toast('Invite copied', 'success'); }
      else { try { await navigator.clipboard.writeText(text); toast('Invite copied', 'success'); } catch (e) { toast("Couldn't copy it. Read out the code instead", 'info'); } }
    });
    peer.on('connection', (c) => {
      listen.conns.push(c);
      const leave = () => { listen.conns = listen.conns.filter((x) => x !== c); renderBar(); };
      c.on('open', () => { c.send(listenState()); renderBar(); sh.close(); toast('A friend joined', 'success'); });
      c.on('data', (d) => { if (d && d.type === 'ping') { try { c.send({ type: 'pong', c: d.c, h: Date.now() }); } catch (e) {} } });
      c.on('close', leave);
      c.on('error', leave);
    });
    peer.on('error', (e) => {
      if (!listen.conns.length) { toast("Couldn't start. Check your connection and try again", 'error'); endListen(); sh.close(); }
    });
    const a = core().audio;
    if (!listen.hooked) {
      listen.hooked = true;
      ['play', 'pause', 'seeked'].forEach((ev) => a.addEventListener(ev, () => { if (listen.role === 'host') broadcast(); }));
    }
    listen.lastId = core().state.currentTrack && core().state.currentTrack.id;
    listen.timer = setInterval(() => {
      const now = core().state.currentTrack && core().state.currentTrack.id;
      if (now !== listen.lastId || Date.now() % 3000 < 500) { listen.lastId = now; broadcast(); }
    }, 500);
    renderBar();
  }
  function applyListenState(m) {
    const c = core();
    if (!m || m.type !== 'state') return;
    if (!m.track) {
      listen.note = m.own ? 'Your friend is playing their own file' : 'Waiting for your friend to play something';
      renderBar();
      return;
    }
    listen.note = `Listening along · ${m.track.title}`;
    renderBar();
    const cur = c.state.currentTrack;
    // the same song can be showing without being loaded, left over from last time the app was open
    const notLoaded = cur && cur.id === m.track.id && !c.state.trackLoading && c.audio.readyState === 0;
    if (!cur || cur.id !== m.track.id || notLoaded) {
      if (listen.pending !== m.track.id || Date.now() - (listen.pendingAt || 0) > 10000) {
        listen.pending = m.track.id;
        listen.pendingAt = Date.now();
        c.playTrack(m.track, [m.track], 0);
      }
      return;
    }
    listen.pending = null;
    if (c.state.trackLoading || c.audio.readyState < 1) return;
    const age = Math.max(0, (Date.now() + listen.offset - m.sentAt) / 1000);
    const target = m.t + (m.playing ? age : 0);
    if (m.playing && c.audio.paused) c.togglePlay();
    else if (!m.playing && !c.audio.paused) c.togglePlay();
    if (Math.abs((c.audio.currentTime || 0) - target) > 1.5 && target < (c.audio.duration || Infinity)) c.seek(target);
  }
  function joinListening(raw) {
    const code = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (code.length !== 6) return toast('A code has 6 letters and numbers. Check it and try again', 'info');
    if (listen.role) endListen();
    if (typeof window.Peer !== 'function') return noPeer();
    const peer = new window.Peer(undefined, peerOpts());
    Object.assign(listen, { role: 'guest', peer, code, note: 'Connecting…' });
    renderBar();
    const fail = setTimeout(() => {
      if (listen.role === 'guest' && !listen.conn) { /* keep waiting for signalling */ }
      if (listen.role === 'guest' && !(listen.conn && listen.conn.open)) { endListen(); toast("Couldn't reach your friend. Check the code, and that you both have internet. Some networks block this, so try mobile data", 'error'); }
    }, 20000);
    peer.on('open', () => {
      const conn = peer.connect(`nocturne-listen-${code}`, { reliable: true });
      listen.conn = conn;
      conn.on('open', () => {
        clearTimeout(fail);
        const beat = () => { try { conn.send({ type: 'ping', c: Date.now() }); } catch (e) {} };
        beat();
        listen.ping = setInterval(beat, 15000);
      });
      conn.on('data', (d) => {
        if (d && d.type === 'pong') { const now = Date.now(); listen.offset = d.h - (d.c + now) / 2; return; }
        applyListenState(d);
      });
      conn.on('close', () => { if (listen.role === 'guest') { endListen(); toast('Your friend ended the session', 'info'); } });
    });
    peer.on('error', (e) => {
      if (listen.role !== 'guest') return;
      clearTimeout(fail);
      endListen();
      toast(e && e.type === 'peer-unavailable' ? "That code isn't active. Ask your friend to start again" : "Couldn't connect. Check your connection and try again", 'error');
    });
  }
  function renderListenRow() {
    const start = $('nf-listen-start');
    if (!start) return;
    start.textContent = listen.role === 'host' ? 'Stop' : 'Start';
  }
  function setupListen() {
    const about = $('settings-section-about');
    if (!about) return;
    const section = document.createElement('div');
    section.className = 'settings-section';
    section.dataset.cat = 'sync';
    section.id = 'nf-listen-section';
    section.innerHTML = '<div class="settings-group-title">Listen together</div><div class="m3-group"><div class="setting-item nf-toggle-row"><div class="setting-item-top"><div class="nf-row-text"><span class="setting-name">Play for a friend</span><span class="pfx-hint">They hear what you play, in time with you, on their own phone.</span></div><button type="button" class="btn-outline-pill" id="nf-listen-start">Start</button></div></div><div class="setting-item"><div class="nf-row-text"><span class="setting-name">Join a friend</span><span class="pfx-hint">Type the code they give you.</span></div><form class="nf-listen-join" id="nf-listen-join"><input type="text" class="pill-text-input" id="nf-listen-code" placeholder="6-letter code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8"><button type="submit" class="btn-pill-primary">Join</button></form></div></div>';
    about.parentElement.insertBefore(section, about);
    section.querySelector('#nf-listen-start').addEventListener('click', () => { if (listen.role === 'host') endListen(); else startListening(); });
    section.querySelector('#nf-listen-join').addEventListener('submit', (e) => { e.preventDefault(); joinListening(section.querySelector('#nf-listen-code').value); });
    window.addEventListener('muriel:deeplink', (e) => {
      const m = /^muriel:\/\/listen\?code=([a-z0-9]+)/i.exec(String(e.detail || ''));
      if (m) joinListening(m[1]);
    });
  }

  // ---- Spotify login on the phone ----
  function setupSpotifyLogin() {
    const pane = document.querySelector('.sp-pane[data-mode="login"]');
    if (pane) {
      const note = pane.firstElementChild;
      if (note) note.innerHTML = `Brings in your liked songs and the playlists you made or collaborate on. Spotify doesn't share other people's playlists this way, so use their link instead. In your <b>Spotify developer dashboard</b>, open your app, go to Settings and add this Redirect URI:<code class="nf-code">${esc((window.MURIEL_BUILD || {}).spotifyRedirect || 'muriel://spotify-callback')}</code>${document.documentElement.classList.contains('is-desktop') ? 'Then click Log in below. Your browser opens; approve, and when the browser asks to open Sine, allow it.' : 'Then tap Log in below. Safari opens, you approve, and it comes back here.'}`;
      const input = $('sp-client-id');
      if (input && !input.value) {
        try {
          const keys = globalThis.__murielVault && globalThis.__murielVault('spotify_app').read();
          if (keys && keys.id) { input.value = keys.id; input.dispatchEvent(new Event('input', { bubbles: true })); }
        } catch (e) {}
      }
    }
    window.addEventListener('muriel:deeplink', async (e) => {
      const link = String(e.detail || '');
      if (!/^muriel:\/\/spotify-callback/i.test(link)) return;
      const query = link.split('?')[1] || '';
      try {
        await fetch(`${core().base()}/api/spotify-callback?${query}`);
      } catch (err) {
        toast("Couldn't finish the Spotify login. Check your connection and try again", 'error');
      }
    });
  }

  window.NocturneExtras = {
    bestFirst,
    markBest,
    searchPlaylists,
    shareSheet,
    noteNotFound,
    openReview,
    openHealth,
    openWhatsNew,
    applyHomeOrder,
    listen: { state: listen, start: startListening, join: joinListening, end: endListen, apply: applyListenState, snapshot: listenState },
  };

  function start() {
    sub.mount();
    [setupLoadingText, setupMiniLyric, setupLogoWave, setupVisualizer, setupDirectionLock, setupFly, setupSongChange, setupHomeOrder, setupGoBack, setupLoop, setupPlaybackRows, setupKeeper, setupPlaylistDetails, setupReviewRow, setupVersionNotes, setupListen, setupSpotifyLogin].forEach((f) => {
      try { f(); } catch (e) { console.warn('[nocturne]', f.name, e); }
    });
  }
  if (core()) start();
  else window.addEventListener('muriel:ready', start, { once: true });
})();
