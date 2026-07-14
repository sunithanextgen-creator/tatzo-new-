const fs = require('fs');
const realpathSync = fs.realpathSync.bind(fs);
fs.realpathSync = function (p, options) {
  try { return realpathSync(p, options); } catch { return String(p); }
};
if (fs.realpathSync.native) {
  const nativeRealpath = fs.realpathSync.native.bind(fs.realpathSync);
  fs.realpathSync.native = function (p, options) {
    try { return nativeRealpath(p, options); } catch { return String(p); }
  };
}
require('C:/Users/user/TatzoApp/.codex-node/v20.19.4/node_modules/npm/bin/npm-cli.js');
