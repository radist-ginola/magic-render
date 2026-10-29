const assert = require('node:assert/strict');
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const read = (file) => fs.readFileSync(file, 'utf8');
const preview = read('src/renderer/components/CanvasPreview.tsx');
const visualPreview = read('src/renderer/components/VisualizerPreview.tsx');
const visualBuilder = read('src/main/services/effects/visualizerBuilder.ts');
const effectPreview = read('src/shared/domain/effectPreview.ts');
const intro = read('src/renderer/components/IntroPanel.tsx');
const introTypes = read('src/shared/domain/introTypes.ts');
const seoPanel = read('src/renderer/components/YoutubeSeoPanel.tsx');
const projectTypes = read('src/shared/domain/projectTypes.ts');
const aiTypes = read('src/shared/domain/aiTypes.ts');
const timestamp = read('src/main/services/aiService/timestampGenerator.ts');
const seoWriter = read('src/main/services/aiService/seoFileWriter.ts');
const seoService = read('src/main/services/aiService/youtubeSeoService.ts');
const seoHandler = read('src/main/ipc/seoHandlers.ts');
const renderHandler = read('src/main/ipc/renderHandlers.ts');
const validator = read('src/main/services/project/projectValidator.ts');
const logMain = read('src/main/index.ts');
const logPanel = read('src/renderer/components/ConsoleLogPanel.tsx');
const css = read('src/renderer/styles/index.css');
const runner = read('scripts/run-current-tests.cjs');
const checks = [];
const check = (name, fn) => { try { fn(); checks.push({name,ok:true}); } catch (error) { checks.push({name,ok:false,error:error.message}); } };
check('App and package-lock are synchronized with no dependency metadata mismatch', () => {
  assert.match(pkg.version, /^0\.3\.\d+$/); assert.equal(lock.version, pkg.version); assert.equal(lock.packages[''].version, pkg.version);
  assert.deepEqual(pkg.dependencies, lock.packages[''].dependencies); assert.deepEqual(pkg.devDependencies, lock.packages[''].devDependencies);
});
check('Main media effect preview uses the shared render clock and canvas-scaled displacement', () => {
  assert.match(preview, /const effectTimelineTime = isPlaying \? effectClockTime : currentTime/);
  assert.match(preview, /const effectContentTime = Math\.max\(0, effectTimelineTime - introDuration\)/);
  assert.match(preview, /mainEffectStyle\(draftProject\.mainMediaEffects, effectContentTime, beat, canvasScale\)/);
  assert.match(preview, /requestAnimationFrame\(tick\)/);
  assert.match(preview, /1000 \/ targetFps/);
  assert.match(effectPreview, /x \* safeDisplayScale/);
});
check('Visualizer media/logo motion follows the global timeline and render-equivalent formula', () => {
  assert.match(preview, /time=\{effectContentTime\} fps=\{draftProject\.settings\.fps \?\? 30\}/);
  assert.match(visualPreview, /projectTime \* Math\.PI \* 2 \* speed/);
  assert.match(visualPreview, /Math\.sin\(Math\.PI \* projectTime \* speed\)/);
  assert.match(visualPreview, /1000 \/ Math\.max\(1, Math\.min\(60, fps\)\)/);
  assert.match(visualBuilder, /motionSpeed \* \.42/); assert.match(visualBuilder, /motionSpeed \* \.31/); assert.match(visualBuilder, /motionSpeed \* \.35/);
  for (const token of ['showwaves=','showcqt=','avectorscope=','channelsplit=channel_layout=stereo','boxblur=${glowRadius}:1','hflip,vflip']) assert.ok(visualBuilder.includes(token), token);
});
check('Intro exposes Media Intro, Opening Fade & Bokeh, and Tidak Ada as explicit exclusive modes', () => {
  assert.match(intro, /<strong>Media Intro<\/strong>/);
  assert.match(intro, /<strong>Opening Fade & Bokeh<\/strong>/);
  assert.match(intro, /<strong>Tidak Ada<\/strong>/);
  assert.match(introTypes, /export type IntroMode = 'media' \| 'fade' \| 'none'/);
  assert.match(introTypes, /getIntroMode\(project\.intro\) === 'media'/);
  assert.match(intro, /mode, enabled: mode !== 'none'/);
});
check('SEO menu has exactly the three requested choices and no project/playlist/provider summary strip', () => {
  assert.match(seoPanel, /<strong>timestamp\.txt<\/strong>/); assert.match(seoPanel, /<strong>youtubeseo\.txt<\/strong>/); assert.match(seoPanel, /<strong>Tidak Ada<\/strong>/);
  assert.doesNotMatch(seoPanel, /aria-label="Ringkasan konfigurasi SEO"/);
  assert.match(projectTypes, /mode\?: 'timestamp' \| 'timestamp-seo' \| 'none'/);
  assert.match(validator, /'timestamp', 'timestamp-seo', 'none'/);
});
check('SEO mode writes only the selected sidecar filename', () => {
  assert.match(timestamp, /path\.join\(folder, 'timestamp\.txt'\)/);
  assert.match(seoWriter, /path\.join\(folder, 'youtubeseo\.txt'\)/);
  assert.match(aiTypes, /writeTimestampSidecar\?: boolean/);
  assert.match(seoHandler, /writeTimestampSidecar: false/);
  assert.match(seoService, /if \(request\.writeTimestampSidecar !== false\)/);
  assert.match(renderHandler, /if \(seoMode === 'timestamp'\)/);
  assert.match(renderHandler, /else if \(seoMode === 'none'\)/);
});
check('Console diagnostics explain stage, known error codes, FFmpeg stderr, and concrete next action', () => {
  assert.match(logMain, /Tahap bermasalah:/); assert.match(renderHandler, /Periksa akses folder output dan data playlist/);
  assert.match(logMain, /translateFfmpegError\(raw/); assert.match(logPanel, /Detail tambahan \(\$\{keys\.join\(', '\)\}\) tersedia pada entri log FFmpeg terkait/);
  assert.doesNotMatch(logMain + logPanel, /Ada detail tambahan\. Periksa Console Log untuk konteks proses\./);
});
check('Overlay canvas remains a grouped grid/flex item and shrinks without a fixed minimum width', () => {
  const p30 = css.slice(css.lastIndexOf('/* P30 —'));
  assert.ok(p30.includes('.mrp-render-page--overlay-workspace .mrp-render-right--workspace { display: flex'));
  assert.ok(p30.includes('grid-template-columns: minmax(0, 1fr) !important'));
  assert.ok(p30.includes('min-width: 0 !important'));
});
check('P30 regression test and integrity verifier are registered in package and current runner', () => {
  assert.equal(pkg.scripts['test:p30-workflow-fixes'], 'node scripts/test-p30-workflow-fixes.cjs');
  assert.ok(pkg.scripts['verify:updates:p33']);
  assert.ok(runner.includes("['node', 'test-p30-workflow-fixes.cjs']"));
  assert.ok(runner.includes("['npm', 'verify:updates:p33']"));
});
for (const row of checks) console.log(`${row.ok ? 'PASS' : 'FAIL'}: ${row.name}${row.ok ? '' : ` — ${row.error}`}`);
const failed = checks.filter((row) => !row.ok);
console.log(`P30 WORKFLOW REGRESSION: ${failed.length ? `FAILED (${failed.length})` : `PASSED (${checks.length})`}`);
process.exitCode = failed.length ? 1 : 0;
