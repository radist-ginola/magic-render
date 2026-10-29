const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  module._compile(output, filename);
};
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const pkg = json('package.json');
const lock = json('package-lock.json');
const checks = [];
const check = (name, fn) => { try { fn(); checks.push({name, ok:true}); } catch (error) { checks.push({name, ok:false, error:error instanceof Error ? error.message : String(error)}); } };

const types = read('src/shared/domain/visualizerTypes.ts');
const validator = read('src/main/services/effects/visualizerValidator.ts');
const ui = read('src/renderer/components/EffectsPanels.tsx');
const preview = read('src/renderer/components/VisualizerPreview.tsx');
const canvas = read('src/renderer/components/CanvasPreview.tsx');
const updateTypes = read('src/shared/domain/previewTypes.ts');
const builderSource = read('src/main/services/effects/visualizerBuilder.ts');
const css = read('src/renderer/styles/index.css');
const help = read('src/renderer/components/HelpPage.tsx');
const reference = read('docs/FFMPEG_VISUALIZER_REFERENCE.md');

check('P34 version and lockfile root remain synchronized', () => {
  assert.equal(lock.version, pkg.version); assert.equal(lock.packages?.['']?.version, pkg.version);
  assert.deepEqual(pkg.dependencies, lock.packages?.['']?.dependencies); assert.deepEqual(pkg.devDependencies, lock.packages?.['']?.devDependencies);
});
check('Playlist-like panel spacing is consistent across all six requested workspaces', () => {
  assert.match(css, /--mrp-workspace-panel-padding: 13px/); assert.match(css, /--mrp-workspace-panel-gap: 12px/);
  for (const token of ['mrp-media-project-card','mrp-intro-panel__library','mrp-overlay-panel__left-column','mrp-sticker-library-panel','mrp-seo-config-panel','mrp-canvas-body']) assert.ok(css.includes(token), token);
  assert.match(css, /margin:0 !important; padding:var\(--mrp-workspace-panel-padding\) !important/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 2fr\) minmax\(0, 1fr\)/);
});
check('All 17 guide topics have a documented integration mapping', () => {
  for (const title of ['Waveform Basics','Waveform Modes & Styles','Background Integration','Stereo Visualizations','Circular & Radial Visualizations','VU Meters & Volume Displays','Spectrum Analyzers','Text Overlays & Title Animations','Logo & Image Overlays','Glow Effects','Screen Recording','Video Rotation','Scrolling Text','Static Waveform Images','Scale Modes','Color Reference Palette','Troubleshooting & Tips']) assert.ok(reference.includes(title), title);
  assert.ok(reference.includes('not valid')); assert.ok(help.includes('FFmpeg Visualizer Reference')); assert.ok(help.includes('Complete%20FFmpeg%20Audio%20Visualization'));
  for (const title of ['Waveform Basics','Waveform Modes &amp; Styles','Background Integration','Stereo Visualizations','Circular &amp; Radial Visualizations','VU Meters &amp; Volume Displays','Spectrum Analyzers','Text Overlays &amp; Title Animations','Logo &amp; Image Overlays','Glow Effects','Screen Recording','Video Rotation','Scrolling Text','Static Waveform Images','Scale Modes','Color Reference Palette','Troubleshooting &amp; Tips']) assert.ok(help.includes(title), `in-app help ${title}`);
});
check('New FFmpeg model styles, configurable modes and validator constraints are integrated', () => {
  for (const style of ['spectrum','frequency','vu-meter','polar']) { assert.ok(types.includes(`'${style}'`), style); assert.ok(ui.includes(style === 'vu-meter' ? "'vu-meter':" : `${style}:`), `UI ${style}`); assert.ok(preview.includes(style), `preview ${style}`); assert.ok(builderSource.includes(`'${style}'`), `builder ${style}`); }
  for (const field of ['waveformMode','waveformScale','frequencyMode','spectrumSlide','volumeMode','volumeOrientation','vectorScopeMode']) { assert.ok(types.includes(`${field}?`), field); assert.ok(validator.includes(`${field} !== undefined`), `validator ${field}`); assert.ok(ui.includes(field), `UI control ${field}`); }
  for (const mode of ['line','cline','p2p','point']) assert.ok(types.includes(`'${mode}'`), mode);
});
check('Visualizer layers can be moved, resized, zoomed and stored in project updates', () => {
  assert.match(updateTypes, /kind: 'overlay' \| 'text' \| 'sticker' \| 'visualizer'/);
  assert.match(updateTypes, /if \(update\.kind === 'visualizer'\)/);
  assert.match(canvas, /kind === 'visualizer'.*item\.size\.width/s);
  assert.match(canvas, /function zoomVisualizer\(/); assert.match(canvas, /onLayerWheelZoom=\{zoomVisualizer\}/);
  assert.match(canvas, /'overlay', 'text', 'sticker', 'visualizer'/);
  assert.match(preview, /mrp-preview-visualizer__resize/); assert.match(preview, /event\.ctrlKey.*event\.metaKey/);
  assert.match(css, /mrp-preview-visualizer-frame\.is-selected/); assert.match(css, /\.mrp-preview-visualizer__resize\.se/);
});
check('Canvas resize and zoom update the persisted visualizer size/position with bounds', () => {
  const sourcePath = path.join(root, 'src/shared/domain/previewTypes.ts');
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const moduleObject = new Module(sourcePath, module); moduleObject.filename = sourcePath; moduleObject.paths = Module._nodeModulePaths(path.dirname(sourcePath)); moduleObject._compile(compiled, sourcePath);
  const applyUpdate = moduleObject.exports.applyPreviewVisualUpdate;
  const project = { visualizers: [{ id: 'resizable-test', position: { x: 100, y: 200 }, size: { width: 400, height: 100 }, opacity: .8 }] };
  const moved = applyUpdate(project, { kind: 'visualizer', id: 'resizable-test', position: { x: 120, y: 220 }, width: 440, height: 110 });
  assert.deepEqual(moved.visualizers[0].position, { x: 120, y: 220 }); assert.deepEqual(moved.visualizers[0].size, { width: 440, height: 110 });
  const bounded = applyUpdate(moved, { kind: 'visualizer', id: 'resizable-test', width: 1, height: 9999 });
  assert.deepEqual(bounded.visualizers[0].size, { width: 32, height: 2160 });
});
check('Audio analyser nodes do not rebuild during layer geometry edits', () => {
  assert.match(preview, /routingSignature = items\.map\(\(item\) => `\$\{item\.id\}:\$\{item\.kind\}:\$\{item\.density \?\? 64\}:\$\{item\.barCount \?\? ''\}`\)/);
  assert.ok(preview.includes('visual.barCount ?? visual.density ?? 64'), 'FFT size must follow the selected bar/sample count');
  assert.match(preview, /\}, \[audio, fps, routingSignature\]\)/);
});

