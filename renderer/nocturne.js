// Sine's own touches on top of the Muriel app: section shortcuts in the Audio panel, what's shaping the sound on
// the Now Playing screen, swipes and double-taps. Everything goes through the app's public core (window.MurielCore).
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('is-mobile') && !document.documentElement.classList.contains('is-desktop')) return;

  const onReady = (fn) => { if (window.MurielCore) fn(); else window.addEventListener('muriel:ready', fn, { once: true }); };

  // ---- Audio panel: jump straight to a section ----
  function setupJump() {
    const nav = document.getElementById('pfx-jump');
    const scroller = document.querySelector('.audio-settings-body');
    if (!nav || !scroller) return;
    const buttons = [...nav.querySelectorAll('button')];
    const targetOf = (b) => document.getElementById(b.dataset.target);
    const show = () => {
      const top = scroller.getBoundingClientRect().top + nav.offsetHeight + 12;
      let active = buttons[0];
      buttons.forEach((b) => { const t = targetOf(b); if (t && t.getBoundingClientRect().top <= top + 8) active = b; });
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) active = buttons[buttons.length - 1];
      buttons.forEach((b) => b.classList.toggle('active', b === active));
    };
    buttons.forEach((b) => b.addEventListener('click', () => {
      const t = targetOf(b);
      if (!t) return;
      const y = t.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - nav.offsetHeight - 6;
      scroller.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }));
    scroller.addEventListener('scroll', show, { passive: true });
    show();
  }

  // ---- Now Playing: a line saying what's shaping the sound; tap it to change it ----
  function setupBadge() {
    const meta = document.querySelector('.right-panel-meta');
    if (!meta || !window.MurielPhoneFx) return;
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'nf-sound-badge';
    badge.id = 'nf-sound-badge';
    badge.hidden = true;
    meta.appendChild(badge);
    const render = () => {
      const parts = window.MurielPhoneFx.describe();
      badge.hidden = !parts.length;
      badge.textContent = parts.join(' · ');
      const st = window.MurielPhoneFx.getStatus().kind;
      badge.classList.toggle('is-working', st === 'working' || st === 'preview');
    };
    badge.addEventListener('click', () => { const b = document.getElementById('btn-open-settings'); if (b) b.click(); });
    window.addEventListener('muriel:fx', render);
    render();
  }

  // ---- gestures ----
  // follow a finger sideways on an element; vertical swipes are left to whatever else wants them
  function swipeable(el, { onSwipe, onDoubleTap, threshold = 56, move = true }) {
    let start = null;
    let lastTap = 0;
    let swallowClick = false;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || (e.target.closest && e.target.closest('button, input, .scrubber-track-container, [role="slider"]'))) { start = null; return; }
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, mode: null };
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!start.mode) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        start.mode = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
        if (start.mode === 'x') el.classList.add('nf-swiping');
      }
      if (start.mode !== 'x') return;
      e.preventDefault();
      e.stopPropagation();
      start.dx = dx;
      if (move) el.style.transform = `translateX(${dx * 0.75}px) rotate(${dx * 0.012}deg)`;
    }, { passive: false, capture: true });
    const end = (e) => {
      if (!start) return;
      const s = start;
      start = null;
      el.classList.remove('nf-swiping');
      if (s.mode === 'x') {
        const dx = s.dx || 0;
        swallowClick = true;
        setTimeout(() => { swallowClick = false; }, 350);
        if (move) el.style.transform = '';
        if (e.type !== 'touchcancel' && Math.abs(dx) >= threshold) onSwipe(dx < 0 ? 'left' : 'right');
        return;
      }
      if (!s.mode && e.type !== 'touchcancel' && onDoubleTap) {
        const now = Date.now();
        if (now - lastTap < 300) { lastTap = 0; onDoubleTap(e); } else lastTap = now;
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  function heartPop(host) {
    const heart = document.createElement('div');
    heart.className = 'nf-heart-pop';
    heart.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 2.9 4.5 6.6 4.5c2.1 0 3.9 1.1 5.4 3 1.5-1.9 3.3-3 5.4-3 3.7 0 5.8 3.7 4.2 7.3C19.5 16.4 12 21 12 21z"/></svg>';
    host.appendChild(heart);
    setTimeout(() => heart.remove(), 750);
  }

  function setupGestures() {
    const core = window.MurielCore;
    const art = document.querySelector('.right-panel-cover-wrapper') || (document.getElementById('right-panel-cover') || {}).parentElement;
    if (art) {
      swipeable(art, {
        onSwipe: (dir) => { if (dir === 'left') core.next(); else core.prev(); },
        onDoubleTap: () => {
          const t = core.state.currentTrack;
          if (!t) return;
          const action = window.NocturneLooks ? window.NocturneLooks.tapAction() : 'like';
          if (action === 'off') return;
          if (action === 'play') { core.togglePlay(); return; }
          if (!core.isFavorite(t)) core.toggleFavorite(t);
          heartPop(art);
        },
      });
    }
    const bar = document.getElementById('playbar');
    if (bar) {
      swipeable(bar, {
        move: false,
        threshold: 44,
        onSwipe: (dir) => {
          if (document.body.classList.contains('np-open')) return;
          if (dir === 'left') core.next(); else core.prev();
        },
      });
    }
  }

  // a short message with an Undo
  let snackTimer = null;
  window.NocturneSnack = (text, undo, label, ms) => snack(text, undo, label, ms);
  function snack(text, undo, label = 'Undo', ms = 4000) {
    let box = document.getElementById('nf-snack');
    if (!box) {
      box = document.createElement('div');
      box.id = 'nf-snack';
      box.className = 'nf-snack';
      box.innerHTML = '<span class="nf-snack-text"></span><button type="button" class="nf-snack-undo">Undo</button>';
      document.body.appendChild(box);
    }
    box.querySelector('.nf-snack-text').textContent = text;
    const btn = box.querySelector('.nf-snack-undo');
    btn.textContent = label;
    btn.onclick = () => { undo(); box.classList.remove('show'); };
    box.classList.add('show');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => box.classList.remove('show'), ms);
  }

  // ---- song rows: swipe right to play next, left to like ----
  function setupRowSwipes() {
    const core = window.MurielCore;
    let cur = null;
    let swallow = false;
    document.addEventListener('touchstart', (e) => {
      cur = null;
      if (e.touches.length !== 1) return;
      const row = e.target.closest && e.target.closest('.track-row');
      if (!row || !row.__track) return;
      const t = e.touches[0];
      cur = { row, x: t.clientX, y: t.clientY, mode: null, dx: 0 };
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!cur) return;
      const t = e.touches[0];
      const dx = t.clientX - cur.x;
      const dy = t.clientY - cur.y;
      if (!cur.mode) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        cur.mode = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
        if (cur.mode === 'y') { cur = null; return; }
        cur.row.classList.add('nf-row-swiping');
      }
      e.preventDefault();
      cur.dx = dx;
      const limit = Math.max(-110, Math.min(110, dx));
      cur.row.style.transform = `translateX(${limit}px)`;
      cur.row.dataset.nfSwipe = dx > 0 ? 'next' : 'like';
      cur.row.classList.toggle('nf-row-armed', Math.abs(dx) >= 72);
    }, { passive: false });
    const end = (e) => {
      if (!cur) return;
      const c = cur;
      cur = null;
      if (c.mode !== 'x') return;
      swallow = true;
      setTimeout(() => { swallow = false; }, 350);
      c.row.classList.remove('nf-row-swiping', 'nf-row-armed');
      c.row.style.transform = '';
      delete c.row.dataset.nfSwipe;
      if (e.type === 'touchcancel' || Math.abs(c.dx) < 72) return;
      const track = c.row.__track;
      if (c.dx > 0) {
        const at = Math.max(0, core.state.queueIndex + 1);
        core.playNextInQueue(track);
        snack(`Playing next: ${track.title}`, () => {
          const q = core.state.queue;
          if (q[at] === track) { q.splice(at, 1); window.dispatchEvent(new Event('muriel:queue')); }
        });
      } else {
        const liked = core.toggleFavorite(track);
        snack(liked ? `Liked: ${track.title}` : `Removed from liked: ${track.title}`, () => core.toggleFavorite(track));
      }
    };
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    document.addEventListener('click', (e) => { if (swallow && e.target.closest && e.target.closest('.track-row')) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // ---- Now Playing: the song's shape as the seek bar ----
  function setupWave() {
    const core = window.MurielCore;
    const wrapper = document.querySelector('.scrubber-bar-wrapper');
    const track = document.getElementById('scrubber-track');
    if (!wrapper || !track || !window.MurielPhoneFx) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'nf-wave';
    canvas.className = 'nf-wave';
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-label', 'Seek');
    track.parentNode.insertBefore(canvas, track);
    let peaks = null;
    let forSong = null;
    let seekPreview = null;
    let raf = 0;
    const sheetOpen = () => document.body.classList.contains('np-open');
    const colors = () => {
      const st = getComputedStyle(document.documentElement);
      return { on: st.getPropertyValue('--md-sys-color-primary').trim() || '#fff', off: st.getPropertyValue('--md-sys-color-on-surface').trim() || '#fff' };
    };
    function draw() {
      raf = 0;
      if (!sheetOpen() || !peaks) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const dur = core.audio.duration || 0;
      const at = seekPreview != null ? seekPreview : (dur ? (core.audio.currentTime || 0) / dur : 0);
      const c = colors();
      const style = document.body.dataset.npWave || 'bars';
      if (style === 'smooth') {
        // one continuous shape, played part in the accent colour
        const trace = () => {
          ctx.beginPath();
          const n = peaks.length;
          const pt = (i, sign) => [(i / (n - 1)) * w, h / 2 + sign * Math.max(1.5, peaks[i] * h * 0.5)];
          ctx.moveTo(...pt(0, -1));
          for (let i = 1; i < n; i++) { const [x, y] = pt(i, -1); const [px, py] = pt(i - 1, -1); ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); }
          for (let i = n - 1; i >= 0; i--) { const [x, y] = pt(i, 1); ctx.lineTo(x, y); }
          ctx.closePath();
        };
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = c.off;
        trace();
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w * at, h);
        ctx.clip();
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.on;
        trace();
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
        return;
      }
      const thin = style === 'thin';
      const gap = thin ? Math.max(2, (w - peaks.length * 1.5) / (peaks.length - 1)) : 2;
      const bw = thin ? 1.5 : Math.max(1.5, (w - gap * (peaks.length - 1)) / peaks.length);
      peaks.forEach((p, i) => {
        const x = i * (bw + gap);
        const bh = Math.max(3, p * h);
        ctx.globalAlpha = (i + 0.5) / peaks.length <= at ? 1 : 0.28;
        ctx.fillStyle = (i + 0.5) / peaks.length <= at ? c.on : c.off;
        const y = (h - bh) / 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, bw / 2); else ctx.rect(x, y, bw, bh);
        ctx.fill();
      });
    }
    const request = () => { if (!raf) raf = requestAnimationFrame(draw); };
    async function load() {
      const t = core.state.currentTrack;
      const id = t && t.id;
      if (!id || !sheetOpen() || forSong === id) { request(); return; }
      forSong = id;
      peaks = null;
      wrapper.classList.remove('nf-has-wave');
      const got = await window.MurielPhoneFx.peaksFor(core.audio.src, id, 64).catch(() => null);
      if (!got || !core.state.currentTrack || core.state.currentTrack.id !== id) { if (core.state.currentTrack && core.state.currentTrack.id === id) forSong = null; return; }
      peaks = got;
      wrapper.classList.add('nf-has-wave');
      request();
    }
    ['timeupdate', 'seeked', 'durationchange'].forEach((ev) => core.audio.addEventListener(ev, request));
    ['loadedmetadata', 'playing'].forEach((ev) => core.audio.addEventListener(ev, load));
    new MutationObserver(load).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', request);
    let dragging = false;
    const part = (x) => { const r = canvas.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)); };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      seekPreview = part(e.clientX);
      request();
    });
    const clock = document.getElementById('time-current');
    const showTime = (p) => {
      const dur = core.audio.duration || 0;
      if (!clock || !dur) return;
      const sec = Math.floor(p * dur);
      clock.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };
    canvas.addEventListener('pointermove', (e) => { if (dragging) { seekPreview = part(e.clientX); showTime(seekPreview); request(); } });
    const lift = (e) => {
      if (!dragging) return;
      dragging = false;
      const dur = core.audio.duration || 0;
      if (e.type === 'pointerup' && dur) core.seek(part(e.clientX) * dur);
      seekPreview = null;
      request();
    };
    canvas.addEventListener('pointerup', lift);
    canvas.addEventListener('pointercancel', lift);
    load();
  }

  // ---- Now Playing: what's up next, which also shows what autoplay chose ----
  function setupUpNext() {
    const core = window.MurielCore;
    const meta = document.querySelector('.right-panel-meta');
    if (!meta) return;
    const line = document.createElement('button');
    line.type = 'button';
    line.id = 'nf-up-next';
    line.className = 'nf-up-next';
    line.hidden = true;
    meta.appendChild(line);
    const render = () => {
      const st = core.state;
      const next = !st.isShuffle && st.queue ? st.queue[st.queueIndex + 1] : null;
      line.hidden = !next;
      if (next) line.textContent = `Up next: ${next.title}${next.artist ? ` · ${next.artist}` : ''}`;
    };
    line.addEventListener('click', () => {
      const tab = [...document.querySelectorAll('#right-panel .drawer-tab')].find((b) => /queue/i.test(b.textContent));
      if (tab) tab.click();
    });
    ['muriel:queue', 'muriel:queue-grown'].forEach((ev) => window.addEventListener(ev, render));
    ['playing', 'emptied'].forEach((ev) => core.audio.addEventListener(ev, render));
    render();
  }

  // ---- home: your genres, one tap from a station ----
  function setupGenres() {
    const core = window.MurielCore;
    const after = document.getElementById('section-home-playlists');
    if (!after || !core.genreFor) return;
    const box = document.createElement('div');
    box.id = 'nf-genres';
    box.className = 'nf-genres';
    box.hidden = true;
    after.parentNode.insertBefore(box, after);
    const known = () => {
      const seen = new Map();
      (core.state.history || []).slice(0, 80).forEach((t) => {
        const g = core.genreFor(t);
        if (!g) return;
        if (!seen.has(g)) seen.set(g, []);
        seen.get(g).push(t);
      });
      return [...seen.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
    };
    const render = () => {
      const groups = known();
      box.hidden = !groups.length;
      if (!groups.length) return;
      box.innerHTML = '<div class="onrepeat-head"><h3 class="section-title">Your genres</h3></div><div class="nf-genre-row"></div>';
      const row = box.querySelector('.nf-genre-row');
      groups.forEach(([genre, tracks]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nf-genre';
        b.textContent = genre;
        b.addEventListener('click', () => {
          const pick = tracks[Math.floor(Math.random() * Math.min(tracks.length, 12))];
          if (pick) core.startRadio(pick);
        });
        row.appendChild(b);
      });
    };
    let learning = false;
    const learn = async () => {
      if (learning || navigator.onLine === false) return;
      learning = true;
      const artists = new Map();
      (core.state.history || []).slice(0, 40).forEach((t) => {
        if (t && t.artist && !core.genreFor(t) && !artists.has(t.artist) && t.platform !== 'local') artists.set(t.artist, t);
      });
      for (const t of [...artists.values()].slice(0, 8)) {
        try { await core.lookupGenreFor(t); } catch (e) {}
        await new Promise((r) => setTimeout(r, 400));
      }
      learning = false;
      render();
    };
    render();
    setTimeout(learn, 5000);
    core.audio.addEventListener('playing', () => setTimeout(render, 2000));
  }

  // ---- first launch: the things you can't see until you know ----
  const WELCOME_KEY = 'nocturne_welcome_v2';
  const DESKTOP_TIPS = `
        <li><b>Keyboard</b>: Space plays and pauses. Ctrl + ← → skips, Ctrl + ↑ ↓ changes the volume, Shift + ← → jumps 5 seconds, M mutes, Ctrl + K searches.</li>
        <li><b>Sound</b>: equalizer, moods, upscaler and effects are in the Audio button at the bottom right. Changes are instant. Hold Compare to hear the difference.</li>
        <li><b>Mini player</b>: the small-window button at the top right keeps Sine on top of everything else.</li>
        <li><b>Sliders</b>: click or drag anywhere on one. Double-click an equalizer slider to set it back to 0.</li>
        <li><b>Autoplay</b> follows the song and its genre, not its name. Change it in Settings → Tracks.</li>`;
  function showWelcome() {
    const old = document.getElementById('nf-welcome');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'nf-welcome';
    wrap.className = 'nf-welcome';
    wrap.innerHTML = `<div class="nf-welcome-card" role="dialog" aria-label="Welcome to Sine">
      <img src="assets/icon.png" alt="" class="nf-welcome-icon">
      <h2>Welcome to Sine</h2>
      <ul>${document.documentElement.classList.contains('is-desktop') ? DESKTOP_TIPS : ''}${document.documentElement.classList.contains('is-desktop') ? '' : `
        <li><b>Swipe the artwork</b> or the mini player to skip. Double-tap the artwork to like it.</li>
        <li><b>Swipe a song</b> right to play it next, left to like it.</li>
        <li><b>Sound</b>: equalizer, presets, upscaler and effects are in the Audio button on Now Playing. Changes are instant. Hold Compare to hear the difference.</li>
        <li><b>Sliders</b>: tap or drag anywhere on one. Double-tap to reset. Slide across the equalizer bars to draw a curve.</li>
        <li><b>Autoplay</b> follows the song and its genre, not its name. Change it in Settings → Tracks.</li>`}
      </ul>
      <button type="button" class="nf-welcome-ok">Got it</button>
    </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('.nf-welcome-ok').addEventListener('click', () => {
      try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) {}
      wrap.remove();
    });
  }
  function setupWelcome() {
    let seen = false;
    try { seen = localStorage.getItem(WELCOME_KEY) === '1'; } catch (e) { seen = true; }
    if (!seen) setTimeout(showWelcome, 900);
    const credits = document.querySelector('.settings-credits');
    if (credits) {
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn-outline-pill';
      again.id = 'nf-show-welcome';
      again.textContent = 'Show the tips again';
      again.addEventListener('click', showWelcome);
      credits.parentNode.insertBefore(again, credits);
    }
  }

  // ---- faster starts: likely songs are fetched before they're tapped ----
  function fastOn() { try { return localStorage.getItem('nocturne_instant') !== '0'; } catch (e) { return true; } }
  function setupFastStart() {
    const core = window.MurielCore;
    const toggle = document.getElementById('toggle-fast-start');
    const show = () => { if (toggle) toggle.classList.toggle('active', fastOn()); };
    if (toggle) {
      toggle.addEventListener('click', () => {
        try { localStorage.setItem('nocturne_instant', fastOn() ? '0' : '1'); } catch (e) {}
        show();
      });
    }
    show();
    window.addEventListener('nocturne:likely', (e) => {
      if (fastOn() && navigator.onLine !== false) core.prefetch(e.detail);
    });
  }

  // ---- streaming quality ----
  function setupQuality() {
    const Q = globalThis.__murielQuality;
    const core = window.MurielCore;
    const choice = document.getElementById('quality-choice');
    const detail = document.getElementById('quality-detail');
    const now = document.getElementById('quality-now');
    const source = document.getElementById('pfx-source');
    if (!Q || !choice) return;
    const text = () => {
      const t = Q.tier();
      const opus = Q.canOpus();
      if (t === 'veryhigh') {
        return opus
          ? 'Opus at about 160 kbps, around 1.2 MB a minute. Uses the official recording when it can find one. Songs you’ve already saved stay as they are.'
          : 'This iPhone can’t play Opus, so this uses AAC at about 128 kbps, around 1 MB a minute.';
      }
      if (t === 'medium' && opus) return 'Opus at about 70 kbps, around 0.5 MB a minute. Songs you’ve already saved stay as they are.';
      if (t === 'low') return 'AAC at about 48 kbps, around 0.35 MB a minute. Songs you’ve already saved stay as they are.';
      return 'AAC at about 128 kbps, around 1 MB a minute. Songs you’ve already saved stay as they are.';
    };
    const show = () => {
      if (detail) detail.textContent = text();
      choice.querySelectorAll('[data-quality]').forEach((b) => {
        const on = b.dataset.quality === Q.tier();
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    };
    choice.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quality]');
      if (!b) return;
      Q.setTier(b.dataset.quality);
      show();
    });
    // what the song playing now really is, read from its file
    let asked = 0;
    const playing = async () => {
      const song = core.state.currentTrack;
      const ask = ++asked;
      let words = '';
      if (song && song.id && song.platform !== 'local') {
        const info = await Q.describeFile(song.id, Number(song.duration) || core.audio.duration || 0).catch(() => null);
        if (ask !== asked) return;
        if (info && info.codec) words = `${info.codec}${info.kbps ? `, ${info.kbps} kbps` : ''}${info.official ? ', official recording' : ''}`;
      }
      if (now) { now.hidden = !words; now.textContent = words ? `Playing now: ${words}` : ''; }
      if (source) { source.hidden = !words; source.textContent = words ? `Source: ${words}` : ''; }
    };
    ['loadedmetadata', 'playing', 'emptied'].forEach((t) => core.audio.addEventListener(t, playing));
    Q.ready.then(show);
    show();
    playing();
  }

  // ---- Spotify search: your own key for Spotify's official API ----
  function setupSpotifySearch() {
    const core = window.MurielCore;
    const vault = () => globalThis.__murielVault('spotify_app');
    const keys = () => { try { return vault().read(); } catch (e) { return null; } };
    const status = document.getElementById('spotify-keys-status');
    const idBox = document.getElementById('spotify-key-id');
    const secretBox = document.getElementById('spotify-key-secret');
    const save = document.getElementById('spotify-keys-save');
    const remove = document.getElementById('spotify-keys-remove');
    if (!status || !idBox || !secretBox || !save || !remove) return;
    const show = (text) => {
      const k = keys();
      status.textContent = text || (k ? 'Set up. Choose Spotify beside the search bar.' : 'Search Spotify with a free developer key of your own. It takes about two minutes, and you only do it once.');
      remove.hidden = !k;
      idBox.value = k ? k.id : '';
      secretBox.value = k ? k.secret : '';
    };
    const search = async (q) => {
      const res = await fetch(`http://127.0.0.1:${core.state.serverPort}/api/search?q=${encodeURIComponent(q)}&platform=spotify&limit=1`);
      return res.json();
    };
    save.addEventListener('click', async () => {
      const id = idBox.value.trim();
      const secret = secretBox.value.trim();
      if (!id || !secret) { status.textContent = 'Paste both the Client ID and the Client Secret.'; return; }
      const before = keys();
      vault().write({ id, secret });
      save.disabled = true;
      status.textContent = 'Testing with Spotify…';
      try {
        const data = await search(`test ${Date.now()}`);
        if (data.success) {
          show('Working. Choose Spotify beside the search bar.');
        } else {
          if (data.code === 'spotify_bad_keys') {
            if (before) vault().write(before); else localStorage.removeItem('muriel_secret_spotify_app');
          }
          status.textContent = data.error || 'Spotify couldn’t be reached. Try again.';
          remove.hidden = !keys();
        }
      } catch (e) {
        status.textContent = 'Spotify couldn’t be reached. Check your connection and try again.';
      }
      save.disabled = false;
    });
    remove.addEventListener('click', () => {
      localStorage.removeItem('muriel_secret_spotify_app');
      idBox.value = '';
      secretBox.value = '';
      show();
    });
    show();
    window.NocturneSpotify = {
      // what to do about a Spotify search that couldn't run, where the results would be
      showProblem(box, data) {
        if (!box) return;
        const setup = data.code === 'spotify_needs_keys' || data.code === 'spotify_bad_keys' || data.code === 'spotify_forbidden';
        const title = data.code === 'spotify_needs_keys' ? 'Spotify search needs a one-time setup' : (data.error || 'Spotify couldn’t be reached');
        const text = data.code === 'spotify_needs_keys'
          ? 'It uses a free developer key of your own, and takes about two minutes.'
          : setup ? 'You can check your keys in Settings.' : 'Try again, or search on another source.';
        box.innerHTML = '';
        const card = document.createElement('div');
        card.className = 'nf-search-problem';
        const h = document.createElement('div');
        h.className = 'nf-search-problem-title';
        h.textContent = title;
        const p = document.createElement('div');
        p.className = 'pfx-hint';
        p.textContent = text;
        card.append(h, p);
        if (setup) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'chip-btn';
          b.id = 'nf-spotify-setup';
          b.textContent = data.code === 'spotify_needs_keys' ? 'Set it up' : 'Open Settings';
          b.addEventListener('click', () => {
            show();
            document.getElementById('nav-settings').click();
            setTimeout(() => {
              if (window.showSettingsCategory) window.showSettingsCategory('integrations');
              setTimeout(() => {
                // only the page itself scrolls: scrollIntoView can move the whole app out of place
                const row = document.getElementById('setting-spotify-keys');
                const page = document.querySelector('.main-content');
                if (row && page) page.scrollTop += row.getBoundingClientRect().top - page.getBoundingClientRect().top - 12;
              }, 120);
            }, 80);
          });
          card.appendChild(b);
        }
        box.appendChild(card);
      },
    };
  }

  // ---- small things ----
  function setupSmallThings() {
    // tap the name at the top: back to the top of the page
    const logo = document.querySelector('.app-logo');
    if (logo) {
      logo.addEventListener('click', () => {
        document.querySelectorAll('.content-view.active, .main-content').forEach((v) => { if (v.scrollTop > 0) v.scrollTo({ top: 0, behavior: 'smooth' }); });
      });
    }
    // scrolling results puts the keyboard away
    document.addEventListener('touchmove', () => {
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'range' && !a.closest('.modal-backdrop')) a.blur();
    }, { passive: true });
    // the Audio panel opens where you left it
    const scroller = document.querySelector('.audio-settings-body');
    const open = document.getElementById('btn-open-settings');
    let spot = 0;
    if (scroller && open) {
      scroller.addEventListener('scroll', () => { if (scroller.clientHeight) spot = scroller.scrollTop; }, { passive: true });
      open.addEventListener('click', () => {
        const to = spot;
        requestAnimationFrame(() => requestAnimationFrame(() => { scroller.scrollTop = to; }));
      });
    }
    // pull the Audio panel down by its header to close it
    const header = document.querySelector('.audio-menu-card .settings-card-header');
    const close = document.getElementById('btn-close-settings');
    if (header && close) {
      let startY = null;
      header.addEventListener('touchstart', (e) => { startY = e.target.closest('button') ? null : e.touches[0].clientY; }, { passive: true });
      header.addEventListener('touchend', (e) => {
        if (startY != null && e.changedTouches[0].clientY - startY > 60) close.click();
        startY = null;
      });
    }
  }

  // ---- Drive mode: big buttons, the screen stays on ----
  function setupDrive() {
    const core = window.MurielCore;
    const tabs = document.querySelector('#right-panel .drawer-tabs');
    if (!tabs) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'nf-drive-open';
    button.className = 'nf-drive-open';
    button.setAttribute('aria-label', 'Drive mode');
    button.textContent = 'Drive';
    tabs.appendChild(button);
    let view = null;
    let lock = null;
    const render = () => {
      if (!view) return;
      const t = core.state.currentTrack;
      view.querySelector('.nf-drive-title').textContent = t ? t.title : 'Nothing playing';
      view.querySelector('.nf-drive-artist').textContent = t ? t.artist || '' : '';
      view.querySelector('.nf-drive-play').textContent = core.audio.paused ? 'Play' : 'Pause';
      const d = core.audio.duration || 0;
      view.querySelector('.nf-drive-bar i').style.width = `${d ? Math.min(100, (core.audio.currentTime / d) * 100) : 0}%`;
    };
    const keepAwake = async () => {
      try { if (navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch (e) { lock = null; }
    };
    const close = () => {
      if (view) view.remove();
      view = null;
      if (lock) { lock.release().catch(() => {}); lock = null; }
    };
    button.addEventListener('click', () => {
      view = document.createElement('div');
      view.id = 'nf-drive';
      view.className = 'nf-drive';
      view.innerHTML = `<button type="button" class="nf-drive-close">Close</button>
        <div class="nf-drive-info"><div class="nf-drive-title"></div><div class="nf-drive-artist"></div><div class="nf-drive-bar"><i></i></div></div>
        <div class="nf-drive-controls">
          <button type="button" class="nf-drive-prev">Back</button>
          <button type="button" class="nf-drive-play">Pause</button>
          <button type="button" class="nf-drive-next">Next</button>
        </div>`;
      document.body.appendChild(view);
      view.querySelector('.nf-drive-close').addEventListener('click', close);
      view.querySelector('.nf-drive-prev').addEventListener('click', () => core.prev());
      view.querySelector('.nf-drive-next').addEventListener('click', () => core.next());
      view.querySelector('.nf-drive-play').addEventListener('click', () => { core.togglePlay(); setTimeout(render, 350); });
      swipeable(view.querySelector('.nf-drive-info'), { move: false, onSwipe: (dir) => { if (dir === 'left') core.next(); else core.prev(); } });
      render();
      keepAwake();
    });
    ['timeupdate', 'playing', 'pause', 'loadedmetadata'].forEach((ev) => core.audio.addEventListener(ev, render));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && view) keepAwake(); });
  }

  // ---- hold to hear the song without any of it ----
  function setupCompare() {
    const b = document.getElementById('pfx-compare');
    if (!b || !window.MurielPhoneFx) return;
    const fx = window.MurielPhoneFx;
    const down = (e) => { e.preventDefault(); b.classList.add('held'); fx.setCompare(true); };
    const up = () => { if (!b.classList.contains('held')) return; b.classList.remove('held'); fx.setCompare(false); };
    b.addEventListener('pointerdown', down);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, up));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    const render = () => {
      const st = window.MurielCore.state;
      b.hidden = !(fx.isActive(fx.current()) && st.currentTrack);
    };
    window.addEventListener('muriel:fx', render);
    render();
  }

  // ---- home: a hello that fits the hour ----
  function setupGreeting() {
    const host = document.querySelector('.app-logo');
    if (!host) return;
    const hour = new Date().getHours();
    host.title = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  }

  onReady(() => {
    setupJump();
    setupBadge();
    setupGestures();
    setupRowSwipes();
    setupWave();
    setupUpNext();
    setupGenres();
    setupWelcome();
    setupFastStart();
    setupQuality();
    setupSpotifySearch();
    setupSmallThings();
    setupDrive();
    setupCompare();
    setupGreeting();
  });
})();
