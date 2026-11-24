// Streaming quality: which version of a song gets downloaded, and how this phone keeps it.
// YouTube's best free stereo stream is Opus at about 160 kbps. iPhones can't open the WebM file it comes in, but they
// do play Opus from Apple's own CAF container, so the audio packets are moved into one, bit for bit, with no re-encoding.
(function () {
  'use strict';
  const PROBE = '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';
  const TIERS = {
    veryhigh: { name: 'Very high', opusTag: 251, codec: 'Opus', kbps: 160, mbPerMin: 1.2 },
    high: { name: 'High', codec: 'AAC', kbps: 128, mbPerMin: 1 },
    medium: { name: 'Medium', opusTag: 250, codec: 'Opus', kbps: 70, mbPerMin: 0.5 },
    low: { name: 'Low', codec: 'AAC', kbps: 48, mbPerMin: 0.35 },
  };
  const KEY = 'nocturne_quality';
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  const log = (m) => { try { if (window.MurielLog) window.MurielLog.add('info', `quality: ${m}`); } catch (e) {} };

  const tier = () => { const t = read(KEY); return TIERS[t] ? t : 'veryhigh'; };

  // ---- WebM to packets ----
  const IDS = { SEGMENT: 0x18538067, TRACKS: 0x1654ae6b, ENTRY: 0xae, NUMBER: 0xd7, CODEC: 0x86, PRIVATE: 0x63a2, CLUSTER: 0x1f43b675, SIMPLE: 0xa3, GROUP: 0xa0, BLOCK: 0xa1 };
  function vint(d, p, keepMarker) {
    if (p >= d.length) return null;
    const first = d[p];
    let len = 1;
    let mask = 0x80;
    while (len <= 8 && !(first & mask)) { len += 1; mask >>= 1; }
    if (len > 8 || p + len > d.length) return null;
    let v = keepMarker ? first : first & (mask - 1);
    let allOnes = (first & (mask - 1)) === mask - 1;
    for (let i = 1; i < len; i += 1) { v = v * 256 + d[p + i]; if (d[p + i] !== 0xff) allOnes = false; }
    return { v, len, unknown: allOnes };
  }
  // A cut-off file is fine: whatever is complete comes back
  function demux(d) {
    const out = { packets: [], channels: 2, preSkip: 0, track: null };
    let wanted = null;
    const walk = (start, end) => {
      let p = start;
      while (p < end) {
        const id = vint(d, p, true);
        if (!id) return;
        const size = vint(d, p + id.len);
        if (!size) return;
        const body = p + id.len + size.len;
        const stop = size.unknown ? end : body + size.v;
        switch (id.v) {
          case IDS.SEGMENT: case IDS.TRACKS: case IDS.CLUSTER: case IDS.GROUP:
            walk(body, Math.min(stop, end));
            break;
          case IDS.ENTRY: {
            const entry = {};
            let q = body;
            while (q < Math.min(stop, end)) {
              const i2 = vint(d, q, true);
              if (!i2) break;
              const s2 = vint(d, q + i2.len);
              if (!s2) break;
              const b2 = q + i2.len + s2.len;
              if (i2.v === IDS.NUMBER) { entry.number = 0; for (let i = 0; i < s2.v; i += 1) entry.number = entry.number * 256 + d[b2 + i]; }
              if (i2.v === IDS.CODEC) entry.codec = String.fromCharCode(...d.subarray(b2, b2 + s2.v));
              if (i2.v === IDS.PRIVATE) entry.priv = d.subarray(b2, b2 + s2.v);
              q = b2 + s2.v;
            }
            if (entry.codec === 'A_OPUS' && wanted == null) {
              wanted = entry.number;
              out.track = entry.number;
              if (entry.priv && entry.priv.length >= 12) { out.channels = entry.priv[9]; out.preSkip = entry.priv[10] | (entry.priv[11] << 8); }
            }
            break;
          }
          case IDS.SIMPLE: case IDS.BLOCK: {
            if (stop > d.length) return;
            const t = vint(d, body);
            if (!t) return;
            if (t.v === wanted) {
              if (d[body + t.len + 2] & 0x06) throw new Error('laced blocks');
              out.packets.push(d.subarray(body + t.len + 3, stop));
            }
            break;
          }
          default:
        }
        if (stop <= p) return;
        p = stop;
      }
    };
    walk(0, d.length);
    if (wanted == null || !out.packets.length) throw new Error('no Opus audio in this file');
    return out;
  }

  // samples at 48 kHz in one Opus packet (RFC 6716, section 3.1)
  function packetSamples(b) {
    const config = b[0] >> 3;
    const code = b[0] & 3;
    const frames = code === 0 ? 1 : code === 3 ? b[1] & 0x3f : 2;
    let size;
    if (config < 12) size = [480, 960, 1920, 2880][config & 3];
    else if (config < 16) size = [480, 960][config & 1];
    else size = [120, 240, 480, 960][config & 3];
    return frames * size;
  }

  // ---- packets to CAF (Apple's Core Audio Format) ----
  function toCaf(demuxed) {
    const { packets, channels, preSkip } = demuxed;
    const samples = packets.map(packetSamples);
    const uniform = samples.every((s) => s === samples[0]);
    const total = samples.reduce((a, b) => a + b, 0);
    const varint = (v, out) => {
      const bytes = [];
      do { bytes.unshift(v % 128); v = Math.floor(v / 128); } while (v > 0);
      for (let i = 0; i < bytes.length; i += 1) out.push(i < bytes.length - 1 ? bytes[i] | 0x80 : bytes[i]);
    };
    const table = [];
    packets.forEach((pk, i) => { if (!uniform) varint(samples[i], table); varint(pk.length, table); });
    const audioBytes = packets.reduce((a, b) => a + b.length, 0);
    const size = 8 + (12 + 32) + (12 + 12) + (12 + 24 + table.length) + (12 + 4 + audioBytes);
    const out = new Uint8Array(size);
    const v = new DataView(out.buffer);
    let p = 0;
    const tag = (s) => { for (let i = 0; i < 4; i += 1) out[p + i] = s.charCodeAt(i); p += 4; };
    const u32 = (n) => { v.setUint32(p, n >>> 0); p += 4; };
    const u64 = (n) => { v.setUint32(p, Math.floor(n / 4294967296)); v.setUint32(p + 4, n >>> 0); p += 8; };
    tag('caff'); v.setUint16(p, 1); v.setUint16(p + 2, 0); p += 4;
    tag('desc'); u64(32); v.setFloat64(p, 48000); p += 8; tag('opus'); u32(0); u32(0); u32(uniform ? samples[0] : 0); u32(channels); u32(0);
    tag('chan'); u64(12); u32(channels === 1 ? (100 << 16) | 1 : (101 << 16) | 2); u32(0); u32(0);
    tag('pakt'); u64(24 + table.length); u64(packets.length); u64(Math.max(0, total - preSkip)); u32(preSkip); u32(0);
    out.set(table, p); p += table.length;
    tag('data'); u64(4 + audioBytes); u32(0);
    packets.forEach((pk) => { out.set(pk, p); p += pk.length; });
    return out;
  }
  const webmToCaf = (bytes) => toCaf(demux(bytes));

  // ---- what this phone can do ----
  let wrapWith = null;
  const BAD = 'nocturne_opus_bad';
  const CAN = 'nocturne_opus_can';
  const stamp = () => navigator.userAgent;
  function bytesOf(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) u[i] = s.charCodeAt(i); return u; }
  async function decodes(bytes) {
    const ctx = new OfflineAudioContext(2, 1, 48000);
    const buf = await ctx.decodeAudioData(bytes.slice().buffer);
    const c = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < c.length; i += 16) peak = Math.max(peak, Math.abs(c[i]));
    return buf.duration > 0.2 && peak > 0.001;
  }
  function elementOpens(bytes, type) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      const a = new Audio();
      const done = (r) => { clearTimeout(timer); a.onloadedmetadata = null; a.onerror = null; try { a.removeAttribute('src'); a.load(); } catch (e) {} URL.revokeObjectURL(url); resolve(r); };
      // iOS may not load anything before the first touch: no answer isn't a no
      const timer = setTimeout(() => done('unknown'), 1000);
      a.preload = 'metadata';
      a.onloadedmetadata = () => done('yes');
      a.onerror = () => done('no');
      a.src = url;
    });
  }
  async function works(bytes, type) {
    try { if (!(await decodes(bytes))) return false; } catch (e) { return false; }
    return (await elementOpens(bytes, type)) !== 'no';
  }
  async function probe() {
    if (globalThis.__murielPlaysOpus) { wrapWith = 'webm'; return; } // Android
    if (read(BAD) === stamp()) { log('Opus switched off after a song failed to play'); return; }
    const known = read(CAN);
    if (known) {
      try { const k = JSON.parse(known); if (k.ua === stamp() && (k.wrap === 'caf' || k.wrap === 'webm')) { wrapWith = k.wrap; return; } } catch (e) {}
    }
    const webm = bytesOf(PROBE);
    if (await works(webmToCaf(webm), 'audio/x-caf')) wrapWith = 'caf';
    else if (await works(webm, 'audio/webm')) wrapWith = 'webm';
    log(`this phone keeps Opus as: ${wrapWith || 'nothing (AAC only)'}`);
    if (wrapWith) write(CAN, JSON.stringify({ ua: stamp(), wrap: wrapWith }));
  }

  // the bytes as they get saved on this phone
  function wrap(bytes) {
    if (wrapWith === 'caf') return { bytes: webmToCaf(bytes), ext: 'caf' };
    return { bytes, ext: 'webm' };
  }

  // ---- which version of the song ----
  function plan(n) {
    const f = n && n.formats;
    if (!f) return n && n.opus && wrapWith ? { opus: n.opus } : {};
    const t = tier();
    const best = f.hls234 || f.hls233;
    const small = f.hls233 || f.hls234;
    if (t === 'low') return { hls: small };
    const tag = TIERS[t].opusTag;
    if (tag && wrapWith && f[tag]) return { opus: f[tag] };
    return { hls: best };
  }

  // The same recording, from the label's own master, not a video or someone's re-upload. Only an exact match counts:
  // same length, same title, same artist, and the same version.
  const VERSION = /\b(live|remix|acoustic|karaoke|cover|instrumental|sped[ -]?up|slowed|reverb|nightcore|demo|edit|mix|version|extended|8d|remaster(?:ed)?|radio|session|bass boosted?)\b/g;
  const plain = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const NOISE = /[([][^)\]]*\b(official|video|audio|lyrics?|lyric|visuali[sz]er|hd|hq|4k|mv|m\/v|explicit|clean)\b[^)\]]*[)\]]/g;
  const words = (s) => plain(s).replace(NOISE, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const versions = (s) => (plain(s).match(VERSION) || []).map((w) => w.replace(/[ -]/g, '')).sort().join();
  function isSameRecording(video, hit) {
    if (!video.duration || !hit.duration || Math.abs(video.duration - hit.duration) > 2) return false;
    if (versions(video.title) !== versions(hit.title)) return false;
    const title = words(hit.title);
    const seen = ` ${words(video.title)} `;
    if (!title || !seen.includes(` ${title} `)) return false;
    const where = ` ${words(video.title)} ${words(video.author)} `;
    return (hit.artists || []).some((a) => { const w = words(a); return w && where.includes(` ${w} `); });
  }
  const timed = (promise, ms) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error('took too long')), ms))]);
  const OFFICIAL = 'nocturne_official';
  const idOf = (t) => (String(t).match(/(?:v=|youtu\.be\/)([\w-]{11})/) || [])[1];
  function noteOfficial(id) {
    try {
      const list = JSON.parse(read(OFFICIAL) || '[]');
      if (!list.includes(id)) list.push(id);
      write(OFFICIAL, JSON.stringify(list.slice(-500)));
    } catch (e) {}
  }
  async function chooseSource(n, target, api) {
    if (tier() !== 'veryhigh' || !n || !n.formats || !n.title || /- Topic$/.test(n.rawAuthor || '')) return n;
    try {
      const query = words(n.title);
      const hits = await timed((Q.search || api.ytMusicSearch)(query, 5), 1500);
      const video = { title: n.title, author: n.rawAuthor, duration: n.duration };
      const hit = (hits || []).find((h) => h && h.id && isSameRecording(video, h));
      if (!hit || hit.id === idOf(target)) return n;
      const better = await timed(api.resolveAudio(`https://www.youtube.com/watch?v=${hit.id}`), 2500);
      if (!better || !better.formats) return n;
      log(`using the official recording of ${idOf(target)}: ${hit.id}`);
      noteOfficial(idOf(target));
      return better;
    } catch (e) { log(`official recording: ${e && e.message}`); return n; }
  }

  // ---- songs saved before this setting, or at a lower one ----
  const tried = new Set();
  function wantsUpgrade(path, platform) {
    if (tier() !== 'veryhigh' || !wrapWith || !navigator.onLine) return false;
    if (platform && platform !== 'youtube' && platform !== 'ytmusic') return false;
    if (!/\.(aac|m4a)$/i.test(path) || tried.has(path)) return false;
    tried.add(path);
    return true;
  }

  // ---- if a phone says it can play this and then can't ----
  function watchPlayer() {
    const audio = document.getElementById('native-audio');
    if (!audio) return;
    audio.addEventListener('error', async () => {
      const src = String(audio.src || '');
      const core = window.MurielCore;
      const id = (src.match(/local-track\?id=([^&]+)/) || [])[1];
      if (!id || !/[?&]q=opus\b/.test(src) || !core || !core.state.currentTrack) return;
      write(BAD, stamp());
      write(CAN, null);
      wrapWith = null;
      log('an Opus file would not play: going back to AAC');
      try { if (globalThis.__murielDropFile) await globalThis.__murielDropFile(decodeURIComponent(id)); } catch (e) {}
      core.playTrack(core.state.currentTrack, core.state.queue, core.state.queueIndex);
    });
  }

  // what's playing now, in words
  async function describeFile(id, duration) {
    if (!globalThis.__murielFileInfo || !id) return null;
    const info = await globalThis.__murielFileInfo(id);
    if (!info) return null;
    const codec = { '.caf': 'Opus', '.webm': 'Opus', '.opus': 'Opus', '.aac': 'AAC', '.m4a': 'AAC', '.mp3': 'MP3' }[info.ext] || '';
    const kbps = duration > 0 ? Math.round((info.size * 8) / duration / 1000) : 0;
    let official = false;
    try { official = JSON.parse(read(OFFICIAL) || '[]').includes(id); } catch (e) {}
    return { codec, kbps, official };
  }

  const Q = {
    TIERS,
    tier,
    setTier(t) { if (TIERS[t]) write(KEY, t); window.dispatchEvent(new Event('nocturne:quality')); },
    canOpus: () => !!wrapWith,
    wrapName: () => wrapWith,
    setWrap(w) { wrapWith = w; },
    plan,
    wrap,
    webmToCaf,
    chooseSource,
    isSameRecording,
    wantsUpgrade,
    describeFile,
    ready: null,
  };
  globalThis.__murielQuality = Q;
  Q.ready = new Promise((r) => setTimeout(r)).then(probe).catch((e) => { log(`probe: ${e && e.message}`); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchPlayer); else watchPlayer();
})();