// Load the real TS graph builder and test the newly integrated filter styles against FFmpeg.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-p34-visualizer-'));
let buildVisualizerFilters;
try {
  const sourcePath = path.join(root, 'src/main/services/effects/visualizerBuilder.ts');
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const moduleObject = new Module(sourcePath, module); moduleObject.filename = sourcePath; moduleObject.paths = Module._nodeModulePaths(path.dirname(sourcePath)); moduleObject._compile(compiled, sourcePath);
  buildVisualizerFilters = moduleObject.exports.buildVisualizerFilters;
} catch (error) { console.error(`Cannot load TypeScript visualizer builder: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); }
const ffmpeg = process.env.MAGIC_RENDER_FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.MAGIC_RENDER_FFPROBE_PATH || 'ffprobe';
const ffmpegAvailable = spawnSync(ffmpeg, ['-version'], { encoding:'utf8', timeout:10000 }).status === 0;
if (ffmpegAvailable) {
  const modes = [
    { style:'spectrum', props:{palette:'fire', spectrumSlide:'scroll', waveformScale:'sqrt', frequencyScale:'log'} },
    { style:'frequency', props:{frequencyMode:'bar', waveformScale:'sqrt', frequencyScale:'log'} },
    { style:'frequency', props:{frequencyMode:'line', waveformScale:'lin', frequencyScale:'linear'} },
    { style:'frequency', props:{frequencyMode:'dot', waveformScale:'cbrt', frequencyScale:'log'} },
    { style:'vu-meter', props:{volumeMode:'rms', volumeOrientation:'horizontal'} },
    { style:'vu-meter', props:{volumeMode:'peak', volumeOrientation:'vertical'} },
    { style:'polar', props:{vectorScopeMode:'polar'} },
    { style:'basic-split', props:{waveformMode:'line', waveformScale:'lin'} },
    { style:'basic-split', props:{waveformMode:'cline', waveformScale:'sqrt'} },
    { style:'basic-split', props:{waveformMode:'p2p', waveformScale:'cbrt'} },
    { style:'basic-split', props:{waveformMode:'point', waveformScale:'log'} },
  ];
  for (const [modeIndex, {style,props}] of modes.entries()) {
    const name = `FFmpeg smoke render: ${style} ${JSON.stringify(props)}`;
    try {
      const visual = { id:'p34test', kind:'wave', stereoStyle:style, position:{x:0,y:0}, size:{width:320,height:120}, opacity:0.85, sensitivity:1, smoothing:0.25, stereoLeftColor:'#ff3b30', stereoRightColor:'#2f80ff', color:'#2cf9ff', glow:2, fadeInSec:0, ...props };
      const built = buildVisualizerFilters([visual], 'base', 1, 1, 25);
      const graph = ['[0:v]null[base]', ...built.filters].join(';');
      const outPath = path.join(tempDir, `${String(modeIndex).padStart(2, '0')}-${style}.mp4`);
      const run = spawnSync(ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=25:duration=0.7','-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=0.7','-filter_complex',graph,'-map',`[${built.output}]`,'-map','1:a:0','-t','0.7','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-y',outPath], {encoding:'utf8', timeout:60000, windowsHide:true});
      assert.equal(run.status, 0, run.stderr || run.error?.message || `FFmpeg exit ${run.status}`); assert.ok(fs.statSync(outPath).size > 1000, 'render file empty');
      const probe = spawnSync(ffprobe, ['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,pix_fmt,width,height','-of','json',outPath], {encoding:'utf8', timeout:15000, windowsHide:true});
      assert.equal(probe.status, 0, probe.stderr || 'FFprobe failed'); const streams=JSON.parse(probe.stdout).streams ?? [];
      assert.equal(streams[0]?.codec_name,'h264'); assert.equal(streams[0]?.pix_fmt,'yuv420p'); checks.push({name,ok:true});
    } catch (error) { checks.push({name,ok:false,error:error instanceof Error?error.message:String(error)}); }
  }
} else console.warn('SKIP: FFmpeg runtime unavailable.');
try { fs.rmSync(tempDir,{recursive:true,force:true}); } catch {}
for (const item of checks) console.log(`${item.ok?'PASS':'FAIL'}: ${item.name}${item.error?` — ${item.error.split('\n')[0].slice(0,240)}`:''}`);
const failed=checks.filter((item)=>!item.ok); console.log(`P34 VISUALIZER / CANVAS / REFERENCE: ${failed.length?'FAILED ('+failed.length+')':'PASSED ('+checks.length+')'}`); process.exitCode=failed.length?1:0;
