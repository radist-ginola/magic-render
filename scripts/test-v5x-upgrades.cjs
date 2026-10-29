const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, file);

const { defaultVisualizer } = require('../src/shared/domain/visualizerTypes.ts');
const { defaultOverlayConfig } = require('../src/shared/domain/overlayTypes.ts');
const { defaultStickerConfig } = require('../src/shared/domain/stickerTypes.ts');
const { overlayAssetPreset, stickerAssetPreset } = require('../src/shared/domain/assetPreset.ts');
const { buildVisualizerFilters } = require('../src/main/services/effects/visualizerBuilder.ts');
const { buildMainEffectFilters, buildParticleFilters } = require('../src/main/services/effects/effectFilterBuilder.ts');
const { buildComposedOutputCommand } = require('../src/main/services/render/renderCommandBuilder.ts');
const { createDefaultProject } = require('../src/main/domain/project/projectFactory.ts');
const { writeYoutubeTimestampText } = require('../src/main/services/aiService/timestampGenerator.ts');

function ffmpeg(graph, output, extra = []) {
  const result = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=400x220:r=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-filter_complex', graph, '-map', `[${output}]`, '-t', '0.4', ...extra, '-f', 'null', '-'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-v5x-'));
  try {
    const asset = (menu, config) => ({ menu, config });
    assert.equal(overlayAssetPreset(asset('overlay', { ...defaultOverlayConfig(), opacity: 0.62, speed: 1.5 })).opacity, 0.62);
    const sticker = stickerAssetPreset(asset('stickerSubscribe', { opacity: 0.8, position: { x: 55, y: 99 } }));
    assert.equal(sticker.opacity, 0.8);
    assert.deepEqual(sticker.position, { x: 55, y: 99 });
    assert.deepEqual(sticker.schedule, defaultStickerConfig().schedule);

    for (const kind of ['bars', 'line', 'dots', 'wave', 'mirror', 'spectrum']) {
      const visual = { ...defaultVisualizer(kind), kind, position: { x: 20, y: 20 }, size: { width: 320, height: 100 } };
      const graph = buildVisualizerFilters([visual], 'base', 1, 1, 24);
      ffmpeg(`[0:v]null[base];${graph.filters.join(';')}`, graph.output);
    }
    const stacked = buildVisualizerFilters(['bars', 'wave'].map((kind, index) => ({ ...defaultVisualizer(String(index)), kind, position: { x: 10, y: index * 100 }, size: { width: 200, height: 70 } })), 'base', 1, 1, 24);
    ffmpeg(`[0:v]null[base];${stacked.filters.join(';')}`, stacked.output);
    for (const kind of ['flicker', 'float', 'tint', 'wobble']) {
      const fx = buildMainEffectFilters([{ id: kind, kind, opacity: 0.5, axisX: 1, axisY: 1, speed: 1, beatSync: false }], 'base', 400, 220, 24);
      ffmpeg(`[0:v]null[base];${fx.filters.join(';')}`, fx.output);
    }
    for (const kind of ['rain', 'snow', 'embers', 'petals', 'sparks']) {
      const fx = buildParticleFilters([{ id: kind, kind, opacity: 0.5, flipX: false, flipY: false, rotation: 0, minCount: 1, maxCount: 1, minDistance: 50, maxDistance: 100, motion: 'fall', speed: 1, beatSync: false }], 'base', 400, 220, undefined, 24);
      ffmpeg(`[0:v]null[base];${fx.filters.join(';')}`, fx.output);
    }

    const picture = path.join(dir, 'main.png'), audio = path.join(dir, 'playlist.aac'), movie = path.join(dir, 'visualizer.mp4');
    for (const [args, target] of [
      [['-f', 'lavfi', '-i', 'color=c=blue:s=320x180', '-frames:v', '1', '-update', '1'], picture],
      [['-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100', '-t', '1', '-c:a', 'aac'], audio],
    ]) {
      const r = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args, target], { encoding: 'utf8', timeout: 30000 });
      assert.equal(r.status, 0, r.stderr);
    }
    const project = createDefaultProject('Visualizer', dir, { resolution: '720p', fps: 24, bitrateKbps: 1200, renderPreset: 'fast' });
    project.mainMedia = { path: picture, type: 'image', autoMute: true, resize: { width: 1920, height: 1080 }, position: { x: 0, y: 0 }, rotation: 0, fade: { fadeInSec: 0, fadeOutSec: 0 } };
    project.visualizers = [{ ...defaultVisualizer('bars'), position: { x: 100, y: 700 }, size: { width: 900, height: 180 } }];
    const command = buildComposedOutputCommand('ffmpeg', project, movie, 1, 0, audio, false);
    const rendered = cp.spawnSync(command.executable, ['-hide_banner', '-loglevel', 'error', ...command.args], { encoding: 'utf8', timeout: 30000 });
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.ok(fs.statSync(movie).size > 10000);

    const paths = [];
    for (let index = 0; index < 5; index++) {
      const title = `song_${index + 1}.mp3`;
      const project = { name: `video ${index + 1}`, bulkItemId: `media-${index + 1}` };
      const outputVideoPath = path.join(dir, `${index + 1}-video.mp4`);
      const timestamp = await writeYoutubeTimestampText({ project, outputVideoPath, finalDurationSeconds: 90, introDurationSeconds: 0, audioPlan: { segments: [{ startSeconds: 0, sourceTrackIndex: 0 }], orderedTracks: [{ order: 0, path: title }] } });
      paths.push(timestamp);
      assert.match(fs.readFileSync(timestamp, 'utf8'), /^00:00 Song\n$/);
    }
    assert.equal(new Set(paths).size, 5);
    console.log('V5X: asset preset, FFmpeg enam visualizer, efek media/partikel baru, lima timestamp unik: PASSED');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
