const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  module._compile(output, filename);
};

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const checks = [];
const check = (name, fn) => { try { fn(); checks.push({ name, ok: true }); } catch (error) { checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }); } };

const modelStyles = [
  'onix-analyzer','onix-classic','onix-modern','onix-plasma','onix-infinity','onix-neon','onix-hawking','onix-core','onix-reactor','onix-spotlight','onix-twirl','onix-warp','onix-ripple','onix-pulsar','onix-hallucia',
  'onix-logo','onix-album-art','onix-blank',
  'vertical-spectrum-bars','circular-spectrum','circular-waveform','radial-spectrum','oscilloscope','lissajous','waveform-progress',
];
const types = read('src/shared/domain/visualizerTypes.ts');
const panel = read('src/renderer/components/EffectsPanels.tsx');
const preview = read('src/renderer/components/VisualizerPreview.tsx');
const canvas = read('src/renderer/components/CanvasPreview.tsx');
const app = read('src/renderer/App.tsx');
const css = read('src/renderer/styles/index.css');
const builderSource = read('src/main/services/effects/visualizerBuilder.ts');

check('VisualizerPreview has no unreachable legacy style comparisons (TS2367 regression)', () => {
  assert.match(preview, /if \(style === 'lissajous'\) \{/);
  assert.doesNotMatch(preview, /style === 'lissajous' \|\| style === 'onix-infinity'/);
  assert.equal((preview.match(/style\s*===\s*'onix-blank'/g) ?? []).length, 1, 'onix-blank should be handled once at the early dispatch');
  assert.equal((preview.match(/style\s*===\s*'onix-neon'/g) ?? []).length, 1, 'onix-neon should be handled once at its implementation');
  assert.equal((preview.match(/style\s*===\s*'onix-infinity'/g) ?? []).length, 1, 'onix-infinity should be handled once at circular-wave dispatch');
});
check('Every ONIXLabs style and supplementary visualizer mode is represented in domain types, UI and FFmpeg builder', () => {
  for (const style of modelStyles) {
    assert.ok(types.includes(`'${style}'`), `domain type missing ${style}`);
    assert.ok(panel.includes(`value:'${style}'`), `UI option missing ${style}`);
    assert.ok(builderSource.includes(style), `builder missing ${style}`);
    if (!['onix-logo','onix-album-art','onix-blank'].includes(style)) assert.ok(preview.includes(`'${style}'`), `Canvas preview missing ${style}`);
  }
});
check('Visualizer controls include position/size, thickness, bar count, symmetry, color mode, sensitivity, smoothing, frequency range, resolution/FPS/alpha/final codec', () => {
  for (const token of ['Ketebalan garis','Jumlah bar / sampel','Simetri / cermin','Mode warna','Sensitivitas','Kehalusan / anti-getar','Frekuensi minimum (Hz)','Frekuensi maksimum (Hz)','Alpha sementara','Codec akhir','project.settings.resolution','project.settings.fps']) assert.ok(panel.includes(token), `missing control ${token}`);
  assert.ok(panel.includes('Warna utama'), 'the visualizer must expose one color input');
  assert.doesNotMatch(panel, /Warna kanal kiri|Warna kanal kanan|Warna akhir gradient/, 'legacy secondary color inputs should be removed');
  assert.ok(panel.includes('Tampilkan titik puncak bar'));
  assert.ok(panel.includes('Sudut atas melengkung'));
});
check('Sticker Subscribe panel margin/padding tokens are applied to all requested workspaces', () => {
  for (const page of ['media','intro','overlay','seo']) assert.ok(css.includes(`.mrp-render-page--${page}-workspace`));
  for (const token of ['--mrp-sticker-panel-outside-top: 14px','--mrp-sticker-panel-outside-bottom: 12px','--mrp-sticker-panel-outside-left: 14px','--mrp-sticker-panel-outside-right: 14px','--mrp-sticker-panel-inner-padding: 12px','--mrp-sticker-preview-inner-padding: 6px']) assert.ok(css.includes(token), token);
  assert.match(css, /\.mrp-final-render-preview[\s\S]{0,180}\.mrp-canvas-body/);
});
check('Canvas stage is centered and media zoom preserves/recenters its bounding-box center', () => {
  assert.match(canvas, /left: '50%', top: '50%'/);
  assert.match(canvas, /transformOrigin: 'center center'/);
  assert.match(app, /const centerX = current\.position\.x === 0 && oldWidth <= 1920 \? 960 : current\.position\.x \+ oldWidth \/ 2/);
  assert.match(app, /const centerY = current\.position\.y === 0 && oldHeight <= 1080 \? 540 : current\.position\.y \+ oldHeight \/ 2/);
});

const sourcePath = path.join(root, 'src/main/services/effects/visualizerBuilder.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const moduleObject = new Module(sourcePath, module); moduleObject.filename = sourcePath; moduleObject.paths = Module._nodeModulePaths(path.dirname(sourcePath)); moduleObject._compile(compiled, sourcePath);
const buildVisualizerFilters = moduleObject.exports.buildVisualizerFilters;

function resolveBin(envKey, baseName) {
  if (process.env[envKey]) return process.env[envKey];
  const packaged = path.join(root, 'resources', 'ffmpeg', process.platform === 'win32' ? `${baseName}.exe` : baseName);
  return fs.existsSync(packaged) ? packaged : baseName;
}
const ffmpeg = resolveBin('MAGIC_RENDER_FFMPEG_PATH', 'ffmpeg');
const ffprobe = resolveBin('MAGIC_RENDER_FFPROBE_PATH', 'ffprobe');
const available = spawnSync(ffmpeg, ['-version'], { encoding:'utf8', timeout:10000, windowsHide:true }).status === 0;
if (available) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-p35-onix-'));
  try {
    for (const [index, style] of modelStyles.entries()) {
      const isArtwork = ['onix-logo','onix-album-art'].includes(style);
      const isBlank = style === 'onix-blank';
      const id = `p35_${index}`;
      const visual = {
        id, kind: isArtwork ? 'mediaLogo' : 'wave', sourcePath: isArtwork ? 'synthetic-test-art.png' : undefined,
        stereoStyle: style, position: { x: 0, y: 0 }, size: { width: 320, height: 180 },
        color: '#2cf9ff', opacity: 0.85, sensitivity: 1, smoothing: 0.35, frequencyScale: 'log', waveformMode: 'cline', waveformScale: 'sqrt',
        colorMode: 'gradient', gradientEndColor: '#ff49d4', stereoLeftColor: '#00ddee', stereoRightColor: '#ff44bb', thickness: 3, barCount: 48, symmetry: index % 2 === 0,
        frequencyMinHz: 40, frequencyMaxHz: 16000, alphaFormat: 'rgba', glow: 2, mediaMotion: 'none',
      };
      try {
        const built = buildVisualizerFilters([visual], 'base', 1, 1, 12, 0, isArtwork ? { [id]: 2 } : {});
        const graph = ['[0:v]null[base]', ...built.filters].join(';');
        const output = path.join(temp, `${String(index).padStart(2, '0')}-${style}.mp4`);
        const args = ['-hide_banner','-loglevel','error','-y', '-f','lavfi','-i','color=c=black:s=320x180:r=12:d=0.5', '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.5', '-f','lavfi','-i','color=c=0x30b8c8:s=128x128:r=12:d=0.5'];
        if (built.filters.length) args.push('-filter_complex', graph);
        args.push('-map', built.filters.length ? `[${built.output}]` : '0:v:0', '-map', '1:a:0', '-t', '0.5', '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',output);
        const run = spawnSync(ffmpeg, args, { encoding:'utf8', timeout:60000, windowsHide:true });
        assert.equal(run.status, 0, run.stderr || run.error?.message || `FFmpeg exit ${run.status}`);
        assert.ok(fs.statSync(output).size > 1000, 'output MP4 is unexpectedly small');
        const probe = spawnSync(ffprobe, ['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,pix_fmt,width,height','-of','json',output], { encoding:'utf8', timeout:15000, windowsHide:true });
        assert.equal(probe.status,0, probe.stderr || 'FFprobe failed');
        const stream = JSON.parse(probe.stdout).streams?.[0];
        assert.equal(stream?.codec_name,'h264'); assert.equal(stream?.pix_fmt,'yuv420p'); assert.equal(stream?.width,320); assert.equal(stream?.height,180);
        checks.push({ name: `FFmpeg + FFprobe smoke render: ${style}${isBlank ? ' (passes base through without an EQ layer)' : ''}`, ok: true });
      } catch (error) { checks.push({ name: `FFmpeg + FFprobe smoke render: ${style}`, ok: false, error: error instanceof Error ? error.message : String(error) }); }
    }
    // Verify a 10-bit alpha intermediate can be composited into the final MP4.
    try {
      const id = 'p35_alpha';
      const visual = { id, kind:'wave', stereoStyle:'onix-analyzer', position:{x:0,y:0}, size:{width:320,height:180}, color:'#2cf9ff', opacity:.8, sensitivity:1, smoothing:.3, frequencyScale:'log', waveformMode:'cline', waveformScale:'sqrt', colorMode:'gradient', gradientEndColor:'#ff49d4', thickness:2, barCount:48, frequencyMinHz:40, frequencyMaxHz:16000, alphaFormat:'yuva444p10le' };
      const built = buildVisualizerFilters([visual], 'base', 1, 1, 12);
      const graph = ['[0:v]null[base]', ...built.filters].join(';');
      const output = path.join(temp,'alpha-yuva444p10le.mp4');
      const run = spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=black:s=320x180:r=12:d=0.5','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.5','-filter_complex',graph,'-map',`[${built.output}]`,'-map','1:a:0','-t','0.5','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',output],{encoding:'utf8',timeout:60000,windowsHide:true});
      assert.equal(run.status,0,run.stderr || run.error?.message || `FFmpeg exit ${run.status}`);
      const probe = spawnSync(ffprobe,['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,pix_fmt','-of','json',output],{encoding:'utf8',timeout:15000,windowsHide:true});
      assert.equal(probe.status,0,probe.stderr || 'FFprobe failed'); const stream=JSON.parse(probe.stdout).streams?.[0]; assert.equal(stream?.codec_name,'h264'); assert.equal(stream?.pix_fmt,'yuv420p');
      checks.push({ name:'YUVA444P10LE temporary visualizer layer composited into final H.264 MP4', ok:true });
    } catch(error) { checks.push({name:'YUVA444P10LE alpha intermediate',ok:false,error:error instanceof Error?error.message:String(error)}); }
    try {
      const id = 'p35_logo_alpha';
      const visual = { id, kind:'mediaLogo', sourcePath:'synthetic-test-art.png', stereoStyle:'onix-logo', position:{x:0,y:0}, size:{width:160,height:120}, color:'#2cf9ff', opacity:.8, sensitivity:1, smoothing:.3, alphaFormat:'yuva444p10le', mediaMotion:'none', sourceCrop:{left:0,right:0,top:0,bottom:0}, blendMode:'normal' };
      const built = buildVisualizerFilters([visual], 'base', 1, 1, 12, 0, { [id]: 2 });
      const graph = ['[0:v]null[base]', ...built.filters].join(';');
      const output = path.join(temp,'logo-alpha-yuva444p10le.mp4');
      const run = spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=black:s=320x180:r=12:d=0.5','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.5','-f','lavfi','-i','color=c=0x30b8c8:s=128x128:r=12:d=0.5','-filter_complex',graph,'-map',`[${built.output}]`,'-map','1:a:0','-t','0.5','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',output],{encoding:'utf8',timeout:60000,windowsHide:true});
      assert.equal(run.status,0,run.stderr || run.error?.message || `FFmpeg exit ${run.status}`);
      const probe = spawnSync(ffprobe,['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,pix_fmt','-of','json',output],{encoding:'utf8',timeout:15000,windowsHide:true});
      assert.equal(probe.status,0,probe.stderr || 'FFprobe failed'); const stream=JSON.parse(probe.stdout).streams?.[0]; assert.equal(stream?.codec_name,'h264'); assert.equal(stream?.pix_fmt,'yuv420p');
      checks.push({ name:'Static Logo mode supports YUVA444P10LE before compositing', ok:true });
    } catch(error) { checks.push({name:'Static Logo YUVA444P10LE alpha intermediate',ok:false,error:error instanceof Error?error.message:String(error)}); }
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
} else {
  checks.push({ name:'FFmpeg runtime available for visualizer smoke tests', ok:false, error:'FFmpeg executable could not be launched.' });
}

for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}: ${item.name}${item.error ? ` — ${item.error.split('\n')[0].slice(0,240)}` : ''}`);
const failures = checks.filter((item) => !item.ok);
console.log(`P35 ONIX VISUALIZER / CANVAS CENTERING: ${failures.length ? `FAILED (${failures.length})` : `PASSED (${checks.length})`}`);
process.exitCode = failures.length ? 1 : 0;
