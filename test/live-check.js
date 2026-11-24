// The in-app YouTube client (server/extract.js) against the real internet, in plain Node: a search and one song.
globalThis.__murielFetch = (input, init) => fetch(input, init);
const ex = require('../server/extract');
(async () => {
  const hits = await ex.youtubeSearch('Rick Astley Never Gonna Give You Up', 5);
  console.log('search:', hits.length, hits[0] && `${hits[0].title} | ${hits[0].uploader} | ${hits[0].duration}s`);
  const music = await ex.ytMusicSearch('Daft Punk Get Lucky', 3).catch((e) => { console.log('music search failed:', e.message); return []; });
  console.log('music search:', music.length, music[0] && music[0].title);
  const a = await ex.resolveAudio(hits[0].webpage_url);
  console.log('song:', a.kind, a.ext, a.container || '', a.opus ? `opus ${a.opus.size} bytes` : 'no opus', String(a.url).slice(0, 60));
  const r = await fetch(a.opus ? `${a.opus.url}&range=0-99999` : a.url, { headers: a.headers });
  console.log('first bytes:', r.status, (await r.arrayBuffer()).byteLength);
})().catch((e) => { console.log('FAILED:', e && (e.stack || e.message)); process.exit(1); });
