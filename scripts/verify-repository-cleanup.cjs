const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts/run-current-tests.cjs'), 'utf8');
assert.equal(pkg.version, lock.version, 'package/lock versions must stay synchronized');
assert.ok(readme.includes(`Source version:** \`${pkg.version}\``), 'README source version must match package.json');
for (const dir of ['node_modules/', 'dist/', '.test-dist/', 'release/']) assert.ok(gitignore.includes(dir), `gitignore must exclude ${dir}`);
assert.ok(runner.includes("['npm', 'build']") && runner.indexOf("['npm', 'build']") < runner.indexOf("['node', 'test-runner-env.test.cjs']"), 'current test runner must build generated dist before checking packaged output');
for (const [name, command] of Object.entries(pkg.scripts)) {
  const matches = [...command.matchAll(/node\s+scripts\/([\w./-]+\.(?:cjs|mjs|js))/g)];
  for (const match of matches) assert.ok(fs.existsSync(path.join(root, 'scripts', match[1])), `package script ${name} points to missing file scripts/${match[1]}`);
}
const rootNames = fs.readdirSync(root);
const stale = rootNames.filter((name) => /^(?:UPDATE\d+_.*\.(?:md|json)|P\d+.*\.md|V5.*\.md|V6.*\.md|REDESIGN_.*\.(?:md|json)|BUILD_ERROR_FIX_REPORT\.md|PHASE30_FIX_REPORT\.md|RTM\.md|app_excerpt\.txt)$/i.test(name));
assert.deepEqual(stale, [], `historical checkpoint files remain in repository root: ${stale.join(', ')}`);
assert.ok(fs.existsSync(path.join(root, 'docs/FFMPEG_VISUALIZER_REFERENCE.md')));
assert.ok(fs.existsSync(path.join(root, 'docs/ONIXLABS_VISUALIZER_REFERENCE.md')));
console.log(`REPOSITORY CLEANUP VERIFY: PASSED (version ${pkg.version}, ${Object.keys(pkg.scripts).length} npm scripts, no root checkpoint clutter)`);
