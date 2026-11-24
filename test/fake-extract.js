// Test stand-in for extract.js: a small catalogue of local songs, served over HTTP like YouTube would.
const http = require('http');
const fs = require('fs');
const path = require('path');
const MEDIA = process.env.SINE_TEST_MEDIA;
const SONGS = [
  { id: 'songAAAAAAA', title: 'Long Song', artist: 'Test Artist', file: 'long.aac', duration: 181 },
  { id: 'songMMMMMMM', title: 'Beta', artist: 'Second Artist', file: 'b.mp3', duration: 25 },
  { id: 'songCCCCCCC', title: 'Gamma', artist: 'Third Artist', file: 'a.aac', duration: 40 },
];
let base = null;
const ready = new Promise((resolve) => {
  const s = http.createServer((req, res) => {
    const f = path.join(MEDIA, path.basename(decodeURIComponent(req.url.split('?')[0])));
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.mp3') ? 'audio/mpeg' : 'audio/aac', 'Content-Length': fs.statSync(f).size });
    fs.createReadStream(f).pipe(res);
  });
  s.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${s.address().port}/`; resolve(); });
  s.unref();
});
const entry = (s) => ({ id: s.id, title: s.title, uploader: s.artist, channel: s.artist, artists: [s.artist], duration: s.duration, thumbnails: [], webpage_url: `https://www.youtube.com/watch?v=${s.id}` });
const find = (target) => SONGS.find((s) => String(target).includes(s.id));
module.exports = {
  youtubeSearch: async (q, n) => SONGS.map(entry).slice(0, n),
  ytMusicSearch: async (q, n) => SONGS.map(entry).slice(0, n),
  soundcloudSearch: async () => [],
  playlist: async () => ({ title: 'Test playlist', entries: SONGS.map(entry) }),
  resolveAudio: async (target) => {
    await ready;
    const s = find(target) || SONGS[0];
    return { url: base + s.file, ext: s.file.split('.').pop(), kind: 'direct', headers: {}, artist: s.artist };
  },
  isPlayable: () => true, scCandidates: async () => [], scCanonicalUrl: async (u) => u,
};
