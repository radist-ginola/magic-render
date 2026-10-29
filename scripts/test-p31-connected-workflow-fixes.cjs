const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const pkg = json('package.json');
const lock = json('package-lock.json');
const preview = read('src/renderer/components/VisualizerPreview.tsx');
const builder = read('src/main/services/effects/visualizerBuilder.ts');
const controls = read('src/renderer/components/EffectsPanels.tsx');
const canvas = read('src/renderer/components/CanvasPreview.tsx');
const introPanel = read('src/renderer/components/IntroPanel.tsx');
const introService = read('src/main/services/intro/introService.ts');
const introTypes = read('src/shared/domain/introTypes.ts');
const selector = read('src/main/services/render/renderStrategySelector.ts');
const bulk = read('src/main/services/render/bulkFastPath.ts');
const app = read('src/renderer/App.tsx');
const text = app.slice(app.indexOf('function TextOverlayPanel'), app.indexOf('function mediaUrl'));
const css = read('src/renderer/styles/index.css');
const runner = read('scripts/run-current-tests.cjs');
const checks = [];
const check = (name, fn) => { try { fn(); checks.push({ name, ok: true }); } catch (error) { checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }); } };

check('Version and lockfile are synchronized with no dependency additions', () => {
  assert.match(pkg.version, /^0\.3\.\d+$/); assert.equal(lock.version, pkg.version); assert.equal(lock.packages[''].version, pkg.version);
  assert.deepEqual(pkg.dependencies, lock.packages[''].dependencies); assert.deepEqual(pkg.devDependencies, lock.packages[''].devDependencies);
});
check('Visualizer has independent analyzer FFT settings and cached buffers per layer', () => {
  assert.match(preview, /analysers: Map<string, AnalyserNode>/); assert.match(preview, /routing\.analysers\.get\(visual\.id\)/);
  assert.match(preview, /type AudioBuffers = \{ fftSize: number; frequencies: Uint8Array<ArrayBuffer>; leftWaveform: Uint8Array<ArrayBuffer>; rightWaveform: Uint8Array<ArrayBuffer>; smoothedLeft: Uint8Array<ArrayBuffer>; smoothedRight: Uint8Array<ArrayBuffer> \}/, 'Stereo preview uses ArrayBuffer-backed left/right channel buffers');
  assert.match(preview, /const desiredFft = Math\.max\(32, Math\.min\(32768/); assert.match(preview, /const audioBuffers = useRef\(new Map<string, AudioBuffers>\(\)\)/);
  assert.match(preview, /visualAnalyzer\.smoothingTimeConstant = 0/); assert.match(preview, /getByteFrequencyData\(buffers\.frequencies\)/);
  assert.match(preview, /getByteTimeDomainData\(buffers\.leftWaveform\)/); assert.match(preview, /getByteTimeDomainData\(buffers\.rightWaveform\)/); assert.match(preview, /const temporalTau = Math\.max\(1 \/ Math\.max\(1, fps\)/);
  assert.match(preview, /const paintIntervalMs = playingRef\.current \? 1000 \/ Math\.max\(1, Math\.min\(60, fps\)\)/);
});
check('Stereo visualizer modes share one color control, smoothing, opacity, fade and placement controls', () => {
  for (const key of ['sensitivity','smoothing','opacity','position','size','fadeInSec']) {
    assert.ok(controls.includes(key), `UI control ${key}`);
    assert.ok(preview.includes(`visual.${key}`) || preview.includes(key), `preview mapping ${key}`);
  }
  assert.ok(controls.includes('Warna utama'), 'one primary visualizer color control');
  assert.doesNotMatch(controls, /Warna kanal kiri|Warna kanal kanan/);
  assert.ok(preview.includes('resolveVisualizerColors(visual)') && builder.includes('resolveVisualizerColors(item)'), 'preview and render use shared palette resolution');
  for (const mode of ['basic-split','mirrored','gap','split-colors','cqt','rainbow','glow','reflection','vector']) assert.ok(controls.includes(mode) || preview.includes(mode) || builder.includes(mode), `stereo model ${mode}`);
  assert.match(preview, /drawStereoModel/); assert.match(builder, /channelsplit=channel_layout=stereo/);
  assert.match(builder, /showcqt=/); assert.match(builder, /avectorscope=/);
});
check('Controls unrelated to waveform stereo models are not exposed as if they affected them', () => {
  assert.match(controls, /!mediaLogo && slider\('Sensitivitas'/);
  assert.match(controls, /mediaLogo && <section className="mrp-effect-section mrp-visualizer-media-source"/);
  assert.match(controls, /Mode blend/); assert.match(controls, /Crop kiri/); assert.match(controls, /Aktifkan Chroma Key/);
});
check('Intro explicitly supports media, fade/bokeh, and none without stale boolean-only behavior', () => {
  assert.match(introPanel, /<strong>Media Intro<\/strong>/);
  assert.match(introPanel, /<strong>Opening Fade & Bokeh<\/strong>/);
  assert.match(introPanel, /<strong>Tidak Ada<\/strong>/);
  assert.match(introTypes, /export type IntroMode = 'media' \| 'fade' \| 'none'/);
  assert.match(introTypes, /getIntroMode\(project\.intro\) === 'media'/);
  assert.match(introService, /mode: enabled \? \(normalizedPath \? 'media' : 'fade'\) : 'none'/);
});
check('Home recent-project menu exposes Preview/Properties/Delete and reports actual FFmpeg readiness', () => {
  assert.match(app, /className="mrp-home-project-card__more"/); assert.match(app, /role="menuitem" onClick=\{\(\) => showRecentPreview\(item\)\}>Preview/);
  assert.match(app, /role="menuitem" onClick=\{\(\) => void showRecentProperties\(item\)\}>Properties/);
  assert.match(app, /role="menuitem" className="is-danger"[\s\S]*?Delete/); assert.match(app, /probeMainMedia\(item\.mainMediaPath\)/);
  assert.match(app, /testRenderEngine\(value\.ffmpegPath, value\.ffprobePath\)/); assert.match(app, /Engine siap/);
  assert.match(app, /recentActionError/); assert.match(css, /\.mrp-home-dialog__error/);
});
check('Text overlay controls auto-update project state and layers are nested under the left Text Overlay item', () => {
  assert.match(text, /setTimeout\(\(\) => \{/); assert.match(text, /onProjectChange\(\{ \.\.\.currentProject, textOverlays:/);
  assert.doesNotMatch(text, /Terapkan Edit/); assert.match(app, /mrp-overlay-text-layer-tree/);
  assert.match(app, /setRequestedTextLayerId\(layer\.id\)/); assert.match(app, /requestedLayerId=\{requestedTextLayerId\}/);
});
check('Regular render selects a single-pass path only when audio/composition/intro do not require processing', () => {
  assert.match(selector, /const needsVisualComposition =/); assert.match(selector, /const needsContentFlow = Boolean\(activeIntroMediaPath\(project\)\)/);
  assert.match(selector, /const needsAudio =/); assert.match(selector, /!needsVisualComposition && !needsContentFlow && !needsAudio/);
  assert.match(bulk, /'-c:v', 'copy'/); assert.match(bulk, /'-stream_loop', '-1'/);
  assert.doesNotMatch(selector, /segment(ed)?StreamCopy|stickerWindowStreamCopy/);
});
check('P31 workflow test and update verifier are registered in the current runner', () => {
  assert.equal(pkg.scripts['test:p31-connected-workflow-fixes'], 'node scripts/test-p31-connected-workflow-fixes.cjs');
  assert.ok(pkg.scripts['verify:updates:p33']);
  assert.ok(runner.includes("['node', 'test-p31-connected-workflow-fixes.cjs']")); assert.ok(runner.includes("['npm', 'verify:updates:p33']"));
});
for (const row of checks) console.log(`${row.ok ? 'PASS' : 'FAIL'}: ${row.name}${row.ok ? '' : ` — ${row.error}`}`);
const failed = checks.filter((row) => !row.ok);
console.log(`P31 CONNECTED WORKFLOW: ${failed.length ? `FAILED (${failed.length})` : `PASSED (${checks.length})`}`);
process.exitCode = failed.length ? 1 : 0;
