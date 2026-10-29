const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
Module._extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);

const { buildVisualizerFilters } = require('../src/main/services/effects/visualizerBuilder.ts');
const { buildParticleFilters } = require('../src/main/services/effects/effectFilterBuilder.ts');
const { defaultVisualizer } = require('../src/shared/domain/visualizerTypes.ts');
const { editorShortcut } = require('../src/renderer/utils/editorShortcuts.ts');
const { ChromaKeyBuilder } = require('../src/main/services/ffmpegEngine/filterGraphBuilder/chromaKeyBuilder.ts');

function render(filters, label) {
  const r = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=15', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-filter_complex', `[0:v]null[base];${filters.join(';')}`, '-map', `[${label}]`, '-frames:v', '2', '-f', 'null', '-'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
}

for (const kind of ['bars','line','dots','wave','mirror','spectrum','smoothBars','waveLine','wavePoints','spectrumFire','spectrumCool','spectrumScroll']) {
  const effect = { ...defaultVisualizer('test'), kind, position: { x: 5, y: 5 }, size: { width: 100, height: 40 }, opacity: 0.8, sensitivity: 1.3 };
  const graph = buildVisualizerFilters([effect], 'base', 1, 1, 15);
  render(graph.filters, graph.output);
  assert.match(graph.filters.join(';'), /volume=1\.30/, `Sensitivity volume gain must be present for visualizer kind ${kind}`);
}
for (const [kind, motion] of [['bubbles','orbit'],['confetti','spiral'],['leaves','zigzag'],['fire','bounce'],['meteor','rise'],['glitter','spread']]) {
  const effect = { id: kind, kind, opacity: 0.6, flipX: false, flipY: false, rotation: 10, minCount: 1, maxCount: 1, minDistance: 50, maxDistance: 100, motion, speed: 1, beatSync: false };
  const graph = buildParticleFilters([effect], 'base', 160, 90, undefined, 15);
  render(graph.filters, graph.output);
}

const key = new ChromaKeyBuilder().build('source', 'keyed', { enabled: true, color: '0x00FF00', similarity: 0.3, blend: 0.1 });
assert.match(key, /colorkey=/);
const pixels = Buffer.from([0,255,0, 20,220,20, 80,170,80, 150,100,60, 255,0,0]);
const keyed = cp.spawnSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size','5x1','-i','pipe:0','-vf','format=rgba,colorkey=0x00ff00:0.3:0.1','-frames:v','1','-pix_fmt','rgba','-f','rawvideo','pipe:1'], { input: pixels, timeout: 30000 });
assert.equal(keyed.status, 0, String(keyed.stderr));
for (let i = 0; i < 5; i++) {
  const [r,g,b] = pixels.subarray(i*3,i*3+3);
  const distance = Math.hypot(r, g - 255, b) / Math.sqrt(3*255*255);
  const expected = Math.round(255 * Math.max(0, Math.min(1, (distance - 0.3) / 0.1)));
  assert.ok(Math.abs(keyed.stdout[i*4+3] - expected) <= 2, `RGB preview / FFmpeg alpha mismatch at pixel ${i}: ${keyed.stdout[i*4+3]} versus ${expected}`);
}
const event = (key, extras = {}) => ({ key, code: key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extras });
assert.equal(editorShortcut(event('ArrowRight', { shiftKey: true }), false, false), 'nudge-right');
assert.equal(editorShortcut(event('ArrowRight', { shiftKey: true }), true, false), null);
assert.equal(editorShortcut(event('p', { ctrlKey: true, shiftKey: true }), false, false), 'pause');
console.log('V5Y: 12 visualizer, 6 partikel baru, chroma RGB pixel, keyboard shortcut: PASSED');
