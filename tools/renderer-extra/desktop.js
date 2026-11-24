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
  const removeAttr = Element.prototype.removeAttribute;
  Element.prototype.removeAttribute = function (name) {
    if (this instanceof HTMLMediaElement && String(name).toLowerCase() === 'src') this.__murielSrc = undefined;
    return removeAttr.call(this, name);
  };
})();
