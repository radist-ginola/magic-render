const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function loadTs(file) {
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const Module = module.constructor;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = module.paths;
  m._compile(code, file);
  return m.exports;
}

const compatibility = loadTs(path.join(root, 'src/main/services/render/outputService.ts'));
const ffmpeg = process.env.MAGIC_RENDER_FFMPEG || 'ffmpeg';
const ffprobe = process.env.MAGIC_RENDER_FFPROBE || 'ffprobe';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-output-compat-'));
const compatibleInput = path.join(temp, 'compatible-input.mp4');
const nonCompatibleInput = path.join(temp, 'legacy-codec.mp4');
const normalizedOutput = path.join(temp, 'normalized.mp4');
const brokenOutput = path.join(temp, 'broken.mp4');

function run(executable, args) {
  const result = cp.spawnSync(executable, args, { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} failed (${result.status}): ${(result.stderr || '').slice(-3000)}`);
  return result;
}

(async () => {
  try {
    run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=24:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', compatibleInput]);
    const compatible = await compatibility.inspectFinalMp4(ffprobe, compatibleInput, 1, true);
    assert.equal(compatible.compatible, true, `Expected standard H.264/AAC MP4 to pass: ${compatible.reason}`);
    assert.equal(compatible.videoCodec, 'h264');
    assert.equal(compatible.pixelFormat, 'yuv420p');
    assert.equal(compatible.audioCodec, 'aac');

    run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=24:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-shortest', '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'aac', nonCompatibleInput]);
    const legacy = await compatibility.inspectFinalMp4(ffprobe, nonCompatibleInput, 1, true);
    assert.equal(legacy.compatible, false, 'Legacy MPEG-4 video must trigger compatibility normalization.');
    assert.match(legacy.reason, /H\.264/);

    const command = compatibility.buildWindowsCompatibleOutputCommand(ffmpeg, nonCompatibleInput, normalizedOutput);
    assert.equal(command.executable, ffmpeg);
    assert.ok(command.args.includes('libx264'));
    assert.ok(command.args.includes('yuv420p'));
    assert.ok(command.args.includes('aac'));
    assert.ok(command.args.includes('+faststart'));
    run(command.executable, command.args);
    const normalized = await compatibility.inspectFinalMp4(ffprobe, normalizedOutput, 1, true);
    assert.equal(normalized.compatible, true, `Normalized MP4 should pass: ${normalized.reason}`);

    fs.writeFileSync(brokenOutput, 'not a video container');
    const broken = await compatibility.inspectFinalMp4(ffprobe, brokenOutput, 1, false);
    assert.equal(broken.compatible, false, 'Corrupt output must not be declared ready.');
    assert.match(broken.reason, /FFprobe|durasi|Container|video stream|File output/i);

    console.log('OUTPUT COMPATIBILITY TEST: PASSED (standard validation, incompatible-codec fallback, and corrupt-file rejection).');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
