const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readJson = (relative) => JSON.parse(read(relative));
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const sourceTypes = read('src/shared/domain/visualizerTypes.ts');
const effectsUi = read('src/renderer/components/EffectsPanels.tsx');
const visualizerPreview = read('src/renderer/components/VisualizerPreview.tsx');
const canvasPreview = read('src/renderer/components/CanvasPreview.tsx');
const visualizerBuilder = read('src/main/services/effects/visualizerBuilder.ts');
const visualizerValidator = read('src/main/services/effects/visualizerValidator.ts');
const app = read('src/renderer/App.tsx');
const css = read('src/renderer/styles/index.css');
const outputService = read('src/main/services/render/outputService.ts');
const keyframeExtractor = read('src/main/services/aiService/keyframeExtractor.ts');
const seoService = read('src/main/services/aiService/youtubeSeoService.ts');
const mediaProtocol = read('src/main/services/media/mediaProtocolService.ts');
const main = read('src/main/index.ts');
const preload = read('src/preload/index.ts');
const runner = read('scripts/run-current-tests.cjs');

assert.equal(pkg.version, lock.version, 'package version and lockfile must be synchronized');
assert.deepEqual(pkg.dependencies, lock.packages?.['']?.dependencies, 'runtime dependencies differ from lockfile');
assert.deepEqual(pkg.devDependencies, lock.packages?.['']?.devDependencies, 'dev dependencies differ from lockfile');

const requiredFiles = [
  'src/shared/domain/visualizerTypes.ts','src/shared/domain/visualizerPalette.ts',
  'src/renderer/components/EffectsPanels.tsx','src/renderer/components/VisualizerPreview.tsx',
  'src/renderer/components/CanvasPreview.tsx','src/renderer/components/YoutubeSeoPanel.tsx',
  'src/renderer/App.tsx','src/renderer/styles/index.css',
  'src/main/services/effects/visualizerBuilder.ts','src/main/services/effects/visualizerValidator.ts',
  'src/main/services/render/outputService.ts','src/main/services/aiService/keyframeExtractor.ts',
  'src/main/services/aiService/youtubeSeoService.ts','src/main/services/media/mediaProtocolService.ts',
  'src/main/index.ts','src/preload/index.ts','src/renderer/public/assets/magic-render-pro-logo.png',
  'docs/FFMPEG_VISUALIZER_REFERENCE.md','docs/ONIXLABS_VISUALIZER_REFERENCE.md',
  'scripts/test-p35-hf3-visualizer-parity.cjs','scripts/test-p35-hf4-panel-layout.cjs',
  'scripts/test-p35-hf5-media-header.cjs','scripts/test-p35-hf6-overlay-spacing.cjs',
  'scripts/test-p35-hf7-canvas-preview-spacing.cjs','scripts/test-p35-hf8-preview-layout.cjs',
  'scripts/test-p35-hf9-seo-spacing.cjs','scripts/test-p35-hf10-seo-top-spacing.cjs',
  'scripts/test-p35-hf11-preload-bridge.cjs','scripts/test-p35-hf12-runtime-fixes.cjs',
  'scripts/test-p35-hf13-header-normalization.cjs','scripts/test-p35-onix-visualizers.cjs',
  'scripts/test-p36-visualizer-project-validation.cjs'
];
for (const file of requiredFiles) assert.ok(fs.existsSync(path.join(root, file)), `required current source/test file missing: ${file}`);

const models = [
  'onix-analyzer','onix-classic','onix-modern','onix-plasma','onix-infinity','onix-neon','onix-hawking','onix-core','onix-reactor','onix-spotlight','onix-twirl','onix-warp','onix-ripple','onix-pulsar','onix-hallucia','onix-logo','onix-album-art','onix-blank',
  'vertical-spectrum-bars','circular-spectrum','circular-waveform','radial-spectrum','oscilloscope','lissajous','waveform-progress'
];
for (const model of models) {
  assert.ok(sourceTypes.includes(`'${model}'`), `missing visualizer type: ${model}`);
  assert.ok(effectsUi.includes(`value:'${model}'`), `missing visualizer UI option: ${model}`);
  assert.ok(visualizerBuilder.includes(model), `missing FFmpeg mapping: ${model}`);
  if (!['onix-logo','onix-album-art','onix-blank'].includes(model)) assert.ok(visualizerPreview.includes(`'${model}'`), `missing Canvas Preview implementation: ${model}`);
}
assert.ok(visualizerValidator.includes('STEREO_VISUALIZER_STYLES'));
assert.ok(visualizerBuilder.includes('showwaves=') && visualizerBuilder.includes('showcqt=') && visualizerBuilder.includes('avectorscope='));
assert.ok(visualizerPreview.includes('routing.stereoAnalysers.get(visual.id)'));
assert.ok(visualizerPreview.includes('drawImage(prepared, -w / 2, -h / 2, w, h)'));
assert.ok(visualizerBuilder.includes('zoompan=z=') && !visualizerBuilder.includes('visual_logo_bars'));
assert.ok(visualizerBuilder.includes('colorkey=0x${keyColor}') && visualizerBuilder.includes('blend=all_mode=${mode}'));
assert.ok(effectsUi.includes("slider('Kehalusan / anti-getar', effect.smoothing ?? 0.9, 0, 0.97, 0.01"));
assert.ok(canvasPreview.includes("left: '50%', top: '50%'"));

