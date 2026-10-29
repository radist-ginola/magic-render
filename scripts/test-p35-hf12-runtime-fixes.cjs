const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const ffmpeg = process.env.MAGIC_RENDER_FFMPEG || 'ffmpeg';
const ffprobe = process.env.MAGIC_RENDER_FFPROBE || 'ffprobe';
function loadTs(relative) {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const loaded = new module.constructor(file, module);
  loaded.filename = file;
  loaded.paths = module.paths;
  loaded._compile(compiled, file);
  return loaded.exports;
}
function run(executable, args) {
  const result = cp.spawnSync(executable, args, { encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} failed (${result.status}): ${(result.stderr || '').slice(-4000)}`);
  return result;
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-p35-hf12-'));
  try {
    // 1. Full-range legacy input must normalize to the actual yuv420p pixel format.
    const fullRangeInput = path.join(temp, 'full-range-yuvj420p.mp4');
    const normalized = path.join(temp, 'normalized-yuv420p.mp4');
    run(ffmpeg, ['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=320x180:r=24:d=1','-vf','format=yuvj420p','-c:v','libx264','-pix_fmt','yuvj420p','-t','1',fullRangeInput]);
    const before = JSON.parse(run(ffprobe, ['-v','error','-select_streams','v:0','-show_entries','stream=pix_fmt,color_range','-of','json',fullRangeInput]).stdout).streams[0];
    assert.equal(before.pix_fmt, 'yuvj420p', 'fixture must exercise the yuvj420p bug');
    const outputService = loadTs('src/main/services/render/outputService.ts');
    const runtimeOutputService = require(path.join(root, 'dist/main/services/render/outputService.js'));
    const command = runtimeOutputService.buildWindowsCompatibleOutputCommand(ffmpeg, fullRangeInput, normalized);
    assert.ok(command.args.some((arg) => arg.includes('out_range=tv')), 'normalizer must convert to limited-range video');
    assert.ok(command.args.includes('yuv420p'), 'normalizer must explicitly request yuv420p');
    run(command.executable, command.args);
    const assessment = await runtimeOutputService.inspectFinalMp4(ffprobe, normalized, 1, false);
    assert.equal(assessment.compatible, true, `packaged yuvj420p normalization must pass: ${assessment.reason}`);
    assert.equal(assessment.pixelFormat, 'yuv420p');
    const sourceCommand = outputService.buildWindowsCompatibleOutputCommand(ffmpeg, fullRangeInput, path.join(temp, 'normalized-source.mp4'));
    run(sourceCommand.executable, sourceCommand.args);
    const sourceAssessment = await outputService.inspectFinalMp4(ffprobe, path.join(temp, 'normalized-source.mp4'), 1, false);
    assert.equal(sourceAssessment.compatible, true, `source yuvj420p normalization must pass: ${sourceAssessment.reason}`);
    assert.equal(sourceAssessment.pixelFormat, 'yuv420p');

    // 2. A stale duration that seeks past EOF should retry, return a real frame, and dedupe fallback frames.
    const video = path.join(temp, 'short-source.mp4');
    run(ffmpeg, ['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=12:duration=1','-c:v','libx264','-pix_fmt','yuv420p',video]);
    const { KeyframeExtractor: SourceKeyframeExtractor } = loadTs('src/main/services/aiService/keyframeExtractor.ts');
    const { KeyframeExtractor: RuntimeKeyframeExtractor } = require(path.join(root, 'dist/main/services/aiService/keyframeExtractor.js'));
    const project = { mainMedia: { path: video, durationSeconds: 1, metadata: { durationSeconds: 1 } } };
    const runtimeFrames = await new RuntimeKeyframeExtractor(ffmpeg).extract(project, video, 90);
    assert.ok(runtimeFrames.length >= 1 && runtimeFrames.length <= 3, 'compiled extractor must return a valid frame after stale-duration retry');
    const frames = await new SourceKeyframeExtractor(ffmpeg).extract(project, video, 90);
    assert.ok(frames.length >= 1 && frames.length <= 3, 'source extractor must return one or more valid frames without repeated fallback timestamps');
    for (const frame of [...runtimeFrames, ...frames]) {
      const bytes = Buffer.from(frame.base64, 'base64');
      assert.ok(bytes.length > 100, 'keyframe payload must not be empty');
      assert.equal(bytes[0], 0xff, 'keyframe must begin with JPEG SOI');
      assert.equal(bytes[1], 0xd8, 'keyframe must begin with JPEG SOI');
      assert.ok(frame.timestampSec >= 0 && frame.timestampSec < 1.1, 'fallback timestamp must reflect a frame actually extracted from source');
    }
    assert.equal(new Set(frames.map((frame) => frame.timestampSec)).size, frames.length, 'fallback timestamps must be deduplicated');

    // 3. Local media protocol serves real MIME types and byte ranges used by Chromium for preview seeking.
    const { serveLocalMediaRequest: sourceServeLocalMediaRequest } = loadTs('src/main/services/media/mediaProtocolService.ts');
    const { serveLocalMediaRequest: runtimeServeLocalMediaRequest } = require(path.join(root, 'dist/main/services/media/mediaProtocolService.js'));
    const encodedVideoUrl = `mrp-media://local?path=${encodeURIComponent(video)}`;
    const stat = fs.statSync(video);
    const fullResponse = await runtimeServeLocalMediaRequest({ url: encodedVideoUrl, method: 'GET', headers: {} });
    assert.equal(fullResponse.status, 200);
    assert.equal(fullResponse.headers.get('content-type'), 'video/mp4');
    assert.equal(Number(fullResponse.headers.get('content-length')), stat.size);
    assert.equal((await fullResponse.arrayBuffer()).byteLength, stat.size, 'runtime local-media stream must return the complete file when no range is requested');
    const rangeResponse = await runtimeServeLocalMediaRequest({ url: encodedVideoUrl, method: 'GET', headers: { range: 'bytes=0-31' } });
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get('content-range'), `bytes 0-31/${stat.size}`);
    const rangeBytes = Buffer.from(await rangeResponse.arrayBuffer());
    assert.equal(rangeBytes.length, 32);
    assert.deepEqual(rangeBytes, fs.readFileSync(video).subarray(0, 32));
    const badRange = await runtimeServeLocalMediaRequest({ url: encodedVideoUrl, method: 'GET', headers: { range: `bytes=${stat.size + 1}-` } });
    assert.equal(badRange.status, 416);
    const sourceRange = await sourceServeLocalMediaRequest({ url: encodedVideoUrl, method: 'GET', headers: { range: 'bytes=0-31' } });
    assert.equal(sourceRange.status, 206, 'source media service must support byte-range requests');
    assert.deepEqual(Buffer.from(await sourceRange.arrayBuffer()), fs.readFileSync(video).subarray(0, 32));

    // 4. The relative logo URL must be present in both Vite public assets and packaged renderer assets.
    const sourceLogo = path.join(root, 'src/renderer/assets/magic-render-pro-logo.png');
    const publicLogo = path.join(root, 'src/renderer/public/assets/magic-render-pro-logo.png');
    const runtimeLogo = path.join(root, 'dist/renderer/assets/magic-render-pro-logo.png');
    for (const logo of [sourceLogo, publicLogo, runtimeLogo]) assert.ok(fs.existsSync(logo), `required logo file missing: ${path.relative(root, logo)}`);
    assert.deepEqual(fs.readFileSync(sourceLogo), fs.readFileSync(publicLogo), 'Vite public logo must match source artwork');
    assert.deepEqual(fs.readFileSync(sourceLogo), fs.readFileSync(runtimeLogo), 'packaged logo must match source artwork');
    const mainSource = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
    const mainRuntime = fs.readFileSync(path.join(root, 'dist/main/index.js'), 'utf8');
    assert.ok(mainSource.includes('serveLocalMediaRequest'), 'source media protocol must use range-aware media service');
    assert.ok(mainRuntime.includes('serveLocalMediaRequest'), 'compiled media protocol must use range-aware media service');
    const runtimeProtocol = fs.readFileSync(path.join(root, 'dist/main/services/media/mediaProtocolService.js'), 'utf8');
    assert.ok(runtimeProtocol.includes('Content-Range'), 'runtime media protocol must support byte ranges');

    console.log('PASS P35-HF12: yuvj420p normalization, SEO keyframe retry, local-media byte ranges, and packaged logo assets.');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
