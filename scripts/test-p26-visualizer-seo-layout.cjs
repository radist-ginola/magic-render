const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const preview = read('src/renderer/components/VisualizerPreview.tsx');
const builder = read('src/main/services/effects/visualizerBuilder.ts');
const css = read('src/renderer/styles/index.css');
const pkg = json('package.json');
const checks = [];
function check(name, fn) { try { fn(); checks.push({ name, ok: true }); } catch (error) { checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }); } }

check('Live analyser uses a high smoothing constant and slower attack/release for every bar/spectrum option', () => {
  assert.match(preview, /visualAnalyzer\.smoothingTimeConstant = 0/);
  assert.match(preview, /routing\.analysers\.get\(visual\.id\)/);
  assert.match(preview, /const temporalTau = Math\.max\(1 \/ Math\.max\(1, fps\)/);
  assert.match(preview, /temporalAlpha = 1 - Math\.exp\(-\(deltaMs \/ 1000\) \/ temporalTau\)/);
  assert.match(preview, /frequencyWindowRadius = Math\.max\(2, Math\.min\(32/);
  assert.match(preview, /routing\.stereoAnalysers\.get\(visual\.id\)/);
  assert.match(preview, /leftWaveform: Uint8Array<ArrayBuffer>; rightWaveform: Uint8Array<ArrayBuffer>/);
  assert.match(preview, /drawStereoModel/);
});
check('Wave-based preview models share the current timebase and separate left/right channels', () => {
  assert.match(preview, /drawWaveChannel/);
  assert.match(preview, /visual\.smoothing \?\? \.9/);
  assert.match(preview, /drawStereoModel/);
  assert.match(preview, /getByteTimeDomainData\(buffers\.leftWaveform\)/);
  assert.match(preview, /getByteTimeDomainData\(buffers\.rightWaveform\)/);
});
check('Media/logo motion uses the global project timebase and matches FFmpeg frame timing while keeping the media layer animated', () => {
  assert.match(preview, /Math\.sin\(Math\.PI \* projectTime \* speed\)/);
  assert.match(builder, /motionSpeed \* \.35/);
  assert.match(preview, /ctx\.drawImage\(prepared, -w \/ 2, -h \/ 2, w, h\)/);
  assert.doesNotMatch(preview, /visual_logo_bars/);
});
check('FFmpeg render uses a longer temporal frame window and averaged frequency bands', () => {
  for (const token of ['showwaves=', 'showcqt=', 'avectorscope=', 'channelsplit=channel_layout=stereo', 'boxblur=${glowRadius}:1', 'hflip,vflip']) assert.ok(builder.includes(token), token);
  assert.match(builder, /rate=\$\{fps\}/);
  assert.doesNotMatch(builder, /Math\.min\(10, Math\.round\(2 \+ smoothing \* 8\)\)/);
});
check('Fullscreen SEO canvas body stays horizontally centred but top-anchors the preview stack', () => {
  const marker = 'P26 — keep the SEO canvas stage anchored';
  const patch = css.slice(css.lastIndexOf(marker));
  assert.ok(patch.length > 0, 'P26 fullscreen override exists at end of stylesheet');
  assert.match(patch, /@media \(min-width: 1200px\)/);
  assert.match(patch, /\.mrp-render-page\.mrp-render-page--seo-workspace \.mrp-render-right--workspace \.mrp-canvas-body \{[\s\S]*?align-items: flex-start !important;[\s\S]*?justify-content: center !important;/);
  assert.match(patch, /\.mrp-render-page\.mrp-render-page--seo-workspace \.mrp-render-right--workspace \.mrp-canvas-preview-root \{[\s\S]*?align-items: center !important;[\s\S]*?justify-content: flex-start !important;/);
  assert.ok(css.lastIndexOf(marker) > css.lastIndexOf('P24 — keep SEO result categories'));
});
check('Smaller-width SEO rules remain present and are not replaced by the fullscreen-only override', () => {
  assert.match(css, /@media \(max-width:1100px\)/);
  assert.match(css, /@media \(max-width:640px\)/);
  assert.ok(css.lastIndexOf('@media (max-width:640px)') < css.lastIndexOf('P26 — keep the SEO canvas stage anchored'));
});
check('P25 project types, audio routing, SEO tabs and logo crop/chroma/blend paths are untouched by the visualizer smoothness change', () => {
  assert.match(builder, /item\.kind === 'mediaLogo' && sourceInputIndices\[item\.id\] !== undefined/);
  assert.match(builder, /colorkey=0x\$\{keyColor\}/);
  assert.match(builder, /blend=all_mode=\$\{mode\}/);
  assert.match(builder, /maskedmerge/);
  const seo = read('src/renderer/components/YoutubeSeoPanel.tsx');
  assert.match(seo, /role="tablist"/);
  for (const id of ['titles','description','tags','hashtags']) assert.ok(seo.includes(`result && activeResultTab === '${id}'`));
});
check('P26 test and verifier entry points are registered without dependency/version changes', () => {
  assert.match(pkg.version, /^0\.3\.\d+$/);
  assert.equal(pkg.scripts?.['test:p26-visualizer-seo-layout'], 'node scripts/test-p26-visualizer-seo-layout.cjs');
  assert.equal(pkg.scripts?.['verify:ui-layout:p26'], 'node scripts/verify-ui-layout-p26.mjs');
  assert.ok(read('scripts/run-current-tests.cjs').includes("['npm', 'verify:ui-layout:p26']"));
});

for (const result of checks) console.log(`${result.ok ? 'PASS' : 'FAIL'}: ${result.name}${result.error ? ` — ${result.error}` : ''}`);
const failed = checks.filter((item) => !item.ok);
console.log(`P26 visualizer/SEO layout test: ${failed.length ? `FAILED (${failed.length})` : `PASSED (${checks.length})`}`);
process.exitCode = failed.length ? 1 : 0;
