const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const ipc = read('src/shared/ipc.ts');
const preload = read('src/preload/index.ts');
const handlers = read('src/main/ipc/appHandlers.ts');
const service = read('src/main/services/updateService.ts');
const config = read('src/main/config/updateConfig.ts');
const help = read('src/renderer/components/HelpPage.tsx');
const styles = read('src/renderer/styles/index.css');
const credentials = read('src/main/services/aiService/aiCredentialStore.ts');
const recent = read('src/main/ipc/projectHandlers.ts');
const settings = read('src/main/services/settingsService.ts');
const packageJson = JSON.parse(read('package.json'));

assert.match(ipc, /APP_CHECK_FOR_UPDATES: 'app:check-for-updates'/);
assert.match(ipc, /APP_OPEN_UPDATE_URL: 'app:open-update-url'/);
assert.match(ipc, /checkForUpdates: \(\) => Promise<UpdateCheckResult>/);
assert.match(preload, /checkForUpdates: \(\) => ipcRenderer\.invoke\(IPC_CHANNELS\.APP_CHECK_FOR_UPDATES\)/);
assert.match(handlers, /checkForLatestGithubRelease\(app\.getVersion\(\)\)/);
assert.match(handlers, /validateUpdateUrl\(rawUrl\)/);
assert.match(service, /https:\/\/api\.github\.com\/repos/);
assert.match(service, /releases\/download/);
assert.match(help, /Periksa versi &amp; update/);
assert.match(help, /Unduh Installer/);
assert.match(help, /0\.3\.27/);
assert.match(styles, /\.mrp-help-update-card/);
assert.match(credentials, /safeStorage\.encryptString\(trimmedKey\)/);
assert.match(credentials, /safeStorage\.decryptString/);
assert.match(recent, /app\.getPath\('userData'\), 'project-state'/);
assert.match(settings, /path\.join\(app\.getPath\('userData'\), 'Asset Library'\)/);
assert.equal(packageJson.version, '0.3.27');
assert.match(config, /UPDATE_GITHUB_OWNER = 'radist-ginola'/);
assert.match(config, /UPDATE_GITHUB_REPOSITORY = 'magic-render'/);
assert.match(config, /https:\/\/github\.com\/radist-ginola\/magic-render/);
assert.doesNotMatch(config, /YOUR_GITHUB_OWNER|YOUR_GITHUB_REPOSITORY/);
assert.match(service, /UPDATE_GITHUB_OWNER.*UPDATE_GITHUB_REPOSITORY/s);
assert.match(service, /tag v\$\{currentVersion\}/);

const forbiddenNames = new Set(['.env', 'recent-projects.json', 'magic-render-pro-ai.json', 'magic-render-pro-settings.json']);
const forbiddenExtensions = new Set(['.mrp-project']);
const excludedDirs = new Set(['node_modules', '.git', 'dist', '.test-dist', 'release', 'coverage']);
const found = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) walk(path.join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (forbiddenNames.has(entry.name) || forbiddenExtensions.has(path.extname(entry.name).toLowerCase())) found.push(rel);
    if (entry.name === '.env' || (/\.env\./.test(entry.name) && entry.name !== '.env.example')) found.push(rel);
    if (/\.(?:ts|tsx|js|jsx|json|md|yml|yaml|txt|cjs|mjs)$/i.test(entry.name) && fs.statSync(full).size < 2_000_000) {
      const content = fs.readFileSync(full, 'utf8');
      const secretPatterns = [/(?:sk-proj-|sk-)[A-Za-z0-9_-]{24,}/, /AIza[0-9A-Za-z_-]{30,}/, /ghp_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/];
      if (secretPatterns.some((pattern) => pattern.test(content))) found.push(`${rel} (possible embedded secret)`);
    }
  }
}
walk(root);
assert.deepEqual([...new Set(found)], [], `User data or secret files must not be included in the repository: ${[...new Set(found)].join(', ')}`);

console.log('[PASS] Help update check wiring, configured release URLs, encrypted credential storage, per-user data paths, and repository data hygiene.');
