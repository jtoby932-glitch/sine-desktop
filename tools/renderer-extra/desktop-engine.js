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
