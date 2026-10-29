const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
require.extensions['.ts'] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const out = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  mod._compile(out, filename);
};
const checks = [];
const check = (label, fn) => { fn(); checks.push(label); console.log(`PASS: ${label}`); };

const panel = read('src/renderer/components/EffectsPanels.tsx');
const preview = read('src/renderer/components/VisualizerPreview.tsx');
const builderSource = read('src/main/services/effects/visualizerBuilder.ts');
const paletteSource = read('src/shared/domain/visualizerPalette.ts');
const types = read('src/shared/domain/visualizerTypes.ts');
const validator = read('src/main/services/effects/visualizerValidator.ts');
const css = read('src/renderer/styles/index.css');

check('Media right panel uses the Sticker Subscribe outer/inner spacing tokens', () => {
  assert.match(css, /P35-HF3 — lock Media right-panel gutters/);
  assert.match(css, /\.mrp-render-page--media-workspace \.mrp-media-settings-stack[\s\S]{0,340}margin: var\(--mrp-sticker-panel-outside-top\) var\(--mrp-sticker-panel-outside-right\) var\(--mrp-sticker-panel-outside-bottom\) 0 !important/);
  assert.match(css, /\.mrp-render-page--media-workspace \.mrp-media-settings-stack > \.mrp-main-media-controls,[\s\S]{0,280}padding: var\(--mrp-sticker-panel-inner-padding\) !important/);
});
check('Visualizer exposes one user color input and controls for round caps and peak markers', () => {
  assert.ok(panel.includes('Warna utama'));
  assert.doesNotMatch(panel, /Warna kanal kiri|Warna kanal kanan|Warna akhir gradient/);
  assert.ok(panel.includes('Sudut atas melengkung'));
  assert.ok(panel.includes('Tampilkan titik puncak bar'));
  assert.ok(types.includes('showPeakMarker?: boolean'));
  assert.ok(validator.includes("v.showPeakMarker !== undefined && typeof v.showPeakMarker !== 'boolean'"));
  assert.ok(preview.includes('drawRoundedBar') && preview.includes('drawBarPeak'));
});

