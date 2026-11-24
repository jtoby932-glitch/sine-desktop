// Where Sine keeps things on a PC, and how server.js gets songs. Same exports as the phone's version.
// Songs come from the same in-app YouTube/SoundCloud client the iPhone uses (extract.js), answered as if it were
// yt-dlp (ytdlp-emulation.js), so there are no extra programs to install or keep up to date.
const path = require('path');
const fs = require('fs');
const os = require('os');

const IS_WIN = process.platform === 'win32';

function userDir() {
  if (process.env.SINE_USER_DIR) return process.env.SINE_USER_DIR;
  try {
    const { app } = require('electron');
    if (app && app.getPath) return app.getPath('userData');
  } catch (e) {}
  return path.join(os.homedir(), '.sine');
}

const USER_DIR = userDir();
// startup.json lives outside the music folder: it says where the music folder is
const STARTUP_PATH = path.join(USER_DIR, 'startup.json');
const DEFAULT_DATA_DIR = path.join(USER_DIR, 'Music library');
const BIN_DIR = path.join(USER_DIR, 'bin');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; }
}
function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    return false;
  }
}

const readStartupConfig = () => readJson(STARTUP_PATH);
const writeStartupConfig = (cfg) => writeJson(STARTUP_PATH, { ...readStartupConfig(), ...cfg });

function usableDir(dir) {
  if (!dir || typeof dir !== 'string' || !path.isAbsolute(dir)) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch (e) {
    return false;
  }
}

// a chosen folder that has gone (an unplugged drive) falls back to the default rather than failing to start
function resolveDataDir() {
  const chosen = readStartupConfig().dataDir;
  return usableDir(chosen) ? chosen : DEFAULT_DATA_DIR;
}

const DATA_DIR = resolveDataDir();
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const CACHE_DIR = path.join(DATA_DIR, 'tracks');
const CUSTOM_LYRICS_DIR = path.join(DATA_DIR, 'custom-lyrics');
const LYRICS_DIR = path.join(DATA_DIR, 'lyrics');
const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
const METADATA_PATH = path.join(DATA_DIR, 'metadata.json');
const LIBRARY_DIR = path.join(DATA_DIR, 'library');
const LIBRARY_PATH = path.join(DATA_DIR, 'library.json');

for (const dir of [DATA_DIR, CACHE_DIR, CUSTOM_LYRICS_DIR, LYRICS_DIR, THUMBNAILS_DIR, LIBRARY_DIR, BIN_DIR]) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
}

const readConfig = () => readJson(CONFIG_PATH);

function setDataDir(dir) {
  return writeStartupConfig({ dataDir: dir || null });
}

function defaultDownloadDir() {
  try { return path.join(require('electron').app.getPath('music'), 'Sine'); } catch (e) {}
  return path.join(os.homedir(), 'Music', 'Sine');
}
function resolveDownloadDir() {
  const chosen = readStartupConfig().downloadDir;
  return usableDir(chosen) ? chosen : defaultDownloadDir();
}
function setDownloadDir(dir) {
  return writeStartupConfig({ downloadDir: dir || null });
}

function findInPath(name) {
  const exts = IS_WIN ? ['.exe', '.cmd', ''] : [''];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      const p = path.join(dir, name + ext);
      try { if (fs.statSync(p).isFile()) return p; } catch (e) {}
    }
  }
  return null;
}

// ffmpeg is optional (Sine works without it, like on iPhone): used when it's on the PC already
function resolveBinary(name) {
  if (name === 'yt-dlp') return 'yt-dlp';
  return findInPath(name);
}

// the yt-dlp emulation recognises this and answers with the in-app YouTube/SoundCloud client
const ytDlpCommand = (args) => ({ bin: 'yt-dlp', args });

// copying the music folder to a new place (Settings → Music folder)
function copyDirContents(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirContents(a, b);
    else if (entry.isFile() && !fs.existsSync(b)) fs.copyFileSync(a, b);
  }
}
function removeDirContents(dir) {
  for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
}

module.exports = {
  clearBinaryCache: () => {},
  IS_WIN, USER_DIR, DATA_DIR, DEFAULT_DATA_DIR, CONFIG_PATH, BIN_DIR, CACHE_DIR, CUSTOM_LYRICS_DIR, LYRICS_DIR,
  THUMBNAILS_DIR, METADATA_PATH, LIBRARY_DIR, LIBRARY_PATH, STARTUP_PATH,
  get DOWNLOADS_DIR() { return resolveDownloadDir(); },
  findInPath, resolveBinary, ytDlpCommand,
  // like the phone: a song is fetched whole into the cache, then played from there
  STREAM_VIA_CACHE: true,
  tutorialDone: () => true, markTutorialDone: () => {},
  readStartupConfig, writeStartupConfig, readConfig, resolveDataDir, setDataDir,
  resolveDownloadDir, setDownloadDir, copyDirContents, removeDirContents,
};
