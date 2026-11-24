// server.js gets its songs by running yt-dlp. On a PC, Sine answers those calls itself with the same in-app
// YouTube/SoundCloud client the iPhone app uses (extract.js), so nothing extra has to be installed. Anything else
// server.js runs (ffmpeg, if the PC has it) goes to the real child_process.
// A port of the iPhone's mobile/shims/child_process.js to Node's own files and network.
const childProcess = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { segmentsToAac, stripId3 } = require('./ts2aac');
const { CACHE_DIR } = require('./platform');

const realSpawn = childProcess.spawn;
let extractor = null;
const ex = () => extractor || (extractor = require(process.env.SINE_FAKE_EXTRACT || './extract'));

function fakeProcess(work) {
  const p = new EventEmitter();
  p.stdout = new EventEmitter();
  p.stderr = new EventEmitter();
  p.stdin = { write() {}, end() {} };
  let killed = false;
  const ac = new AbortController();
  // like a killed process: stop the work and report the exit straight away (server.js cleans up on 'close')
  p.kill = () => { if (killed) return; killed = true; ac.abort(); setTimeout(() => p.emit('close', null), 0); };
  setTimeout(async () => {
    try {
      const out = await work(ac.signal);
      if (killed) return;
      if (out) p.stdout.emit('data', Buffer.from(out));
      p.emit('close', 0);
    } catch (e) {
      if (killed) return;
      p.stderr.emit('data', Buffer.from(`ERROR: ${(e && e.message) || e}`));
      p.emit('close', 1);
    }
  }, 0);
  return p;
}

const opt = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

