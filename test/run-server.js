// Runs Sine's PC server in plain Node for tests: prints {"port","token"} once it's listening.
const Module = require('module');
const path = require('path');
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return path.join(__dirname, 'electron-stub.js');
  return realResolve.call(this, request, ...rest);
};
globalThis.__murielFetch = (input, init) => fetch(input, init);
const files = {};
globalThis.__murielVault = (name) => ({ read() { if (!(name in files)) { const e = new Error('none'); e.code = 'ENOENT'; throw e; } return files[name]; }, write(v) { files[name] = v; } });
require('../server/ytdlp-emulation').install();
const server = require('../server/server.js');
server.startServer(0).then((port) => {
  process.stdout.write(JSON.stringify({ port, token: server.getServerToken() }) + '\n');
});
