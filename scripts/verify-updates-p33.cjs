const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const modes = ['basic-split','mirrored','gap','split-colors','cqt','rainbow','glow','reflection','vector'];
const files = [
  'src/shared/domain/visualizerTypes.ts','src/renderer/components/EffectsPanels.tsx','src/renderer/components/VisualizerPreview.tsx',
  'src/main/services/effects/visualizerBuilder.ts','src/renderer/styles/index.css','src/renderer/App.tsx',
  'src/renderer/components/BulkRenderPage.tsx','src/main/services/bulk/bulkPlanner.ts',
  'src/main/services/aiService/timestampGenerator.ts','src/main/services/aiService/seoFileWriter.ts',
  'src/main/index.ts','src/renderer/components/ConsoleLogPanel.tsx','scripts/test-p33-stereo-bulk-log-fixes.cjs','scripts/test-p33-bulk-sidecars.cjs'
];
for (const file of files) assert.ok(fs.existsSync(path.join(root,file)), `Required P33 file is missing: ${file}`);
assert.equal(lock.version, pkg.version); assert.equal(lock.packages?.['']?.version, pkg.version);
assert.deepEqual(pkg.dependencies, lock.packages?.['']?.dependencies);
assert.deepEqual(pkg.devDependencies, lock.packages?.['']?.devDependencies);
assert.equal(pkg.scripts['test:p33-bulk-sidecars'], 'node scripts/test-p33-bulk-sidecars.cjs');
assert.ok(read('scripts/run-current-tests.cjs').includes('test-p33-bulk-sidecars.cjs'), 'P33 bulk sidecar test must be in the active test runner');
const builder = read('src/main/services/effects/visualizerBuilder.ts');
const preview = read('src/renderer/components/VisualizerPreview.tsx');
const ui = read('src/renderer/components/EffectsPanels.tsx');
const bulk = read('src/renderer/App.tsx');
const bulkPlanner = read('src/main/services/bulk/bulkPlanner.ts');
const mainLog = read('src/main/index.ts');
const rendererLog = read('src/renderer/components/ConsoleLogPanel.tsx');
for (const mode of modes) {
  assert.ok(builder.includes(mode), `FFmpeg builder lacks model: ${mode}`);
  assert.ok(preview.includes(mode), `Canvas preview lacks model: ${mode}`);
  assert.ok(ui.includes(mode), `UI lacks model: ${mode}`);
}
assert.ok(builder.includes('showwaves=') && builder.includes('showcqt=') && builder.includes('avectorscope='));
assert.ok(preview.includes('routing.stereoAnalysers.get(visual.id)'));
assert.ok(bulk.includes('seoTemplate:project?.youtubeSEO'));
assert.match(bulk, /generateYoutubeSeo\(plan\.project,\s*result\.outputPath\)/);
assert.ok(bulkPlanner.includes('project.bulkItemId = media.id'));
assert.ok(mainLog.includes('durationSeconds') && rendererLog.includes('durationSeconds'));
assert.ok(mainLog.includes('Tahap selesai') && rendererLog.includes('Tahap selesai'));
console.log(`P33 UPDATE VERIFICATION: PASSED (${files.length} source/test files, ${modes.length} stereo models, version ${pkg.version}, lockfile synchronized)`);
