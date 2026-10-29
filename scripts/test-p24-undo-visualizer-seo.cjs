const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const checks = [];
function check(name, fn) { try { fn(); checks.push({ name, ok: true }); } catch (error) { checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }); } }

const history = read('src/renderer/context/historyContext.tsx');
const app = read('src/renderer/App.tsx');
const assetEditor = read('src/renderer/components/AssetVisualEditor.tsx');
const help = read('src/renderer/components/HelpPage.tsx');
const visualTypes = read('src/shared/domain/visualizerTypes.ts');
const visualUi = read('src/renderer/components/EffectsPanels.tsx');
const visualPreview = read('src/renderer/components/VisualizerPreview.tsx');
const visualBuilder = read('src/main/services/effects/visualizerBuilder.ts');
const validator = read('src/main/services/effects/visualizerValidator.ts');
const seo = read('src/renderer/components/YoutubeSeoPanel.tsx');
const css = read('src/renderer/styles/index.css');
const pkg = JSON.parse(read('package.json'));

check('App wraps every workspace in the shared project-history provider', () => {
  assert.match(app, /<HistoryProvider historyLimit=\{100\} initialProject=\{null\}><AppContent \/><\/HistoryProvider>/);
  assert.match(app, /setProject: recordProject/);
  assert.match(app, /const setProject = \(next: ProjectData, options\?: HistoryOptions\): void => recordProject\(next, options\)/);
});
check('Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z route to project-wide undo/redo', () => {
  assert.match(history, /window\.addEventListener\('keydown', onKeyDown\)/);
  assert.match(history, /key === 'z' && !event\.shiftKey[\s\S]*?undo\(\)/);
  assert.match(history, /key === 'y' \|\| \(key === 'z' && event\.shiftKey\)[\s\S]*?redo\(\)/);
  assert.match(history, /event\.preventDefault\(\)/);
});
check('Global shortcut ignores Alt and respects an already handled keyboard event', () => {
  assert.match(history, /event\.defaultPrevented \|\| !\(event\.ctrlKey \|\| event\.metaKey\) \|\| event\.altKey/);
});
check('Project undo remains available on canvas, sliders, toggles, colors, radio inputs and select controls', () => {
  const selector = history.match(/const textInput = target\?\.closest\('([^']+)'\)/)?.[1] ?? '';
  assert.ok(selector.includes('textarea') && selector.includes('contenteditable="true"'));
  for (const token of ['input:not([type])', 'input[type="text"]', 'input[type="search"]', 'input[type="email"]', 'input[type="tel"]']) assert.ok(selector.includes(token), token);
  assert.ok(!selector.includes('input[type="number"]'), 'Numeric project inputs must reach project undo');
  assert.equal([...app.matchAll(/onOpenRecentProject\(item\)/g)].length, 2);
  assert.match(app, /async function openRecentProject\(item: RecentProject\)[\s\S]*?replaceProject\(result\.project\);[\s\S]*?setRecent\(result\.recentProjects\);[\s\S]*?setMainPage\('Render'\); setRenderTab\('Media'\); setMessage\(`Loaded:/);
  assert.match(history, /const replaceProjectInternal = \(next: ProjectData \| null\): void => \{[\s\S]*?setPast\(\[\]\);[\s\S]*?setFuture\(\[\]\)/);
});
check('Text inputs keep native text undo while Asset Visual Editor keeps local undo only when focused', () => {
  assert.match(history, /if \(textInput\) return/);
  assert.match(history, /target\?\.closest\('\.mrp-asset-editor'\)/);
  assert.match(assetEditor, /!event\.target\.closest\('\.mrp-asset-editor'\)\) return/);
});
check('History supports bounded snapshots, coalesced slider gestures and clearing redo after a new change', () => {
  for (const token of ['DEFAULT_HISTORY_LIMIT = 100', "mode === 'coalesce'", "mode === 'commit-coalesced'", 'coalescedBaseRef.current', 'setFuture([])', 'structuredClone(project)', 'setPast((items) => [...items']) assert.ok(history.includes(token), token);
});
check('Help documents shortcuts as workspace-wide project undo/redo', () => {
  assert.match(help, /Ctrl\+Z\/Y/);
  assert.match(help, /seluruh menu/);
});
check('Every visualizer variant receives an editable smoothing / anti-shake control', () => {
  assert.match(visualUi, /slider\('Kehalusan \/ anti-getar', effect\.smoothing \?\? 0\.9, 0, 0\.97, 0\.01/);
  assert.doesNotMatch(visualUi, /!wave && !spectrum && !mediaLogo && slider\('Kehalusan/);
  assert.match(validator, /v\.smoothing > 0\.97/);
  assert.match(visualTypes, /smoothing\?: number/);
});
check('Stereo preview uses isolated analyzers and reusable per-channel buffers', () => {
  assert.match(visualPreview, /stereoAnalysers: Map<string, StereoAnalyserPair>/);
  assert.match(visualPreview, /routing\.stereoAnalysers\.get\(visual\.id\)/);
  assert.match(visualPreview, /leftWaveform: Uint8Array<ArrayBuffer>; rightWaveform: Uint8Array<ArrayBuffer>/);
  assert.match(visualPreview, /getByteTimeDomainData\(buffers\.leftWaveform\)/);
  assert.match(visualPreview, /getByteTimeDomainData\(buffers\.rightWaveform\)/);
  assert.match(visualPreview, /visualAnalyzer\.smoothingTimeConstant = 0/);
  assert.match(visualPreview, /const temporalTau = Math\.max\(1 \/ Math\.max\(1, fps\)/);
});
check('Stereo preview includes all nine styles and channel-specific presentation', () => {
  for (const token of ['drawStereoModel','basic-split','mirrored','gap','split-colors','cqt','rainbow','glow','reflection','vector']) assert.ok(visualPreview.includes(token), token);
  assert.match(visualPreview, /ctx\.globalAlpha = \.22/);
  assert.match(visualPreview, /hsl\(/);
});
check('FFmpeg stereo output maps all stereo guide models to real filters', () => {
  for (const token of ['showwaves=','showcqt=','avectorscope=','channelsplit=channel_layout=stereo','hflip,vflip','boxblur=${glowRadius}:1',"hue=h='t*100'",'overlay=x=0:y=${reflectionHeight}']) assert.ok(visualBuilder.includes(token), token);
  for (const token of ['basic-split','mirrored','gap','split-colors','cqt','rainbow','glow','reflection','vector']) assert.ok(visualBuilder.includes(token), token);
});
check('Media/logo visualizer draws and animates the media itself without an EQ-bar layer', () => {
  for (const token of ['mediaLogo', 'getPreparedMedia(visual, w, h)', 'visual.mediaMotion', "motion === 'pulse'", "motion === 'float'", "motion === 'rotate'", 'ctx.drawImage(prepared']) assert.ok(visualPreview.includes(token), token);
  assert.doesNotMatch(visualPreview, /visual_logo_bars/);
  assert.match(visualBuilder, /zoompan=z=/);
  assert.doesNotMatch(visualBuilder, /visual_logo_bars/);
});
check('Media/logo visualizer supports crop, chroma key, blend mode and saved motion controls', () => {
  for (const token of ['sourceCrop', 'chromaKeyEnabled', 'chromaSimilarity', 'chromaBlend', 'mediaMotion', 'motionAmount', 'motionSpeed', 'blendMode']) assert.ok(visualTypes.includes(token), token);
  for (const token of ['Media / logo & crop', 'Mode blend', 'Aktifkan Chroma Key', 'Kekuatan gerakan', 'Kecepatan gerakan']) assert.ok(visualUi.includes(token), token);
  assert.match(visualPreview, /mixBlendMode: blendModes\[visual\.blendMode \?\? 'normal'\]/);
  assert.match(visualBuilder, /colorkey=0x\$\{keyColor\}/);
  assert.match(visualBuilder, /blend=all_mode=\$\{mode\}/);
  assert.match(visualBuilder, /maskedmerge/);
});
check('Visualizer project validator bounds crop, motion, blend, chroma and smoothing inputs', () => {
  for (const token of ['sourceCrop !== undefined', 'motionAmount > 0.3', 'motionSpeed > 4', 'blendMode !== undefined', 'chromaSimilarity > 1', 'chromaBlend > 1', 'v.smoothing > 0.97']) assert.ok(validator.includes(token), token);
});
check('SEO results preserve four tabs before and after generation', () => {
  assert.match(seo, /type SeoResultTab = 'titles' \| 'description' \| 'tags' \| 'hashtags'/);
  assert.match(seo, /role="tablist"/);
  for (const token of ["{ id: 'titles', label: 'Judul'", "{ id: 'description', label: 'Deskripsi'", "{ id: 'tags', label: 'Tags'", "{ id: 'hashtags', label: 'Hashtag'"]) assert.ok(seo.includes(token), token);
  assert.match(seo, /role="tab"[\s\S]*?aria-selected=\{activeResultTab === tab\.id\}/);
});
check('SEO generation returns to the title tab and each result family renders only inside its matching tab', () => {
  assert.match(seo, /setResult\(value\); setActiveResultTab\('titles'\)/);
  for (const tab of ['titles','description','tags','hashtags']) assert.ok(seo.includes(`result && activeResultTab === '${tab}'`), tab);
  assert.match(seo, /useEffect\(\(\) => \{ setResult\(latestResult\); setActiveResultTab\('titles'\); \}, \[latestResult, project\.projectId\]\)/);
});
check('SEO fullscreen workspace pins the config, canvas and tabbed results to shared rows and columns', () => {
  assert.match(css, /@media \(min-width:1200px\)[\s\S]*?\.mrp-render-page--seo-workspace[\s\S]*?grid-template-columns:\s*minmax\(0,1fr\) minmax\(0,2fr\) minmax\(0,1fr\)/);
  assert.match(css, /\.mrp-render-page--seo-workspace \.mrp-seo-config-panel\s*\{[^}]*grid-column:1;[^}]*grid-row:2\s*\/\s*(?:span\s*)?2/s);
  assert.match(css, /\.mrp-render-page--seo-workspace \.mrp-seo-results-panel\s*\{[^}]*grid-column:3;[^}]*grid-row:2\s*\/\s*(?:span\s*)?2/s);
  assert.match(css, /\.mrp-seo-result-tabs/);
});
check('P24 test and UI verification entry points remain registered with synchronized version metadata', () => {
  assert.match(pkg.version, /^0\.3\.\d+$/);
  assert.equal(pkg.scripts?.['test:p24-undo-visualizer-seo'], 'node scripts/test-p24-undo-visualizer-seo.cjs');
  assert.equal(pkg.scripts?.['verify:ui-layout:p24'], 'node scripts/verify-ui-layout-p24.mjs');
});

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error.split('\n')[0].slice(0,260)}` : ''}`);
console.log(`P24 UNDO/VISUALIZER/SEO: ${failed.length ? `FAILED (${failed.length})` : 'PASSED'} (${checks.length - failed.length} PASS, ${failed.length} FAIL)`);
process.exitCode = failed.length ? 1 : 0;
