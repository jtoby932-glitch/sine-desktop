// The server's log: a small file in the app's folder (sine.log, the last 1 MB), for when something goes wrong.
const fs = require('fs');
const path = require('path');
const { USER_DIR } = require('./platform');

const LOG_DIR = path.join(USER_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'sine.log');
const recent = [];
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) {}

function write(level, message) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${String(message).slice(0, 2000)}`;
  recent.push(line);
  if (recent.length > 300) recent.shift();
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 1024 * 1024) fs.renameSync(LOG_FILE, `${LOG_FILE}.old`);
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {}
}
const describe = (message, err) => (err ? `${message}: ${(err && (err.stack || err.message)) || err}` : message);
module.exports = {
  log: (level, message) => write(level, message),
  error: (message, err) => write('error', describe(message, err)),
  warn: (message, err) => write('warn', describe(message, err)),
  info: (message) => write('info', message),
  tail: (n = 100) => recent.slice(-n),
  LOG_DIR,
  LOG_FILE,
};