for (const marker of [
  'P35-HF4 — repair the three cramped effect panels',
  'P35-HF5 — keep Main Media Effects text left and action buttons right with space-between',
  'P35-HF6 — normalize Overlay right-panel gutters across Media Overlay, Particle, Visualizer, and Text Overlay',
  'P35-HF7 — unify canvas preview outer gutters, frame padding, and sizing across all preview workspaces.',
  'P35-HF8 — lock YouTube SEO and final Render preview geometry to the shared canvas contract.',
  'P35-HF9 — normalize YouTube SEO canvas and side-panel spacing at every breakpoint.',
  'P35-HF10 — remove duplicate top inset from the YouTube SEO canvas workspace.'
]) assert.ok(css.includes(marker), `missing current CSS regression marker: ${marker}`);

assert.ok(outputService.includes('out_range=tv') && outputService.includes("'-color_range', 'tv'"), 'MP4 compatibility normalization is missing');
assert.ok(keyframeExtractor.includes('first-frame fallback') && keyframeExtractor.includes('accurate seek'), 'SEO keyframe recovery is missing');
assert.ok(seoService.includes('const selectedVideo ='), 'SEO must use fresh FFprobe duration');
assert.ok(mediaProtocol.includes('Content-Range') && mediaProtocol.includes('Accept-Ranges'), 'local media protocol byte-range support is missing');
assert.ok(main.includes('serveLocalMediaRequest') && main.includes("on('preload-error'"), 'main protocol/diagnostic integration missing');
assert.ok(preload.includes('onPrepareToClose') && preload.includes("exposeInMainWorld('electronAPI'"));

const requiredRunnerTests = [
  'test-p35-hf3-visualizer-parity.cjs','test-p35-hf4-panel-layout.cjs','test-p35-hf5-media-header.cjs',
  'test-p35-hf6-overlay-spacing.cjs','test-p35-hf7-canvas-preview-spacing.cjs','test-p35-hf8-preview-layout.cjs',
  'test-p35-hf9-seo-spacing.cjs','test-p35-hf10-seo-top-spacing.cjs','test-p35-hf11-preload-bridge.cjs',
  'test-p35-hf12-runtime-fixes.cjs','test-p35-hf13-header-normalization.cjs','test-p35-onix-visualizers.cjs',
  'test-p36-visualizer-project-validation.cjs'
];
for (const name of requiredRunnerTests) assert.ok(runner.includes(name), `active test runner is missing ${name}`);
assert.equal(pkg.scripts['verify:updates:p35'], 'node scripts/verify-updates-p35.cjs');

// Compiled artifacts are expected after `npm run build`; find Vite's hashed CSS rather than pinning a stale hash.
const distMain = path.join(root, 'dist/main/index.js');
const distPreload = path.join(root, 'dist/preload/index.js');
const distCssDir = path.join(root, 'dist/renderer/assets');
if (fs.existsSync(distMain) && fs.existsSync(distPreload) && fs.existsSync(distCssDir)) {
  assert.ok(read('dist/main/index.js').includes('serveLocalMediaRequest'));
  assert.ok(read('dist/preload/index.js').includes('onPrepareToClose'));
  const cssFiles = fs.readdirSync(distCssDir).filter((name) => name.endsWith('.css'));
  assert.ok(cssFiles.length > 0, 'built renderer CSS is missing');
  const builtCss = cssFiles.map((name) => fs.readFileSync(path.join(distCssDir, name), 'utf8')).join('\n');
  for (const marker of ['P35-HF6 — normalize Overlay right-panel gutters','P35-HF8 — lock YouTube SEO and final Render preview geometry']) assert.ok(builtCss.includes(marker), `built CSS is missing ${marker}`);
}

console.log(`CURRENT RELEASE VERIFICATION: PASSED (${requiredFiles.length} required files, ${models.length} visualizer modes, version ${pkg.version})`);
