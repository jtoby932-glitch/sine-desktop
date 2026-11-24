// Settings → Appearance on phones: see the look while changing it, pick or save a whole look, shape Now Playing.
// Runs after app.js and works through the app's own controls and settings keys, so nothing here can get out of step.
(function () {
  'use strict';
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (e) {} };

  // ---- Now Playing options ----
  const NP = {
    art: { key: 'nocturne_np_art', attr: 'npArt', fallback: 'rounded' },
    bg: { key: 'nocturne_np_bg', attr: 'npBg', fallback: 'glow' },
    seek: { key: 'nocturne_np_seek', attr: 'npSeek', fallback: 'wave' },
    align: { key: 'nocturne_np_align', attr: 'npAlign', fallback: 'left' },
    tap: { key: 'nocturne_np_tap', attr: 'npTap', fallback: 'like' },
    wave: { key: 'nocturne_np_wave', attr: 'npWave', fallback: 'bars' },
    fly: { key: 'nocturne_np_fly', attr: 'npFly', fallback: 'on' },
    lyric: { key: 'nocturne_np_lyric', attr: 'npLyric', fallback: 'on' },
    viz: { key: 'nocturne_np_viz', attr: 'npViz', fallback: 'both' },
    vizLook: { key: 'nocturne_np_viz_look', attr: 'npVizLook', fallback: 'solid' },
  };
  // the mini player's visualizer came later: everyone gets it once, and can turn it off after that
  try {
    if (!read('nocturne_viz_mini_v1')) { localStorage.setItem('nocturne_viz_mini_v1', '1'); localStorage.removeItem(NP.viz.key); }
  } catch (e) {}
  const npValue = (n) => read(NP[n].key) || NP[n].fallback;
  function applyNp() { Object.keys(NP).forEach((n) => { document.body.dataset[NP[n].attr] = npValue(n); }); }

  // ---- looks ----
  const LOOK_KEYS = ['muriel_theme_mode', 'muriel_theme_accent', 'muriel_theme_intensity', 'muriel_theme_brightness', 'muriel_palette_style',
    'muriel_adv_intensity_bg', 'muriel_highlight_buttons', 'muriel_corner_radius', 'muriel_font', 'nocturne_np_art', 'nocturne_np_bg', 'nocturne_np_seek', 'nocturne_np_align'];
  const look = (id, name, mode, accent, intensity, brightness, palette, tint, radius, art, bg, seek, ground) => ({
    id, name, ground,
    values: {
      muriel_theme_mode: mode, muriel_theme_accent: accent, muriel_theme_intensity: intensity, muriel_theme_brightness: brightness,
      muriel_palette_style: palette, muriel_adv_intensity_bg: tint ? 'true' : 'false', muriel_highlight_buttons: '1', muriel_corner_radius: radius,
      muriel_font: 'google', nocturne_np_art: art, nocturne_np_bg: bg, nocturne_np_seek: seek, nocturne_np_align: 'left',
    },
  });
  const LOOKS = [
    look('nocturne', 'Nocturne', 'dark', '#b69df8', 36, 50, 'classic', false, 16, 'rounded', 'glow', 'wave', '#120c1f'),
    look('dusk', 'Dusk', 'dark', '#ff8f7a', 62, 50, 'vibrant', true, 20, 'rounded', 'cover', 'wave', '#2a1420'),
    look('deep', 'Deep Sea', 'dark', '#56c5c5', 58, 45, 'tonal-spot', true, 24, 'rounded', 'glow', 'wave', '#07222a'),
    look('vinyl', 'Vinyl', 'dark', '#f5b83d', 30, 45, 'classic', false, 12, 'vinyl', 'plain', 'line', '#1c1710'),
    look('mono', 'Mono', 'dark', '#c8c8c8', 0, 40, 'neutral', false, 4, 'square', 'plain', 'line', '#111111'),
    look('neon', 'Neon', 'dark', '#ff4fd8', 90, 40, 'expressive', true, 28, 'circle', 'glow', 'wave', '#1b0626'),
    look('paper', 'Paper', 'light', '#6d4cd8', 24, 60, 'tonal-spot', false, 16, 'rounded', 'plain', 'wave', '#f4f1fb'),
    look('album', 'From album', 'auto', '#b69df8', 36, 50, 'classic', false, 20, 'rounded', 'cover', 'wave', null),
  ];
  const SAVED = 'nocturne_looks';
  const saved = () => { try { const v = JSON.parse(read(SAVED) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const snapshot = () => {
    const out = {};
    LOOK_KEYS.forEach((k) => { const v = read(k); if (v != null) out[k] = v; });
    return out;
  };

  function isDark(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) < 128;
  }

  // through the app's own controls, so their labels and positions follow
  function applyValues(values) {
    const merged = { ...values };
    const core = window.MurielCore;
    const set = (k) => { if (merged[k] != null) write(k, merged[k]); };
    ['muriel_theme_mode', 'muriel_theme_accent', 'muriel_theme_intensity', 'muriel_theme_brightness'].forEach(set);
    Object.keys(NP).forEach((n) => { if (merged[NP[n].key] != null) write(NP[n].key, merged[NP[n].key]); });
    if (merged.muriel_palette_style) {
      const opt = document.querySelector(`#palette-style-menu [data-value="${merged.muriel_palette_style}"]`);
      if (opt) opt.click();
    }
    if (merged.muriel_adv_intensity_bg != null) {
      const btn = document.getElementById('btn-intensity-bg');
      if (btn && btn.classList.contains('active') !== onOff(merged.muriel_adv_intensity_bg, false)) btn.click();
    }
    if (merged.muriel_highlight_buttons != null) {
      const btn = [...document.querySelectorAll('.setting-item')].find((i) => (i.querySelector('.setting-name') || {}).textContent === 'Highlight buttons');
      const sw = btn && btn.querySelector('.effect-switch-btn');
      if (sw && sw.classList.contains('active') !== onOff(merged.muriel_highlight_buttons, true)) sw.click();
    }
    if (merged.muriel_corner_radius != null) {
      const r = document.getElementById('slider-corner-radius');
      if (r) { r.value = merged.muriel_corner_radius; r.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    if (merged.muriel_font) {
      const f = document.querySelector(`#font-toggle [data-font="${merged.muriel_font}"]`);
      if (f) f.click();
    }
    if (core && core.reloadFromStorage) core.reloadFromStorage(['muriel_theme_mode']);
    syncColorControls();
    applyNp();
    if (npValue('seek') === 'line') straightLine();
    renderAll();
    window.dispatchEvent(new Event('nocturne:look'));
  }
  function syncColorControls() {
    const pairs = [['slider-theme-intensity', 'muriel_theme_intensity', 'val-theme-intensity'], ['slider-theme-brightness', 'muriel_theme_brightness', 'val-theme-brightness']];
    pairs.forEach(([id, key, label]) => {
      const s = document.getElementById(id);
      const v = read(key);
      if (!s || v == null) return;
      s.value = v;
      s.dispatchEvent(new Event('nf:refresh'));
      const l = document.getElementById(label);
      if (l) l.textContent = `${v}%`;
    });
  }
  function applyLook(values, name) {
    const before = snapshot();
    applyValues(values);
    if (window.NocturneSnack && name) window.NocturneSnack(`${name} applied`, () => applyValues(before));
  }

  // ---- the page ----
  let looksEl = null;
  let editing = false;
  let npChoices = [];
  // what a setting comes to, whether it was ever changed or not
  const FLAGS = { muriel_adv_intensity_bg: false, muriel_highlight_buttons: true };
  const onOff = (v, fallback) => (v == null ? fallback : v === true || v === '1' || v === 'true' || v === 1);
  const effective = (k, v) => {
    if (k in FLAGS) return onOff(v, FLAGS[k]);
    const value = v == null ? LOOKS[0].values[k] : v;
    return String(value).toLowerCase();
  };
  const same = (a, b) => LOOK_KEYS.every((k) => b[k] == null || effective(k, a[k]) === effective(k, b[k]));

  function barsSvg(accent, ground) {
    const dark = ground ? isDark(ground) : true;
    const bar = [[0, 100], [0, 52], [24, 76], [48, 100], [0, 100]];
    return `<svg viewBox="0 0 54 100" aria-hidden="true">${bar.map(([a, b], i) => `<rect x="${i * 11.5}" y="${a}" width="8.5" height="${b - a}" rx="4.25" fill="${accent}" opacity="${i === 0 || i === 4 ? 1 : dark ? 0.72 : 0.82}"/>`).join('')}</svg>`;
  }
  function tile(item, isSaved) {
    const v = item.values;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nf-look';
    b.dataset.look = item.id;
    const ground = item.ground || (isDark(v.muriel_theme_accent) ? '#f4f1fb' : '#120c1f');
    b.innerHTML = `<span class="nf-look-art${item.id === 'album' ? ' nf-look-album' : ''}" style="background:${item.id === 'album' ? 'linear-gradient(135deg,#ff8fa3,#7a5cff 60%,#1f6f8b)' : ground}"></span><span class="nf-look-name"></span>`;
    b.querySelector('.nf-look-art').innerHTML = barsSvg(item.id === 'album' ? '#fff' : v.muriel_theme_accent, item.id === 'album' ? '#000000' : ground);
    b.querySelector('.nf-look-name').textContent = item.name;
    if (same(snapshot(), v)) b.classList.add('active');
    b.setAttribute('aria-pressed', String(b.classList.contains('active')));
    b.addEventListener('click', () => {
      if (isSaved && editing) return;
      applyLook(v, item.name);
    });
    if (isSaved) {
      const del = document.createElement('span');
      del.className = 'nf-look-del';
      del.setAttribute('role', 'button');
      del.setAttribute('aria-label', `Delete ${item.name}`);
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const before = saved();
        write(SAVED, JSON.stringify(before.filter((x) => x.id !== item.id)));
        if (!saved().length) editing = false;
        renderAll();
        if (window.NocturneSnack) window.NocturneSnack(`${item.name} deleted`, () => { write(SAVED, JSON.stringify(before)); renderAll(); });
      });
      b.appendChild(del);
    }
    return b;
  }
  function renderLooks() {
    if (!looksEl) return;
    const row = looksEl.querySelector('.nf-looks');
    row.textContent = '';
    const mine = saved();
    mine.forEach((m) => row.appendChild(tile({ ...m, ground: m.ground }, true)));
    LOOKS.forEach((l) => row.appendChild(tile(l, false)));
    looksEl.classList.toggle('nf-editing', editing);
    const edit = looksEl.querySelector('.nf-looks-edit');
    edit.hidden = !mine.length;
    edit.textContent = editing ? 'Done' : 'Edit';
  }
  function renderNp() { npChoices.forEach((fn) => fn()); }
  function renderAll() { renderLooks(); renderNp(); renderPreview(); toggleLine(); }

  // surface colours carry the interface's transparency; what sits over scrolling content needs them solid
  function solidColor() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface').trim();
    const probe = document.createElement('div');
    probe.style.color = v;
    document.body.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/[\d.]+/g);
    const c = getComputedStyle(probe).color;
    probe.remove();
    if (!m) return;
    const parts = /^color\(srgb/.test(c) ? m.slice(0, 3).map((x) => Math.round(Number(x) * 255)) : m.slice(0, 3).map(Number);
    document.documentElement.style.setProperty('--nf-solid', `rgb(${parts.join(',')})`);
  }
  // Line means a clean line: the app's wavy one is drawn for bigger screens
  function straightLine() {
    const r = row('Wavy progress bar');
    const sw = r && r.querySelector('.effect-switch-btn');
    if (sw && sw.classList.contains('active')) sw.click();
  }

  function saveLook(name) {
    const clean = name.trim().slice(0, 24);
    if (!clean) return false;
    const list = saved();
    const values = snapshot();
    const accent = values.muriel_theme_accent || '#b69df8';
    const ground = values.muriel_theme_mode === 'light' ? '#f4f1fb' : '#120c1f';
    const old = list.find((l) => l.name.toLowerCase() === clean.toLowerCase());
    const entry = { id: old ? old.id : `saved_${Date.now().toString(36)}`, name: clean, ground, values: { ...values, muriel_theme_accent: accent } };
    if (old) list[list.indexOf(old)] = entry; else list.unshift(entry);
    write(SAVED, JSON.stringify(list.slice(0, 12)));
    renderAll();
    return true;
  }

  // a row of choices in the app's own style
  function choiceRow(title, hint, name, options, onPick) {
    const item = document.createElement('div');
    item.className = 'setting-item';
    item.id = `setting-np-${name}`;
    item.innerHTML = `<div class="nf-setting-head"><span class="setting-name"></span>${hint ? '<span class="pfx-hint"></span>' : ''}</div><div class="tempo-preset-chips"></div>`;
    item.querySelector('.setting-name').textContent = title;
    if (hint) item.querySelector('.pfx-hint').textContent = hint;
    const row = item.querySelector('.tempo-preset-chips');
    options.forEach(([value, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn tempo-preset-chip';
      b.dataset.value = value;
      b.textContent = label;
      b.addEventListener('click', () => {
        write(NP[name].key, value);
        applyNp();
        if (name === 'seek' && value === 'line') straightLine();
        renderAll();
        if (onPick) onPick(value);
      });
      row.appendChild(b);
    });
    npChoices.push(() => {
      const now = npValue(name);
      row.querySelectorAll('button').forEach((b) => { const on = b.dataset.value === now; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    });
    return item;
  }

  // ---- live preview ----
  let previewEl = null;
  function renderPreview() {
    if (!previewEl) return;
    const core = window.MurielCore;
    const song = core && core.state && core.state.currentTrack;
    previewEl.querySelector('.nf-pv-title').textContent = song ? song.title : 'Song title';
    previewEl.querySelector('.nf-pv-artist').textContent = song ? song.artist : 'Artist';
    const cover = document.getElementById('right-panel-cover');
    const src = cover && cover.getAttribute('src');
    const art = previewEl.querySelector('.nf-pv-art');
    art.style.backgroundImage = src && song ? `url("${src.replace(/"/g, '%22')}")` : '';
    art.classList.toggle('has-art', !!(src && song));
  }

  function row(name) {
    return [...document.querySelectorAll('#view-settings .setting-item')].find((i) => { const n = i.querySelector('.setting-name'); return n && n.textContent.trim() === name; });
  }
  function group(title, id) {
    const head = document.createElement('div');
    head.className = 'settings-group-title';
    head.id = `nf-group-${id}`;
    head.textContent = title;
    const body = document.createElement('div');
    body.className = 'm3-group';
    body.dataset.group = `nf-${id}`;
    return { head, body };
  }
  function toggleLine() {
    const line = npValue('seek') === 'line';
    ['Wavy progress bar', 'Progress bar knob', 'Progress bar background'].forEach((n) => { const r = row(n); if (r) r.classList.toggle('nf-off', !line); });
    const sync = window.syncSettingsGroupTitles;
    if (sync) sync();
  }

  function build() {
    const section = document.querySelector('#view-settings .settings-section[data-cat="theme"]');
    if (!section) return;
    const colorsHead = [...section.querySelectorAll('.settings-group-title')].find((t) => t.textContent.trim() === 'Colors');
    if (!colorsHead) return;

    // settings with nothing to change on a phone
    ['UI scale', 'No-Hand cursor', 'Position of searchbar', 'Show wave visualizer in bottom bar', 'Visualizer in full karaoke mode', 'Visualizer with lyrics',
      'Visualizer opacity', 'Visualizer smoothness', 'Visualizer sensitivity', 'Blur effects', 'Glass blur', 'Glass blur strength',
      'Hide top titlebar', 'Playbar visualizer position', 'Playbar visualizer opacity', 'Connected liquid visualizer', 'Shaped cover in the bottom bar', 'Battery saver'].forEach((n) => { const r = row(n); if (r) r.classList.add('gs-retired', 'nf-retired'); });

    // ---- preview and jumps: stay in view while scrolling ----
    const top = document.createElement('div');
    top.className = 'nf-appearance-top';
    top.innerHTML = `<div class="nf-preview" aria-hidden="true"><div class="nf-pv-art"></div><div class="nf-pv-text"><div class="nf-pv-title"></div><div class="nf-pv-artist"></div><div class="nf-pv-wave">${Array.from({ length: 34 }, (_, i) => `<i class="${i < 13 ? 'on' : ''}" style="height:${28 + Math.round(68 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)))}%"></i>`).join('')}</div></div><div class="nf-pv-play"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div></div><div class="pfx-jump nf-jump"></div>`;
    previewEl = top.querySelector('.nf-preview');
    section.insertBefore(top, section.firstChild);

    // ---- looks ----
    const L = group('Looks', 'looks');
    looksEl = document.createElement('div');
    looksEl.className = 'setting-item nf-looks-card';
    looksEl.innerHTML = '<div class="nf-looks"></div><div class="nf-look-save"><input type="text" class="tempo-preset-name" id="nf-look-name" maxlength="24" placeholder="Name this look"><button type="button" class="chip-btn" id="nf-look-save">Save look</button><button type="button" class="chip-btn nf-looks-edit" hidden>Edit</button></div>';
    L.body.appendChild(looksEl);
    section.insertBefore(L.head, colorsHead);
    section.insertBefore(L.body, colorsHead);
    const nameInput = looksEl.querySelector('#nf-look-name');
    looksEl.querySelector('#nf-look-save').addEventListener('click', () => {
      if (saveLook(nameInput.value)) { nameInput.value = ''; nameInput.blur(); }
      else nameInput.focus();
    });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); looksEl.querySelector('#nf-look-save').click(); } });
    looksEl.querySelector('.nf-looks-edit').addEventListener('click', () => { editing = !editing; renderLooks(); });
    colorsHead.textContent = 'Colours';

    // ---- Now Playing ----
    const P = group('Now Playing', 'np');
    P.body.appendChild(choiceRow('Artwork', '', 'art', [['rounded', 'Rounded'], ['square', 'Square'], ['circle', 'Circle'], ['vinyl', 'Vinyl']]));
    P.body.appendChild(choiceRow('Background', '', 'bg', [['glow', 'Soft glow'], ['cover', 'Album art'], ['plain', 'Plain']]));
    P.body.appendChild(choiceRow('Seek bar', '', 'seek', [['wave', 'Waveform'], ['sine', 'Sine wave'], ['line', 'Line']]));
    P.body.appendChild(choiceRow('Waveform style', '', 'wave', [['bars', 'Bars'], ['smooth', 'Smooth'], ['thin', 'Thin']]));
    ['Wavy progress bar', 'Progress bar knob', 'Progress bar background'].forEach((n) => { const r = row(n); if (r) P.body.appendChild(r); });
    P.body.appendChild(choiceRow('Song title', '', 'align', [['left', 'Left'], ['center', 'Centre']]));
    P.body.appendChild(choiceRow('Double-tap the artwork', '', 'tap', [['like', 'Like'], ['play', 'Play or pause'], ['off', 'Nothing']]));
    P.body.appendChild(choiceRow('Visualizer', 'Bars that move to the song. It reads the song ahead of time, so the sound is never touched.', 'viz', [['np', 'Now Playing'], ['both', 'Mini player too'], ['off', 'Off']]));
    P.body.appendChild(choiceRow('Visualizer look', '', 'vizLook', [['solid', 'Solid'], ['blocks', 'Blocks'], ['thin', 'Thin']]));
    P.body.appendChild(choiceRow('Artwork opens Now Playing', 'It moves from the mini player into the full screen and back.', 'fly', [['on', 'On'], ['off', 'Off']]));
    P.body.appendChild(choiceRow('Lyric line in the mini player', 'Shows the line being sung under the song title.', 'lyric', [['on', 'On'], ['off', 'Off']]));

    // ---- text and shape, from what was under Interface ----
    const T = group('Text and shape', 'text');
    ['Interface font', 'Font scale', 'Corner radius', 'Icon style'].forEach((n) => { const r = row(n); if (r) T.body.appendChild(r); });

    const transparencyHead = [...section.querySelectorAll('.settings-group-title')].find((t) => t.textContent.trim() === 'Transparency');
    const backgroundHead = [...section.querySelectorAll('.settings-group-title')].find((t) => t.textContent.trim() === 'Background');
    const anchor = transparencyHead || backgroundHead;
    section.insertBefore(P.head, anchor);
    section.insertBefore(P.body, anchor);
    section.insertBefore(T.head, anchor);
    section.insertBefore(T.body, anchor);
    // Background reads best straight after these, transparency after that
    if (backgroundHead && transparencyHead) {
      const bgBody = backgroundHead.nextElementSibling;
      section.insertBefore(backgroundHead, transparencyHead);
      section.insertBefore(bgBody, transparencyHead);
    }

    // ---- reset ----
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'chip-btn nf-appearance-reset';
    reset.id = 'nf-appearance-reset';
    reset.textContent = 'Reset appearance';
    reset.addEventListener('click', () => applyLook(LOOKS[0].values, 'Default look'));
    section.appendChild(reset);

    // ---- jumps ----
    const jump = top.querySelector('.nf-jump');
    const targets = [['Looks', L.head], ['Colours', colorsHead], ['Now Playing', P.head], ['Text', T.head], ['Background', backgroundHead || anchor]];
    const scroller = () => { let n = section.parentElement; while (n && n !== document.body) { const c = getComputedStyle(n).overflowY; if ((c === 'auto' || c === 'scroll') && n.scrollHeight > n.clientHeight) return n; n = n.parentElement; } return document.scrollingElement; };
    const buttons = targets.map(([label, el]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        const s = scroller();
        const y = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop - top.offsetHeight - 6;
        s.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      });
      jump.appendChild(b);
      return { b, el };
    });
    const syncJump = () => {
      if (section.classList.contains('cat-hidden')) return;
      const line = top.getBoundingClientRect().bottom + 14;
      let on = buttons[0];
      buttons.forEach((x) => { if (x.el.getBoundingClientRect().top <= line) on = x; });
      buttons.forEach((x) => {
        const active = x === on;
        if (x.b.classList.contains('active') !== active) {
          x.b.classList.toggle('active', active);
          if (active && jump.scrollWidth > jump.clientWidth) jump.scrollTo({ left: x.b.offsetLeft - 16, behavior: 'smooth' });
        }
      });
    };
    document.addEventListener('scroll', syncJump, { passive: true, capture: true });
    syncJump();

    // ---- the top of Settings stays out of the way once inside a page ----
    window.addEventListener('muriel:fx', renderPreview);
    window.addEventListener('nocturne:look', renderPreview);
    const cover = document.getElementById('right-panel-cover');
    if (cover) new MutationObserver(() => { renderPreview(); backdrop(); }).observe(cover, { attributes: true, attributeFilter: ['src'] });
    // follows every colour change, however it was made
    let colorTimer = 0;
    new MutationObserver(() => { clearTimeout(colorTimer); colorTimer = setTimeout(() => { solidColor(); renderLooks(); }, 60); }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    solidColor();
    renderAll();
    if (window.syncSettingsGroupTitles) window.syncSettingsGroupTitles();
  }

  // the album-art background of Now Playing
  let drop = null;
  function backdrop() {
    if (!drop) return;
    const cover = document.getElementById('right-panel-cover');
    const src = cover && cover.getAttribute('src');
    const song = window.MurielCore && window.MurielCore.state && window.MurielCore.state.currentTrack;
    drop.style.backgroundImage = src && song ? `url("${src.replace(/"/g, '%22')}")` : '';
    drop.classList.toggle('has-art', !!(src && song));
  }

  function start() {
    applyNp();
    const panel = document.getElementById('right-panel');
    if (panel) {
      drop = document.createElement('div');
      drop.className = 'nf-np-backdrop';
      panel.prepend(drop);
    }
    build();
    backdrop();
    window.NocturneLooks = { LOOKS, saved, saveLook, applyLook, snapshot, tapAction: () => npValue('tap') };
  }

  if (window.MurielCore) start(); else window.addEventListener('muriel:ready', start, { once: true });
})();