const palettePath = path.join(root, 'src/shared/domain/visualizerPalette.ts');
const paletteModule = new Module(palettePath, module); paletteModule.filename = palettePath; paletteModule.paths = Module._nodeModulePaths(path.dirname(palettePath));
paletteModule._compile(ts.transpileModule(paletteSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, palettePath);
const { resolveVisualizerColors } = paletteModule.exports;
check('Canvas preview and FFmpeg share the same single-color derivation, ignoring legacy second-color values', () => {
  const single = resolveVisualizerColors({ color: '#abcdef', colorMode: 'single' });
  assert.deepEqual(single, { primary: '#abcdef', secondary: '#abcdef' });
  const a = resolveVisualizerColors({ color: '#2cf9ff', colorMode: 'gradient', gradientEndColor: '#ff49d4', stereoLeftColor: '#010203', stereoRightColor: '#040506' });
  const b = resolveVisualizerColors({ color: '#2cf9ff', colorMode: 'gradient', gradientEndColor: '#123456', stereoLeftColor: '#654321', stereoRightColor: '#fedcba' });
  assert.deepEqual(a, b);
  assert.match(builderSource, /resolveVisualizerColors\(item\)/);
  assert.match(preview, /resolveVisualizerColors\(visual\)/);
});

const builderPath = path.join(root, 'src/main/services/effects/visualizerBuilder.ts');
const builderModule = new Module(builderPath, module); builderModule.filename = builderPath; builderModule.paths = Module._nodeModulePaths(path.dirname(builderPath));
builderModule._compile(ts.transpileModule(builderSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, builderPath);
const { buildVisualizerFilters } = builderModule.exports;
const ffmpeg = process.env.MAGIC_RENDER_FFMPEG_PATH || (process.platform === 'win32' ? path.join(root, 'resources', 'ffmpeg', 'ffmpeg.exe') : 'ffmpeg');
const ffprobe = process.env.MAGIC_RENDER_FFPROBE_PATH || (process.platform === 'win32' ? path.join(root, 'resources', 'ffmpeg', 'ffprobe.exe') : 'ffprobe');
assert.equal(spawnSync(ffmpeg, ['-version'], { encoding: 'utf8', timeout: 10000, windowsHide: true }).status, 0, 'FFmpeg executable must be available for render smoke tests');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-p35-hf3-bars-'));
try {
  const cases = [
    { style: 'onix-analyzer', roundedTop: true, showPeakMarker: true, symmetry: false, colorMode: 'gradient' },
    { style: 'vertical-spectrum-bars', roundedTop: true, showPeakMarker: false, symmetry: false, colorMode: 'single' },
    { style: 'onix-modern', roundedTop: false, showPeakMarker: true, symmetry: true, colorMode: 'neon' },
    { style: 'frequency', frequencyMode: 'bar', roundedTop: true, showPeakMarker: true, symmetry: true, colorMode: 'amber' },
  ];
  for (const [index, c] of cases.entries()) {
    const visual = {
      id: `hf3-${index}`, kind: 'wave', stereoStyle: c.style, frequencyMode: c.frequencyMode ?? 'bar',
      position: { x: 0, y: 0 }, size: { width: 320, height: 180 }, color: '#2cf9ff', colorMode: c.colorMode,
      gradientEndColor: '#ff49d4', stereoLeftColor: '#ff0000', stereoRightColor: '#00ff00', opacity: .85,
      sensitivity: 1, smoothing: .35, frequencyScale: 'log', waveformScale: 'sqrt', barCount: 32, density: 32,
      roundedTop: c.roundedTop, cornerRadius: 6, bandSpacing: .15, showPeakMarker: c.showPeakMarker,
      symmetry: c.symmetry, frequencyMinHz: 40, frequencyMaxHz: 16000, alphaFormat: 'rgba', glow: 1,
    };
    const built = buildVisualizerFilters([visual], 'base', 1, 1, 12);
    const graph = ['[0:v]null[base]', ...built.filters].join(';');
    assert.match(graph, /showfreqs=.*mode=bar/);
    assert.equal(graph.includes('mode=dot'), c.showPeakMarker, 'peak dot branch should follow the peak-marker toggle');
    assert.equal(graph.includes('vstack=inputs=2'), c.symmetry, 'symmetric bars should mirror the half-height spectrum');
    if (c.roundedTop) assert.match(graph, /geq=.*alphaExpression|geq=.*alpha\(X,Y/);
    const output = path.join(temp, `${index}.mp4`);
    const args = ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=black:s=320x180:r=12:d=0.6','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.6','-filter_complex',graph,'-map',`[${built.output}]`,'-map','1:a:0','-t','0.6','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',output];
    const run = spawnSync(ffmpeg, args, { encoding: 'utf8', timeout: 45000, windowsHide: true });
    assert.equal(run.status, 0, `${c.style} / ${JSON.stringify(c)} failed: ${run.stderr || run.error?.message || run.status}`);
    const probe = spawnSync(ffprobe, ['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,pix_fmt,width,height','-of','json',output], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(probe.status, 0, probe.stderr || 'FFprobe failed');
    const stream = JSON.parse(probe.stdout).streams?.[0];
    assert.equal(stream?.codec_name, 'h264'); assert.equal(stream?.pix_fmt, 'yuv420p'); assert.equal(stream?.width, 320); assert.equal(stream?.height, 180);
    checks.push(`FFmpeg+FFprobe bar smoke: ${c.style} (${c.showPeakMarker ? 'peak-on' : 'peak-off'}, ${c.symmetry ? 'symmetric' : 'normal'})`);
    console.log(`PASS: ${checks.at(-1)}`);
  }
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log(`P35-HF3 VISUALIZER PARITY: PASSED (${checks.length} checks)`);
