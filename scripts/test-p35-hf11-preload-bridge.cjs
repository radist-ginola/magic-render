const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const main = read('src/main/index.ts');
const builtMain = read('dist/main/index.js');
const preload = read('src/preload/index.ts');
const builtPreload = read('dist/preload/index.js');
const ipcSource = read('src/shared/ipc.ts');
const ipcBuilt = read('dist/shared/ipc.js');
const types = read('src/renderer/types.d.ts');
const pkg = JSON.parse(read('package.json'));
const runner = read('scripts/run-current-tests.cjs');

for (const [label, source] of [['source main', main], ['compiled main', builtMain]]) {
  assert.match(source, /resolvePreloadScriptPath/, `${label}: preload path resolver must exist`);
  assert.match(source, /getAppPath\(\).*dist.*preload.*index\.js/s, `${label}: app-root preload fallback must exist`);
  assert.match(source, /process\.cwd\(\).*dist.*preload.*index\.js/s, `${label}: cwd preload fallback must exist`);
  assert.match(source, /preload:\s*preloadPath/, `${label}: BrowserWindow must use resolved preload path`);
  assert.match(source, /preload-error/, `${label}: preload runtime errors must be logged`);
  assert.match(source, /onPrepareToClose/, `${label}: close bridge verification must be present`);
}
for (const [label, source] of [['source preload', preload], ['compiled preload', builtPreload]]) {
  assert.ok(source.includes("exposeInMainWorld('magicRender', api)"), `${label}: primary API must remain exposed`);
  assert.ok(source.includes("exposeInMainWorld('electronAPI', Object.freeze({ ...api }))"), `${label}: compatibility API alias must be exposed`);
  assert.match(source, /onPrepareToClose:/, `${label}: close-preparation handler must exist`);
}
const sourceApiNames = [...preload.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*\(/gm)].map((match) => match[1]);
const compiledApiNames = [...builtPreload.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):\s*\(/gm)].map((match) => match[1]);
assert.deepEqual(compiledApiNames, sourceApiNames, 'compiled preload API surface must match source exactly');
const sourceChannelNames = [...ipcSource.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):\s*['"]/gm)].map((match) => match[1]);
const compiledChannelNames = [...ipcBuilt.matchAll(/^\s{4}([A-Z][A-Z0-9_]+):\s*['"]/gm)].map((match) => match[1]);
assert.deepEqual(compiledChannelNames, sourceChannelNames, 'compiled IPC channel set must match source exactly');
assert.match(types, /electronAPI:\s*MagicRenderApi/, 'renderer typing must include electronAPI alias');
assert.equal(pkg.scripts['test:p35-hf11-preload-bridge'], 'node scripts/test-p35-hf11-preload-bridge.cjs');
assert.ok(runner.includes('test-p35-hf11-preload-bridge.cjs'), 'test must be registered in the active test runner');
console.log('PASS P35-HF11: preload path resolution, runtime diagnostics, and magicRender/electronAPI bridge compatibility.');
