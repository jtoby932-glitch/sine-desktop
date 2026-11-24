// stands in for Electron when the server is tested in plain Node
const os = require('os');
const path = require('path');
module.exports = {
  app: { getPath: (n) => path.join(process.env.SINE_USER_DIR || os.tmpdir(), n), getLocaleCountryCode: () => 'GB', getVersion: () => 'test' },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
};
