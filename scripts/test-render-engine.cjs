const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const os = require('node:os');
const ts = require('typescript');

function loadTs(file, injected = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const Module = module.constructor;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = module.paths;
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (injected[request]) return injected[request];
    return original.call(this, request, parent, isMain);
  };
  try { m._compile(code, file); return m.exports; } finally { Module._load = original; }
}

const root = process.cwd();
const parser = loadTs(path.join(root, 'src/main/services/ffmpegEngine/progressParser.ts'));
const p = new parser.FfmpegProgressParser();
let r = p.parseLine('out_time_ms=1500000');
if (Math.abs(r.outTimeSec - 1.5) > 1e-9) throw new Error('out_time_ms parsing failed');
r = p.parseLine('speed=2.25x');
if (r.speedMultiplier !== 2.25) throw new Error('speed parsing failed');
r = p.parseLine('progress=end');
if (r.progress !== 'end') throw new Error('progress end parsing failed');

const selector = loadTs(path.join(root, 'src/main/services/render/renderStrategySelector.ts'));
const base = { mainMedia: { type: 'video' }, overlays: [], textOverlays: [], stickerSubscribe: null, intro: { enabled: false, path: null }, playlist: { files: [], shuffle: false } };
if (selector.selectRenderStrategy(base) !== 'single-pass') throw new Error('single-pass selection failed');
if (selector.selectRenderStrategy({ ...base, overlays: [{ id: 'x' }] }) !== 'multi-stage') throw new Error('multi-stage selection failed');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-render-pro-phase12-'));
const input = path.join(tmp, 'input.mp4');
const output = path.join(tmp, 'output.mp4');
const cmd = ['-y','-f','lavfi','-i','color=c=black:s=320x180:r=24','-t','1','-c:v','libx264','-pix_fmt','yuv420p',input];
const ff = cp.spawnSync('ffmpeg', cmd, { encoding:'utf8' });
if (ff.status !== 0) throw new Error(`ffmpeg source generation failed: ${ff.stderr}`);
const final = cp.spawnSync('ffmpeg', ['-y','-i',input,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-t','1',output], { encoding:'utf8' });
if (final.status !== 0 || !fs.existsSync(output)) throw new Error(`ffmpeg final encode failed: ${final.stderr}`);
const probe = cp.spawnSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',output], { encoding:'utf8' });
if (probe.status !== 0 || Number(probe.stdout.trim()) <= 0) throw new Error('ffprobe final output validation failed');
fs.rmSync(tmp, { recursive:true, force:true });
console.log('RENDER ENGINE TEST: PASSED (progress parser, strategy selection, FFmpeg encode/ffprobe smoke test).');