async function searchJson(target, limit) {
  let entries;
  let m = target.match(/^(yt|sc)search(\d*):(.*)$/);
  if (m) {
    const n = Number(m[2]) || limit || 20;
    entries = m[1] === 'sc' ? await ex().soundcloudSearch(m[3], n) : await ex().youtubeSearch(m[3], n);
  } else if ((m = target.match(/music\.youtube\.com\/search\?q=([^#&]+)/))) {
    entries = await ex().ytMusicSearch(decodeURIComponent(m[1].replace(/\+/g, ' ')), limit || 20);
  } else if (/^https?:\/\//.test(target)) {
    // playlist / album / set link (link import)
    const pl = await ex().playlist(target, limit || 500);
    return JSON.stringify({ title: pl.title, entries: pl.entries });
  } else {
    throw new Error(`unsupported search target ${target}`);
  }
  return JSON.stringify({ entries });
}

function concat(pieces) {
  return Buffer.concat(pieces.map((x) => Buffer.from(x.buffer, x.byteOffset, x.byteLength)));
}

// joins downloaded HLS segments into one playable file ('aac' for YouTube, 'mp3' / 'fmp4' for SoundCloud)
function joinSegments(parts, container) {
  if (container === 'aac' || !container) return Buffer.from(segmentsToAac(parts));
  return concat(container === 'mp3' ? parts.map(stripId3) : parts);
}

const DEADLINE_MS = 30000;
function fetchWithDeadline(url, opts = {}) {
  const timeout = AbortSignal.timeout(DEADLINE_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  return fetch(url, { ...opts, signal });
}

// every URL, 4 at a time, bodies in order; a flaky piece is retried a couple of times
async function fetchAll(urls, headers, signal) {
  const parts = new Array(urls.length);
  let next = 0;
  let failed = null;
  const worker = async () => {
    while (next < urls.length && !failed) {
      if (signal && signal.aborted) throw (failed = new Error('download cancelled'));
      const i = next++;
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await fetchWithDeadline(urls[i], { headers, signal });
          if (!r.ok) throw Object.assign(new Error(`segment ${i} failed: ${r.status}`), { status: r.status });
          parts[i] = new Uint8Array(await r.arrayBuffer());
          break;
        } catch (e) {
          if (attempt >= 2 || failed || (signal && signal.aborted) || (e.status >= 400 && e.status < 500)) throw (failed = failed || e);
          await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));
  return parts;
}

async function downloadHls(playlistUrl, headers, signal, container) {
  const m3u = await (await fetchWithDeadline(playlistUrl, { headers, signal })).text();
  const lines = m3u.split('\n').map((l) => l.trim());
  const key = lines.find((l) => l.startsWith('#EXT-X-KEY') && !/METHOD=NONE/.test(l));
  if (key) throw new Error('this song is only available encrypted (DRM)');
  const urls = lines.filter((l) => l && !l.startsWith('#')).map((l) => new URL(l, playlistUrl).href);
  const map = lines.map((l) => l.startsWith('#EXT-X-MAP') && (l.match(/URI="([^"]+)"/) || [])[1]).find(Boolean);
  if (map) urls.unshift(new URL(map, playlistUrl).href);
  if (!urls.length) throw new Error('empty HLS playlist');
  return joinSegments(await fetchAll(urls, headers, signal), container);
}

// a googlevideo file in 1 MiB ranges (long single requests get throttled or cut off), checked to have arrived whole
async function downloadRanges(url, headers, signal, size) {
  const step = 1 << 20;
  const urls = [];
  for (let a = 0; a < size; a += step) urls.push(`${url}&range=${a}-${Math.min(size, a + step) - 1}`);
  const bytes = concat(await fetchAll(urls, headers, signal));
  if (bytes.length !== size) throw new Error(`incomplete download: ${bytes.length} of ${size} bytes`);
  return bytes;
}

function writeAtomic(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.part`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, file);
}

async function downloadPlain(url, file, headers, signal) {
  const r = await fetch(url, { headers, signal });
  if (!r.ok || !r.body) throw new Error(`download failed: ${r.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.part`;
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(tmp));
  fs.renameSync(tmp, file);
  return fs.statSync(file).size;
}

async function download(args, target, signal) {
  const audio = await ex().resolveAudio(target);
  if (signal && signal.aborted) throw new Error('download cancelled');
  const template = opt(args, '-o');
  const named = (ext) => (template.includes('%(ext)s') ? template.replace('%(ext)s', ext) : template);
  // Settings → Tracks → Streaming quality (the page tells the main process: globalThis.__sineQuality). Very high is
  // Opus at ~160 kbps, High AAC at ~128, Medium Opus at ~70, Low AAC at ~48; whatever isn't offered falls back.
  const tier = globalThis.__sineQuality || 'veryhigh';
  const f = audio.formats || {};
  const wantOpus = tier === 'veryhigh' ? audio.opus : tier === 'medium' ? (f[250] || null) : null;
  const hlsUrl = (tier === 'low' ? (f.hls233 || f.hls234) : tier === 'high' ? (f.hls234 || f.hls233) : tier === 'medium' ? (f.hls233 || f.hls234) : null) || audio.url;
  const opus = wantOpus ? await downloadRanges(wantOpus.url, audio.headers, signal, wantOpus.size).catch((e) => {
    if (signal && signal.aborted) throw e;
    console.warn('[sine] Opus download failed, using AAC', e && e.message);
    return null;
  }) : null;
  if (opus) writeAtomic(named('webm'), opus);
  else if (audio.kind === 'hls') writeAtomic(named(audio.ext), await downloadHls(hlsUrl, audio.headers, signal, audio.container));
  else await downloadPlain(audio.url, named(audio.ext), audio.headers || { 'User-Agent': 'Mozilla/5.0' }, signal);
  enforceCacheLimit();
  return '';
}

// the downloaded-songs cache stays under 4 GB: the songs used longest ago go first, the newest few always stay
const CACHE_LIMIT = 4 * 1024 ** 3;
const KEEP_NEWEST = 4;
function enforceCacheLimit() {
  let files;
  try {
    files = fs.readdirSync(CACHE_DIR).map((n) => {
      const p = path.join(CACHE_DIR, n);
      const st = fs.statSync(p);
      return { p, size: st.size, used: Math.max(st.mtimeMs, st.atimeMs), temp: /\.(temp|part)\b/.test(n) };
    });
  } catch (e) { return; }
  let total = files.reduce((n, f) => n + f.size, 0);
  if (total <= CACHE_LIMIT) return;
  files = files.filter((f) => !f.temp).sort((a, b) => a.used - b.used);
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_NEWEST))) {
    if (total <= CACHE_LIMIT) break;
    try { fs.unlinkSync(f.p); total -= f.size; } catch (e) {}
  }
}

function emulate(args) {
  args = args || [];
  // yt-dlp takes the target anywhere: server.js puts search terms first and URLs last
  const target = [...args].reverse().find((a) => /^(yt|sc)search\d*:|^https?:\/\//.test(a)) || args[args.length - 1];
  const limit = Number(opt(args, '--playlist-end')) || undefined;
  if (args.includes('-g')) return fakeProcess(async () => `${(await ex().resolveAudio(target)).url}\n`);
  if (args.includes('--dump-single-json') || args.includes('-J')) return fakeProcess(() => searchJson(target, limit));
  if (args.includes('--print')) return fakeProcess(async () => `${(await ex().resolveAudio(target)).artist || 'NA'}\n`);
  if (args.includes('-x')) return fakeProcess((signal) => download(args, target, signal));
  if (args.includes('--version') || args.includes('-U')) return fakeProcess(async () => 'sine\n');
  return fakeProcess(async () => { throw new Error(`unsupported yt-dlp call: ${args.join(' ')}`); });
}

// installed before server.js is loaded (it keeps its own reference to spawn)
function install() {
  childProcess.spawn = function spawn(bin, args, options) {
    if (bin === 'yt-dlp') return emulate(args);
    return realSpawn.call(this, bin, args, options);
  };
}

module.exports = { install, emulate, enforceCacheLimit };
