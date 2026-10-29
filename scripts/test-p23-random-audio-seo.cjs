const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
Module._extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
const { analyzeRandomPlaylistTrack, selectRandomPlaylistTrack } = require('../src/main/services/aiService/audioTrackAnalyzer.ts');
const { buildAnalysisPrompt, buildProductionPrompt } = require('../src/main/services/aiService/seoPipeline.ts');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-p23-audio-seo-'));
function ffmpeg(args) { const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8', timeout: 30000 }); assert.equal(result.status, 0, result.stderr || String(result.error)); }
(async () => {
  try {
    assert.equal(selectRandomPlaylistTrack([], () => 0.5), null);
    assert.equal(selectRandomPlaylistTrack(['first', 'second', 'third'], () => 0.8), 'third');
    const a = path.join(work, 'Ambient_Piano.mp3'), b = path.join(work, 'Rock_Theme.mp3');
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=4', '-q:a', '7', '-y', a]);
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=44100:duration=4', '-q:a', '7', '-y', b]);
    const sequence = [0.9, 0.4]; let call = 0;
    const sample = await analyzeRandomPlaylistTrack('ffmpeg', 'ffprobe', [
      { path: a, durationSeconds: 4, order: 0 }, { path: b, durationSeconds: 4, order: 1 },
    ], () => sequence[call++] ?? 0.5);
    assert.equal(sample.trackName, 'Rock_Theme.mp3');
    assert.equal(sample.sampleStartSec, 0);
    assert.equal(sample.spectrogram.mimeType, 'image/png');
    assert.ok(Buffer.from(sample.spectrogram.base64, 'base64').subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'AI audio attachment must be a valid PNG spectrogram');
    const evidence = JSON.stringify({ selectedPlaylistFile: sample.trackName, durationSeconds: sample.durationSeconds, analyzedSegmentStartSeconds: sample.sampleStartSec, analyzedSegmentDurationSeconds: sample.sampleDurationSec, method: 'log-frequency spectrogram' });
    const frames = [{ timestampSec: 1, mimeType: 'image/jpeg', base64: 'dGVzdA==' }];
    const analysisPrompt = buildAnalysisPrompt('slow rock', { contentType: 'Music', targetLanguage: 'English (US)' }, frames, 'main', '', evidence);
    assert.match(analysisPrompt, /randomly selected short segment/i);
    assert.match(analysisPrompt, /LAST attached image is a log-frequency spectrogram/i);
    assert.match(analysisPrompt, /does NOT reveal lyrics/i);
    const productionPrompt = buildProductionPrompt('slow rock', { contentType: 'Music' }, { visualAnalysis: 'Night setting', audienceIntent: 'relaxing music', visualEvidence: { observed: ['blue light'], interpreted: ['calm'], uncertain: [], visibleText: [] }, keywordsPrimary: ['slow rock'], keywordsSecondary: [], keywordsLongTail: [], audioEvidence: evidence }, '', 'Avoid misleading titles');
    assert.match(productionPrompt, /selectedPlaylistFile/i);
    assert.match(productionPrompt, /Rock_Theme\.mp3/i);
    assert.match(productionPrompt, /Avoid misleading titles/);
    console.log('P23 SEO audio: random playlist selection, generated spectrogram, evidence-aware analysis/production prompts passed.');
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
