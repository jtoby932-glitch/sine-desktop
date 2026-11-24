// Riff's equalizer, sound presets and effects, plus an upscaler, for the iPhone app (Audio -> Speed & Pitch).
// The equalizer's filters, the distortion, echo and reverb, and the six built-in sound presets are Riff's own
// (Riff 42.3 by rootscripts, MIT licence). Riff plays them live; here the same sound is rendered, for the reason below.
//
// Why songs are rendered instead of played through a live Web Audio graph: iOS suspends Web Audio when the screen
// locks or the app is in the background (see mobile-ui.js), but keeps a plain <audio> element playing. So this
// reads the song's cached file, runs it through an OfflineAudioContext, and hands the finished audio to the same
// plain <audio> element. Lock screen controls, background playback, speed and pitch all keep working as before.
// With everything off nothing here touches playback. If a song can't be processed, its original file plays.
(function () {
  'use strict';

  const SAMPLE_RATE = 44100;
  const MAX_SECONDS = 10 * 60;          // a longer song needs too much memory on a phone: it plays unprocessed
  const MAX_FILE_BYTES = 80 * 1024 * 1024;
  // a song never waits longer than this before its original file plays
  const TIMEOUT_MS = 30000;
  const TIMEOUT_HIDDEN_MS = 20000;
  const STORE_KEY = 'muriel_phone_fx2'; // a new name: the first version's weaker presets aren't carried over

  // Riff's 10-band equalizer: peaking filters at these frequencies, Q 1.1, on top of its Low / Mid / High
  const EQ_BANDS = [
    { f: 32, label: '32' }, { f: 64, label: '64' }, { f: 125, label: '125' }, { f: 250, label: '250' }, { f: 500, label: '500' },
    { f: 1000, label: '1k' }, { f: 2000, label: '2k' }, { f: 4000, label: '4k' }, { f: 8000, label: '8k' }, { f: 16000, label: '16k' },
  ];

  // Riff has no presets for the equalizer alone: these fill that gap. Its sound presets are the app's own chips.
  const EQ_PRESETS = [
    { id: 'flat', name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'bass', name: 'Bass Boost', gains: [8, 8, 7, 5, 2, 0, 0, 0, 0, 0] },
    { id: 'vocal', name: 'Vocal Clarity', gains: [-3, -3, -3, -2, -1, 1, 4, 6, 3, 1] },
    { id: 'treble', name: 'Treble Boost', gains: [0, 0, 0, 0, 0, 0, 2, 5, 7, 8] },
    { id: 'loudness', name: 'Loudness', gains: [6, 6, 4, 1, -1, -2, 0, 3, 5, 6] },
    { id: 'hiphop', name: 'Hip-Hop', gains: [7, 7, 6, 3, 0, -1, 0, 2, 2, 3] },
    { id: 'electronic', name: 'Electronic', gains: [7, 7, 5, 1, -2, -3, 0, 3, 5, 6] },
    { id: 'rock', name: 'Rock', gains: [5, 5, 4, 0, -2, -3, 2, 4, 5, 4] },
    { id: 'pop', name: 'Pop', gains: [-2, -1, 2, 4, 4, 3, 0, -1, 2, 3] },
    { id: 'acoustic', name: 'Acoustic', gains: [3, 3, 3, 2, 2, 1, 3, 3, 3, 2] },
    { id: 'night', name: 'Late Night', gains: [-5, -4, -2, 1, 3, 3, 3, -1, -4, -6] },
  ];

  // Riff's three upscaler engines, exactly as Riff builds them (riff: true, see buildGraph), with its Vocal, Air and
  // Bass controls. Then three of Sine's own, whose amounts run from 0 to 1 at full strength.
  const UP_PROFILES = [
    { id: 'hqmusic-3', name: 'hqmusic-3', desc: 'Harmonic Restorer', riff: true, sat: 0.5, baseAir: 0, baseBass: 0, ratio: 1.5 },
    { id: 'glyphs-7B', name: 'glyphs-7B', desc: 'High-End Upscaler', riff: true, sat: 0.2, baseAir: 2.5, baseBass: 0, ratio: 1.5 },
    { id: 'fyro1.1', name: 'fyro1.1', desc: 'Dynamic Depth', riff: true, sat: 0.2, baseAir: 0, baseBass: 3, ratio: 2 },
    { id: 'hifi', name: 'Hi-Fi Restore', desc: 'Rebuilds cut highs', strength: 80, air: 1, presence: 0.15, warm: 0, bass: 0, width: 0.1 },
    { id: 'analog', name: 'Warm Analog', desc: 'Tape-style warmth', strength: 70, air: 0, presence: 0, warm: 1, bass: 0.25, width: 0 },
    { id: 'wide', name: 'Wide Stage', desc: 'Bigger stereo', strength: 70, air: 0.3, presence: 0, warm: 0, bass: 0, width: 1 },
    // Moods: a whole sound rather than a repair. shape: [filter, frequency, Q, gain in dB]; comp: evens out the level;
    // room: how much reverb, with the bass kept out of it; trim: dB, so a mood isn't simply louder than the song.
    { id: 'afterhours', mood: true, name: 'Afterhours', desc: 'Soft and warm, for low volume', strength: 100, warm: 0.4,
      shape: [['highshelf', 6000, null, -5], ['highshelf', 11000, null, -3], ['peaking', 350, 0.8, 2], ['lowshelf', 70, null, -1.5]],
      comp: { threshold: -28, ratio: 2.2, attack: 0.02, release: 0.25 }, trim: -1.5 },
    { id: 'blackout', mood: true, name: 'Blackout', desc: 'Deep bass, darker, clear vocals', strength: 100, bass: 0.7,
      shape: [['lowshelf', 65, null, 6], ['peaking', 110, 0.9, 2], ['peaking', 400, 1, -2.5], ['peaking', 3000, 1, 1.5], ['highshelf', 9000, null, -2]],
      comp: { threshold: -18, ratio: 2, attack: 0.015, release: 0.15 }, trim: -4.5 },
    { id: 'velvet', mood: true, name: 'Velvet', desc: 'Smooth, tames harsh songs', strength: 100, warm: 0.6,
      shape: [['peaking', 6500, 1.6, -5], ['peaking', 3200, 1.2, -2.5], ['highshelf', 11000, null, -2.5], ['peaking', 250, 1, 1]], trim: -1 },
    { id: 'frontrow', mood: true, name: 'Front Row', desc: 'Forward vocals, punchy drums', strength: 100, presence: 0.4,
      shape: [['peaking', 3000, 0.9, 3.5], ['peaking', 120, 1, 2.5], ['peaking', 400, 1, -2], ['highshelf', 10000, null, 1.5]],
      comp: { threshold: -20, ratio: 3, attack: 0.02, release: 0.12 }, room: 0.1, roomSeconds: 0.9, trim: -3 },
    { id: 'cassette', mood: true, name: 'Cassette', desc: 'Old tape, soft highs', strength: 100, warm: 1, width: -0.4,
      shape: [['highpass', 60, 0.7, null], ['highshelf', 7000, null, -8], ['peaking', 900, 0.7, 1.5]], trim: -2 },
    { id: 'neon', mood: true, name: 'Neon', desc: 'Crisp, tight and wide', strength: 100, air: 0.4, width: 0.7,
      shape: [['highshelf', 9000, null, 4], ['peaking', 4500, 1, 1.5], ['lowshelf', 80, null, 3], ['peaking', 250, 1, -2]],
      comp: { threshold: -18, ratio: 2, attack: 0.015, release: 0.12 }, trim: -2.5 },
    { id: 'cathedral', mood: true, name: 'Cathedral', desc: 'Huge reverb, clean bass', strength: 100, width: 0.3,
      shape: [['peaking', 300, 1, -1.5], ['highshelf', 8000, null, 1]], room: 0.6, roomSeconds: 3.2, roomCut: 240, trim: -2 },
    { id: 'pocket', mood: true, name: 'Pocket', desc: 'Made for phone speakers', strength: 100, bass: 1,
      shape: [['highpass', 70, 0.7, null], ['peaking', 1000, 0.7, 2], ['peaking', 2500, 1, 2]],
      comp: { threshold: -22, ratio: 3, attack: 0.012, release: 0.15 }, trim: -1.5 },
    { id: 'longhaul', mood: true, name: 'Long Haul', desc: 'Even and easy, for hours', strength: 100,
      shape: [['peaking', 3200, 1.2, -2.5], ['peaking', 6800, 1.2, -1.5], ['highshelf', 9000, null, -2]],
      comp: { threshold: -24, ratio: 2.5, attack: 0.03, release: 0.3 }, trim: -1 },
  ];
  const RIFF_TUNES = ['vocal', 'air', 'bass'];

  const FX_KEYS = ['distortion', 'echo', 'reverb'];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---- settings ----

  // saved here: the upscaler and the equalizer's on/off. The equalizer's values, the effects and the presets are
  // the app's own audio settings, kept and saved by app.js as on desktop.
  function defaults() {
    const strengths = {};
    const tunes = {};
    UP_PROFILES.forEach((p) => {
      if (p.riff) tunes[p.id] = { vocal: 0, air: 0, bass: 0 };
      else strengths[p.id] = p.strength;
    });
    return { eqOn: true, upOn: false, profile: UP_PROFILES[0].id, strengths, tunes, level: false, levelTarget: 'normal', bassEnh: 0, autoEq: false };
  }

  function normalize(raw) {
    const base = defaults();
    if (!raw || typeof raw !== 'object') return base;
    if (raw.eqOn === false) base.eqOn = false;
    base.upOn = !!raw.upOn;
    base.level = !!raw.level;
    base.autoEq = !!raw.autoEq;
    if (UP_PROFILES.some((p) => p.id === raw.profile)) base.profile = raw.profile;
    if (raw.strengths && typeof raw.strengths === 'object') {
      UP_PROFILES.forEach((p) => {
        if (p.riff) return;
        const v = Number(raw.strengths[p.id]);
        if (Number.isFinite(v)) base.strengths[p.id] = clamp(Math.round(v), 0, 100);
      });
    }
    if (['quiet', 'normal', 'loud'].includes(raw.levelTarget)) base.levelTarget = raw.levelTarget;
    { const v = Number(raw.bassEnh); if (Number.isFinite(v)) base.bassEnh = clamp(Math.round(v), 0, 100); }
    if (raw.tunes && typeof raw.tunes === 'object') {
      UP_PROFILES.forEach((p) => {
        if (!p.riff || !raw.tunes[p.id]) return;
        RIFF_TUNES.forEach((k) => {
          const v = Number(raw.tunes[p.id][k]);
          if (Number.isFinite(v)) base.tunes[p.id][k] = clamp(Math.round(v), -50, 50);
        });
      });
    }
    return base;
  }

  const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const fine = (v) => Math.round(v * 100) / 100;

  // Auto EQ: what each kind of music gets. Set by hand, the equalizer always wins.
  const AUTO_EQ = {
    hiphop: 'hiphop', metal: 'rock', rock: 'rock', electronic: 'electronic', pop: 'pop', country: 'acoustic', folk: 'acoustic',
    latin: 'loudness', reggae: 'bass', jazz: 'acoustic', rnb: 'night',
  };
  function autoPreset(genre) {
    const fam = window.MurielAutoplay && genre ? window.MurielAutoplay.family(genre) : '';
    const id = AUTO_EQ[fam];
    return id ? EQ_PRESETS.find((p) => p.id === id) : null;
  }

  // everything one render needs, flat: the upscaler settings and the song's effective audio settings
  function compose(up, audioSettings, genre) {
    const a = audioSettings || {};
    const e = a.eq || {};
    const eqOn = up.eqOn !== false;
    let bands = EQ_BANDS.map((_, i) => fine(num(Array.isArray(a.eqBands) ? a.eqBands[i] : 0)));
    const eqValues = { low: fine(num(e.low)), mid: fine(num(e.mid)), high: fine(num(e.high)) };
    let autoFrom = '';
    if (up.autoEq && eqOn && bands.every((g) => g === 0) && !eqValues.low && !eqValues.mid && !eqValues.high) {
      const preset = autoPreset(genre);
      if (preset) { bands = preset.gains.slice(); autoFrom = preset.name; }
    }
    return {
      eqOn,
      upOn: up.upOn,
      profile: up.profile,
      strengths: up.strengths,
      tunes: up.tunes,
      level: !!up.level,
      levelTarget: up.levelTarget || 'normal',
      bassEnh: eqOn ? num(up.bassEnh) : 0,
      autoFrom,
      genre: genre || '',
      eq: eqValues,
      bands,
      fx: { distortion: fine(num(a.distortion)), echo: fine(num(a.echo)), reverb: fine(num(a.reverb)) },
      volume: fine(num(a.volume, 1)),
    };
  }

  const eqAudible = (s) => s.eqOn && (s.eq.low !== 0 || s.eq.mid !== 0 || s.eq.high !== 0 || s.bands.some((g) => g !== 0));
  const upAudible = (s) => {
    if (!s.upOn) return false;
    const p = UP_PROFILES.find((x) => x.id === s.profile);
    return !!p && (p.riff || s.strengths[s.profile] > 0);
  };
  const fxAudible = (s) => FX_KEYS.some((k) => s.fx[k] > 0);
  const isActive = (s) => eqAudible(s) || upAudible(s) || fxAudible(s) || s.bassEnh > 0 || s.volume !== 1 || !!s.level;

  // what makes one render different from another
  function signature(s) {
    return JSON.stringify([
      eqAudible(s) ? [s.eq, s.bands] : 0,
      upAudible(s) ? [s.profile, s.strengths[s.profile], s.tunes && s.tunes[s.profile]] : 0,
      FX_KEYS.map((k) => s.fx[k]),
      s.volume,
      s.level ? s.levelTarget || 'normal' : 0,
      s.bassEnh || 0,
    ]);
  }

  // ---- analysis: where the file's high frequencies stop ----

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang);
      const wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1;
        let ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k;
          const b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci;
          const xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
  }

  // The frequency above which the file holds next to nothing (lossy encoders cut there), as a smoothed average
  // over windows spread across the song. A quiet or very short song counts as full range.
  function detectCutoff(buffer) {
    const N = 4096;
    const FRAMES = 32;
    const FULL = 20000;
    if (buffer.length < N * 2) return FULL;
    const L = buffer.getChannelData(0);
    const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
    const power = new Float64Array(N / 2);
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    const step = Math.max(1, Math.floor((buffer.length - N) / FRAMES));
    for (let f = 0; f < FRAMES; f++) {
      const at = Math.min(buffer.length - N, f * step);
      for (let i = 0; i < N; i++) {
        re[i] = 0.5 * (L[at + i] + R[at + i]) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
        im[i] = 0;
      }
      fft(re, im);
      for (let i = 0; i < N / 2; i++) power[i] += re[i] * re[i] + im[i] * im[i];
    }
    const hz = buffer.sampleRate / N;
    const db = (from, to) => {
      let sum = 0;
      let count = 0;
      for (let i = Math.floor(from / hz); i < Math.min(N / 2, Math.ceil(to / hz)); i++) { sum += power[i]; count++; }
      return count && sum > 0 ? 10 * Math.log10(sum / count) : -300;
    };
    const reference = db(1000, 4000);
    if (reference <= -250) return FULL;
    // walk down from the top in third-of-a-kHz steps to the first band that still holds real signal
    for (let f = Math.min(FULL, buffer.sampleRate / 2 - 500); f > 6000; f -= 333) {
      if (db(f - 166, f + 166) > reference - 55) return Math.round(f);
    }
    return 6000;
  }

  // How loud a song feels, in decibels: the average of its 400 ms blocks, leaving out the quiet ones (the idea behind
  // LUFS, without its filters, which is plenty for bringing songs close to each other)
  function measureLoudness(buffer) {
    const L = buffer.getChannelData(0);
    const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
    const size = Math.floor(buffer.sampleRate * 0.4);
    const blocks = [];
    for (let at = 0; at + size <= L.length; at += size) {
      let e = 0;
      for (let i = at; i < at + size; i += 4) e += L[i] * L[i] + R[i] * R[i];
      blocks.push(e / (2 * Math.ceil(size / 4)));
    }
    if (!blocks.length) return -14;
    const mean = (list) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
    const floor = mean(blocks) * 0.1;
    const loud = blocks.filter((b) => b > floor && b > 1e-7);
    const m = mean(loud.length ? loud : blocks);
    return m > 0 ? 10 * Math.log10(m) : -60;
  }
  const LEVEL_TARGETS = { quiet: -20, normal: -16, loud: -12 };
  const levelGain = (loudness) => clamp((LEVEL_TARGETS[settings.levelTarget] || LEVEL_TARGETS.normal) - loudness, -10, 8);

  function wavePeaks(buffer, count) {
    const L = buffer.getChannelData(0);
    const size = Math.floor(L.length / count);
    const out = [];
    let max = 1e-6;
    for (let b = 0; b < count; b++) {
      let e = 0;
      const start = b * size;
      for (let i = start; i < start + size; i += 16) e += L[i] * L[i];
      const v = Math.sqrt(e / Math.max(1, size / 16));
      out.push(v);
      if (v > max) max = v;
    }
    return out.map((v) => Math.pow(v / max, 0.8));
  }

  // ---- the render ----

  function shaperCurve(fn, size = 4097) {
    const curve = new Float32Array(size);
    for (let i = 0; i < size; i++) curve[i] = fn((i * 2) / (size - 1) - 1);
    return curve;
  }
  // doubles every frequency it is fed, whatever the level: this is what writes new content above the cutoff
  const RECTIFIER = shaperCurve((x) => Math.abs(Math.tanh(1.4 * x)) / Math.tanh(1.4));
  // soft, slightly lopsided saturation, the even harmonics of tubes and tape
  const SATURATOR = shaperCurve((x) => {
    const y = x + 0.25 * x * x;
    return Math.tanh(1.6 * y) / Math.tanh(1.6 * 1.25);
  });

  const OUT_RANGE = 8; // handles peaks up to 8 times full scale: a +18 dB boost
  const OUT_KNEE = 0.9;
  const OUT_CEILING = 0.97; // under the file's own 0.98, so its limiter has nothing left to do
  let outCurve = null;
  function outputCurve() {
    if (outCurve) return outCurve;
    const size = 65537;
    const curve = new Float32Array(size);
    const room = OUT_CEILING - OUT_KNEE;
    for (let i = 0; i < size; i++) {
      const x = ((i / (size - 1)) * 2 - 1) * OUT_RANGE;
      const a = Math.abs(x);
      const y = a <= OUT_KNEE ? a : OUT_KNEE + room * Math.tanh((a - OUT_KNEE) / room);
      curve[i] = x < 0 ? -y : y;
    }
    outCurve = curve;
    return curve;
  }

  let bassShape = null;
  function bassCurve() {
    if (bassShape) return bassShape;
    const size = 4097;
    bassShape = new Float32Array(size);
    for (let i = 0; i < size; i++) { const x = (i / (size - 1)) * 2 - 1; bassShape[i] = Math.tanh(x * 3) / Math.tanh(3); }
    return bassShape;
  }

  // Riff's curves have an even number of points, so no point sits at zero: silence comes out as a small offset, and the
  // quietest sound bends around a kink beside it. The same shape with a point exactly at zero: nothing in, nothing out.
  function evenCurve(curve) {
    const n = curve.length;
    if (n % 2) return curve;
    const zero = (curve[n / 2 - 1] + curve[n / 2]) / 2; // where silence lands (input 0 is half way between these two points)
    const out = new Float32Array(n * 16 + 1);
    const mid = n * 8;
    for (let i = 0; i < out.length; i++) {
      const at = (i / (out.length - 1)) * (n - 1);
      const lo = Math.min(n - 2, Math.floor(at));
      const value = curve[lo] + (curve[lo + 1] - curve[lo]) * (at - lo);
      out[i] = i === mid ? 0 : value - zero;
    }
    return out;
  }
  // how open the distortion is at each level of the song: shut below about -58 dB, fully open from about -40 dB
  let gateCurve = null;
  function quietGate() {
    if (gateCurve) return gateCurve;
    const low = 10 ** (-58 / 20);
    const high = 10 ** (-40 / 20);
    gateCurve = shaperCurve((x) => {
      const t = Math.min(1, Math.max(0, (Math.abs(x) - low) / (high - low)));
      return t * t * (3 - 2 * t);
    }, 65537);
    return gateCurve;
  }

  // a room of that length, made once: a burst of noise dying away, smoothly and a little differently in each ear
  const rooms = new Map();
  function roomImpulse(ctx, seconds) {
    const key = `${ctx.sampleRate}:${seconds}`;
    if (rooms.has(key)) return rooms.get(key);
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const impulse = ctx.createBuffer(2, length, rate);
    let seed = 7;
    const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
    for (let c = 0; c < 2; c++) {
      const d = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        d[i] = noise() * Math.exp(-5.5 * t) * Math.min(1, (i / rate) / 0.01) * (1 - t * t);
      }
    }
    rooms.set(key, impulse);
    return impulse;
  }

  // music crosses zero all the time, so its average never quite reaches "open": anything near it counts as fully open,
  // which leaves the distortion exactly as it was whenever the song is playing at any normal level
  let gateFullCurve = null;
  function gateFull() {
    if (!gateFullCurve) gateFullCurve = shaperCurve((x) => Math.max(0, Math.min(1, x * 1.35)), 4097);
    return gateFullCurve;
  }

  function buildGraph(ctx, srcNode, buffer, s, cutoff) {
    const biquad = (type, f, q, gain) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = clamp(f, 10, ctx.sampleRate / 2 - 1);
      if (q != null) n.Q.value = q;
      if (gain != null) n.gain.value = gain;
      return n;
    };
    const gainNode = (g) => { const n = ctx.createGain(); n.gain.value = g; return n; };
    const chain = (...nodes) => { nodes.reduce((a, b) => { a.connect(b); return b; }); return nodes[nodes.length - 1]; };
    const shaper = (curve, over) => { const n = ctx.createWaveShaper(); n.curve = curve; n.oversample = over; return n; };

    let tail = srcNode;

    if (upAudible(s)) {
      const p = UP_PROFILES.find((x) => x.id === s.profile);
      if (p.riff) {
        // Riff's chain, value for value (audio-engine.js): gentle compression, three tone controls, a touch of
        // harmonics and a limiter, all in one line
        const t = (s.tunes && s.tunes[p.id]) || { vocal: 0, air: 0, bass: 0 };
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 10;
        comp.ratio.value = p.ratio;
        comp.attack.value = 0.01;
        comp.release.value = 0.1;
        const toneGain = (base, v) => clamp(base + v * 0.08, -4, 4);
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -1;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.005;
        limiter.release.value = 0.05;
        tail = chain(srcNode, comp,
          biquad('lowshelf', 80, null, toneGain(p.baseBass, t.bass)),
          biquad('peaking', 2500, 1.2, toneGain(0, t.vocal)),
          biquad('highshelf', 9000, null, toneGain(p.baseAir, t.air)),
          shaper(evenCurve(window.MurielAudioEngine.prototype._makeHarmonicCurve(p.sat)), '4x'),
          limiter);
      } else {
      const k = s.strengths[s.profile] / 100;
      const air = (p.air || 0) * k;
      const presence = (p.presence || 0) * k;
      const warm = (p.warm || 0) * k;
      const bass = (p.bass || 0) * k;
      const width = (p.width || 0) * k;

      const input = gainNode(1);
      const sum = gainNode(1);
      srcNode.connect(input);

      // gentle tone moves on the direct signal
      const tone = [];
      if (air > 0) tone.push(biquad('highshelf', 8000, null, 5 * air));
      if (bass > 0) tone.push(biquad('lowshelf', 90, null, 6 * bass));
      if (warm > 0) tone.push(biquad('lowshelf', 180, null, 3 * warm), biquad('highshelf', 12000, null, -2.5 * warm));
      if (presence > 0) tone.push(biquad('peaking', 350, 0.8, -2.5 * presence), biquad('peaking', 3000, 0.9, 4.5 * presence));
      if (tone.length) { chain(input, ...tone, sum); } else { input.connect(sum); }

      // new harmonics, mixed in beside the direct signal. Only the air band runs high enough to alias, so only it
      // pays for oversampling, the slowest part of a render.
      if (air > 0) {
        // the octave under the file's cutoff, doubled, lands just above it. Never higher than 13 kHz, or a
        // full-range file would get all of its new content above what most people can hear.
        const c = clamp(cutoff, 6000, 13000);
        chain(input, biquad('highpass', c / 2, 0.7), biquad('highpass', c / 2, 0.7), gainNode(6), shaper(RECTIFIER, '2x'),
          biquad('highpass', c, 0.7), biquad('highpass', c, 0.7), biquad('highpass', c, 0.7),
          biquad('lowpass', 20000, 0.7), gainNode((air * 0.8) / 6), sum);
      }
      if (presence > 0) {
        chain(input, biquad('highpass', 1800, 0.7), biquad('lowpass', 7000, 0.7), gainNode(3), shaper(SATURATOR, 'none'),
          biquad('highpass', 3500, 0.7), biquad('highpass', 3500, 0.7), biquad('lowpass', 11000, 0.7),
          gainNode((presence * 0.5) / 3), sum);
      }
      if (warm > 0) {
        chain(input, biquad('highpass', 90, 0.7), biquad('lowpass', 1800, 0.7), gainNode(2.5), shaper(SATURATOR, 'none'),
          biquad('highpass', 350, 0.7), biquad('lowpass', 6000, 0.7), gainNode((warm * 0.5) / 2.5), sum);
      }
      if (bass > 0) {
        // the overtones of a bass note are what make it audible on speakers too small to play the note itself
        chain(input, biquad('lowpass', 140, 0.7), biquad('lowpass', 140, 0.7), gainNode(4), shaper(RECTIFIER, 'none'),
          biquad('highpass', 120, 0.7), biquad('lowpass', 450, 0.7), biquad('lowpass', 450, 0.7),
          gainNode((bass * 0.8) / 4), sum);
      }

      tail = sum;

      // stereo width: more or less of the difference between the channels, bass left in the centre
      if (width !== 0 && buffer.numberOfChannels > 1) {
        const split = ctx.createChannelSplitter(2);
        const merge = ctx.createChannelMerger(2);
        const side = gainNode(1);
        tail.connect(split);
        const leftIn = gainNode(0.5);
        const rightIn = gainNode(-0.5);
        split.connect(leftIn, 0);
        split.connect(rightIn, 1);
        leftIn.connect(side);
        rightIn.connect(side);
        const amount = chain(side, biquad('highpass', 250, 0.7), gainNode(width * 1.2));
        split.connect(merge, 0, 0);
        split.connect(merge, 1, 1);
        amount.connect(merge, 0, 0);
        const inverted = gainNode(-1);
        amount.connect(inverted);
        inverted.connect(merge, 0, 1);
        tail = merge;
      }
      // what makes a mood a mood
      if (p.shape) {
        p.shape.forEach(([type, f, q, gain]) => { tail = chain(tail, biquad(type, f, q, gain == null ? null : gain * k)); });
      }
      if (p.comp) {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = p.comp.threshold;
        comp.knee.value = 12;
        comp.ratio.value = 1 + (p.comp.ratio - 1) * k;
        comp.attack.value = p.comp.attack;
        comp.release.value = p.comp.release;
        tail = chain(tail, comp);
      }
      if (p.room) {
        const conv = ctx.createConvolver();
        conv.buffer = roomImpulse(ctx, p.roomSeconds || 1);
        const mix = gainNode(1);
        tail.connect(mix);
        chain(tail, biquad('highpass', p.roomCut || 200, 0.7), conv, gainNode(p.room * k), mix);
        tail = mix;
      }
      if (p.trim) tail = chain(tail, gainNode(10 ** ((p.trim * k) / 20)));
      }
    }

    // Riff's equalizer, comes after the upscaler so it also shapes what the upscaler added
    if (eqAudible(s)) {
      const limit = (g) => clamp(g, -12, 12);
      [
        biquad('lowshelf', 200, null, limit(s.eq.low)),
        biquad('peaking', 1000, 0.9, limit(s.eq.mid)),
        biquad('highshelf', 4000, null, limit(s.eq.high)),
        ...EQ_BANDS.map((band, i) => biquad('peaking', band.f, 1.1, limit(s.bands[i]))),
      ].forEach((node) => { tail.connect(node); tail = node; });
    }

    // Bass enhancer: harmonics made from the lowest notes, which the ear reads as deeper bass even on speakers that
    // can't reach them, plus a small lift of the lows themselves. Far less level than the same bass from the equalizer.
    if (s.bassEnh > 0) {
      const k = s.bassEnh / 100;
      const sum = gainNode(1);
      chain(tail, biquad('lowshelf', 70, null, 3 * k), sum);
      chain(tail, biquad('lowpass', 130, 0.7), gainNode(1 + 5 * k), shaper(bassCurve(), 'none'),
        biquad('highpass', 140, 0.7), biquad('lowpass', 620, 0.7), gainNode(0.35 * k), sum);
      tail = sum;
    }

    // Riff's effects, with its own settings and shapes (audio-engine.js)
    const levelDb = s.level ? num(s.levelDb) : 0;
    if (fxAudible(s) || s.volume !== 1 || levelDb !== 0) {
      const engine = window.MurielAudioEngine.prototype;
      const master = gainNode(s.volume * Math.pow(10, levelDb / 20));
      const dry = gainNode(s.fx.distortion > 0 ? 1 - (s.fx.distortion / 100) * 0.4 : 1);
      tail.connect(dry);
      dry.connect(master);
      if (s.fx.distortion > 0) {
        // Distortion turns up the quietest sound the most, so as a song fades out it would stop getting quieter and buzz
        // on whatever faint sound was left. It closes as the song goes quiet, following the song's own level.
        const follow = gainNode(0);
        chain(tail, shaper(quietGate(), 'none'), biquad('lowpass', 9, 0.7), biquad('lowpass', 9, 0.7), shaper(gateFull(), 'none')).connect(follow.gain);
        chain(tail, shaper(evenCurve(engine._makeDistortionCurve(s.fx.distortion)), 'none'), gainNode((s.fx.distortion / 100) * 0.75), follow, master);
      }
      if (s.fx.echo > 0) {
        const delay = ctx.createDelay(1.0);
        delay.delayTime.value = 0.3;
        const feedback = gainNode(0.35);
        tail.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        chain(delay, gainNode(s.fx.echo / 100), master);
      }
      if (s.fx.reverb > 0) {
        const conv = ctx.createConvolver();
        conv.buffer = engine._createReverbImpulse(ctx);
        chain(tail, conv, gainNode(s.fx.reverb / 100), master);
      }
      tail = master;
    }

    // The same last stage for the live sound and the finished file, so nothing changes when one takes over from the
    // other. Up to OUT_KNEE the sound passes through untouched; a boost above that rounds off gently instead of
    // ducking the whole song, which is what made it go quiet and flat a few seconds after a change.
    return chain(tail, gainNode(1 / OUT_RANGE), shaper(outputCurve(), 'none'));
  }

  async function render(buffer, s, cutoff) {
    const ctx = new OfflineAudioContext(2, buffer.length, buffer.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    buildGraph(ctx, src, buffer, s, cutoff).connect(ctx.destination);
    src.start(0);
    return ctx.startRendering();
  }

  // a few seconds from one place in the song, for hearing a change straight away
  async function renderPart(buffer, s, cutoff, from, seconds) {
    const length = Math.max(1, Math.min(buffer.length - Math.floor(from * buffer.sampleRate), Math.floor(seconds * buffer.sampleRate)));
    const ctx = new OfflineAudioContext(2, length, buffer.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    buildGraph(ctx, src, buffer, s, cutoff).connect(ctx.destination);
    src.start(0, from, seconds);
    return ctx.startRendering();
  }

  const breathe = () => (document.hidden ? null : new Promise((r) => setTimeout(r)));

  // The rendered audio as a 16-bit WAV. Boosts can push peaks over full scale. Turning the whole song down to fit
  // would cancel out the boost you asked for, so only the moments that go over are turned down, briefly and smoothly,
  // and a song that doesn't go over is left exactly as it is. Runs in a worker so the app never freezes for it.
  function encodeWavBytes(L, R, sampleRate) {
    const n = L.length;
    const CEILING = 0.98;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(L[i]);
      const b = Math.abs(R[i]);
      if (a > peak) peak = a;
      if (b > peak) peak = b;
    }
    let gain = null;
    if (peak > CEILING) {
      gain = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const m = Math.max(Math.abs(L[i]), Math.abs(R[i]));
        gain[i] = m > CEILING ? CEILING / m : 1;
      }
      const attack = 1 / Math.max(1, Math.round(sampleRate * 0.005));
      let g = 1;
      for (let i = n - 1; i >= 0; i--) { g = Math.min(gain[i], g + attack); gain[i] = g; }
      const release = Math.exp(-1 / (sampleRate * 0.12));
      g = 1;
      for (let i = 0; i < n; i++) { g = Math.min(gain[i], 1 - (1 - g) * release); gain[i] = g; }
    }
    const bytes = new ArrayBuffer(44 + n * 4);
    const view = new DataView(bytes);
    const text = (at, t) => { for (let i = 0; i < t.length; i++) view.setUint8(at + i, t.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + n * 4, true); text(8, 'WAVE');
    text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, n * 4, true);
    const pcm = new Int16Array(bytes, 44);
    for (let i = 0; i < n; i++) {
      const l = Math.max(-1, Math.min(1, gain ? L[i] * gain[i] : L[i]));
      const r = Math.max(-1, Math.min(1, gain ? R[i] * gain[i] : R[i]));
      pcm[i * 2] = Math.round(l * 32767);
      pcm[i * 2 + 1] = Math.round(r * 32767);
    }
    return bytes;
  }

  let wavWorker = null;
  let wavWorkerBroken = false;
  let wavJob = 0;
  const wavWaiting = new Map();
  function getWavWorker() {
    if (wavWorker || wavWorkerBroken) return wavWorker;
    try {
      const code = `const encode=${encodeWavBytes.toString()};onmessage=(e)=>{const{id,L,R,rate}=e.data;const bytes=encode(new Float32Array(L),new Float32Array(R),rate);postMessage({id,bytes},[bytes])}`;
      wavWorker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      wavWorker.onmessage = (e) => {
        const job = wavWaiting.get(e.data.id);
        wavWaiting.delete(e.data.id);
        if (job) job.resolve(e.data.bytes);
      };
      wavWorker.onerror = () => {
        wavWorkerBroken = true;
        wavWorker = null;
        wavWaiting.forEach((job) => job.reject(new Error('encoder stopped')));
        wavWaiting.clear();
      };
    } catch (e) { wavWorkerBroken = true; wavWorker = null; }
    return wavWorker;
  }

  async function toWav(rendered) {
    const L = rendered.getChannelData(0);
    const R = rendered.getChannelData(1);
    const worker = getWavWorker();
    if (worker) {
      try {
        const left = L.slice().buffer;
        const right = R.slice().buffer;
        const id = ++wavJob;
        const bytes = await new Promise((resolve, reject) => {
          wavWaiting.set(id, { resolve, reject });
          worker.postMessage({ id, L: left, R: right, rate: rendered.sampleRate }, [left, right]);
        });
        return new Blob([bytes], { type: 'audio/wav' });
      } catch (e) { /* fall through to doing it here */ }
    }
    return new Blob([encodeWavBytes(L, R, rendered.sampleRate)], { type: 'audio/wav' });
  }

  async function decode(bytes) {
    return new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(bytes);
  }

  // SoundCloud's AAC songs are saved as fragmented .m4a, which iOS can play but may refuse to decode in one go.
  // Their frames can be rewrapped as plain ADTS, the same kind of file YouTube songs are saved as here.
  function fmp4ToAdts(d) {
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const name = (p) => String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]);
    function* boxes(start, end) {
      let p = start;
      while (p + 8 <= end) {
        let size = v.getUint32(p);
        let head = 8;
        if (size === 1) { size = Number(v.getBigUint64(p + 8)); head = 16; } else if (size === 0) size = end - p;
        if (size < head || p + size > end) return;
        yield { type: name(p + 4), start: p, body: p + head, end: p + size };
        p += size;
      }
    }
    const child = (box, type) => { for (const b of boxes(box.body, box.end)) if (b.type === type) return b; return null; };
    const path = (box, ...types) => types.reduce((b, t) => (b ? child(b, t) : null), box);
    let config = null;
    let trexSize = 0;
    const frames = [];
    for (const top of boxes(0, d.length)) {
      if (top.type === 'moov') {
        const trex = path(top, 'mvex', 'trex');
        if (trex) trexSize = v.getUint32(trex.body + 16);
        for (const trak of boxes(top.body, top.end)) {
          if (trak.type !== 'trak' || config) continue;
          const stsd = path(trak, 'mdia', 'minf', 'stbl', 'stsd');
          if (!stsd) continue;
          for (const entry of boxes(stsd.body + 8, stsd.end)) {
            if (entry.type !== 'mp4a') continue;
            const esds = (() => { for (const b of boxes(entry.body + 28, entry.end)) if (b.type === 'esds') return b; return null; })();
            if (!esds) continue;
            // inside the descriptors: ES (3) > DecoderConfig (4) > DecoderSpecificInfo (5)
            let p = esds.body + 4;
            const descriptor = () => {
              const tag = d[p++];
              let len = 0;
              for (let i = 0; i < 4; i++) { const b = d[p++]; len = (len << 7) | (b & 0x7f); if (!(b & 0x80)) break; }
              return { tag, len };
            };
            let desc = descriptor();
            if (desc.tag === 3) {
              const flags = d[p + 2];
              p += 3;
              if (flags & 0x80) p += 2;
              if (flags & 0x40) p += 1 + d[p];
              if (flags & 0x20) p += 2;
              desc = descriptor();
            }
            if (desc.tag === 4) { p += 13; desc = descriptor(); }
            if (desc.tag === 5) {
              const objectType = d[p] >> 3;
              config = {
                profile: (objectType >= 1 && objectType <= 4 ? objectType : 2) - 1,
                rate: ((d[p] & 7) << 1) | (d[p + 1] >> 7),
                channels: (d[p + 1] >> 3) & 15,
              };
            }
          }
        }
      } else if (top.type === 'moof') {
        for (const traf of boxes(top.body, top.end)) {
          if (traf.type !== 'traf') continue;
          const tfhd = child(traf, 'tfhd');
          if (!tfhd) continue;
          const tf = v.getUint32(tfhd.body) & 0xffffff;
          let q = tfhd.body + 8;
          let base = top.start;
          let defaultSize = trexSize;
          if (tf & 1) { base = Number(v.getBigUint64(q)); q += 8; }
          if (tf & 2) q += 4;
          if (tf & 8) q += 4;
          if (tf & 0x10) { defaultSize = v.getUint32(q); q += 4; }
          let at = base;
          for (const trun of boxes(traf.body, traf.end)) {
            if (trun.type !== 'trun') continue;
            const fl = v.getUint32(trun.body) & 0xffffff;
            const count = v.getUint32(trun.body + 4);
            let r = trun.body + 8;
            if (fl & 1) { at = base + v.getInt32(r); r += 4; }
            if (fl & 4) r += 4;
            for (let i = 0; i < count; i++) {
              let size = defaultSize;
              if (fl & 0x100) r += 4;
              if (fl & 0x200) { size = v.getUint32(r); r += 4; }
              if (fl & 0x400) r += 4;
              if (fl & 0x800) r += 4;
              frames.push([at, size]);
              at += size;
            }
          }
        }
      }
    }
    if (!config || config.rate > 12 || !frames.length) throw new Error('not AAC in fragmented MP4');
    const total = frames.reduce((n, f) => n + f[1] + 7, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const [at, size] of frames) {
      if (at + size > d.length) throw new Error('fragment runs past the end of the file');
      const len = size + 7;
      out[o++] = 0xff;
      out[o++] = 0xf1;
      out[o++] = (config.profile << 6) | (config.rate << 2) | (config.channels >> 2);
      out[o++] = ((config.channels & 3) << 6) | (len >> 11);
      out[o++] = (len >> 3) & 0xff;
      out[o++] = ((len & 7) << 5) | 0x1f;
      out[o++] = 0xfc;
      out.set(d.subarray(at, at + size), o);
      o += size;
    }
    return out;
  }

  function isFragmentedMp4(bytes) {
    const d = new Uint8Array(bytes);
    if (d.length < 12 || String.fromCharCode(d[4], d[5], d[6], d[7]) !== 'ftyp') return false;
    // the first boxes are small; a fragmented file has a moof soon after its moov
    const v = new DataView(bytes);
    let p = 0;
    while (p + 8 <= d.length) {
      const size = v.getUint32(p);
      const type = String.fromCharCode(d[p + 4], d[p + 5], d[p + 6], d[p + 7]);
      if (type === 'moof') return true;
      if (type === 'mdat' || size < 8) return false;
      p += size;
    }
    return false;
  }

  async function decodeSong(bytes) {
    const spare = isFragmentedMp4(bytes) ? bytes.slice(0) : null;
    try {
      return await decode(bytes);
    } catch (first) {
      if (!spare) throw first;
      return decode(fmp4ToAdts(new Uint8Array(spare)).buffer);
    }
  }

  // ---- reading the song's file ----

  const plugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};

  // the file: URL behind one of the app's local URLs, found the way the player finds it
  async function fileUrlOf(src) {
    const probe = new Audio();
    probe.preload = 'none';
    probe.src = src;
    await probe.__murielPending;
    const real = probe.getAttribute('src');
    probe.removeAttribute('src');
    if (!real) throw new Error('no file behind the song');
    return real;
  }

  function readByXhr(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => resolve(xhr.response);
      xhr.onerror = () => reject(new Error('request failed'));
      xhr.send();
    });
  }

  async function readByFilesystem(url) {
    const fs = plugins().Filesystem;
    const m = String(url).match(/_capacitor_file_(\/.*)$/);
    if (!fs || !m) throw new Error('no file path');
    const { data } = await fs.readFile({ path: `file://${decodeURI(m[1])}` });
    if (typeof data !== 'string') return data.arrayBuffer();
    const text = atob(data);
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
    return out.buffer;
  }

  // Capacitor serves media files without an HTTP status, so a fetch of one can report status 0 and ok=false even
  // though its bytes are all there: what counts is whether the bytes arrive. If they don't, there are other doors.
  async function readSong(src) {
    const problems = [];
    const enough = (b) => b && b.byteLength > 1024;
    try {
      const res = await window.fetch(src);
      if (res.status >= 400) throw new Error(`status ${res.status}`);
      const bytes = await res.arrayBuffer();
      if (enough(bytes)) return bytes;
      throw new Error(`only ${bytes ? bytes.byteLength : 0} bytes`);
    } catch (e) { problems.push(`fetch: ${e && e.message}`); }
    let url = null;
    try { url = await fileUrlOf(src); } catch (e) { problems.push(`lookup: ${e && e.message}`); }
    if (url) {
      for (const [how, read] of [['xhr', readByXhr], ['filesystem', readByFilesystem]]) {
        try {
          const bytes = await read(url);
          if (enough(bytes)) {
            log(`read the file by ${how} after: ${problems.join('; ')}`);
            return bytes;
          }
          throw new Error(`only ${bytes ? bytes.byteLength : 0} bytes`);
        } catch (e) { problems.push(`${how}: ${e && e.message}`); }
      }
    }
    throw new Error(problems.join('; '));
  }

  // ---- where a finished render plays from: a blob in memory, or a file if blobs turn out not to play ----

  let useFiles = false;
  let diskSlot = 0;
  const DISK_SLOTS = 5;

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsDataURL(blob);
    });
  }

  async function saveToDisk(blob) {
    const fs = plugins().Filesystem;
    if (!fs || !window.Capacitor.convertFileSrc) throw new Error('no file storage');
    // a slot nothing is using: writing over the file on the player would break the song the next time it reads it
    const taken = (slot) => (loaded && loaded.url.includes(`/fx${slot}.wav`)) || [...renders.values()].some((e) => e.url.includes(`/fx${slot}.wav`));
    for (let tries = 0; tries < DISK_SLOTS; tries++) {
      diskSlot = (diskSlot + 1) % DISK_SLOTS;
      if (!taken(diskSlot)) break;
    }
    const path = `muriel-fx/fx${diskSlot}.wav`;
    const CHUNK = 3 * 1024 * 1024; // a multiple of 3: each piece is complete base64 of its own
    for (let at = 0; at < blob.size; at += CHUNK) {
      const data = await blobToBase64(blob.slice(at, at + CHUNK));
      const options = { path, directory: 'CACHE', data, recursive: true };
      if (at === 0) await fs.writeFile(options); else await fs.appendFile(options);
    }
    const { uri } = await fs.getUri({ path, directory: 'CACHE' });
    return `${window.Capacitor.convertFileSrc(uri)}?v=${Date.now()}`;
  }

  const renderedUrls = new Set();
  // WebKit reports a URL's scheme in lower case; Capacitor's file URLs use the capitalised app scheme
  const sameUrl = (u) => String(u || '').replace(/^[a-z][a-z0-9+.-]*:/i, (m) => m.toLowerCase());
  const markRendered = (url) => { renderedUrls.add(sameUrl(url)); return url; };

  async function playableUrl(blob) {
    return markRendered(useFiles ? await saveToDisk(blob) : URL.createObjectURL(blob));
  }

  function isRendered(url) {
    return renderedUrls.has(sameUrl(url));
  }

  // into the app's own error log (Settings -> share error log), so a problem on a phone can be read afterwards
  function log(message) {
    if (window.MurielLog && window.MurielLog.add) window.MurielLog.add('warn', `[phone-fx] ${message}`);
    else console.warn('[phone-fx]', message);
  }

  // ---- the player ----

  const LOCAL = /^http:\/\/127\.0\.0\.1:\d+\//;
  const tooLong = () => { const e = new Error('too long'); e.code = 'too-long'; return e; };

  let settings = defaults();
  let audio = null;
  let protoSrc = null;
  let saveTimer = null;
  let applyTimer = null;
  let work = Promise.resolve();
  let decoded = null;                   // { src, buffer, cutoff } of the playing song, so a change re-renders fast
  let dropDecodedTimer = null;
  const renders = new Map();            // "src::signature" -> { url, cutoff }, newest last
  const cutoffs = new Map();
  let status = { kind: 'idle' };
  let ui = null;
  let stalledInBackground = false;      // iOS held up a render with the screen locked: don't make every song wait
  let brokenReason = '';                // processed audio can't play on this phone at all: songs play as they are
  let lastPosition = 0;
  let lastSignature = '';
  let loaded = null;                    // { url, src } while the player holds processed audio

  function current(track) {
    const core = window.MurielCore;
    const t = track || (core && core.state && core.state.currentTrack);
    const genre = settings.autoEq && core && core.genreFor && t ? core.genreFor(t) : '';
    return compose(settings, window.audioEngine && window.audioEngine.audioSettings, genre);
  }

  function load() {
    try { settings = normalize(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); } catch (e) { settings = defaults(); }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) {} }, 200);
  }

  function setStatus(kind, extra) {
    status = { kind, ...(extra || {}) };
    if (ui) ui.renderAll();
    window.dispatchEvent(new Event('muriel:fx'));
  }

  function holdDecoded(entry) {
    decoded = entry;
    clearTimeout(dropDecodedTimer);
    // the decoded song is large: it stays only while someone is likely to be moving sliders
    dropDecodedTimer = setTimeout(() => { decoded = null; }, 45000);
  }

  function remember(key, entry) {
    renders.delete(key);
    renders.set(key, entry);
    // oldest first, but never the one on the player: a song on loop goes back to its start and needs it again
    for (const [oldKey, old] of renders) {
      if (renders.size <= 3) break;
      if (oldKey === key || (loaded && sameUrl(loaded.url) === sameUrl(old.url))) continue;
      renders.delete(oldKey);
      // a crossfade may still be playing this one to its end
      if (old.url.startsWith('blob:')) {
        setTimeout(() => {
          if (loaded && sameUrl(loaded.url) === sameUrl(old.url)) return;
          URL.revokeObjectURL(old.url);
          renderedUrls.delete(sameUrl(old.url));
        }, 120000);
      }
    }
  }

  const decoding = new Map();

  // the playing song, decoded (kept a while, as changes usually come in a row)
  async function getSource(src, keep = true, given = null) {
    if (decoded && decoded.src === src) { if (keep) holdDecoded(decoded); return decoded; }
    if (decoding.has(src)) return decoding.get(src);
    const job = (async () => {
      const bytes = given || await step('read', () => readSong(src));
      if (bytes.byteLength > MAX_FILE_BYTES) throw tooLong();
      const buffer = await step('decode', () => decodeSong(bytes));
      if (buffer.duration > MAX_SECONDS) throw tooLong();
      if (!cutoffs.has(src)) {
        if (cutoffs.size > 50) cutoffs.clear();
        cutoffs.set(src, detectCutoff(buffer));
      }
      return { src, buffer, cutoff: cutoffs.get(src), loudness: measureLoudness(buffer) };
    })();
    decoding.set(src, job);
    try {
      const source = await job;
      if (keep) holdDecoded(source);
      return source;
    } finally { decoding.delete(src); }
  }

  // ---- the visualizer's picture of a song ----
  // Worked out ahead from the file, in a worker, and read back by playback time. Nothing goes between the song and the
  // speaker for this: on an iPhone that would stop the music when the screen locks.
  const SPECTRUM_BARS = 48;
  const SPECTRUM_FPS = 30;
  const SPECTRUM_LOW = 40;
  const SPECTRUM_HIGH = 10000;
  function spectrumJob(mono, rate, fps, bars, low, high) {
    const N = 1024;
    const hop = rate / fps;
    const count = Math.max(1, Math.floor(mono.length / hop));
    const raw = new Float32Array(count * bars);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const rev = new Uint16Array(N);
    const bitsN = Math.log2(N);
    for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bitsN; b++) if (i & (1 << b)) r |= 1 << (bitsN - 1 - b); rev[i] = r; }
    const cos = new Float32Array(N / 2);
    const sin = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / N); sin[i] = -Math.sin((2 * Math.PI * i) / N); }
    const edges = new Float32Array(bars + 1);
    for (let b = 0; b <= bars; b++) edges[b] = low * Math.pow(high / low, b / bars);
    const binHz = rate / N;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    const mags = new Float32Array(N / 2);
    for (let f = 0; f < count; f++) {
      const start = Math.floor(f * hop - N / 2);
      for (let i = 0; i < N; i++) { const at = start + i; const v = at >= 0 && at < mono.length ? mono[at] * win[i] : 0; re[rev[i]] = v; im[rev[i]] = 0; }
      for (let size = 2; size <= N; size *= 2) {
        const half = size / 2;
        const step = N / size;
        for (let i = 0; i < N; i += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const a = i + j;
            const b = a + half;
            const tr = re[b] * cos[k] - im[b] * sin[k];
            const ti = re[b] * sin[k] + im[b] * cos[k];
            re[b] = re[a] - tr; im[b] = im[a] - ti;
            re[a] += tr; im[a] += ti;
          }
        }
      }
      for (let i = 0; i < N / 2; i++) mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      for (let b = 0; b < bars; b++) {
        const lo = edges[b] / binHz;
        const hi = edges[b + 1] / binHz;
        let v = 0;
        if (hi - lo < 1) {
          // narrower than one step of the analysis: between its two neighbours
          const mid = (lo + hi) / 2;
          const i = Math.min(N / 2 - 2, Math.floor(mid));
          v = mags[i] + (mags[i + 1] - mags[i]) * (mid - i);
        } else {
          for (let i = Math.ceil(lo); i <= Math.floor(hi) && i < N / 2; i++) if (mags[i] > v) v = mags[i];
        }
        // music has less energy the higher it goes; without this only the left of the display would ever move
        raw[f * bars + b] = v * Math.pow(Math.sqrt(edges[b] * edges[b + 1]) / 1000, 0.5);
      }
    }
    // Bars follow how each frequency changes, not how loud it is: compared with where that frequency has been over the
    // last moment, and with the rest of the frame. So a loud, dense passage keeps its peaks and dips instead of filling
    // the display, while quiet passages and silence still sit low.
    const db = new Float32Array(raw.length);
    let top = -200;
    for (let i = 0; i < raw.length; i++) { db[i] = raw[i] > 1e-7 ? 20 * Math.log10(raw[i]) : -200; if (db[i] > top) top = db[i]; }
    const frames = new Uint8Array(raw.length);
    const reach = Math.round(fps * 0.75);
    const slow = new Float32Array(count * bars);
    const mean = new Float32Array(bars);
    for (let b = 0; b < bars; b++) {
      const sum = new Float64Array(count + 1);
      for (let f = 0; f < count; f++) sum[f + 1] = sum[f] + Math.max(top - 70, db[f * bars + b]);
      mean[b] = sum[count] / count;
      for (let f = 0; f < count; f++) {
        const lo = Math.max(0, f - reach);
        const hi = Math.min(count, f + reach + 1);
        slow[f * bars + b] = (sum[hi] - sum[lo]) / (hi - lo);
      }
    }
    const row = new Float32Array(bars);
    for (let f = 0; f < count; f++) {
      let total = 0;
      let peak = -200;
      for (let b = 0; b < bars; b++) if (db[f * bars + b] > peak) peak = db[f * bars + b];
      for (let b = 0; b < bars; b++) {
        const at = f * bars + b;
        const gate = Math.min(1, Math.max(0, (db[at] - Math.max(top - 62, -120)) / 16));
        const v = (0.47 + (db[at] - slow[at]) / 23 + (slow[at] - mean[b]) / 60 + (db[at] - peak) / 34) * gate;
        row[b] = v;
        total += v;
      }
      const over = total / bars - 0.42;
      for (let b = 0; b < bars; b++) {
        const v = over > 0 ? row[b] - over * 0.85 : row[b];
        // head room, so only the very biggest hits reach the top of the scale and bars don't line up at it
        frames[f * bars + b] = Math.round(Math.min(1, Math.max(0, v * 0.85)) * 255);
      }
    }
    return frames;
  }
  function runSpectrum(mono, rate) {
    const args = [rate, SPECTRUM_FPS, SPECTRUM_BARS, SPECTRUM_LOW, SPECTRUM_HIGH];
    return new Promise((resolve, reject) => {
      let w = null;
      try {
        const code = `const job=${spectrumJob.toString()};onmessage=(e)=>{const f=job(e.data.mono,...e.data.args);postMessage(f,[f.buffer])}`;
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        w = new Worker(url);
        URL.revokeObjectURL(url);
      } catch (e) { w = null; }
      if (!w) { setTimeout(() => { try { resolve(spectrumJob(mono, ...args)); } catch (e) { reject(e); } }, 50); return; }
      w.onmessage = (e) => { w.terminate(); resolve(e.data); };
      w.onerror = () => { w.terminate(); reject(new Error('visualizer worker failed')); };
      w.postMessage({ mono, args }, [mono.buffer]);
    });
  }
  async function spectrumOfBuffer(buffer) {
    // half the sample rate is plenty for what a display shows
    const factor = buffer.sampleRate >= 32000 ? 2 : 1;
    const n = Math.floor(buffer.length / factor);
    const mono = new Float32Array(n);
    const chs = Math.min(2, buffer.numberOfChannels);
    for (let c = 0; c < chs; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0, k = 0; i < n; i++, k += factor) mono[i] += (factor === 2 ? (d[k] + (d[k + 1] || 0)) / 2 : d[k]) / chs;
    }
    return spectrumShape(await runSpectrum(mono, buffer.sampleRate / factor));
  }
  // Songs you've played before don't need working out again, even after the app restarts: a few hundred KB each, on disk.
  const SPECTRUM_SAVED = 60;
  let spectrumDb = null;
  function openSpectrumDb() {
    if (spectrumDb) return spectrumDb;
    spectrumDb = new Promise((resolve, reject) => {
      const r = indexedDB.open('sine-spectra', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('songs');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    spectrumDb.catch(() => {});
    return spectrumDb;
  }
  const spectrumKey = (id) => `v1:${SPECTRUM_BARS}:${SPECTRUM_FPS}:${id}`;
  function spectrumShape(frames) {
    const centres = [];
    for (let b = 0; b < SPECTRUM_BARS; b++) centres.push(SPECTRUM_LOW * Math.pow(SPECTRUM_HIGH / SPECTRUM_LOW, (b + 0.5) / SPECTRUM_BARS));
    return { frames, bars: SPECTRUM_BARS, fps: SPECTRUM_FPS, centres };
  }
  async function savedSpectrum(id) {
    try {
      const db = await openSpectrumDb();
      const found = await new Promise((resolve, reject) => {
        const q = db.transaction('songs').objectStore('songs').get(spectrumKey(id));
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
        setTimeout(() => resolve(null), 400); // never wait long on this: working it out is the fallback
      });
      return found && found.frames ? spectrumShape(found.frames) : null;
    } catch (e) { return null; }
  }
  async function saveSpectrum(id, out) {
    try {
      const db = await openSpectrumDb();
      const store = db.transaction('songs', 'readwrite').objectStore('songs');
      store.put({ frames: out.frames, at: Date.now() }, spectrumKey(id));
      const count = store.count();
      count.onsuccess = () => {
        if (count.result <= SPECTRUM_SAVED) return;
        // over the limit: the songs saved longest ago go
        const all = [];
        store.openCursor().onsuccess = (e) => {
          const c = e.target.result;
          if (c) { all.push([c.value.at || 0, c.key]); c.continue(); return; }
          all.sort((a, b) => a[0] - b[0]).slice(0, all.length - SPECTRUM_SAVED).forEach(([, key]) => store.delete(key));
        };
      };
    } catch (e) { /* only a shortcut */ }
  }
  const spectra = new Map();
  const spectrumWork = new Map();
  function keepSpectrum(id, out) {
    spectra.set(id, out);
    while (spectra.size > 4) spectra.delete(spectra.keys().next().value);
    return out;
  }
  // from a saved copy, else from the file: the job is shared, so getting the next song ready and playing it never do it twice
  function spectrumFrom(id, src, source) {
    if (spectra.has(id)) return Promise.resolve(spectra.get(id));
    if (spectrumWork.has(id)) return spectrumWork.get(id);
    const job = (async () => {
      const saved = await savedSpectrum(id);
      if (saved) return keepSpectrum(id, saved);
      const from = source || await getSource(src, false);
      const out = keepSpectrum(id, await spectrumOfBuffer(from.buffer));
      saveSpectrum(id, out);
      return out;
    })();
    spectrumWork.set(id, job);
    const done = () => spectrumWork.delete(id);
    job.then(done, done);
    return job;
  }
  async function spectrumFor(id) {
    if (spectra.has(id)) return spectra.get(id);
    if (spectrumWork.has(id)) return spectrumWork.get(id);
    const saved = await savedSpectrum(id);
    if (saved) return keepSpectrum(id, saved);
    const src = audio && audio.__murielSrc ? audio.__murielSrc : audio && protoSrc.get.call(audio);
    if (!src || !LOCAL.test(String(src))) return null;
    return spectrumFrom(id, src);
  }
  // how much the equalizer lifts or lowers a frequency, in dB, so the display shows what you hear
  function eqGainAt(hz) {
    const s = current();
    if (!eqAudible(s)) return 0;
    let g = 0;
    const low = 2 ** ((Math.log2(200) - Math.log2(hz)) * 1.5);
    g += num(s.eq.low) * (low / (1 + low));
    const high = 2 ** ((Math.log2(hz) - Math.log2(4000)) * 1.5);
    g += num(s.eq.high) * (high / (1 + high));
    g += num(s.eq.mid) * Math.exp(-((Math.log2(hz / 1000) / 1.2) ** 2));
    EQ_BANDS.forEach((band, i) => { g += num(s.bands[i]) * Math.exp(-((Math.log2(hz / band.f) / 0.65) ** 2)); });
    return g;
  }

  async function step(label, run) {
    try {
      return await run();
    } catch (e) {
      if (e && e.code === 'too-long') throw e;
      throw new Error(`${label}: ${(e && (e.message || e.name)) || e}`);
    }
  }

  async function produce(src, snapshot, keep = true, gotSource = null) {
    const key = `${src}::${signature(snapshot)}`;
    const ready = renders.get(key);
    if (ready) return ready;
    const core = window.MurielCore;
    const known = keep && core && core.state && core.state.currentTrack && Number(core.state.currentTrack.duration);
    if (known && known > MAX_SECONDS) throw tooLong();
    const source = await getSource(src, keep);
    if (gotSource) gotSource(source);
    const blob = await step('render', async () => toWav(await render(source.buffer, { ...snapshot, levelDb: levelGain(source.loudness) }, source.cutoff)));
    const url = await step('store', () => playableUrl(blob));
    const entry = { url, blob, cutoff: source.cutoff };
    remember(key, entry);
    return entry;
  }

  // one render at a time; a song skipped while waiting its turn is dropped
  function queueRender(src, snapshot) {
    const job = work.then(() => {
      if (audio.__murielSrc !== src) return null;
      return produce(src, snapshot);
    });
    // a render that never finishes must not hold up later songs
    work = withTimeout(job).then(() => {}, () => {});
    return job;
  }

  function withTimeout(promise) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (document.hidden) stalledInBackground = true;
        reject(new Error('took too long'));
      }, document.hidden ? TIMEOUT_HIDDEN_MS : TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function loadOriginal(src) {
    loaded = null;
    protoSrc.set.call(audio, src);
  }

  function loadRendered(url, src) {
    loaded = { url, src };
    // in use again: the newest in the store
    for (const [key, entry] of renders) {
      if (sameUrl(entry.url) === sameUrl(url)) { renders.delete(key); renders.set(key, entry); break; }
    }
    protoSrc.set.call(audio, url);
    // the app knows the song by its usual URL: keep answering with that
    audio.__murielSrc = src;
  }

  function reportFailure(e) {
    const tooLongSong = e && e.code === 'too-long';
    if (!tooLongSong) log(`couldn't process a song: ${(e && e.message) || e}`);
    setStatus(tooLongSong ? 'too-long' : 'failed', { reason: tooLongSong ? '' : (e && e.message) || '' });
  }

  // ---- the next song, processed before it's needed ----
  let prepared = null;

  function prepareNextSong() {
    const core = window.MurielCore;
    const src = audio.__murielSrc;
    const left = (audio.duration || 0) - (mainTime() || 0);
    const active = isActive(current());
    // the visualizer's bars for the next song are worth having ready even with no sound settings on
    const wantBars = document.body.dataset.npViz !== 'off' && !document.body.classList.contains('perf');
    if (!core || !src || !(left > 0) || (mainTime() || 0) < 6 || prepared === src || !LOCAL.test(src) || (!active && !wantBars)) return;
    // not while the live sound is carrying this song: that's when spare processing power matters most
    if (live || helper || swap) return;
    const state = core.state;
    // the same song is coming round again: nothing else to get ready, and the memory is better left alone
    const section = window.NocturneExtras && window.NocturneExtras.loop;
    if (state.isRepeat || (section && section.b != null)) return;
    const next = core.upNext ? core.upNext() : state && Array.isArray(state.queue) && !state.isShuffle ? state.queue[state.queueIndex + 1] : null;
    if (!next || !next.id || next.spotifyId || !/[?&]id=/.test(src)) return;
    prepared = src;
    const id = String(next.id).replace(/^(yt_|youtube_)/, '');
    const nextSrc = src.replace(/([?&]id=)[^&]*/, `$1${encodeURIComponent(id)}`);
    const snapshot = current(next);
    // the file only has to be decoded once for both jobs
    const bars = (source) => { if (wantBars) spectrumFrom(next.id, nextSrc, source).catch(() => {}); };
    // a render that never finishes must not hold up the songs after it
    work = withTimeout(work.then(() => (active ? produce(nextSrc, snapshot, false, bars) : spectrumFrom(next.id, nextSrc)))).then(() => {}, () => { prepared = null; });
  }

  // ---- changing the sound without stopping the song ----
  // While you adjust, the song plays through a live sound graph: the same filters and effects a render uses, changed
  // in a few milliseconds with no reload and no seek, which is what makes a change instant and smooth. The main player
  // keeps time beside it, muted, because it's what the lock screen and the rest of the app follow. Once the changes
  // stop, the finished render goes into the main player behind the live sound, which then fades out over it.
  // Live sound can't keep a song's pitch at another speed, and iOS stops it when the screen locks. So at a pitch-kept
  // speed a second <audio> player does the same job, more slowly, and a locked phone goes straight to the render.
  const PREVIEW_SECONDS = 16;
  const HEAD_BYTES = 800 * 1024;        // about 50 seconds of music: decoded first, so a song can start at once
  const IDLE_BEFORE_HANDOVER = 2500;
  const JOIN_FADE_MS = 15;
  let liveCtx = null;
  let live = null;                      // the live graph: { node, buffer, src, trackId, t0, offset, rate, master, chain, dry }
  let liveSuspendTimer = null;
  let helper = null;                    // { el, base, length, temporary }: the second player
  let swap = null;                      // the main player is loading behind whatever is sounding
  let swapTimer = null;
  let fxMuted = false;                  // muted by this code, on top of what the listener chose
  let wantMuted = false;                // what the listener chose
  let wantVolume = 1;                   // the volume slider (a PC: an iPhone's is the hardware's)
  const liveLevel = () => (wantMuted ? 0 : wantVolume);
  let noOverlap = false;                // this phone won't play two players at once
  let applyGeneration = 0;
  let fullTimer = null;
  let waitingHelper = null;             // ready for when a new song starts
  let waitingLive = null;
  let outsideHoldAt = 0;                // sound stopped from outside: everything held while the app works out why               // the same, for live sound
  let lastChangeAt = 0;
  let startToken = 0;
  let starting = null;
  let comparing = false;
  let nativeTime = null;
  let nativePaused = null;
  let nativeMuted = null;

  const mainTime = () => nativeTime.get.call(audio) || 0;
  const mainPaused = () => nativePaused.get.call(audio);
  const helperTime = () => (helper ? helper.base + (helper.el.currentTime || 0) : mainTime());
  const liveTime = () => (live ? (live.paused ? live.heldAt : live.offset + Math.max(0, live.ctx.currentTime - live.t0) * live.rate) : mainTime());
  const soundTime = () => (live ? liveTime() : helperTime());
  const pitchKeptSpeed = () => audio && audio.preservesPitch && Math.abs((audio.playbackRate || 1) - 1) > 0.001;
  let appHidden = false; // an iPhone doesn't always report the page as hidden when it locks; the app's own state says so
  const isHidden = () => document.hidden || appHidden;
  const liveAllowed = () => !isHidden() && !pitchKeptSpeed() && !!(window.AudioContext || window.webkitAudioContext);

  function applyMute() {
    nativeMuted.set.call(audio, wantMuted || fxMuted || (holdingForOutside() && nativeMuted.get.call(audio)));
    if (helper) { helper.el.muted = wantMuted; helper.el.volume = wantVolume; }
    if (live) live.master.gain.value = liveLevel();
  }

  function getLiveCtx() {
    if (!liveCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      liveCtx = new AC({ latencyHint: 'playback' });
      // iOS took the live sound away (screen off, leaving the app): the main player takes over right now
      liveCtx.addEventListener('statechange', () => {
        if (liveCtx.state === 'interrupted') wentToBackground();
        else if (liveCtx.state === 'suspended' && stoppedFromOutside()) outsideStop('live sound');
      });
    }
    return liveCtx;
  }

  async function liveRunning() {
    const ctx = getLiveCtx();
    if (holdingForOutside()) return false;
    clearTimeout(liveSuspendTimer);
    if (ctx.state !== 'running') {
      await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 500))]);
    }
    return ctx.state === 'running';
  }

  function attachChain(l, snapshot, cutoff, levelDb) {
    const ctx = l.ctx;
    const input = ctx.createGain();
    const out = ctx.createGain();
    buildGraph(ctx, input, l.buffer, { ...snapshot, levelDb }, cutoff).connect(out);
    out.connect(l.master);
    const now = ctx.currentTime;
    const old = l.chain;
    out.gain.setValueAtTime(old ? 0 : comparing ? 0 : 1, now);
    if (old) out.gain.linearRampToValueAtTime(comparing ? 0 : 1, now + 0.04);
    l.node.connect(input);
    l.chain = { input, out, snapshot, cutoff, levelDb };
    if (old) {
      old.out.gain.cancelScheduledValues(now);
      old.out.gain.setValueAtTime(old.out.gain.value, now);
      old.out.gain.linearRampToValueAtTime(0, now + 0.04);
      setTimeout(() => {
        try { l.node.disconnect(old.input); } catch (e) {}
        try { old.out.disconnect(); } catch (e) {}
      }, 120);
    }
  }

  // iOS treats live sound on its own like a game: the ring/silent switch would mute it. With a normal player
  // audibly "playing" it counts as music. So a player of pure silence runs alongside for as long as live sound does.
  // While it does, it's also the player the lock screen follows (iOS ignores a muted one, and the main player is muted
  // then), and the lock screen takes that player's own time whenever it jumps. A one-second loop jumped back every
  // second, so the lock screen sat at 0:00 while the song played. So it's as long as the song, at the song's time and speed.
  let silence = null;
  let silenceSeconds = 0;
  function silentWav(seconds) {
    const rate = 8000;
    const bytes = rate * 2 * seconds;
    const v = new DataView(new ArrayBuffer(44 + bytes));
    const text = (at, t) => { for (let i = 0; i < t.length; i++) v.setUint8(at + i, t.charCodeAt(i)); };
    text(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); text(8, 'WAVE');
    text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    text(36, 'data'); v.setUint32(40, bytes, true);
    return new Blob([v.buffer], { type: 'audio/wav' });
  }
  function keepAsMusic(on) {
    try {
      if (on) {
        const song = window.MurielCore && window.MurielCore.state && window.MurielCore.state.currentTrack;
        const songSeconds = (song && Number(song.duration)) || 0;
        const need = Math.min(MAX_SECONDS + 60, Math.max(240, Math.ceil((songSeconds + 30) / 60) * 60));
        if (!silence) {
          silence = new Audio();
          silence.id = 'nocturne-silence';
          silence.loop = true; // only for a song longer than it: alignSilence puts it straight back
        }
        if (silenceSeconds < need && silence.paused) {
          const old = silenceSeconds ? silence.src : '';
          silence.src = URL.createObjectURL(silentWav(need));
          silenceSeconds = need;
          if (old) URL.revokeObjectURL(old);
        }
        alignSilence();
        if (silence.paused) silence.play().catch(() => {});
      } else if (silence && !silence.paused) {
        silence.pause();
      }
    } catch (e) {}
  }
  function alignSilence() {
    if (!silence || !live) return;
    try {
      const rate = live.rate || 1;
      if (Math.abs(silence.playbackRate - rate) > 0.001) silence.playbackRate = rate;
      const at = liveTime();
      if (silence.readyState >= 1 && Number.isFinite(at) && at < silenceSeconds - 1 && Math.abs((silence.currentTime || 0) - at) > 0.75) silence.currentTime = at;
    } catch (e) {}
  }
  setInterval(() => { if (silence && !silence.paused) alignSilence(); }, 250);

  // live sound starts at `at` seconds into the song
  async function startLive(source, at, snapshot, info) {
    // iOS doesn't play live sound in the background (nor is it started as the screen may be going off)
    if (isHidden() || justCovered()) return null;
    const srcAtStart = audio.__murielSrc;
    const songAtStart = window.MurielCore && window.MurielCore.state.currentTrack;
    keepAsMusic(true);
    if (!(await liveRunning())) { keepAsMusic(false); throw new Error('live audio would not start'); }
    // waking the audio engine can take a while on a phone that's lagging: the song may have moved on meanwhile,
    // and starting anyway would play the old sound over the new one
    const movedOn = audio.__murielSrc !== srcAtStart || (window.MurielCore && window.MurielCore.state.currentTrack) !== songAtStart;
    // (or the screen went off meanwhile)
    if (movedOn || isHidden() || justCovered() || (info.followMain && mainPaused())) { if (!live) keepAsMusic(false); return null; }
    const ctx = getLiveCtx();
    const master = ctx.createGain();
    const LEAD = 0.025;
    const t0 = ctx.currentTime + LEAD;
    // a soft start hides the join; the main player goes silent in this same step (below)
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(liveLevel(), t0 + 0.012);
    master.connect(ctx.destination);
    const dry = ctx.createGain();
    dry.gain.value = comparing ? 1 : 0;
    dry.connect(master);
    const rate = audio.playbackRate || 1;
    if (info.followMain) at = mainTime();
    const node = ctx.createBufferSource();
    node.buffer = source.buffer;
    node.playbackRate.value = rate;
    const previous = live;
    const l = { ctx, node, buffer: source.buffer, src: info.src || null, trackId: info.trackId || '', head: !!info.head, t0, offset: at + (info.followMain ? LEAD * rate : 0), rate, master, dry, chain: null, snapshotSig: signature(snapshot), loudness: source.loudness };
    node.connect(dry);
    attachChain(l, snapshot, source.cutoff, levelGain(source.loudness));
    node.onended = () => { if (live === l && !l.stopping) checkSound(); };
    node.start(t0, l.offset);
    live = l;
    // In one step with the start above, with nothing that can run in between: if this waited on a timer, a lag right
    // here would leave the main player and the live sound both playing the song
    if (info.followMain) { fxMuted = true; nativeMuted.set.call(audio, true); }
    if (previous) dropLive(previous, 30);
    return l;
  }

  // Pause has to leave nothing running. If the graph keeps going while iOS changes audio mode (which it does when
  // the last player stops), its output can get stuck looping its last few milliseconds: a fast repeating noise. So:
  // fade, stop the song and any echo or reverb still ringing, stop the whole graph, and only then let go of the session.
  function pauseLive() {
    const l = live;
    if (!l || l.paused) return;
    l.heldAt = liveTime();
    l.paused = true;
    const ctx = l.ctx;
    const now = ctx.currentTime;
    l.master.gain.cancelScheduledValues(now);
    l.master.gain.setValueAtTime(l.master.gain.value, now);
    l.master.gain.linearRampToValueAtTime(0, now + 0.02);
    const token = (l.pauseToken = (l.pauseToken || 0) + 1);
    setTimeout(() => {
      if (live !== l || !l.paused || l.pauseToken !== token) return;
      silenceNodes(l);
      ctx.suspend().catch(() => {}).then(() => { if (live === l && l.paused && l.pauseToken === token) keepAsMusic(false); });
    }, 35);
  }

  function silenceNodes(l) {
    l.node.onended = null;
    try { l.node.stop(); } catch (e) {}
    try { l.node.disconnect(); } catch (e) {}
    // the effects go too, or an echo would still be ringing when the song starts again
    if (l.chain) { try { l.chain.out.disconnect(); } catch (e) {} }
  }

  async function resumeLive() {
    const l = live;
    if (!l || !l.paused) return;
    const token = (l.pauseToken = (l.pauseToken || 0) + 1);
    keepAsMusic(true);
    if (!(await liveRunning())) { if (live === l && l.pauseToken === token) { l.paused = false; soundBackToMain(0); } return; }
    if (live !== l || l.pauseToken !== token) return;
    const at = swap ? l.heldAt : mainTime();
    silenceNodes(l);
    l.paused = false;
    if (at >= l.buffer.duration - 0.1) { soundBackToMain(0); return; }
    const old = l.chain;
    const ctx = l.ctx;
    const when = ctx.currentTime + 0.03;
    const node = ctx.createBufferSource();
    node.buffer = l.buffer;
    node.playbackRate.value = audio.playbackRate || 1;
    node.connect(l.dry);
    l.node = node;
    l.t0 = when;
    l.offset = at;
    l.rate = audio.playbackRate || 1;
    l.chain = null;
    attachChain(l, current(), old.cutoff, old.levelDb);
    node.onended = () => { if (live === l && !l.stopping) checkSound(); };
    node.start(when, at);
    const now = ctx.currentTime;
    l.master.gain.cancelScheduledValues(now);
    l.master.gain.setValueAtTime(0, now);
    l.master.gain.linearRampToValueAtTime(liveLevel(), when + 0.02);
  }

  function dropLive(l, fadeMs) {
    if (!l) return;
    l.stopping = true;
    try {
      const now = l.ctx.currentTime;
      l.master.gain.cancelScheduledValues(now);
      l.master.gain.setValueAtTime(l.master.gain.value, now);
      l.master.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
      l.node.stop(now + fadeMs / 1000 + 0.02);
    } catch (e) {}
    setTimeout(() => { try { l.master.disconnect(); } catch (e) {} }, fadeMs + 80);
  }

  function endLive(fadeMs = 30) {
    const l = live;
    live = null;
    dropLive(l, fadeMs);
    clearTimeout(liveSuspendTimer);
    // nothing runs once it's done, and the session is let go of only after that (see pauseLive)
    liveSuspendTimer = setTimeout(() => {
      if (live || !liveCtx) return;
      const done = () => { if (!live) keepAsMusic(false); };
      if (liveCtx.state === 'running') liveCtx.suspend().then(done, done); else done();
    }, fadeMs + 90);
  }

  // the same audio, with more of the song: picks up on the exact sample
  function extendLive(source) {
    if (!live || live.buffer === source.buffer) return;
    const l = live;
    // measured on the first seconds until now: the finished file will use the whole song's level
    const wholeLevel = levelGain(source.loudness);
    l.loudness = source.loudness;
    const levelMoved = l.chain && Math.abs(num(l.chain.levelDb) - num(wholeLevel)) > 0.05;
    if (l.paused) { l.buffer = source.buffer; l.head = false; if (l.chain) l.chain.levelDb = wholeLevel; return; }
    const ctx = l.ctx;
    const at = ctx.currentTime + 0.1;
    const offset = l.offset + Math.max(0, at - l.t0) * l.rate;
    const node = ctx.createBufferSource();
    node.buffer = source.buffer;
    node.playbackRate.value = l.rate;
    node.connect(l.dry);
    if (l.chain) node.connect(l.chain.input);
    node.start(at, offset);
    try { l.node.stop(at); } catch (e) {}
    l.node = node;
    l.buffer = source.buffer;
    l.t0 = at;
    l.offset = offset;
    l.head = false;
    node.onended = () => { if (live === l && !l.stopping) checkSound(); };
    if (levelMoved) attachChain(l, current(), l.chain.cutoff, wholeLevel);
  }

  // jump: a seek, or a resume after a pause
  function moveLive(at) {
    if (!live) return;
    const l = live;
    if (l.paused) { l.heldAt = at; return; }
    const ctx = l.ctx;
    const when = ctx.currentTime + 0.03;
    if (at >= l.buffer.duration - 0.1) { endLive(); fxMuted = false; applyMute(); return; }
    const node = ctx.createBufferSource();
    node.buffer = l.buffer;
    node.playbackRate.value = audio.playbackRate || 1;
    node.connect(l.dry);
    if (l.chain) node.connect(l.chain.input);
    node.start(when, at);
    try { l.node.stop(when); } catch (e) {}
    l.node = node;
    l.t0 = when;
    l.offset = at;
    l.rate = audio.playbackRate || 1;
    node.onended = () => { if (live === l && !l.stopping) checkSound(); };
  }

  function disposeHelper(h) {
    if (!h) return;
    try { h.el.__ownPause = true; h.el.pause(); h.el.removeAttribute('src'); h.el.load(); } catch (e) {}
    if (h.temporary && h.url) URL.revokeObjectURL(h.url);
  }

  function endHelper() {
    const h = helper;
    helper = null;
    disposeHelper(h);
    if (waitingHelper) { disposeHelper(waitingHelper); waitingHelper = null; }
  }

  // nothing but the main player from here
  function soundBackToMain(fadeMs) {
    waitingLive = null;
    endHelper();
    endLive(Math.min(fadeMs, JOIN_FADE_MS));
    fxMuted = false;
    applyMute();
  }

  // ---- leaving the app or turning the screen off: the music carries on ----
  let lastSystemPauseAt = 0;
  let otherSoundAt = 0; // another app took the sound: nothing here starts playing over it
  // the phone paused the song as the app went to the background, and not for another app's sound: it should carry on
  const pausedByGoingAway = () => Date.now() - lastSystemPauseAt < 5000 && Date.now() - otherSoundAt > 5000;
  let keepGoingTimer = null;
  function wentToBackground() {
    if (!audio) return;
    const state = (window.MurielCore && window.MurielCore.state) || {};
    // sounding right now, or stopped by the phone itself in the moment before this was reported
    const wasSounding = (!mainPaused() || !!(live && !live.paused) || !!(helper && !helper.el.paused) || Date.now() - lastSystemPauseAt < 1500) && !state.pausedByUser;
    const src = audio.__murielSrc;
    // a song starting: its main player waits, quietly, for live sound or a second player that won't come now
    if (waitingLive || waitingHelper || (fxMuted && !live && !helper)) soundBackToMain(0);
    if (headPlaying()) endLive(0);
    else if ((live || helper) && src) {
      // the main player takes over, where the sound is: it's been playing alongside, quietly, in step
      const position = soundTime();
      const entry = renders.get(`${src}::${signature(current())}`);
      const generation = ++applyGeneration;
      if (swap) { swap = null; clearTimeout(swapTimer); }
      soundBackToMain(0);
      if (entry && (!loaded || sameUrl(loaded.url) !== sameUrl(entry.url))) switchAudio(entry.url, src, position, wasSounding);
      else {
        // only a real difference is put right: a seek is a hiccup
        if (Math.abs(mainTime() - position) > 0.25) { try { nativeTime.set.call(audio, position); } catch (e) {} }
        if (isActive(current())) renderWhole(src, current(), generation, 0);
      }
    } else if (src && !swap && !state.trackLoading && isActive(current()) && !renderFits()) {
      // the main player is already the sound, but the finished version is ready and waiting its turn: now
      const entry = renders.get(`${src}::${signature(current())}`);
      if (entry) { ++applyGeneration; switchAudio(entry.url, src, null, wasSounding); }
    }
    // (a song still starting is left to the app, unless it's ready and only the phone stopped it)
    if (!wasSounding || audio.ended || (state.trackLoading && !(audio.readyState >= 2 && pausedByGoingAway()))) return;
    // an iPhone can pause the player as the app is hidden, more so if it was muted behind the live sound: start it
    // again, for a couple of seconds at most, unless you've paused it yourself meanwhile
    clearInterval(keepGoingTimer);
    let tries = 0;
    const nudge = () => {
      tries += 1;
      if (state.pausedByUser || (state.trackLoading && !(audio.readyState >= 2)) || audio.ended || tries > 8) { clearInterval(keepGoingTimer); return; }
      if (mainPaused()) HTMLMediaElement.prototype.play.call(audio).catch(() => {});
    };
    nudge();
    keepGoingTimer = setInterval(nudge, 250);
  }

  // Covered: the screen may be about to go off (it's covered first), and then iOS stops live sound and pauses a quiet
  // main player, and getting going again is a stop you hear. So the main player takes over now, while that's seamless.
  // Notification Centre or Control Centre only cover the app, though: if it doesn't go to the background, the sound
  // you chose comes back a moment later. (A song's first seconds, still arriving, have nothing to hand over to.)
  let coverTimer = null;
  let coveredAt = 0;
  const justCovered = () => coveredAt > 0 && Date.now() - coveredAt < 800;
  function coveredOver() {
    coveredAt = Date.now();
    if (!audio || headPlaying()) return;
    if (!((live && !live.paused && !live.stopping) || (helper && !helper.el.paused))) return;
    wentToBackground();
    clearTimeout(coverTimer);
    let checks = 0;
    const comeBack = () => {
      checks += 1;
      const state = (window.MurielCore && window.MurielCore.state) || {};
      if (isHidden() || checks > 12 || !audio.__murielSrc || live || helper || swap) return;
      if (state.pausedByUser || state.trackLoading || mainPaused()) { coverTimer = setTimeout(comeBack, 300); return; }
      if (!isActive(current()) || renderFits()) return;
      schedule(0);
    };
    coverTimer = setTimeout(comeBack, 900);
  }
  function renderFits() {
    if (!loaded || !playingRendered()) return false;
    const entry = renders.get(`${loaded.src}::${signature(current())}`);
    return !!entry && sameUrl(entry.url) === sameUrl(loaded.url);
  }

  // ---- the guard: whatever else goes wrong, only one thing is ever sounding ----
  let lastClockFix = 0;
  let clockFixing = false;
  let seekStartedAt = 0;
  let lastJoinMs = null;
  function oneAtATime() {
    if (!audio || !nativeMuted) return;
    if (live && helper && !live.paused && !live.stopping && !swap) { log('guard: live sound and second player together'); endHelper(); }
    const mainAudible = !mainPaused() && !nativeMuted.get.call(audio) && audio.readyState >= 2 && !audio.ended;
    if (!mainAudible) return;
    if (live && !live.paused && !live.stopping) {
      log('guard: main player and live sound together');
      if (live.head) { endLive(20); return; } // the song's own file has taken over: the early part isn't needed
      fxMuted = true;
      nativeMuted.set.call(audio, true);
    } else if (helper && !helper.el.paused && !helper.el.muted && !swap) {
      log('guard: main player and second player together');
      fxMuted = true;
      nativeMuted.set.call(audio, true);
    }
  }
  setInterval(oneAtATime, 100);
  // ---- and a playing song is never left silent ----
  let lastSoundAt = -1;
  let stuckTicks = 0;
  // Headphones or AirPods going away: iOS pauses everything audible at once (but not the main player while it's quiet
  // behind live sound or the second player). Sine used to start the sound again, and it came out of the speaker. So a
  // stop from outside puts everything on hold, silent, while the app works out why: paused for good if it was the
  // headphones (app.js), carried on as before if it was something else. Nothing starts or unmutes during the hold.
  function holdingForOutside() { return outsideHoldAt > 0 && Date.now() - outsideHoldAt < 1500; }
  function outsideStop(what) {
    const state = (window.MurielCore && window.MurielCore.state) || {};
    if (holdingForOutside() || state.pausedByUser || !window.__nocOutsidePause) return;
    outsideHoldAt = Date.now();
    log(`stopped from outside (${what}): on hold`);
    window.__nocOutsidePause(what);
  }
  function stoppedFromOutside() {
    if (live) return !live.paused && !live.stopping && live.ctx.state !== 'running' && !isHidden() && liveTime() < live.buffer.duration - 0.05;
    if (helper) return helper.el.paused && !helper.el.ended && !helper.el.error && !helper.el.__ownPause && !mainPaused();
    return false;
  }
  function checkSound() {
    if (audio && stoppedFromOutside()) outsideStop(live ? 'live sound' : 'second player');
    if (holdingForOutside()) return;
    if (!audio || !fxMuted || swap || mainPaused() || waitingLive || waitingHelper) { stuckTicks = 0; lastSoundAt = -1; return; }
    let ok = false;
    if (live) {
      ok = live.paused || (live.ctx.state === 'running' && liveTime() < live.buffer.duration - 0.05);
      if (ok && isHidden()) ok = false;
    } else if (helper) {
      const t = helper.el.currentTime || 0;
      ok = !helper.el.paused && !helper.el.ended && !helper.el.error;
      if (ok && t === lastSoundAt) { stuckTicks += 1; if (stuckTicks < 3) return; ok = false; } else stuckTicks = 0;
      lastSoundAt = t;
    }
    if (ok) return;
    log(`sound guard: nothing was sounding (${live ? `live ${live.ctx.state}` : helper ? 'helper stopped' : 'no second player'}), back to the main player`);
    soundBackToMain(0);
    if (isActive(current()) && !isHidden()) schedule(600);
  }
  setInterval(checkSound, 300);

  function waitFor(el, event, ms) {
    return new Promise((resolve, reject) => {
      const done = (fn, v) => { clearTimeout(timer); el.removeEventListener(event, ok); el.removeEventListener('error', bad); fn(v); };
      const ok = () => done(resolve, true);
      const bad = () => done(reject, new Error('helper could not load'));
      const timer = setTimeout(() => done(resolve, false), ms);
      el.addEventListener(event, ok);
      el.addEventListener('error', bad);
    });
  }

  // A player that loads a file goes back to its default speed (an iPhone does it once the file has loaded), so the
  // second player played a sped-up song at normal speed. Its default is the song's speed too, and it's set again.
  function keepHelperSpeed(el) {
    const rate = audio.playbackRate || 1;
    try {
      el.defaultPlaybackRate = rate;
      if (Math.abs(el.playbackRate - rate) > 0.001) el.playbackRate = rate;
      if (el.preservesPitch !== audio.preservesPitch) el.preservesPitch = audio.preservesPitch;
      el.webkitPreservesPitch = audio.preservesPitch;
    } catch (e) {}
  }
  async function prepareHelper(url, base, length, temporary) {
    const el = new Audio();
    el.preload = 'auto';
    el.muted = wantMuted;
    el.volume = wantVolume;
    keepHelperSpeed(el);
    ['loadedmetadata', 'canplay', 'playing'].forEach((type) => el.addEventListener(type, () => keepHelperSpeed(el)));
    el.addEventListener('pause', () => { if (helper && helper.el === el && stoppedFromOutside()) outsideStop('second player'); });
    el.src = url;
    const h = { el, url, base, length, temporary };
    try {
      await waitFor(el, 'canplay', 2500);
    } catch (e) { disposeHelper(h); throw e; }
    return h;
  }

  // the helper starts sounding where the main player is; the main player goes quiet the moment it does
  async function startHelper(h, generation) {
    // in the background only the main player is ever heard: a second one would be one more change, and a stop.
    // Nor in the moment after the app is covered: the screen may be going off.
    if (isHidden() || justCovered() || holdingForOutside()) { disposeHelper(h); return false; }
    h.el.currentTime = Math.max(0, mainTime() - h.base + 0.05 * (audio.playbackRate || 1));
    await waitFor(h.el, 'seeked', 500).catch(() => false);
    // paused or moved on while this was getting ready
    if (generation !== applyGeneration || mainPaused()) { disposeHelper(h); return false; }
    try {
      await h.el.play();
    } catch (e) { disposeHelper(h); throw e; }
    if (generation !== applyGeneration || mainPaused() || isHidden() || justCovered()) { disposeHelper(h); return false; }
    const previous = helper;
    helper = h;
    fxMuted = true;
    applyMute();
    disposeHelper(previous);
    setTimeout(() => {
      // some phones stop one player when another starts: go back to the plain way, once and for all
      const state = (window.MurielCore && window.MurielCore.state) || {};
      if (helper === h && !swap && mainPaused() && !state.pausedByUser && state.isPlaying) {
        noOverlap = true;
        log('this phone stops the main player when a second one starts: changes will have a short gap');
        soundBackToMain(0);
        audio.play().catch(() => {});
      }
    }, 400);
    return true;
  }

  function followMain(event) {
    if (swap) return;
    if (event.type === 'playing' && waitingLive) {
      const w = waitingLive;
      waitingLive = null;
      startLive(w.source, mainTime(), current(), { src: w.src, followMain: true, head: w.head }).then((l) => {
        if (!l && !live) { fxMuted = false; applyMute(); }
      }, (e) => {
        log(`live start: ${e && e.message}`);
        fxMuted = false;
        applyMute();
      });
      return;
    }
    if (event.type === 'playing' && waitingHelper) {
      const h = waitingHelper;
      waitingHelper = null;
      startHelper(h, applyGeneration).then((ok) => { if (!ok) { fxMuted = false; applyMute(); } }, (e) => { log(`preview: ${e && e.message}`); fxMuted = false; applyMute(); });
      return;
    }
    if (live) {
      switch (event.type) {
        case 'pause':
          // holds its place: played again from the main player's time
          pauseLive();
          break;
        case 'play':
        case 'playing':
          if (live.paused && !holdingForOutside()) resumeLive();
          break;
        case 'ratechange':
          if (pitchKeptSpeed()) { soundBackToMain(40); schedule(0); break; }
          if (Math.abs((audio.playbackRate || 1) - live.rate) > 0.001) {
            live.offset = liveTime();
            live.t0 = live.ctx.currentTime;
            live.rate = audio.playbackRate || 1;
            live.node.playbackRate.value = live.rate;
          }
          break;
        case 'seeking':
          if (!clockFixing) seekStartedAt = Date.now();
          break;
        case 'seeked':
          // the correction above, not the listener's seek
          if (clockFixing) { clockFixing = false; break; }
          seekStartedAt = 0;
          if (!live.paused && Math.abs(mainTime() - liveTime()) > 0.3) {
            if (mainTime() < live.buffer.duration - 0.2) moveLive(mainTime());
            else soundBackToMain(0);
          }
          break;
        case 'timeupdate':
          // two clocks, and the main player is the silent one: it's the one that moves, so a drift is never heard
          // (never during a seek of yours: a time update arrives just before the seek reports it's done)
          if (!live.paused && !mainPaused() && !audio.seeking && Date.now() - seekStartedAt > 2000 && Math.abs(mainTime() - liveTime()) > 0.7 && Date.now() - lastClockFix > 3000) {
            lastClockFix = Date.now();
            clockFixing = true;
            nativeTime.set.call(audio, liveTime());
          }
          break;
        case 'emptied':
        case 'ended':
          soundBackToMain(0);
          break;
        default:
      }
      return;
    }
    if (!helper) return;
    const el = helper.el;
    switch (event.type) {
      case 'pause':
        el.__ownPause = true;
        el.pause();
        break;
      case 'play':
      case 'playing':
        if (holdingForOutside()) break;
        el.__ownPause = false;
        el.currentTime = Math.max(0, mainTime() - helper.base);
        el.play().catch(() => {});
        break;
      case 'ratechange':
        keepHelperSpeed(el);
        break;
      case 'seeking': {
        const at = mainTime() - helper.base;
        if (at >= 0 && at < helper.length - 2) el.currentTime = at;
        else { soundBackToMain(0); schedule(0); }
        break;
      }
      case 'timeupdate': {
        const at = mainTime() - helper.base;
        if (at > helper.length - 2 && helper.length !== Infinity) { schedule(0); break; }
        // a correction on an iPhone is an audible jump: only for a real drift
        if (!mainPaused() && Math.abs((el.currentTime || 0) - at) > 0.8) el.currentTime = at;
        break;
      }
      case 'emptied':
      case 'ended':
        soundBackToMain(0);
        break;
      default:
    }
  }

  function finishSwap() {
    const state = (window.MurielCore && window.MurielCore.state) || {};
    clearTimeout(swapTimer);
    const keep = swap && swap.keepSound;
    swap = null;
    if (keep) return; // the main player is ready and quiet; the live sound carries on until the render is done
    const h = helper;
    helper = null;
    // Main player in, live sound out, in one step. The fade is only long enough to avoid a click: while both play the
    // sound is doubled, and a long fade is heard as a bump in the song.
    fxMuted = false;
    applyMute();
    endLive(JOIN_FADE_MS);
    setTimeout(() => disposeHelper(h), 40);
    if (state.pausedByUser) HTMLMediaElement.prototype.pause.call(audio);
  }

  // events from the main player while it loads behind the live sound: the app shouldn't think the song stopped.
  // A song that's only now arriving is different: the app is waiting for those very events.
  const SWAP_EVENTS = ['emptied', 'loadstart', 'waiting', 'stalled', 'pause', 'play', 'durationchange', 'timeupdate', 'seeking',
    'seeked', 'canplay', 'canplaythrough', 'loadedmetadata', 'loadeddata', 'playing', 'ratechange', 'suspend', 'progress'];
  function duringSwap(event) {
    if (!swap) return;
    if (!swap.fresh) event.stopImmediatePropagation();
    const state = (window.MurielCore && window.MurielCore.state) || {};
    if (state.pausedByUser && helper) { helper.el.__ownPause = true; helper.el.pause(); }
    if (event.type === 'loadedmetadata') {
      nativeTime.set.call(audio, soundTime() + 0.03);
      // paused while this was loading: it's ready, and stays paused here
      if (live && live.paused) { finishSwap(); return; }
      if (helper) {
        audio.playbackRate = helper.el.playbackRate;
        audio.preservesPitch = helper.el.preservesPitch;
      } else if (live && !swap.fresh) {
        audio.playbackRate = live.rate;
      }
      swap.loaded = true;
      HTMLMediaElement.prototype.play.call(audio).catch(() => {});
    }
    if ((event.type === 'playing' || event.type === 'seeked' || event.type === 'canplay') && swap.loaded && !mainPaused() && !audio.seeking) {
      // lined up to within what can't be heard before the two meet; seeks can land a little off, so that's learned
      const off = mainTime() - soundTime();
      swap.tries = (swap.tries || 0) + 1;
      if (Math.abs(off) > (swap.tries <= 6 ? 0.03 : 0.08) && swap.tries <= 12) {
        swap.bias = clamp((swap.bias || 0) - off, -0.25, 0.25);
        nativeTime.set.call(audio, soundTime() + 0.02 + swap.bias);
        return;
      }
      lastJoinMs = Math.round(off * 1000);
      finishSwap();
    }
  }

  function abortSwap() {
    if (!swap) return;
    log('hand-over took too long');
    swap = null;
    clearTimeout(swapTimer);
    const position = soundTime();
    soundBackToMain(0);
    try { audio.currentTime = position; } catch (e) {}
    const state = (window.MurielCore && window.MurielCore.state) || {};
    if (!state.pausedByUser) audio.play().catch(() => {});
  }

  // The finished audio (or the original song, for url null) goes into the main player without a break in the sound
  async function handOver(url, src, generation) {
    if (audio.__murielSrc !== src || generation !== applyGeneration) return;
    // (the moment after the app is covered counts: the screen may be going off, and nothing new is started then)
    if (mainPaused() || isHidden() || justCovered() || noOverlap) {
      const position = live || helper ? soundTime() : null;
      const state = (window.MurielCore && window.MurielCore.state) || {};
      // (an iPhone can have paused a quiet main player as the app went to the background: that isn't you pausing)
      const play = (!audio.paused && !audio.ended) || ((!!state.isPlaying || (isHidden() && (!!state.trackLoading || pausedByGoingAway()))) && !state.pausedByUser);
      soundBackToMain(0);
      switchAudio(url, src, position, play);
      return;
    }
    if (!live && !helper) {
      let started = false;
      if (liveAllowed()) {
        // the shortest way to have something sounding while the main player reloads
        try {
          const source = await getSource(src);
          if (generation !== applyGeneration) return;
          if (!(await startLive(source, mainTime(), current(), { src, followMain: true }))) {
            // live sound couldn't start (the app went to the background meanwhile, say): straight over, as above,
            // or the finished version would never be heard
            if (generation === applyGeneration && audio.__murielSrc === src) { soundBackToMain(0); switchAudio(url, src, null, !mainPaused()); }
            return;
          }
          started = true;
        } catch (e) { log(`hand-over live: ${e && e.message}`); }
      }
      if (!started) {
        try {
          const target = url || await fileUrlOf(src);
          const h = await prepareHelper(target, 0, Infinity, false);
          started = await startHelper(h, generation);
        } catch (e) { log(`hand-over: ${e && e.message}`); }
      }
      if (!started) {
        if (generation === applyGeneration) switchAudio(url, src);
        return;
      }
    }
    if (audio.__murielSrc !== src || generation !== applyGeneration) return;
    swap = { src };
    swapTimer = setTimeout(abortSwap, 5000);
    if (url) loadRendered(url, src); else loadOriginal(src);
  }

  async function makePreview(src, snapshot, from, generation) {
    const source = await getSource(src);
    if (generation !== applyGeneration) return null;
    const at = from == null ? mainTime() : from;
    const seconds = Math.min(PREVIEW_SECONDS, source.buffer.duration - at);
    if (seconds < 1.5) return null;
    const blob = await toWav(await renderPart(source.buffer, { ...snapshot, levelDb: levelGain(source.loudness) }, source.cutoff, at, seconds));
    if (generation !== applyGeneration) return null;
    const h = await prepareHelper(URL.createObjectURL(blob), at, seconds, true);
    if (generation !== applyGeneration) { disposeHelper(h); return null; }
    h.cutoff = source.cutoff;
    return h;
  }

  // the whole song, behind the live sound, once the changes have stopped
  function renderWhole(src, snapshot, generation, delay) {
    clearTimeout(fullTimer);
    fullTimer = setTimeout(() => {
      withTimeout(queueRender(src, snapshot)).then((entry) => {
        if (generation !== applyGeneration || audio.__murielSrc !== src || !entry) return;
        const go = () => {
          if (generation !== applyGeneration || audio.__murielSrc !== src) return;
          setStatus('done', { cutoff: entry.cutoff });
          if (loaded && sameUrl(loaded.url) === sameUrl(entry.url)) { if ((helper || live) && !swap) soundBackToMain(60); return; }
          handOver(entry.url, src, generation);
        };
        // a hand-over mid-adjustment would be wasted: wait for a pause in the changes. Comparing holds it off too.
        const wait = Math.max(0, lastChangeAt + IDLE_BEFORE_HANDOVER - Date.now());
        const hold = () => { if (comparing) setTimeout(hold, 300); else go(); };
        setTimeout(hold, document.hidden ? 0 : wait);
      }, (e) => {
        if (generation !== applyGeneration || audio.__murielSrc !== src) return;
        if (playingRendered() || helper || live) handOver(null, src, generation);
        reportFailure(e);
      });
    }, delay);
  }

  // Only the first part of the song, for starting it right away. Frame-based files can simply be cut.
  function headOf(bytes) {
    if (bytes.byteLength <= HEAD_BYTES * 1.5) return null;
    const d = new Uint8Array(bytes);
    const adts = d[0] === 0xff && (d[1] & 0xf6) === 0xf0;
    const mp3 = (d[0] === 0xff && (d[1] & 0xe0) === 0xe0) || (d[0] === 0x49 && d[1] === 0x44 && d[2] === 0x33);
    if (!adts && !mp3) return null;
    if (adts) {
      // to the end of the last whole frame
      let p = 0;
      while (p + 7 < d.length) {
        const len = ((d[p + 3] & 3) << 11) | (d[p + 4] << 3) | (d[p + 5] >> 5);
        if (len < 7 || p + len > HEAD_BYTES) break;
        p += len;
      }
      return p > 7 ? bytes.slice(0, p) : null;
    }
    return bytes.slice(0, HEAD_BYTES);
  }

  // start from the song's first part; `bytes` are the whole file, or just what has arrived
  async function decodeHead(bytes, known) {
    const part = known ? bytes : headOf(bytes);
    if (!part) return null;
    const buffer = await decodeSong(part === bytes ? bytes.slice(0) : part);
    return { buffer, cutoff: detectCutoff(buffer), loudness: measureLoudness(buffer) };
  }

  // ---- a song on its way: the first seconds can play before the rest has downloaded ----
  let headFor = null;
  function instantStart() { try { return localStorage.getItem('nocturne_instant') !== '0'; } catch (e) { return true; } }
  globalThis.__murielHead = async (target, bytes) => {
    const core = window.MurielCore;
    const song = core && core.state && core.state.currentTrack;
    if (!song || !audio || !instantStart() || !liveAllowed() || live || audio.__murielSrc || !core.state.trackLoading || core.state.pausedByUser) return;
    if (!(String(target).includes(String(song.id)) || song.url === target)) return;
    const generation = applyGeneration;
    try {
      const source = await decodeHead(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), true);
      if (!source || generation !== applyGeneration || core.state.currentTrack !== song || audio.__murielSrc) return;
      if (live) return; // two downloads of one song both offered a head: the first is already sounding
      headFor = song.id;
      await startLive(source, 0, current(song), { trackId: song.id, head: true });
      window.dispatchEvent(new Event('muriel:fx'));
    } catch (e) { log(`early start: ${e && e.message}`); }
  };

  // what the app reads for a song that is sounding before its file has arrived
  const headPlaying = () => !!(live && live.head && !live.src);
  let headTicker = setInterval(() => {
    if (!headPlaying()) return;
    const state = (window.MurielCore && window.MurielCore.state) || {};
    if (state.pausedByUser) { endLive(40); return; }
    audio.dispatchEvent(new Event('timeupdate'));
  }, 250);

  // the file arrived for a song already sounding: the main player takes up behind it
  function fileArrived(src, snapshot, active) {
    const generation = ++applyGeneration;
    audio.__murielSrc = src;
    live.src = src;
    fxMuted = true;
    applyMute();
    swap = { src, fresh: true, keepSound: active };
    swapTimer = setTimeout(abortSwap, 5000);
    loadOriginal(src);
    if (active) {
      setStatus('preview');
      getSource(src).then((source) => {
        if (generation !== applyGeneration) return;
        extendLive(source);
        renderWhole(src, snapshot, generation, 400);
      }, (e) => { if (generation === applyGeneration) { soundBackToMain(0); reportFailure(e); } });
    } else {
      setStatus('idle');
    }
  }

  // a song is starting: hold play() until there's something to hear, then play that, or the original file if it failed
  function startSong(src) {
    const core = window.MurielCore;
    const song = core && core.state && core.state.currentTrack;
    // Auto EQ needs the song's genre: wait a moment for it if it isn't known yet, then carry on either way
    if (settings.autoEq && song && core.genreFor && !core.genreFor(song) && !document.hidden && !song.__genreAsked) {
      song.__genreAsked = true;
      audio.__murielSrc = src;
      audio.__murielPending = Promise.race([core.lookupGenreFor(song).catch(() => ''), new Promise((r) => setTimeout(r, 800))]).then(() => {
        if (audio.__murielSrc === src) { startSong(src); return audio.__murielPending; }
        return undefined;
      });
      return;
    }
    const snapshot = current();
    const active = isActive(snapshot);
    if (headPlaying() && song && live.trackId === song.id) {
      fileArrived(src, snapshot, active);
      return;
    }
    lastPosition = 0;
    prepared = null;
    starting = null;
    switchingTo = null;
    ++startToken;
    const generation = ++applyGeneration;
    clearTimeout(fullTimer);
    if (swap) { swap = null; clearTimeout(swapTimer); }
    soundBackToMain(0);
    if (!active) {
      // nothing to do for this song after all
      setStatus('idle');
      loadOriginal(src);
      return;
    }
    if (brokenReason || (stalledInBackground && document.hidden)) {
      setStatus('failed', { reason: brokenReason || 'iOS held up processing while the screen was locked' });
      loadOriginal(src);
      return;
    }
    loaded = null;
    audio.__murielSrc = src;
    audio.__murielPending = null;
    const ready = renders.get(`${src}::${signature(snapshot)}`);
    if (ready) {
      // processed ahead of time: nothing to wait for
      loadRendered(ready.url, src);
      setStatus('done', { cutoff: ready.cutoff });
      return;
    }
    setStatus('working');
    const fallback = (e) => {
      if (audio.__murielSrc !== src) return undefined;
      if (e) reportFailure(e);
      loadOriginal(src);
      return audio.__murielPending;
    };
    if (document.hidden || noOverlap) {
      audio.__murielPending = withTimeout(queueRender(src, snapshot)).then((entry) => {
        if (audio.__murielSrc !== src) return undefined;
        if (!entry) return fallback();
        loadRendered(entry.url, src);
        setStatus('done', { cutoff: entry.cutoff });
        return undefined;
      }, fallback);
      return;
    }
    if (pitchKeptSpeed() || !liveAllowed()) {
      audio.__murielPending = withTimeout(makePreview(src, snapshot, 0, generation)).then((h) => {
        if (audio.__murielSrc !== src) { disposeHelper(h); return undefined; }
        // a setting changed meanwhile: skip the preview, but the song still has to load
        if (generation !== applyGeneration) { disposeHelper(h); h = null; }
        if (h) {
          waitingHelper = h;
          fxMuted = true;
          applyMute();
          setStatus('preview', { cutoff: h.cutoff });
        }
        renderWhole(src, current(), applyGeneration, 60);
        loadOriginal(src);
        return audio.__murielPending;
      }, fallback);
      return;
    }
    // the fast way: read the file, decode the first part, go. The rest is decoded and rendered behind it.
    // A setting changed meanwhile must never stop the song from loading: only a newer song may do that.
    const token = ++startToken;
    starting = src;
    const alive = () => audio.__murielSrc === src && token === startToken;
    const started = () => {
      if (token === startToken) starting = null;
      if (signature(current()) !== signature(snapshot)) schedule(0);
    };
    audio.__murielPending = withTimeout((async () => {
      const known = decoded && decoded.src === src ? decoded : null;
      const bytes = known ? null : await step('read', () => readSong(src));
      if (bytes && bytes.byteLength > MAX_FILE_BYTES) throw tooLong();
      const head = known || (bytes ? await step('decode', () => decodeHead(bytes)) : null);
      return { head, bytes };
    })()).then(({ head, bytes }) => {
      if (!alive()) return undefined;
      const whole = getSource(src, true, bytes);
      if (isHidden() || justCovered()) {
        // the screen went off (or may be going off) while this was worked out: there'll be no live sound to wait for,
        // and a quiet main player would be stopped in the background. It plays; the finished version follows.
        whole.then(() => { if (audio.__murielSrc === src) renderWhole(src, current(), applyGeneration, 0); }, (e) => { if (audio.__murielSrc === src) reportFailure(e); });
        loadOriginal(src);
        started();
        return audio.__murielPending;
      }
      if (head) {
        waitingLive = { source: head, src, head: head !== decoded };
        fxMuted = true;
        applyMute();
        setStatus('preview', { cutoff: head.cutoff });
        whole.then((source) => { if (audio.__murielSrc === src) extendLive(source); }).catch(() => {});
        whole.then(() => { if (audio.__murielSrc === src) renderWhole(src, current(), applyGeneration, 200); }, (e) => {
          if (audio.__murielSrc === src) { soundBackToMain(0); reportFailure(e); }
        });
        loadOriginal(src);
        started();
        return audio.__murielPending;
      }
      return whole.then((source) => {
        if (!alive()) return undefined;
        if (isHidden() || justCovered()) {
          renderWhole(src, current(), applyGeneration, 0);
          loadOriginal(src);
          started();
          return audio.__murielPending;
        }
        waitingLive = { source, src };
        fxMuted = true;
        applyMute();
        setStatus('preview', { cutoff: source.cutoff });
        renderWhole(src, current(), applyGeneration, 200);
        loadOriginal(src);
        started();
        return audio.__murielPending;
      });
    }).catch((e) => {
      if (token === startToken) starting = null;
      return fallback(e);
    });
  }

  // the same song, different audio: load it at the position it was at and carry on
  // while the main player reloads it reads 0 until it's put back in place: the app and the lock screen are told
  // where it's going instead, or the lock screen showed 0:00 for a moment each time (locking the phone, for one)
  let switchingTo = null;
  let switchingTimer = null;
  function switchAudio(url, src, at, play) {
    const position = at != null ? at : audio.currentTime || 0;
    const wasPlaying = play != null ? play : !audio.paused && !audio.ended;
    switchingTo = position;
    clearTimeout(switchingTimer);
    switchingTimer = setTimeout(() => { switchingTo = null; }, 4000);
    const resume = () => {
      if (switchingTo === position) switchingTo = null;
      if (audio.__murielSrc !== src) return;
      try { audio.currentTime = position; } catch (e) {}
      // paused while this was loading: it stays paused
      const core = window.MurielCore;
      if (wasPlaying && !(core && core.state && core.state.pausedByUser)) audio.play().catch(() => {});
    };
    audio.addEventListener('loadedmetadata', resume, { once: true });
    if (url) loadRendered(url, src); else loadOriginal(src);
  }

  const playingRendered = () => !!loaded || isRendered(audio.currentSrc);

  // the processed audio won't play from where it was put: try a file instead of a blob, then the original song
  let renderHasPlayed = false;
  let recentRecoveries = [];
  async function recoverPlayback(src) {
    const code = audio.error ? audio.error.code : '?';
    const position = Math.max(audio.currentTime || 0, lastPosition);
    const core = window.MurielCore;
    const state = (core && core.state) || {};
    // a song that failed as it started hasn't begun playing yet, but it was about to
    const play = !!state.isPlaying || !audio.paused || (position === 0 && !state.pausedByUser);
    const entry = renders.get(`${src}::${signature(current())}`);
    log(`processed audio wouldn't play (media error ${code}, from ${useFiles ? 'file' : 'memory'})`);
    if (!useFiles && entry && entry.blob) {
      useFiles = true;
      try {
        entry.url = markRendered(await saveToDisk(entry.blob));
        if (audio.__murielSrc === src) switchAudio(entry.url, src, position, play);
        return;
      } catch (e) {
        useFiles = false;
        log(`couldn't save processed audio: ${e && e.message}`);
      }
    }
    // Processed audio has played on this phone, so this failure is a passing one (memory, a phone call, the file being
    // read back at a loop): put the sound back, instead of turning it off for every song until the app restarts.
    const now = Date.now();
    recentRecoveries = recentRecoveries.filter((at) => now - at < 60000);
    if (renderHasPlayed && recentRecoveries.length < 3) {
      recentRecoveries.push(now);
      if (audio.__murielSrc !== src) return;
      if (entry && entry.blob) {
        try {
          // from wherever it wasn't just playing from
          useFiles = false;
          entry.url = await playableUrl(entry.blob);
          if (audio.__murielSrc === src) switchAudio(entry.url, src, position, play);
          return;
        } catch (e) { log(`couldn't reload processed audio: ${e && e.message}`); }
      }
      switchAudio(null, src, position, play);
      schedule(800);
      return;
    }
    brokenReason = `the phone wouldn't play the processed audio (media error ${code})`;
    // it has worked on this phone before, so this isn't for good: try again in a while
    if (renderHasPlayed) setTimeout(() => { brokenReason = ''; soundCheck(); }, 120000);
    if (audio.__murielSrc !== src) return;
    setStatus('failed', { reason: brokenReason });
    switchAudio(null, src, position, play);
  }

  // the settings changed: bring the playing song in line
  function applyToCurrent() {
    const src = audio && audio.__murielSrc;
    // a song on its way picks the change up as soon as it has loaded
    if (starting && starting === src) return;
    const generation = ++applyGeneration;
    clearTimeout(fullTimer);
    lastChangeAt = Date.now();
    const snapshot = current();
    if (!isActive(snapshot)) {
      setStatus('idle');
      if (src && (playingRendered() || helper || live)) {
        if (live && !swap) attachChain(live, snapshot, live.chain ? live.chain.cutoff : 20000, 0);
        setTimeout(() => handOver(null, src, generation), 300);
      }
      return;
    }
    if (!src) {
      if (headPlaying()) { attachChain(live, snapshot, live.chain.cutoff, levelGain(live.loudness)); return; }
      setStatus(audio && audio.currentSrc ? 'unsupported' : 'waiting');
      return;
    }
    if (!LOCAL.test(src)) { setStatus('unsupported'); return; }
    const ready = renders.get(`${src}::${signature(snapshot)}`);
    if (live && live.src === src) {
      // the moment of truth: nothing reloads, nothing seeks
      attachChain(live, snapshot, live.chain.cutoff, levelGain(live.loudness));
      setStatus(ready ? 'done' : 'preview', { cutoff: live.chain.cutoff });
      if (ready) {
        setTimeout(() => {
          if (generation !== applyGeneration) return;
          if (!loaded || sameUrl(loaded.url) !== sameUrl(ready.url)) handOver(ready.url, src, generation);
          else if (!swap) soundBackToMain(60);
        }, IDLE_BEFORE_HANDOVER);
        return;
      }
      renderWhole(src, snapshot, generation, 900);
      return;
    }
    if (ready) {
      setStatus('done', { cutoff: ready.cutoff });
      if (!loaded || sameUrl(loaded.url) !== sameUrl(ready.url)) handOver(ready.url, src, generation);
      else if (helper && !swap) soundBackToMain(0);
      return;
    }
    setStatus('working');
    if (!mainPaused() && !swap && liveAllowed()) {
      getSource(src).then(async (source) => {
        if (generation !== applyGeneration || mainPaused()) return;
        const fresh = current();
        if (!(await startLive(source, mainTime(), fresh, { src, followMain: true }))) return;
        setStatus('preview', { cutoff: source.cutoff });
      }).catch((e) => {
        if (e && e.code !== 'too-long') log(`live: ${e && e.message}`);
      });
      renderWhole(src, snapshot, generation, 900);
      return;
    }
    if (!mainPaused() && !document.hidden && !noOverlap && !swap) {
      makePreview(src, snapshot, null, generation).then((h) => {
        if (!h) return false;
        return startHelper(h, generation).then((ok) => {
          if (ok && status.kind === 'working') setStatus('preview', { cutoff: h.cutoff });
          return ok;
        });
      }).catch((e) => { if (e && e.code !== 'too-long') log(`preview: ${e && e.message}`); });
    }
    renderWhole(src, snapshot, generation, 700);
  }

  // Hold to hear the song without any of this, let go to have it back. Only live sound can switch this fast.
  async function setCompare(on) {
    comparing = !!on;
    window.dispatchEvent(new Event('muriel:fx'));
    const src = audio && audio.__murielSrc;
    if (on && !live && src && !mainPaused() && liveAllowed() && LOCAL.test(src)) {
      try {
        const source = await getSource(src);
        if (!comparing) return;
        if (!(await startLive(source, mainTime(), current(), { src, followMain: true }))) return;
      } catch (e) { log(`compare: ${e && e.message}`); return; }
    }
    if (!live || !live.chain) return;
    const now = live.ctx.currentTime;
    const a = live.chain.out.gain;
    const b = live.dry.gain;
    a.cancelScheduledValues(now);
    b.cancelScheduledValues(now);
    a.setValueAtTime(a.value, now);
    b.setValueAtTime(b.value, now);
    a.linearRampToValueAtTime(comparing ? 0 : 1, now + 0.03);
    b.linearRampToValueAtTime(comparing ? 1 : 0, now + 0.03);
    if (!comparing && audio.__murielSrc) { lastChangeAt = Date.now(); schedule(400); }
  }

  // an upscaler setting changed
  // the name of the saved profile this sound still is, if it is
  function activeProfileName(s) {
    const state = (window.MurielCore && window.MurielCore.state) || {};
    const p = (state.customPresets || []).find((x) => x.id === state.activePresetId);
    if (!p || !p.fx) return '';
    const a = p.settings;
    const same = (x, y) => Math.abs(num(x) - num(y)) < 0.01;
    if (!same(a.reverb, s.fx.reverb) || !same(a.echo, s.fx.echo) || !same(a.distortion, s.fx.distortion)) return '';
    if (!same(a.eq.low, s.eq.low) || !same(a.eq.mid, s.eq.mid) || !same(a.eq.high, s.eq.high)) return '';
    if (!(a.eqBands || []).every((g, i) => same(g, s.bands[i]))) return '';
    const u = normalize(p.fx);
    if ((u.bassEnh || 0) !== (s.bassEnh || 0) || (u.level && u.levelTarget !== s.levelTarget)) return '';
    if (u.eqOn !== s.eqOn || u.upOn !== s.upOn || u.profile !== s.profile || !!u.level !== !!s.level) return '';
    if (JSON.stringify(u.strengths) !== JSON.stringify(s.strengths) || JSON.stringify(u.tunes) !== JSON.stringify(s.tunes)) return '';
    return p.name;
  }

  function changed(delay) {
    save();
    if (ui) ui.renderAll();
    window.dispatchEvent(new Event('muriel:fx'));
    updateModifiedDot();
    schedule(delay);
  }

  function schedule(delay) {
    lastSignature = signature(current());
    clearTimeout(applyTimer);
    applyTimer = setTimeout(applyToCurrent, delay == null ? 120 : delay);
  }

  // the app changed its audio settings (a slider, a preset, a reset): speed and pitch need no render, the rest does
  function audioSettingsChanged() {
    if (ui) ui.renderAll();
    window.dispatchEvent(new Event('muriel:fx'));
    const sig = signature(current());
    if (sig !== lastSignature) schedule(120);
  }

  // the song should have its sound but is playing without it (a render failed earlier, or was held up): try again
  function soundCheck() {
    if (!audio || !audio.__murielSrc || brokenReason || starting || swap || live || helper) return;
    if (!isActive(current()) || playingRendered() || mainPaused()) return;
    if (status.kind === 'working' || status.kind === 'preview' || status.kind === 'too-long') return;
    schedule(300);
  }

  function updateModifiedDot() {
    const dot = document.getElementById('settings-modified-dot');
    if (dot && window.audioEngine && window.audioEngine.isModified) dot.classList.toggle('hidden', !window.audioEngine.isModified());
  }

  function hookPlayer() {
    const core = window.MurielCore;
    if (!core || !core.audio || audio) return;
    audio = core.audio;
    protoSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    // with both features off this hands every song straight to the normal player
    Object.defineProperty(audio, 'src', {
      configurable: true,
      get() { return protoSrc.get.call(this); },
      set(value) {
        const v = String(value);
        if (headPlaying() && LOCAL.test(v)) { startSong(v); return; }
        // Auto EQ can't tell yet: it has to look up the genre of the song that's starting
        const maybe = settings.autoEq && settings.eqOn;
        if (!(isActive(current()) || maybe) || !LOCAL.test(v)) {
          if (isActive(current())) setStatus('unsupported');
          loaded = null;
          protoSrc.set.call(this, v);
          return;
        }
        startSong(v);
      },
    });
    audio.addEventListener('timeupdate', () => {
      if (audio.currentTime > 0) lastPosition = audio.currentTime;
      prepareNextSong();
    });
    nativeTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    nativePaused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused');
    nativeMuted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    wantMuted = nativeMuted.get.call(audio);
    // while the main player loads behind the helper, the app reads the song as still playing at the helper's place
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() { return switchingTo !== null ? switchingTo : swap || headPlaying() ? soundTime() : nativeTime.get.call(this); },
      set(v) {
        if (swap && helper) helper.el.currentTime = Math.max(0, v - helper.base);
        else if (swap && live) moveLive(v);
        else nativeTime.set.call(this, v);
      },
    });
    // pause and play have to reach the live sound while the main player can't report them itself
    audio.pause = function pause() {
      // the first seconds of a song still arriving: they end here, and the file waits paused when it comes
      if (headPlaying()) endLive(30);
      else if (live && swap) pauseLive();
      return HTMLMediaElement.prototype.pause.call(this);
    };
    audio.play = function play() {
      if (live && swap && live.paused) {
        resumeLive();
        if (!swap.loaded) return Promise.resolve();
      }
      return HTMLMediaElement.prototype.play.call(this);
    };
    Object.defineProperty(audio, 'paused', { configurable: true, get() { if (live && swap && live.paused) return true; return swap || headPlaying() ? false : nativePaused.get.call(this); } });
    Object.defineProperty(audio, 'muted', {
      configurable: true,
      get() { return wantMuted; },
      set(v) { wantMuted = !!v; applyMute(); },
    });
    const nativeVolume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    wantVolume = nativeVolume.get.call(audio);
    Object.defineProperty(audio, 'volume', {
      configurable: true,
      get() { return wantVolume; },
      set(v) { wantVolume = Math.max(0, Math.min(1, Number(v) || 0)); nativeVolume.set.call(audio, wantVolume); applyMute(); },
    });
    ['playing', 'play', 'pause', 'ratechange', 'seeking', 'seeked', 'timeupdate', 'emptied', 'ended'].forEach((type) => audio.addEventListener(type, followMain));
    audio.addEventListener('playing', oneAtATime);
    // (a hand-over behind the live sound shows no 'playing' here, so the clock moving counts too)
    ['playing', 'timeupdate'].forEach((type) => audio.addEventListener(type, () => { if (loaded && !audio.seeking && (nativeTime.get.call(audio) || 0) > 0) renderHasPlayed = true; }));
    // the first touch anywhere is what iOS needs before live sound may ever start
    const unlock = () => {
      try { const ctx = getLiveCtx(); if (ctx.state !== 'running') ctx.resume().then(() => { if (!live) ctx.suspend().catch(() => {}); }, () => {}); else if (!live) ctx.suspend().catch(() => {}); } catch (e) {}
      document.removeEventListener('touchend', unlock, true);
      document.removeEventListener('click', unlock, true);
    };
    document.addEventListener('touchend', unlock, true);
    document.addEventListener('click', unlock, true);
    // iOS stops live sound the moment the app is hidden: the main player has to be audible by then
    document.addEventListener('visibilitychange', () => { if (document.hidden) wentToBackground(); });
    try {
      const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      // Notification Centre, Control Centre or a banner only cover the app: live sound carries on under them. It's
      // the background (the screen locking, another app) where iOS stops it, and the main player takes over then.
      if (capApp && capApp.addListener) {
        capApp.addListener('appStateChange', (s) => { if (s && s.isActive) { appHidden = false; coveredAt = 0; } else coveredOver(); });
        capApp.addListener('pause', () => { appHidden = true; wentToBackground(); });
        capApp.addListener('resume', () => { appHidden = false; });
      }
    } catch (e) {}
    audio.addEventListener('pause', () => {
      const state = (window.MurielCore && window.MurielCore.state) || {};
      if (!state.pausedByUser && !audio.ended) lastSystemPauseAt = Date.now();
    });
    const modalButton = document.getElementById('btn-open-settings');
    // opening the panel gets the song ready, so the first change is as quick as the rest
    if (modalButton) {
      modalButton.addEventListener('click', () => {
        const src = audio.__murielSrc;
        if (src && LOCAL.test(src)) getSource(src).catch(() => {});
      });
    }
    const engine = window.audioEngine;
    if (engine && engine.setAudioSettings) {
      const setAudioSettings = engine.setAudioSettings.bind(engine);
      engine.setAudioSettings = (values) => {
        setAudioSettings(values);
        audioSettingsChanged();
      };
    }
    lastSignature = signature(current());
    if (ui) ui.renderAll();
    if (engine && engine.isModified) {
      const original = engine.isModified.bind(engine);
      engine.isModified = () => original() || isActive(current());
    }
    updateModifiedDot();
    const reset = document.getElementById('btn-reset-audio');
    if (reset) {
      reset.addEventListener('click', () => {
        settings = defaults();
        save();
        audioSettingsChanged();
        schedule(0);
        updateModifiedDot();
      });
    }
    // a finished version that's ready but somehow not the one playing (in the background there's no one to notice)
    setInterval(() => {
      if (status.kind !== 'done' || !audio.__murielSrc || mainPaused() || brokenReason || starting || swap || live || helper || comparing) return;
      const state = (window.MurielCore && window.MurielCore.state) || {};
      if (!state.trackLoading && isActive(current()) && !renderFits()) schedule(300);
    }, 4000);
    // back from a locked screen where rendering stalled: the song playing unprocessed gets its sound back
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (stalledInBackground) {
        stalledInBackground = false;
        if (isActive(current())) applyToCurrent();
        return;
      }
      soundCheck();
    });
    // a song loaded before this ran (the one restored at launch)
    if (isActive(current()) && audio.__murielSrc) applyToCurrent();
    else if (isActive(current())) setStatus('waiting');
  }

  // Runs before the app's own 'error' listener (those are added once the page has loaded), so an unplayable render
  // is sorted out here, instead of the app deciding the song is broken and skipping it.
  const element = document.getElementById('native-audio');
  if (element) {
    SWAP_EVENTS.forEach((type) => element.addEventListener(type, duringSwap));
    element.addEventListener('error', (e) => {
      // a failed load leaves currentSrc empty, so what was loaded has to be remembered
      if (!audio || !loaded || audio.__murielSrc !== loaded.src) return;
      e.stopImmediatePropagation();
      if (swap) { swap = null; clearTimeout(swapTimer); }
      if (helper) { lastPosition = helperTime(); endHelper(); }
      recoverPlayback(loaded.src);
    });
  }

  // ---- the controls ----

  function buildUi() {
    const faders = document.getElementById('pfx-faders');
    const presets = document.getElementById('pfx-presets');
    const profiles = document.getElementById('pfx-profiles');
    const eqSwitch = document.getElementById('pfx-eq-toggle');
    const upSwitch = document.getElementById('pfx-up-toggle');
    const strength = document.getElementById('pfx-strength');
    const strengthVal = document.getElementById('pfx-strength-val');
    const upDetail = document.getElementById('pfx-up-detail');
    const statusEl = document.getElementById('pfx-status');
    const eqCard = document.getElementById('pfx-eq-card');
    const upCard = document.getElementById('pfx-up-card');
    if (!faders || !presets || !profiles) return null;

    // Riff's own controls are hidden with their tabs on phones. They come here, still wired to app.js as before.
    const soundPresets = document.getElementById('presets-container');
    const presetHost = document.getElementById('pfx-sound-presets');
    if (soundPresets && presetHost) presetHost.appendChild(soundPresets);
    const eqRows = document.getElementById('pfx-eq-rows');
    if (eqRows) document.querySelectorAll('[data-audio-panel="eq"] > .eq-row').forEach((row) => eqRows.appendChild(row));
    const effects = document.querySelector('[data-audio-panel="effects"]');
    const effectsSpot = document.getElementById('pfx-effects-spot');
    if (effects && effectsSpot) effectsSpot.replaceWith(...effects.children);
    const savePreset = document.getElementById('pfx-save-preset');
    if (savePreset) savePreset.addEventListener('click', () => { const b = document.getElementById('btn-save-preset-dialog'); if (b) b.click(); });
    const editProfiles = document.getElementById('pfx-edit-profiles');
    const soundCard = document.getElementById('pfx-sound-card');
    if (editProfiles && soundCard) {
      const editing = (on) => { soundCard.classList.toggle('pfx-editing', on); editProfiles.textContent = on ? 'Done' : 'Edit'; };
      editProfiles.addEventListener('click', () => editing(!soundCard.classList.contains('pfx-editing')));
      const refresh = () => {
        const any = !!document.querySelector('#presets-container .preset-chip[data-is-custom="true"]');
        editProfiles.hidden = !any;
        if (!any) editing(false);
      };
      window.addEventListener('muriel:presets', refresh);
      refresh();
    }

    // Riff's 10 band sliders stay as they are, out of sight: rotated native sliders are unproven under a finger on
    // an iPhone. These bars move them, so app.js keeps handling the values, presets and saving.
    const bandInput = (i) => {
      const box = document.getElementById('eq-bands');
      return box ? box.querySelectorAll('.eq-band-range')[i] : null;
    };
    const setBand = (i, value) => {
      const input = bandInput(i);
      if (!input) return;
      const v = clamp(Math.round(value), -12, 12);
      if (!settings.eqOn) { settings.eqOn = true; changed(450); }
      if (input.value === String(v)) return;
      input.value = String(v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const faderEls = EQ_BANDS.map((band, i) => {
      const el = document.createElement('div');
      el.className = 'pfx-fader';
      el.tabIndex = 0;
      el.setAttribute('role', 'slider');
      el.setAttribute('aria-label', `${band.label} hertz`);
      el.setAttribute('aria-valuemin', '-12');
      el.setAttribute('aria-valuemax', '12');
      el.innerHTML = '<span class="pfx-fader-val"></span><span class="pfx-fader-track"><span class="pfx-fader-fill"></span><span class="pfx-fader-thumb"></span></span>'
        + `<span class="pfx-fader-freq">${band.label}</span>`;
      el.addEventListener('keydown', (e) => {
        const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        setBand(i, current().bands[i] + step);
      });
      faders.appendChild(el);
      return el;
    });

    // One finger on the bars: up and down moves that bar, anywhere in its column. Starting sideways draws a curve
    // across the bars. Which of the two is decided by the first few pixels, so a drifting finger stays on its bar.
    const SNAP = 0.7;
    const barGain = (y) => {
      const r = faderEls[0].querySelector('.pfx-fader-track').getBoundingClientRect();
      const g = clamp(12 - ((y - r.top) / r.height) * 24, -12, 12);
      return Math.abs(g) < SNAP ? 0 : g;
    };
    const barIndex = (x) => {
      const r = faders.getBoundingClientRect();
      return clamp(Math.floor(((x - r.left) / r.width) * EQ_BANDS.length), 0, EQ_BANDS.length - 1);
    };
    let finger = null;
    let lastBarTap = { bar: -1, at: 0 };
    const mark = (i) => faderEls.forEach((el, k) => el.classList.toggle('dragging', k === i));
    faders.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const bar = barIndex(e.clientX);
      faderEls[bar].focus({ preventScroll: true });
      try { faders.setPointerCapture(e.pointerId); } catch (err) {}
      const now = Date.now();
      if (lastBarTap.bar === bar && now - lastBarTap.at < 320) {
        lastBarTap = { bar: -1, at: 0 };
        finger = null;
        setBand(bar, 0);
        return;
      }
      lastBarTap = { bar, at: now };
      finger = { bar, x: e.clientX, y: e.clientY, mode: null, lastBar: bar };
      mark(bar);
      setBand(bar, barGain(e.clientY));
    });
    faders.addEventListener('pointermove', (e) => {
      if (!finger) return;
      if (!finger.mode) {
        const dx = Math.abs(e.clientX - finger.x);
        const dy = Math.abs(e.clientY - finger.y);
        if (dx < 10 && dy < 10) return;
        finger.mode = dx > dy * 1.2 ? 'sweep' : 'single';
      }
      if (finger.mode === 'single') { setBand(finger.bar, barGain(e.clientY)); return; }
      const bar = barIndex(e.clientX);
      const g = barGain(e.clientY);
      const step = bar >= finger.lastBar ? 1 : -1;
      for (let i = finger.lastBar; i !== bar + step; i += step) setBand(i, g);
      finger.lastBar = bar;
      mark(bar);
    });
    const lift = () => { finger = null; mark(-1); };
    faders.addEventListener('pointerup', lift);
    faders.addEventListener('pointercancel', lift);

    // the sound the equalizer makes, as one curve through the bars
    const curve = document.createElement('canvas');
    curve.id = 'pfx-curve';
    curve.className = 'pfx-curve';
    faders.appendChild(curve);
    let curveRaf = 0;
    const measureCtx = new OfflineAudioContext(1, 1, 44100);
    const POINTS = 96;
    const freqs = new Float32Array(POINTS).map((_, i) => 24 * Math.pow(2, (i / (POINTS - 1)) * 9.7));
    const makeFilters = (s) => [
      ['lowshelf', 200, 1, s.eq.low], ['peaking', 1000, 0.9, s.eq.mid], ['highshelf', 4000, 1, s.eq.high],
      ...EQ_BANDS.map((b, i) => ['peaking', b.f, 1.1, s.bands[i]]),
    ].filter((f) => f[3] !== 0).map(([type, f, q, g]) => {
      const n = measureCtx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      n.gain.value = g;
      return n;
    });
    function drawCurve() {
      curveRaf = 0;
      const track = faderEls[0].querySelector('.pfx-fader-track');
      const box = faders.getBoundingClientRect();
      const t = track.getBoundingClientRect();
      if (!box.width || !t.height) return;
      curve.style.top = `${t.top - box.top}px`;
      curve.style.height = `${t.height}px`;
      const dpr = window.devicePixelRatio || 1;
      const w = box.width;
      const h = t.height;
      if (curve.width !== Math.round(w * dpr)) { curve.width = Math.round(w * dpr); curve.height = Math.round(h * dpr); }
      const ctx = curve.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = current();
      const on = s.eqOn;
      const total = new Float32Array(POINTS);
      const mag = new Float32Array(POINTS);
      const phase = new Float32Array(POINTS);
      makeFilters(s).forEach((n) => {
        n.getFrequencyResponse(freqs, mag, phase);
        for (let i = 0; i < POINTS; i++) total[i] += 20 * Math.log10(Math.max(1e-4, mag[i]));
      });
      curve.dataset.peak = String(total.reduce((m, v) => Math.max(m, Math.abs(v)), 0));
      const col = w / EQ_BANDS.length;
      // bars sit an octave apart: 32 Hz under the first, 16 kHz under the last
      const xOf = (f) => col / 2 + (Math.log2(f / 32) / 9) * (w - col);
      const yOf = (db) => h / 2 - (Math.max(-18, Math.min(18, db)) / 18) * (h / 2 - 4);
      const css = getComputedStyle(document.documentElement);
      ctx.beginPath();
      for (let i = 0; i < POINTS; i++) { const x = xOf(freqs[i]); const y = yOf(total[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css.getPropertyValue('--md-sys-color-primary').trim() || '#fff';
      ctx.globalAlpha = on ? 0.9 : 0.3;
      ctx.stroke();
      ctx.lineTo(xOf(freqs[POINTS - 1]), h / 2);
      ctx.lineTo(xOf(freqs[0]), h / 2);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = on ? 0.12 : 0.04;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const requestCurve = () => { if (!curveRaf) curveRaf = requestAnimationFrame(drawCurve); };
    const modal = document.getElementById('audio-settings-modal');
    if (modal) new MutationObserver(requestCurve).observe(modal, { attributes: true, attributeFilter: ['class'] });
    const scrollerEl = document.querySelector('.audio-settings-body');
    if (scrollerEl) scrollerEl.addEventListener('scroll', requestCurve, { passive: true });

    const presetEls = EQ_PRESETS.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn tempo-preset-chip';
      b.textContent = p.name;
      b.addEventListener('click', () => {
        if (!settings.eqOn) { settings.eqOn = true; save(); }
        p.gains.forEach((g, i) => setBand(i, g));
        if (ui) ui.renderAll();
      });
      presets.appendChild(b);
      return { p, b };
    });

    const profileEls = UP_PROFILES.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pfx-profile';
      b.setAttribute('role', 'radio');
      b.innerHTML = `<span class="pfx-profile-name">${p.name}</span><span class="pfx-profile-desc">${p.desc}</span>`;
      b.addEventListener('click', () => {
        settings.profile = p.id;
        settings.upOn = true;
        changed(150);
      });
      // the moods get their own heading
      if (p.mood && !profiles.querySelector('.pfx-profiles-head')) {
        const head = document.createElement('span');
        head.className = 'pfx-profiles-head';
        head.textContent = 'Moods';
        profiles.appendChild(head);
      }
      profiles.appendChild(b);
      return { p, b };
    });

    const strengthWrap = document.getElementById('pfx-strength-wrap');
    const tuneWrap = document.getElementById('pfx-tunes');
    const tuneInputs = RIFF_TUNES.map((key) => {
      const input = document.getElementById(`pfx-tune-${key}`);
      const value = document.getElementById(`pfx-tune-${key}-val`);
      if (input) {
        input.addEventListener('input', () => {
          const p = UP_PROFILES.find((x) => x.id === settings.profile);
          if (!p.riff) return;
          settings.tunes[p.id][key] = clamp(parseInt(input.value, 10) || 0, -50, 50);
          settings.upOn = true;
          changed(120);
        });
      }
      return { key, input, value };
    });
    const levelSwitch = document.getElementById('pfx-level-toggle');
    const autoSwitch = document.getElementById('pfx-auto-toggle');
    const levelChoice = document.getElementById('pfx-level-target');
    if (levelChoice) levelChoice.addEventListener('click', (e) => {
      const b = e.target.closest('[data-level]');
      if (!b) return;
      settings.levelTarget = b.dataset.level;
      changed(120);
    });
    const bassEnh = document.getElementById('pfx-bass-enh');
    const bassEnhVal = document.getElementById('pfx-bass-enh-val');
    if (bassEnh) bassEnh.addEventListener('input', () => {
      settings.bassEnh = clamp(parseInt(bassEnh.value, 10) || 0, 0, 100);
      changed(120);
    });
    if (levelSwitch) levelSwitch.addEventListener('click', () => { settings.level = !settings.level; changed(100); });
    if (autoSwitch) {
      autoSwitch.addEventListener('click', () => {
        settings.autoEq = !settings.autoEq;
        const core = window.MurielCore;
        const t = core && core.state && core.state.currentTrack;
        if (settings.autoEq && t && core.lookupGenreFor && !core.genreFor(t)) core.lookupGenreFor(t).then(() => { changed(0); }, () => {});
        changed(100);
      });
    }
    if (eqSwitch) eqSwitch.addEventListener('click', () => { settings.eqOn = !settings.eqOn; changed(100); });
    if (upSwitch) upSwitch.addEventListener('click', () => { settings.upOn = !settings.upOn; changed(100); });
    if (strength) {
      strength.addEventListener('input', () => {
        if (UP_PROFILES.find((p) => p.id === settings.profile).riff) return;
        settings.strengths[settings.profile] = clamp(parseInt(strength.value, 10) || 0, 0, 100);
        settings.upOn = true;
        changed(500);
      });
    }

    const renderStatus = () => {
      const messages = {
        idle: 'All off. Songs play as they are.',
        waiting: 'On. It will apply when a song plays.',
        working: 'Applying…',
        preview: 'On. Finishing the rest of this song…',
        done: 'On and applied to this song.',
        'too-long': 'Not applied: this song is too long to process on a phone, so the original is playing.',
        failed: `Not applied: the original is playing.${status.reason ? ` (${status.reason})` : ''}`,
        unsupported: 'Not applied: this stream can’t be processed, so the original is playing.',
      };
      if (statusEl) {
        statusEl.textContent = messages[status.kind] || '';
        statusEl.dataset.kind = status.kind;
      }
      if (upDetail) {
        const p = UP_PROFILES.find((x) => x.id === settings.profile);
        let text = '';
        if (settings.upOn && p && p.air >= 0.25 && status.kind === 'done' && status.cutoff) {
          const khz = (status.cutoff / 1000).toFixed(status.cutoff < 10000 ? 1 : 0);
          text = status.cutoff < 19000
            ? `This file’s highs stop near ${khz} kHz. New detail is being added above that.`
            : 'This file already reaches the top of the range, so only a little air is being added.';
        }
        upDetail.textContent = text;
        upDetail.hidden = !text;
      }
    };

    const renderAll = () => {
      const now = current();
      if (eqSwitch) { eqSwitch.classList.toggle('active', settings.eqOn); eqSwitch.setAttribute('aria-pressed', String(settings.eqOn)); }
      if (upSwitch) { upSwitch.classList.toggle('active', settings.upOn); upSwitch.setAttribute('aria-pressed', String(settings.upOn)); }
      if (levelSwitch) levelSwitch.classList.toggle('active', settings.level);
      if (levelChoice) {
        levelChoice.hidden = !settings.level;
        levelChoice.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('active', b.dataset.level === settings.levelTarget));
      }
      if (bassEnh && bassEnh.value !== String(settings.bassEnh)) bassEnh.value = String(settings.bassEnh);
      if (bassEnhVal) bassEnhVal.textContent = settings.bassEnh ? `${settings.bassEnh}%` : 'Off';
      if (autoSwitch) autoSwitch.classList.toggle('active', settings.autoEq);
      const autoNote = document.getElementById('pfx-auto-note');
      if (autoNote) {
        const manual = now.eq.low || now.eq.mid || now.eq.high || (!now.autoFrom && now.bands.some((g) => g !== 0));
        autoNote.textContent = !settings.autoEq ? 'Picks an equalizer preset for each song’s genre, while the bars are flat'
          : manual ? 'Your own equalizer settings are on, so they’re used instead'
            : now.autoFrom ? `${now.genre}: using ${now.autoFrom}` : now.genre ? `${now.genre}: left as it is` : 'Waiting for a song’s genre';
      }
      if (eqCard) eqCard.classList.toggle('is-off', !settings.eqOn);
      if (upCard) upCard.classList.toggle('is-off', !settings.upOn);
      faderEls.forEach((el, i) => {
        const g = Math.round(now.bands[i]);
        el.style.setProperty('--v', String(now.bands[i] / 12));
        el.setAttribute('aria-valuenow', String(g));
        el.querySelector('.pfx-fader-val').textContent = `${g > 0 ? '+' : ''}${g}`;
      });
      presetEls.forEach(({ p, b }) => {
        b.classList.toggle('active', settings.eqOn && p.gains.every((g, i) => g === now.bands[i]));
      });
      requestCurve();
      profileEls.forEach(({ p, b }) => {
        const on = p.id === settings.profile;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
      });
      if (strength) {
        const v = String(settings.strengths[settings.profile] == null ? 70 : settings.strengths[settings.profile]);
        if (strength.value !== v) strength.value = v;
      }
      const chosen = UP_PROFILES.find((x) => x.id === settings.profile);
      if (strengthWrap) strengthWrap.hidden = !!chosen.riff;
      if (tuneWrap) tuneWrap.hidden = !chosen.riff;
      if (chosen.riff) {
        tuneInputs.forEach(({ key, input, value }) => {
          const v = settings.tunes[chosen.id][key];
          if (input && input.value !== String(v)) input.value = String(v);
          if (value) value.textContent = `${v > 0 ? '+' : ''}${v}%`;
        });
      } else if (strengthVal) strengthVal.textContent = `${settings.strengths[settings.profile]}%`;
      renderStatus();
    };

    return { renderAll, renderStatus };
  }

  function start() {
    if (!document.documentElement.classList.contains('is-mobile') && !document.documentElement.classList.contains('is-desktop')) return;
    load();
    ui = buildUi();
    if (ui) ui.renderAll();
    if (window.MurielCore) hookPlayer();
    else window.addEventListener('muriel:ready', hookPlayer, { once: true });
  }

  window.MurielPhoneFx = {
    EQ_BANDS, EQ_PRESETS, UP_PROFILES, defaults, normalize, compose, isActive, signature, detectCutoff, render, renderPart, toWav,
    current: () => current(),
    fmp4ToAdts, isFragmentedMp4, readSong, toWav,
    isPlayingRendered: () => !!audio && isRendered(audio.currentSrc),
    // a song on loop just went back to its start
    songRestarted: () => soundCheck(),
    stopKeepingGoing: () => { clearInterval(keepGoingTimer); otherSoundAt = Date.now(); },
    // the app, on a stop from outside: hold everything while it works out why, and let go once it knows
    holdForOutside: () => { if (!holdingForOutside()) outsideHoldAt = Date.now(); },
    releaseOutsideHold: () => { outsideHoldAt = 0; },
    isSwapping: () => !!swap,
    // the player won't get going: load the same song again, where it was
    reloadInPlace(at) {
      if (!audio) return false;
      const src = audio.__murielSrc;
      log('player would not start again: reloading it in place');
      if (src) {
        soundBackToMain(0);
        switchAudio(loaded ? loaded.url : null, src, at, true);
        return true;
      }
      const position = at;
      audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = position; } catch (e) {} audio.play().catch(() => {}); }, { once: true });
      audio.load();
      return true;
    },
    getStatus: () => status,
    // a new song is being picked: nothing of the last one should keep sounding
    songChanging() {
      if (!audio) return;
      ++applyGeneration;
      ++startToken;
      starting = null;
      clearTimeout(fullTimer);
      if (swap) { swap = null; clearTimeout(swapTimer); }
      soundBackToMain(0);
    },
    isSoundingEarly: headPlaying,
    spectrumFor,
    spectrumOfBuffer,
    eqGainAt,
    isLiveSounding: () => !!live,
    setCompare,
    isComparing: () => comparing,
    debugSound: () => ({ lastJoinMs, renderFits: renderFits(), helperRate: helper ? helper.el.playbackRate : null, liveRate: live ? live.rate : null, renderKept: !!loaded && [...renders.values()].some((e) => sameUrl(e.url) === sameUrl(loaded.url)), renderCount: renders.size, broken: brokenReason, liveWet: live && live.chain ? live.chain.out.gain.value : 0, liveDryGain: live ? live.dry.gain.value : 0, liveMaster: live ? live.master.gain.value : 0, liveStarted: live ? live.ctx.currentTime >= live.t0 : false, liveSrc: live ? live.src : null, silenceKeeper: !!(silence && !silence.paused), live: !!live, livePaused: !!(live && live.paused), liveState: live ? live.ctx.state : '', liveTime: live ? liveTime() : 0, head: live ? live.head : false, helper: !!helper, swap: !!swap, fxMuted, wantMuted, liveOut: live ? live.master : null, liveLevelDb: live && live.chain ? live.chain.levelDb : 0, ctx: liveCtx, generation: applyGeneration }),
    // the song's shape for the seek bar, kept per song so it needs working out only once
    async peaksFor(src, id, count) {
      const key = `muriel_wave_${id}`;
      try {
        const saved = localStorage.getItem(key);
        if (saved) return Array.from(saved, (c) => (c.charCodeAt(0) - 48) / 64);
      } catch (e) {}
      if (!LOCAL.test(String(src))) return null;
      const source = await getSource(src);
      const out = wavePeaks(source.buffer, count);
      try {
        const order = JSON.parse(localStorage.getItem('muriel_wave_list') || '[]');
        order.push(key);
        while (order.length > 150) localStorage.removeItem(order.shift());
        localStorage.setItem('muriel_wave_list', JSON.stringify(order));
        localStorage.setItem(key, out.map((v) => String.fromCharCode(48 + Math.round(v * 64))).join(''));
      } catch (e) {}
      return out;
    },
    measureLoudness,
    // what's shaping the sound right now, in words
    describe() {
      const s = current();
      const named = activeProfileName(s);
      if (named) return [named];
      const out = [];
      if (eqAudible(s)) {
        const preset = EQ_PRESETS.find((p) => p.gains.every((g, i) => g === s.bands[i]));
        const rowsFlat = s.eq.low === 0 && s.eq.mid === 0 && s.eq.high === 0;
        out.push(s.autoFrom ? `Auto EQ: ${s.autoFrom}` : preset && rowsFlat ? preset.name : 'Custom EQ');
      }
      if (upAudible(s)) out.push(UP_PROFILES.find((p) => p.id === s.profile).name);
      if (s.fx.distortion > 0) out.push('Distortion');
      if (s.fx.echo > 0) out.push('Echo');
      if (s.fx.reverb > 0) out.push('Reverb');
      if (s.bassEnh > 0) out.push('Bass enhancer');
      if (s.level) out.push('Even volume');
      return out;
    },
    getSettings: () => settings,
    // a saved sound profile: everything on this panel that isn't in the app's own settings
    applyProfile(fx) {
      settings = normalize(JSON.parse(JSON.stringify(fx)));
      changed(0);
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
