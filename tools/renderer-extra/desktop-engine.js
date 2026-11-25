// The PC version plays through Sine's own sound engine (phone-fx.js), like the iPhone: the song is processed into
// a finished file and played as it is, so the original desktop engine must not route the player through Web Audio
// as well (everything would be applied twice). It keeps speed and pitch, which are the player's own settings.
(() => {
  const Engine = window.MurielAudioEngine;
  if (!Engine) return;
  Engine.prototype.init = function (audioElement) { this.__element = audioElement || this.__element; };
  Engine.prototype._applyMasterVolume = function () {
    const el = this.__element;
    if (!el) return;
    el.muted = !!this.isMuted;
    el.volume = Math.max(0, Math.min(1, Number(this.volume) || 0));
  };
})();

// Speed and pitch reach the player at most ten times a second. Dragging a slider sends an input event every frame,
// and setting the player's rate and pitch mode that often while it plays could crash the page in Chromium.
(() => {
  const Engine = window.MurielAudioEngine;
  if (!Engine || !Engine.prototype.applySettings) return;
  const apply = Engine.prototype.applySettings;
  const GAP = 100;
  Engine.prototype.applySettings = function (audioElement) {
    apply.call(this, null);
    if (!audioElement) return;
    this.__rateEl = audioElement;
    if (this.__rateTimer) return;
    const run = () => {
      this.__rateTimer = null;
      const el = this.__rateEl;
      if (!el) return;
      const { rate, preservePitch } = this.playbackFor();
      if (el.preservesPitch !== preservePitch) { el.preservesPitch = preservePitch; el.webkitPreservesPitch = preservePitch; }
      if (el.defaultPlaybackRate !== rate) el.defaultPlaybackRate = rate;
      if (Math.abs((el.playbackRate || 1) - rate) > 1e-4) el.playbackRate = rate;
      this.__rateAt = performance.now();
    };
    const since = performance.now() - (this.__rateAt || 0);
    if (since >= GAP) run(); else this.__rateTimer = setTimeout(run, GAP - since);
  };
})();
