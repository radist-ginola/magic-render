const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ipc = fs.readFileSync(path.join(root, 'src/shared/ipc.ts'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src/main/ipc/settingsHandlers.ts'), 'utf8');
const render = fs.readFileSync(path.join(root, 'src/main/ipc/renderHandlers.ts'), 'utf8');
const register = fs.readFileSync(path.join(root, 'src/main/ipc/registerIpc.ts'), 'utf8');
for (const token of [
  "SETTINGS_GET: 'settings:get'",
  "SETTINGS_UPDATE: 'settings:update'",
  "SETTINGS_CONFIGURE_AI: 'settings:configure-ai'",
  "SETTINGS_AI_STATUS: 'settings:ai-status'",
  "RENDER_START: 'render:start'",
  "RENDER_CONTROL: 'render:control'",
]) assert.ok(ipc.includes(token), `Missing IPC contract token ${token}`);
assert.match(preload, /getSettings/);
assert.match(preload, /configureSettingsAi/);
assert.match(preload, /getSettingsAiStatus/);
assert.match(settings, /assertAllowedString\(apiKey, 'API key'/);
assert.doesNotMatch(settings, /return\s+\{[^}]*apiKey\s*:/);
assert.match(render, /IPC_CHANNELS\.RENDER_START/);
assert.match(register, /registerSettingsIpcHandlers/);
console.log('PHASE 22 IPC CONTRACT CHECK: TEST PASSED (static contract/boundary assertions; Electron runtime registration remains separate).');
