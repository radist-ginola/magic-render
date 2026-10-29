const assert = require('node:assert/strict');
const { ensureNpmOnPath, prependPathEntry } = require('./test-runner-env.cjs');

const windowsEnv = { Path: 'C:\\Windows\\System32;C:\\Tools', npm_execpath: 'C:\\Node\\node_modules\\npm\\bin\\npm-cli.js' };
prependPathEntry(windowsEnv, 'C:\\Magic Render Pro\\resources\\ffmpeg', 'win32');
ensureNpmOnPath(windowsEnv, 'C:\\Node\\node.exe', windowsEnv.npm_execpath, 'win32');
assert.match(windowsEnv.Path, /^C:\\Node;/i, 'Node/npm launcher path must remain first after FFmpeg is prepended');
assert.match(windowsEnv.Path, /C:\\Magic Render Pro\\resources\\ffmpeg/i, 'FFmpeg path with spaces must be preserved');
assert.match(windowsEnv.Path, /C:\\Windows\\System32/i, 'original Windows path entries must be preserved');
assert.equal(Object.keys(windowsEnv).filter((key) => key.toLowerCase() === 'path').length, 1, 'only one PATH casing variant should remain');
const posixEnv = { PATH: '/usr/bin:/bin' };
prependPathEntry(posixEnv, '/opt/ffmpeg', 'linux');
ensureNpmOnPath(posixEnv, '/opt/node/bin/node', '/opt/node/lib/node_modules/npm/bin/npm-cli.js', 'linux');
assert.ok(posixEnv.PATH.startsWith('/opt/node/bin:'), 'Node launcher directory must be prepended on POSIX too');
assert.ok(posixEnv.PATH.includes('/opt/ffmpeg'), 'FFmpeg path must be preserved after npm path repair');
assert.ok(posixEnv.PATH.includes('/usr/bin'), 'original POSIX path entries must be preserved');
console.log('PASS: nested npm PATH propagation remains stable after FFmpeg PATH prepending on Windows and POSIX');
