// The PC version's own bits, loaded before everything else: the error log Settings can share (the iPhone app's
// comes from its bridge), and a class for the desktop layout's styles.
(function () {
  'use strict';
  document.documentElement.classList.add('is-desktop');
  const api = window.electronAPI;
  if (api && api.isWindows) document.documentElement.classList.add('is-windows');

  // ---- error log: the last 300 warnings and errors, kept across restarts ----
  const LOG_KEY = 'muriel_debug_log';
  let lines = [];
  try { lines = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) {}
  let saveTimer = null;
  function add(level, msg) {
    lines.push(`${new Date().toISOString()} ${String(level).toUpperCase()} ${String(msg).slice(0, 500)}`);
    if (lines.length > 300) lines.splice(0, lines.length - 300);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(LOG_KEY, JSON.stringify(lines)); } catch (e) {} }, 500);
    if (level === 'error' && api && api.logError) { try { api.logError(msg); } catch (e) {} }
  }
  // Chromium's ResizeObserver note is harmless (a layout settled a frame later) and isn't worth a log line
  const harmless = (m) => /ResizeObserver loop/.test(String(m));
  for (const level of ['warn', 'error']) {
    const orig = console[level].bind(console);
    const str = (a) => { if (a && a.stack) return a.stack; if (typeof a !== 'object') return String(a); try { return JSON.stringify(a); } catch (e) { return String(a); } };
    console[level] = (...args) => { const m = args.map(str).join(' '); if (!harmless(m)) add(level, m); orig(...args); };
  }
  window.addEventListener('error', (e) => { if (!harmless(e.message)) add('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`); });
  window.addEventListener('unhandledrejection', (e) => add('error', `unhandled: ${(e.reason && (e.reason.stack || e.reason.message)) || e.reason}`));
  window.MurielLog = {
    add,
    text: () => [`Sine for PC ${navigator.userAgent}`, ...lines].join('\n'),
    clear: () => { lines = []; try { localStorage.removeItem(LOG_KEY); } catch (e) {} },
  };
  // the song cache is kept in check by the PC's server itself
  window.MurielCache = { enforceLimit: () => {} };

  // Sine's sound engine (phone-fx.js) works on songs from the in-app server and keeps note of which one each player
  // has (on iPhone the bridge does that): a player's address on the server is remembered as __murielSrc
  const LOCAL = /^http:\/\/127\.0\.0\.1:\d+\//;
  const srcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    configurable: true,
    enumerable: srcDesc.enumerable,
    get() { return srcDesc.get.call(this); },
    set(value) {
      const v = String(value);
      this.__murielSrc = LOCAL.test(v) ? v : undefined;
      srcDesc.set.call(this, v);
    },
  });
  // the real localStorage: profiles-core.js later puts a stand-in in front of it, and its writes reach the
  // Storage.prototype patches below with this one as `this`
  let realStorage = null;
  try { realStorage = window.localStorage; } catch (e) {}
  const isLocal = (s) => s === realStorage || s === window.localStorage;

  // ---- secrets (your Spotify developer keys): kept by the PC's encrypted store, which the server reads too ----
  // (on the iPhone the page and the server share one store; here they are two processes)
  if (api && api.vaultRead) {
    globalThis.__murielVault = (name) => ({
      read() {
        const r = api.vaultRead(name);
        if (!r || !r.ok) { const e = new Error('nothing saved'); e.code = 'ENOENT'; throw e; }
        return r.value;
      },
      write(value) { api.vaultWrite(name, value); },
    });
    // Settings forgets keys by removing their old iPhone storage key
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      const m = /^muriel_secret_([a-z0-9_]+)$/i.exec(String(key));
      if (m && isLocal(this)) { try { api.vaultWrite(m[1], null); } catch (e) {} }
      return removeItem.call(this, key);
    };
  }

  // ---- muriel:// links (the Spotify login coming back, shared playlists, sync and listen-along codes) ----
  if (api && api.onDeepLink) {
    const open = (link) => { if (link) window.dispatchEvent(new CustomEvent('muriel:deeplink', { detail: String(link) })); };
    api.onDeepLink(open);
    // a link Sine was opened with: once the page's own listeners are there
    window.addEventListener('load', () => setTimeout(() => { api.pageReady().then(open).catch(() => {}); }, 1500));
  }

  // ---- streaming quality: the downloader is in the main process, so it's told the choice ----
  if (api && api.setQuality) {
    const tell = () => { try { api.setQuality(localStorage.getItem('nocturne_quality') || 'veryhigh'); } catch (e) {} };
    window.addEventListener('load', tell);
    // (another profile's keys reach here as muriel_p:<id>:nocturne_quality: profiles-core.js wraps this later)
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const r = setItem.call(this, key, value);
      if (/(^|:)nocturne_quality$/.test(String(key)) && isLocal(this)) setTimeout(tell, 0);
      return r;
    };
  }

  // ---- output device: every player follows it ----
  // Settings → Tracks → Output device sets it on the main player; Sine's sound engine plays effects through players
  // and an audio context of its own, which follow it here.
  let sinkId = null;
  const players = new Set();
  const contexts = new Set();
  const nativeSetSink = HTMLMediaElement.prototype.setSinkId;
  const follow = (el) => { if (sinkId !== null && el.sinkId !== sinkId) nativeSetSink.call(el, sinkId).catch(() => {}); };
  if (nativeSetSink) {
    HTMLMediaElement.prototype.setSinkId = function (id) {
      sinkId = String(id || '');
      for (const p of players) { if (p !== this) follow(p); }
      for (const c of contexts) { if (typeof c.setSinkId === 'function' && c.state !== 'closed') c.setSinkId(sinkId).catch(() => {}); }
      return nativeSetSink.call(this, id);
    };
    const NativeAudio = window.Audio;
    const Audio = function (src) {
      const a = src === undefined ? new NativeAudio() : new NativeAudio(src);
      players.add(a);
      follow(a);
      a.addEventListener('emptied', () => { if (!a.src) players.delete(a); });
      return a;
    };
    Audio.prototype = NativeAudio.prototype;
    window.Audio = Audio;
    const NativeContext = window.AudioContext;
    if (NativeContext) {
      window.AudioContext = class extends NativeContext {
        constructor(...args) {
          super(...args);
          contexts.add(this);
          if (sinkId !== null && typeof this.setSinkId === 'function') this.setSinkId(sinkId).catch(() => {});
          this.addEventListener('statechange', () => { if (this.state === 'closed') contexts.delete(this); });
        }
      };
    }
  }

  const removeAttr = Element.prototype.removeAttribute;
  Element.prototype.removeAttribute = function (name) {
    if (this instanceof HTMLMediaElement && String(name).toLowerCase() === 'src') this.__murielSrc = undefined;
    return removeAttr.call(this, name);
  };

  // ---- sliders in the Audio panel: a fast drag reaches the sound engine at most ~12 times a second ----
  // A mouse drag sends an input event every frame; each one used to re-run the whole chain (app settings, Sine's
  // sound engine, saving, redrawing the panel), and sliding fast while a song played could crash Sine. The slider
  // itself still follows the mouse; the sound gets the latest position, and the final one as soon as you let go.
  const SLIDER_GAP = 80;
  const held = new Map(); // slider → { timer, at }
  const pass = new WeakSet();
  const send = (el) => {
    const h = held.get(el);
    if (h) { clearTimeout(h.timer); h.timer = null; h.at = performance.now(); }
    const ev = new Event('input', { bubbles: true });
    pass.add(ev);
    el.dispatchEvent(ev);
  };
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (pass.has(e) || !(el instanceof HTMLInputElement) || el.type !== 'range' || !el.closest('#audio-settings-modal, .audio-menu-card')) return;
    let h = held.get(el);
    if (!h) { h = { timer: null, at: 0 }; held.set(el, h); }
    const since = performance.now() - h.at;
    if (since >= SLIDER_GAP && !h.timer) { h.at = performance.now(); return; } // goes straight through
    e.stopImmediatePropagation();
    if (!h.timer) h.timer = setTimeout(() => send(el), Math.max(0, SLIDER_GAP - since));
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    const h = el && held.get(el);
    if (h && h.timer) send(el); // let go: the final position now, before the change itself
  }, true);

  // ---- Sine's player-bar visualizer: behind the right-hand controls, clear of the progress bar ----
  document.addEventListener('DOMContentLoaded', () => {
    const move = () => {
      const c = document.getElementById('nf-cava-mini');
      const right = document.querySelector('.playbar-right');
      if (c && right && c.parentElement !== right) right.insertBefore(c, right.firstChild);
      return !!(c && right);
    };
    if (move()) return;
    const mo = new MutationObserver(() => { if (move()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
  });

  // ---- the player bar's "more" button: edit, download and share when there's no room for all three ----
  // (desktop.css shows it instead of them when the left side of the bar is narrow)
  document.addEventListener('DOMContentLoaded', () => {
    const share = document.getElementById('btn-playbar-share');
    if (!share) return;
    const more = document.createElement('button');
    more.className = 'btn-icon-pill';
    more.id = 'btn-playbar-overflow';
    more.type = 'button';
    more.title = 'More';
    more.setAttribute('aria-label', 'More');
    more.setAttribute('aria-haspopup', 'menu');
    more.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>';
    share.after(more);
    let menu = null;
    const close = () => { if (menu) { menu.remove(); menu = null; } };
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu) { close(); return; }
      const items = [['btn-edit-current-track', 'Edit title and artist'], ['btn-playbar-more', 'Download…'], ['btn-playbar-share', 'Share']]
        .map(([id, label]) => [document.getElementById(id), label])
        .filter(([b]) => b && !b.disabled && b.style.display !== 'none' && !b.hidden);
      if (!items.length) return;
      menu = document.createElement('div');
      menu.className = 'track-context-menu';
      menu.setAttribute('role', 'menu');
      const T = (window.MurielI18n && window.MurielI18n.T) || ((s) => s);
      for (const [b, label] of items) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'track-context-item';
        item.setAttribute('role', 'menuitem');
        item.textContent = T(label);
        item.addEventListener('click', (ev) => { ev.stopPropagation(); close(); b.click(); });
        menu.appendChild(item);
      }
      document.body.appendChild(menu);
      const r = more.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - m.width - 8))}px`;
      menu.style.top = `${Math.max(8, r.top - m.height - 8)}px`;
      const first = menu.querySelector('button');
      if (first) first.focus({ preventScroll: true });
    });
    document.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
  });
})();
