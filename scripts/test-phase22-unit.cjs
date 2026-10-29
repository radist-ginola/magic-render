const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const TS = require('typescript');
Module._extensions['.ts'] = (mod, filename) => mod._compile(TS.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: TS.ScriptTarget.ES2022, module: TS.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);

const root = path.join(__dirname, '..');
const originalLoad = Module._load;

function loadTs(relative, injected = {}) {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, 'utf8');
  const output = TS.transpileModule(source, {
    compilerOptions: { target: TS.ScriptTarget.ES2022, module: TS.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const localModule = new Module(file, module);
  localModule.filename = file;
  localModule.paths = Module._nodeModulePaths(path.dirname(file));
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(injected, request)) return injected[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    localModule._compile(output, file);
    return localModule.exports;
  } finally {
    Module._load = originalLoad;
  }
}

function expectThrow(fn, pattern) {
  assert.throws(fn, pattern ? new RegExp(pattern, 'i') : undefined);
}

// U-002 duration calculation
const playlist = loadTs('src/main/services/audio/playlistAlgorithms.ts');
assert.equal(playlist.calculateTotalDuration([{ path: 'a', durationSeconds: 10, order: 0 }, { path: 'b', durationSeconds: 5, order: 1 }]), 15);
expectThrow(() => playlist.buildExactDurationComposition([], 10, false), 'Playlist kosong');

// U-003 CPU calculation
const cpu = loadTs('src/main/services/cpuController.ts', { 'node:os': { availableParallelism: () => 8, cpus: () => Array(8).fill({}) } });
assert.equal(cpu.calculateSafeFfmpegThreads(1, 8), 1);
assert.equal(cpu.calculateSafeFfmpegThreads(50, 8), 4);
assert.equal(cpu.calculateSafeFfmpegThreads(100, 8), 8);
expectThrow(() => cpu.validateCpuLoadPercent(0), '1%');
expectThrow(() => cpu.validateCpuLoadPercent(101), '100%');
expectThrow(() => cpu.validateCpuLoadPercent(Number.NaN), 'angka');
assert.deepEqual(cpu.applyFfmpegThreadMapping(['-y', '-i', 'input.mp4', '-c:v', 'libx264', 'out.mp4'], 75, 4), ['-y', '-filter_threads', '3', '-filter_complex_threads', '3', '-i', 'input.mp4', '-c:v', 'libx264', '-threads:v', '3', 'out.mp4']);
assert.deepEqual(cpu.applyFfmpegThreadMapping(['-i', 'input.mp4', '-c:v', 'libx264', 'out.mp4'], 50, 4), ['-filter_threads', '2', '-filter_complex_threads', '2', '-i', 'input.mp4', '-c:v', 'libx264', '-threads:v', '2', 'out.mp4']);
assert.equal(cpu.calculateSafeFfmpegThreads(60, 8), 4);

// U-004 filter builders
const overlay = loadTs('src/main/services/ffmpegEngine/filterGraphBuilder/overlayFilterBuilder.ts');
const blend = loadTs('src/main/services/ffmpegEngine/filterGraphBuilder/blendFilterBuilder.ts');
const chroma = loadTs('src/main/services/ffmpegEngine/filterGraphBuilder/chromaKeyBuilder.ts');
const color = loadTs('src/main/services/ffmpegEngine/filterGraphBuilder/colorKeyBuilder.ts');
const ob = new overlay.OverlayFilterBuilder();
assert.match(ob.buildPreOverlayFilters({ type: 'image', path: 'a', id: '1', config: { opacity: 0.5, resize: { width: 80, height: 40 }, position: { x: 0, y: 0 }, rotation: 0, speed: 1, blendMode: 'normal', chromaKey: { enabled: false, color: '0x00FF00', similarity: 0.3, blend: 0.1 }, colorKey: { enabled: false, color: '0x000000', similarity: 0.3, blend: 0.1 } } }, 'in', 'out'), /scale=80:40/);
assert.match(ob.buildPositionedLayer('in', 'out', 100, 100, -1, 0), /overlay=x=-1:y=0/);
const bb = new blend.BlendFilterBuilder();
assert.match(bb.build('a', 'b', 'c', 'normal'), /overlay/);
assert.match(bb.build('a', 'b', 'c', 'screen'), /blend=all_mode=screen/);
expectThrow(() => bb.build('a', 'b', 'c', 'bogus'), 'unsupported');
const cb = new chroma.ChromaKeyBuilder();
assert.match(cb.build('a', 'b', { enabled: true, color: '#00ff00', similarity: 0.3, blend: 0.1 }), /0x00FF00/);
expectThrow(() => cb.build('a', 'b', { enabled: true, color: '#xyzxyz', similarity: 0.3, blend: 0.1 }), 'hex');
const ck = new color.ColorKeyBuilder();
expectThrow(() => ck.build('a', 'b', { enabled: true, color: '123', similarity: 0.3, blend: 0.1 }), 'hex');

// U-005 scheduling
const scheduler = loadTs('src/main/services/stickerScheduler.ts');
assert.deepEqual(scheduler.buildScheduleWindows({ mode: 'full-duration', iterativeCount: 1, timestamps: [] }, 20, 3), [{ startSec: 0, endSec: 20 }]);
assert.deepEqual(scheduler.buildScheduleWindows({ mode: 'iterative', iterativeCount: 3, timestamps: [] }, 370, 2).map((entry) => entry.startSec), [180,360]);
assert.deepEqual(scheduler.buildScheduleWindows({ mode: 'timestamp', iterativeCount: 1, timestamps: ['00:02', '00:20'] }, 10, 3), [{ startSec: 2, endSec: 5 }]);
expectThrow(() => scheduler.timestampToSecondsForValidation('bad'), 'Timestamp');
expectThrow(() => scheduler.buildScheduleWindows({ mode: 'iterative', iterativeCount: 0, timestamps: [] }, 10, 2), '1–100');
assert.deepEqual(scheduler.buildScheduleWindows({ mode: 'iterative', iterativeCount: 5, iterativeUnit: 'seconds', timestamps: [] }, 13, 2).map((entry) => entry.startSec), [5,10]);

// U-006 timestamp generation
const timestamp = loadTs('src/main/services/aiService/timestampGenerator.ts');
const project = { name: 'Test Project' };
const text = timestamp.buildYoutubeTimestampText({ project, finalDurationSeconds: 100, outputVideoPath: '/tmp/video.mp4', introDurationSeconds: 5, audioPlan: { orderedTracks: [{ path: '/music/A.mp3', durationSeconds: 50, order: 0 }, { path: '/music/B.mp3', durationSeconds: 50, order: 1 }], segments: [{ path: '/music/A.mp3', startSeconds: 0, durationSeconds: 50, sourceTrackIndex: 0 }, { path: '/music/B.mp3', startSeconds: 50, durationSeconds: 50, sourceTrackIndex: 1 }], totalDurationSeconds: 100, targetDurationSeconds: 100, shuffle: false } });
assert.match(text, /00:00 Intro/);
assert.match(text, /00:05 A/);
assert.match(text, /00:55 B/);
assert.ok(!text.includes('01:45 B'));

// U-007 error translator
const err = loadTs('src/main/services/ffmpegEngine/errorTranslator.ts');
assert.equal(err.translateFfmpegError('moov atom not found').code, 'MOOV_ATOM_NOT_FOUND');
assert.equal(err.translateFfmpegError('Error opening output file: Permission denied', { stage: 'output', exitCode: 1 }).code, 'PERMISSION_DENIED');
assert.equal(err.translateFfmpegError('some unknown failure', { stage: 'output', exitCode: 9 }).code, 'FFMPEG_UNKNOWN_ERROR');

// U-008 encoding/output helpers
const commandBuilder = loadTs('src/main/services/ffmpegEngine/commandBuilder.ts');
assert.match(commandBuilder.formatSpawnCommand({ executable: 'ffmpeg.exe', args: ['-i', 'C:/My Videos/input file.mp4', '-y'] }), /ffmpeg\.exe/);
assert.match(commandBuilder.formatSpawnCommand({ executable: 'ffmpeg.exe', args: ['-i', 'C:/My Videos/input file.mp4', '-y'] }), /\"C:\/My Videos\/input file\.mp4\"/);

const encoding = loadTs('src/main/services/render/encodingBuilder.ts');
assert.deepEqual(encoding.buildVideoEncodingArgs(), ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p']);
assert.deepEqual(encoding.buildAudioEncodingArgs(), ['-c:a', 'aac', '-b:a', '320k']);
assert.deepEqual(encoding.buildCbrVideoBitrateArgs({ bitrateKbps: 1200 }), ['-b:v', '1200k', '-minrate', '1200k', '-maxrate', '1200k', '-bufsize', '2400k']);
assert.equal(encoding.normalizeBitrate(1200.8), 1201);
expectThrow(() => encoding.normalizeBitrate(0), 'bitrate');

// Output service with real filesystem edge cases.
const output = loadTs('src/main/services/render/outputService.ts');
const os = require('node:os');
const fsp = require('node:fs/promises');
(async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'mrp-phase22-unit-'));
  const service = new output.OutputService();
  const first = await service.prepareOutputPath(tmp, 'My:Video', { extension: '.mp4', overwrite: false, estimatedBytes: 1024 });
  assert.match(first.outputPath, /My_Video\.mp4$/);
  await fsp.writeFile(first.outputPath, 'existing');
  const second = await service.prepareOutputPath(tmp, 'My:Video', { extension: '.mp4', overwrite: false });
  assert.match(second.outputPath, /My_Video-1\.mp4$/);
  const invalidExt = await service.validateDirectory(tmp, '.avi');
  assert.equal(invalidExt.valid, false);
  await fsp.rm(tmp, { recursive: true, force: true });
  console.log('PHASE 22 UNIT TESTS: TEST PASSED (duration, CPU, filters, scheduling, timestamp, error translation, encoding, output edge cases).');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
