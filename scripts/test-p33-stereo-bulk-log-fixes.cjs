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

const modes = ['basic-split','mirrored','gap','split-colors','cqt','rainbow','glow','reflection','vector'];
const visualTypes = read('src/shared/domain/visualizerTypes.ts');
const visualUi = read('src/renderer/components/EffectsPanels.tsx');
const visualPreview = read('src/renderer/components/VisualizerPreview.tsx');
const visualBuilderSource = read('src/main/services/effects/visualizerBuilder.ts');
const css = read('src/renderer/styles/index.css');
const app = read('src/renderer/App.tsx');
const bulkUi = read('src/renderer/components/BulkRenderPage.tsx');
const bulkTypes = read('src/shared/domain/bulkTypes.ts');
const bulkPlanner = read('src/main/services/bulk/bulkPlanner.ts');
const timestamp = read('src/main/services/aiService/timestampGenerator.ts');
const seoWriter = read('src/main/services/aiService/seoFileWriter.ts');
const mainLog = read('src/main/index.ts');
const rendererLog = read('src/renderer/components/ConsoleLogPanel.tsx');

check('P33 version, lockfile and dependency sets are synchronized', () => {
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages?.['']?.version, pkg.version);
  assert.deepEqual(pkg.dependencies, lock.packages?.['']?.dependencies);
  assert.deepEqual(pkg.devDependencies, lock.packages?.['']?.devDependencies);
});
check('Every stereo model appears in controls, shared types, preview and render builder', () => {
  for (const mode of modes) {
    assert.ok(visualTypes.includes(`'${mode}'`), `shared type ${mode}`);
    assert.ok(visualUi.includes(`'${mode}'`) || visualUi.includes(`value: '${mode}'`) || visualUi.includes(`${mode}:`), `control ${mode}`);
    assert.ok(visualPreview.includes(mode), `preview ${mode}`);
    assert.ok(visualBuilderSource.includes(mode), `render builder ${mode}`);
  }
  for (const token of ['showwaves=','showcqt=','avectorscope=','channelsplit=channel_layout=stereo','boxblur=${glowRadius}:1','hflip,vflip',"hue=h='t*100'"]) assert.ok(visualBuilderSource.includes(token), token);
  assert.match(visualPreview, /stereoAnalysers: Map<string, StereoAnalyserPair>/);
  assert.match(visualPreview, /getByteTimeDomainData\(buffers\.leftWaveform\)/);
  assert.match(visualPreview, /getByteTimeDomainData\(buffers\.rightWaveform\)/);
});
check('Six workspace menus share consistent margin, padding, gaps, and 25/50/25 desktop proportions', () => {
  assert.match(css, /--mrp-workspace-column-left: minmax\(0, 1fr\)/);
  assert.match(css, /--mrp-workspace-column-center: minmax\(0, 2fr\)/);
  assert.match(css, /--mrp-workspace-column-right: minmax\(0, 1fr\)/);
  assert.match(css, /--mrp-workspace-panel-padding: 13px/);
  assert.match(css, /--mrp-workspace-panel-gap: 12px/);
  for (const name of ['media','intro','overlay','sticker','seo','final-render']) assert.ok(css.includes(`mrp-render-page--${name}-workspace`) || css.includes(`mrp-${name}`), `shared workspace ${name}`);
  assert.match(css, /margin: 0 !important/);
});
check('Bulk Render exposes metadata mode and receives the active YouTube SEO project template', () => {
  for (const mode of ["'timestamp'", "'timestamp-seo'", "'none'"]) assert.ok(bulkTypes.includes(mode), mode);
  assert.match(bulkUi, /timestamp\.txt/); assert.match(bulkUi, /youtubeseo\.txt/); assert.match(bulkUi, /Tidak Ada/);
  assert.match(app, /prepareBulkRender\(\{media:bulkMedia,[\s\S]*?seoTemplate:project\?\.youtubeSEO\}/);
  assert.match(app, /generateYoutubeSeo\(plan\.project, result\.outputPath\)/);
  assert.match(bulkPlanner, /project\.bulkItemId = media\.id/);
  assert.match(timestamp, /\$\{path\.basename\(outputVideoPath, path\.extname\(outputVideoPath\)\)\}-timestamp\.txt/);
  assert.match(seoWriter, /\$\{path\.basename\(outputVideoPath, path\.extname\(outputVideoPath\)\)\}-youtubeseo\.txt/);
  assert.match(app, /Video sudah berhasil dirender, tetapi proses metadata gagal/);
});
check('Console Log translates MP4 metadata and distinguishes success stages from failing stages', () => {
  for (const token of ['durationSeconds','videoCodec','pixelFormat','audioCodec','formatName']) { assert.ok(mainLog.includes(token), `main ${token}`); assert.ok(rendererLog.includes(token), `renderer ${token}`); }
  assert.match(mainLog, /Validasi MP4 final lulus/); assert.match(rendererLog, /Validasi MP4 final lulus/);
  assert.match(mainLog, /Tahap selesai/); assert.match(rendererLog, /Tahap selesai/);
  assert.match(mainLog, /Tahap bermasalah/); assert.match(rendererLog, /Tahap bermasalah/);
});

// Load the actual filter-graph builder via the installed TypeScript transpiler.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-p33-stereo-'));
let buildVisualizerFilters;
try {
  const sourcePath = path.join(root, 'src/main/services/effects/visualizerBuilder.ts');
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const moduleObject = new Module(sourcePath, module);
  moduleObject.filename = sourcePath;
  moduleObject.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  moduleObject._compile(compiled, sourcePath);
  buildVisualizerFilters = moduleObject.exports.buildVisualizerFilters;
} catch (error) {
  console.error(`Cannot load TypeScript visualizer builder: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
function resolveBinary(envKey, bundledName, fallback) {
  const candidate = process.env[envKey];
  if (candidate && fs.existsSync(candidate)) return candidate;
  const bundled = path.join(root, 'resources', 'ffmpeg', bundledName);
  if (fs.existsSync(bundled)) return bundled;
  return fallback;
}
const ffmpeg = resolveBinary('MAGIC_RENDER_FFMPEG_PATH', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg', 'ffmpeg');
const ffprobe = resolveBinary('MAGIC_RENDER_FFPROBE_PATH', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe', 'ffprobe');
let ffmpegAvailable = spawnSync(ffmpeg, ['-version'], { encoding:'utf8', timeout:10000, windowsHide:true }).status === 0;
if (ffmpegAvailable) {
  for (const mode of modes) {
    const name = `Real FFmpeg render smoke test: ${mode}`;
    try {
      const visual = { id:`test-${mode}`, kind:'wave', stereoStyle:mode, position:{x:0,y:0}, size:{width:320,height:120}, opacity:0.85, sensitivity:1, smoothing:0.9, stereoLeftColor:'#ff3b30', stereoRightColor:'#2f80ff', glow:2, fadeInSec:0 };
      const built = buildVisualizerFilters([visual], 'base', 1, 1, 25);
      const graph = ['[0:v]null[base]', ...built.filters].join(';');
      const outPath = path.join(tempDir, `${mode}.mp4`);
      const args = ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=25:duration=1','-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=1','-filter_complex',graph,'-map',`[${built.output}]`,'-map','1:a:0','-t','1','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-y',outPath];
      const run = spawnSync(ffmpeg, args, { encoding:'utf8', timeout:60000, windowsHide:true });
      assert.equal(run.status, 0, run.stderr || run.error?.message || `FFmpeg exit code ${run.status}`);
      assert.ok(fs.statSync(outPath).size > 1000, 'MP4 is not empty');
      const probe = spawnSync(ffprobe, ['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,pix_fmt','-of','json',outPath], { encoding:'utf8', timeout:15000, windowsHide:true });
      assert.equal(probe.status, 0, probe.stderr || 'FFprobe failed');
      const streams = JSON.parse(probe.stdout).streams ?? [];
      assert.equal(streams[0]?.codec_name, 'h264'); assert.equal(streams[0]?.pix_fmt, 'yuv420p');
      checks.push({name, ok:true});
    } catch (error) {
      checks.push({name, ok:false, error:error instanceof Error ? error.message : String(error)});
    }
  }
} else {
  console.warn('SKIP: FFmpeg stereo smoke tests — FFmpeg binary not available in this environment.');
}
try { fs.rmSync(tempDir, {recursive:true, force:true}); } catch {}
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error.split('\n')[0].slice(0,240)}` : ''}`);
const failed = checks.filter((item) => !item.ok);
console.log(`P33 STEREO/BULK/LOG: ${failed.length ? `FAILED (${failed.length})` : `PASSED (${checks.length})`}`);
process.exitCode = failed.length ? 1 : 0;
