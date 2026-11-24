// Spotify links and search on the PC server, with Spotify itself stood in for (this machine can't reach it).
process.env.SINE_USER_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'sine-sp-'));
const Module = require('module');
const path = require('path');
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { if (request === 'electron') return path.join(__dirname, 'electron-stub.js'); return realResolve.call(this, request, ...rest); };
const files = {};
globalThis.__murielVault = (name) => ({ read() { if (!(name in files)) { const e = new Error('none'); e.code = 'ENOENT'; throw e; } return files[name]; }, write(v) { if (v == null) delete files[name]; else files[name] = v; } });
const asked = [];
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
globalThis.__murielFetch = async (url, init = {}) => {
  url = String(url); asked.push(url);
  if (url.startsWith('https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC')) {
    const data = { props: { pageProps: { state: { data: { entity: { name: 'Never Gonna Give You Up', artists: [{ name: 'Rick Astley' }], duration: 213573, coverArt: { sources: [{ url: 'https://i.scdn.co/image/x', width: 640 }] } } } } } } };
    return new Response(`<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`, { status: 200 });
  }
  if (url.startsWith('https://open.spotify.com/embed/track/')) return new Response('nope', { status: 404 });
  if (url === 'https://accounts.spotify.com/api/token') {
    const auth = (init.headers || {}).Authorization || '';
    return Buffer.from(auth.replace('Basic ', ''), 'base64').toString() === 'goodid:goodsecret' ? json({ access_token: 'T', expires_in: 3600 }) : json({ error: 'invalid_client' }, 400);
  }
  if (url.startsWith('https://api.spotify.com/v1/search?type=track')) return json({ tracks: { items: [{ id: '4uLU6hMCjMI75M1A2tKUQC', name: 'Never Gonna Give You Up', artists: [{ name: 'Rick Astley' }], duration_ms: 213573, album: { images: [{ url: 'https://i.scdn.co/a', width: 300 }] } }] } });
  if (url.startsWith('https://api.spotify.com/v1/search?type=playlist')) return json({ playlists: { items: [null, { id: 'pl1', name: 'Rick Rolls', owner: { display_name: 'me' }, images: [{ url: 'c' }], tracks: { total: 9 } }] } });
  if (url.startsWith('https://api.spotify.com/v1/tracks/')) return json({ id: '4uLU6hMCjMI75M1A2tKUQC', name: 'Never Gonna Give You Up (API)', artists: [{ name: 'Rick Astley' }], duration_ms: 213573 });
  return new Response('unexpected ' + url, { status: 500 });
};
require('../server/ytdlp-emulation').install();
const server = require('../server/server.js');
(async () => {
  const port = await server.startServer(0);
  const token = server.getServerToken();
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'X-Muriel-Token': token } }); return { status: r.status, body: await r.json() }; };
  const results = [];
  const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(detail).slice(0, 300)}`); };
  const link = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123';
  let r = await get(`/api/spotify-import?url=${encodeURIComponent(link)}`);
  check('song link imports as one song (no keys: public page)', r.body.success && r.body.single && r.body.tracks[0].artist === 'Rick Astley' && r.body.tracks[0].title === 'Never Gonna Give You Up', r);
  r = await get(`/api/spotify-import?url=${encodeURIComponent('https://open.spotify.com/intl-de/track/0000000000000000000000')}`);
  check('missing song says so', !r.body.success && r.body.code === 'spotify_not_found' && r.status === 404, r);
  r = await get(`/api/search?q=${encodeURIComponent(link)}&platform=youtube&limit=8`);
  check('song link pasted in search finds that song', r.body.success && r.body.tracks.length === 1 && r.body.tracks[0].spotifyId === '4uLU6hMCjMI75M1A2tKUQC' && /rick astley/i.test(r.body.tracks[0].searchQuery), r);
  r = await get('/api/search?q=rick&platform=spotify&limit=8');
  check('Spotify search without keys asks for them', !r.body.success && r.body.code === 'spotify_needs_keys', r);
  files.spotify_app = { id: 'badid', secret: 'x' };
  r = await get('/api/search?q=rick2&platform=spotify&limit=8');
  check('wrong keys are reported', !r.body.success && r.body.code === 'spotify_bad_keys', r);
  files.spotify_app = { id: 'goodid', secret: 'goodsecret' };
  r = await get('/api/search?q=rick3&platform=spotify&limit=8');
  check('Spotify search with keys', r.body.success && r.body.tracks[0].title === 'Never Gonna Give You Up' && r.body.tracks[0].thumbnail === 'https://i.scdn.co/a', r);
  r = await get('/api/spotify-playlists?q=rick');
  check('Spotify playlists in search', r.body.success && r.body.playlists.length === 1 && r.body.playlists[0].total === 9, r);
  r = await get(`/api/spotify-import?url=${encodeURIComponent('spotify:track:4uLU6hMCjMI75M1A2tKUQC')}`);
  check('song link with keys uses the API', r.body.success && r.body.name === 'Never Gonna Give You Up (API)', r);
  r = await get(`/api/spotify-import?url=${encodeURIComponent('https://example.com/x')}`);
  check('other links still refused politely', !r.body.success && r.status === 400, r);
  process.env.SINE_SPOTIFY_REDIRECT = 'muriel://spotify-callback';
  r = await get('/api/spotify-auth-start?clientId=0123456789abcdef0123456789abcdef');
  check('login uses the muriel:// address', r.body.success && r.body.redirectUri === 'muriel://spotify-callback' && r.body.url.includes(encodeURIComponent('muriel://spotify-callback')), r);
  console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAILED');
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
