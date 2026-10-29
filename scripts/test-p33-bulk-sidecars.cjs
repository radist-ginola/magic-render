const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
Module._extensions['.ts'] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  mod._compile(ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
};
const { writeYoutubeTimestampText } = require('../src/main/services/aiService/timestampGenerator.ts');
const { writeYoutubeSeoText } = require('../src/main/services/aiService/seoFileWriter.ts');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-p33-bulk-sidecars-'));
  try {
    const makeProject = (bulkItemId, name) => ({
      projectId: `project-${bulkItemId}`,
      bulkItemId,
      name,
      youtubeSEO: { mode: 'timestamp-seo', mainKeyword: 'slow rock', context: { contentType: 'Musik' } },
      playlistTracks: [],
    });
    const firstVideo = path.join(temp, '001-song-alpha-a1.mp4');
    const secondVideo = path.join(temp, '002-song-beta-b2.mp4');
    const timestampInput = (project, outputVideoPath) => ({
      project, finalDurationSeconds: 120, outputVideoPath, introDurationSeconds: 0, audioPlan: null,
    });
    const firstTimestamp = await writeYoutubeTimestampText(timestampInput(makeProject('alpha', 'Alpha'), firstVideo));
    const secondTimestamp = await writeYoutubeTimestampText(timestampInput(makeProject('beta', 'Beta'), secondVideo));
    assert.equal(path.basename(firstTimestamp), '001-song-alpha-a1-timestamp.txt');
    assert.equal(path.basename(secondTimestamp), '002-song-beta-b2-timestamp.txt');
    assert.notEqual(firstTimestamp, secondTimestamp);
    assert.ok(fs.readFileSync(firstTimestamp, 'utf8').includes('Alpha'));
    assert.ok(fs.readFileSync(secondTimestamp, 'utf8').includes('Beta'));

    const seoResult = {
      titles: ['Slow Rock Love Songs'],
      descriptions: { seoRich: 'SEO description', engagement: 'Engagement description', premium: 'Premium description' },
      descriptionParts: {
        opening: 'Classic slow rock songs for the evening.', body: 'Timeless romantic rock ballads.', bodySecondary: '',
        perfectForNarrative: '', perfectForHeading: 'This playlist is perfect for:',
        audiences: ['Classic rock listeners', 'Slow rock fans', 'Romantic music fans', 'Oldies music fans'], closing: 'Enjoy the music.',
      },
      bestTitleIndex: 0, tags: ['slow rock', 'love songs'], hashtags: ['#SlowRock'],
      keywordsPrimary: ['slow rock'], keywordsSecondary: [], keywordsLongTail: [],
      visualAnalysis: 'Not evaluated by this file-writer smoke test.', audienceIntent: 'Music listeners',
    };
    const firstSeo = await writeYoutubeSeoText(makeProject('alpha', 'Alpha'), seoResult, firstVideo, '00:00 Alpha\n', false);
    const secondSeo = await writeYoutubeSeoText(makeProject('beta', 'Beta'), seoResult, secondVideo, '00:00 Beta\n', false);
    assert.equal(path.basename(firstSeo), '001-song-alpha-a1-youtubeseo.txt');
    assert.equal(path.basename(secondSeo), '002-song-beta-b2-youtubeseo.txt');
    assert.notEqual(firstSeo, secondSeo);
    assert.ok(fs.readFileSync(firstSeo, 'utf8').includes('Alpha'));
    assert.ok(fs.readFileSync(secondSeo, 'utf8').includes('Beta'));
    assert.equal(fs.existsSync(path.join(temp, 'timestamp.txt')), false, 'bulk timestamp must use an item-specific file name');
    assert.equal(fs.existsSync(path.join(temp, 'youtubeseo.txt')), false, 'bulk SEO must use an item-specific file name');
    console.log('PASS: Timestamp sidecars are unique and contain per-item project data.');
    console.log('PASS: YouTube SEO sidecars are unique and contain per-item project data.');
    console.log('PASS: Bulk writers do not collide with generic timestamp.txt/youtubeseo.txt paths.');
    console.log('P33 BULK SIDECAR OUTPUT: PASSED (3 checks)');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
