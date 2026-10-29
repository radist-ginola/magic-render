const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readJson = (relative) => JSON.parse(read(relative));
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const app = read('src/renderer/App.tsx');
const css = read('src/renderer/styles/index.css');
const intro = read('src/renderer/components/IntroPanel.tsx');
const types = read('src/shared/domain/introTypes.ts');
const factory = read('src/main/domain/project/projectFactory.ts');
const preview = read('src/renderer/components/VisualizerPreview.tsx');
const visualizer = read('src/main/services/effects/visualizerBuilder.ts');
const runner = read('scripts/run-current-tests.cjs');
const checks = [];
const check = (label, fn) => { try { fn(); checks.push([label, true, '']); } catch (error) { checks.push([label, false, error instanceof Error ? error.message : String(error)]); } };
check('Package version/lockfile agree and no dependency changes', () => {
  assert.match(pkg.version, /^0\.3\.\d+$/); assert.equal(lock.version, pkg.version); assert.equal(lock.packages[''].version, pkg.version);
  assert.deepEqual(pkg.dependencies, lock.packages[''].dependencies); assert.deepEqual(pkg.devDependencies, lock.packages[''].devDependencies);
});
check('Recent-project menu has viewport-clamped fixed coordinates, outside-click and resize/scroll close handlers', () => {
  assert.match(app, /const \[recentMenuPosition, setRecentMenuPosition\] = useState<\{ top: number; left: number \} \| null>\(null\)/);
  assert.match(app, /getBoundingClientRect\(\)/); assert.match(app, /window\.innerWidth - menuWidth/);
  assert.match(app, /position: 'fixed', top: recentMenuPosition\.top, left: recentMenuPosition\.left/);
  assert.match(app, /document\.addEventListener\('pointerdown', closeOutside\)/); assert.match(css, /\.mrp-home-project-card\.is-menu-open \{ z-index: 300; transform: none !important; \}/);
  for (const name of ['Preview','Properties','Delete']) assert.ok(app.includes(name));
});
check('Intro has three explicit choices and no-intro is the project factory default', () => {
  assert.match(intro, /<strong>Media Intro<\/strong>/); assert.match(intro, /<strong>Opening Fade & Bokeh<\/strong>/); assert.match(intro, /<strong>Tidak Ada<\/strong>/);
  assert.match(types, /export type IntroMode = 'media' \| 'fade' \| 'none'/); assert.match(types, /mode === 'none'/);
  assert.match(types, /getIntroMode\(project\.intro\) === 'media'/); assert.match(factory, /mode: 'none'/);
});
check('Desktop render menus share 25/50/25 workspace grid with responsive stacking preserved', () => {
  assert.match(css, /--mrp-workspace-column-left: minmax\(0, 1fr\)/);
  assert.match(css, /--mrp-workspace-column-center: minmax\(0, 2fr\)/);
  assert.match(css, /@media \(min-width: 1200px\)[\s\S]*grid-template-columns: var\(--mrp-workspace-column-left\) var\(--mrp-workspace-column-center\) var\(--mrp-workspace-column-right\) !important/);
  assert.match(css, /@media \(max-width: 1199px\)/); assert.match(css, /--mrp-workspace-panel-padding/);
});
check('Render menu omits the text footer below Canvas Preview and keeps actions with icons in a three-column row', () => {
  assert.doesNotMatch(app, /<div className="mrp-final-render-preview-foot">/);
  assert.match(app, /mrp-render-monitor__header/); assert.match(css, /\.mrp-render-monitor__header\s*\{[^}]*justify-content:\s*space-between/s);
  assert.match(app, /mrp-monitor-action-icon/); assert.match(css, /\.mrp-monitor-actions\.mrp-render-monitor__actions \{ display: grid; grid-template-columns: repeat\(3, minmax\(0,1fr\)\)/);
});
check('FFmpeg waveform follows guide with explicit rate, draw mode and preview smoothing aligned to frame window', () => {
  assert.match(visualizer, /showwaves=s=\$\{halfWidth\}x\$\{waveHeight\}:rate=\$\{fps\}:[^`]+draw=full/);
  assert.match(visualizer, /showcqt=s=\$\{width\}x\$\{height\}:r=\$\{fps\}/);
  for (const token of ['showwaves=','showcqt=','avectorscope=','channelsplit=channel_layout=stereo','boxblur=${glowRadius}:1','hflip,vflip']) assert.ok(visualizer.includes(token), token);
  assert.match(preview, /drawStereoModel/); assert.match(preview, /routing\.stereoAnalysers\.get\(visual\.id\)/);
  assert.match(visualizer, /rate=\$\{fps\}/);
});
check('Current P32 checks are registered in current test runner', () => {
  assert.equal(pkg.scripts['test:p32-ui-fixes'], 'node scripts/test-p32-ui-fixes.cjs');
  assert.ok(pkg.scripts['test:p33-stereo-bulk-log']);
  assert.ok(pkg.scripts['verify:updates:p33']);
  assert.ok(runner.includes("['node', 'test-p32-ui-fixes.cjs']")); assert.ok(runner.includes("['node', 'test-p33-stereo-bulk-log-fixes.cjs']"));
});
for (const [label, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${ok ? '' : ` — ${detail}`}`);
const failed = checks.filter((item) => !item[1]);
console.log(`P32 UI/INTRO/VISUALIZER: ${failed.length ? `FAILED (${failed.length}/${checks.length})` : `PASSED (${checks.length})`}`);
process.exitCode = failed.length ? 1 : 0;
