const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
Module._extensions['.ts'] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  mod._compile(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
};
const { ProjectRepository } = require('../src/main/repositories/projectRepository.ts');
const { createDefaultProject } = require('../src/main/domain/project/projectFactory.ts');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const checks = [];
function check(name, fn) { try { fn(); checks.push({ name, ok: true }); } catch (error) { checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }); } }

async function main() {
  const app = read('src/renderer/App.tsx');
  const shared = read('src/shared/ipc.ts');
  const preload = read('src/preload/index.ts');
  const main = read('src/main/index.ts');
  const repository = read('src/main/repositories/projectRepository.ts');
  const css = read('src/renderer/styles/index.css');
  const preview = read('src/renderer/components/VisualizerPreview.tsx');
  const builder = read('src/main/services/effects/visualizerBuilder.ts');
  const runner = read('src/main/services/ffmpegEngine/ffmpegRunner.ts');
  const commandBuilder = read('src/main/services/ffmpegEngine/commandBuilder.ts');

  check('Current version and lock root are synchronized without dependency changes', () => {
    assert.match(pkg.version, /^0\.3\.\d+$/);
    assert.equal(lock.version, pkg.version);
    assert.equal(lock.packages?.['']?.version, pkg.version);
    assert.deepEqual(pkg.dependencies, lock.packages?.['']?.dependencies);
    assert.deepEqual(pkg.devDependencies, lock.packages?.['']?.devDependencies);
  });

  check('Project edits are autosaved with a debounce and errors are reported', () => {
    assert.match(app, /const latestProjectRef = useRef<ProjectData \| null>\(project\)/);
    assert.match(app, /setTimeout\(\(\) => \{[\s\S]*?persistProjectSnapshot\(snapshot\)[\s\S]*?\}, 650\)/);
    assert.match(app, /window\.magicRender\.saveProject\(candidate\)/);
    assert.match(app, /\[AUTOSAVE\] Project otomatis gagal disimpan/);
  });

  check('Navigation and project replacement flush pending autosaves before switching', () => {
    assert.match(app, /async function navigateToPage\(page: MainPage\)[\s\S]*?await flushProjectSave\(\)/);
    assert.match(app, /async function navigateToRenderTab\(tab: RenderTab\)[\s\S]*?await flushProjectSave\(\)/);
    assert.match(app, /await flushProjectSave\(\); const result = await window\.magicRender\.loadProject\(\)/);
    assert.match(app, /await flushProjectSave\(\); const result = await window\.magicRender\.loadProject\(item\.projectFilePath\)/);
    for (const target of ["navigateToPage('Home')", "navigateToPage('Bulk Render')", "navigateToPage('Asset')", "navigateToPage('Setting')", "navigateToPage('Help')"]) {
      assert.ok(app.includes(target) || app.includes("void navigateToPage(target)"), `navigation path ${target}`);
    }
  });

  check('Window close waits for the renderer save and offers a safe choice on failure', () => {
    assert.match(shared, /APP_PREPARE_CLOSE: 'app:prepare-close'/);
    assert.match(shared, /notifyCloseReady: \(saved: boolean, errorMessage\?: string\) => void/);
    assert.match(preload, /ipcRenderer\.send\(IPC_CHANNELS\.APP_CLOSE_READY, \{ saved, errorMessage \}\)/);
    assert.match(app, /onPrepareToClose\(\(\) => \{[\s\S]*?flushProjectSave\(\)[\s\S]*?notifyCloseReady\(true\)[\s\S]*?notifyCloseReady\(false, detail\)/);
    assert.match(main, /APP_CLOSE_READY, onReady/);
    assert.match(main, /dialog\.showMessageBox\(window/);
    assert.match(main, /Tutup tanpa menyimpan/);
  });

  check('Per-project writes are serialized and each temporary path is unique and atomic', () => {
    assert.match(repository, /saveTails = new Map<string, Promise<void>>\(\)/);
    assert.match(repository, /randomUUID\(\)/);
    assert.match(repository, /await fs\.rename\(tempPath, filePath\)/);
    assert.match(repository, /previous\.catch\(\(\) => undefined\)\.then/);
  });

  check('Overlay right panel stacks cleanly and avoids broken word wrapping at compact widths', () => {
    assert.match(css, /@media \(min-width: 1200px\) and \(max-width: 1599px\)/);
    assert.match(css, /@media \(max-width: 1199px\)[\s\S]*?mrp-render-page--overlay-workspace/);
    assert.match(css, /mrp-overlay-selected-settings p,[\s\S]*?word-break: normal !important/);
    assert.match(css, /mrp-overlay-selected-settings input:not\(\[type="checkbox"\]\)/);
  });

  check('Stereo preview and FFmpeg output use isolated channel analysis and all supported stereo models', () => {
    assert.match(preview, /routing\.stereoAnalysers\.get\(visual\.id\)/);
    assert.match(preview, /leftWaveform: Uint8Array<ArrayBuffer>; rightWaveform: Uint8Array<ArrayBuffer>/);
    assert.match(preview, /const temporalTau = Math\.max\(1 \/ Math\.max\(1, fps\)/);
    for (const token of ['showwaves=','showcqt=','avectorscope=','channelsplit=channel_layout=stereo','boxblur=${glowRadius}:1','hflip,vflip']) assert.ok(builder.includes(token), token);
  });

  check('FFmpeg capability detection selects a compatible option-file syntax and documents the active executable', () => {
    assert.match(runner, /detectFilterGraphFileOption\(command\.executable\)/);
    assert.match(runner, /'-filter_complex_script' \| '\-\/filter_complex'/);
    assert.match(runner, /opsi \$\{fileOption\}; executable aktif: \$\{command\.executable\}/);
    assert.match(commandBuilder, /graph \$\{graph\.length\} characters; runner will use compatible option-file syntax/);
  });

  check('Application has one selected FFmpeg executable per command; resource and PATH do not get concatenated', () => {
    assert.match(read('src/main/config/environment.ts'), /const ffmpegPath = customFfmpegPath \|\| \(app\.isPackaged \? packagedFfmpegRoot : developmentFfmpegPath\)/);
    assert.match(runner, /spawn\(command\.executable, args/);
    assert.doesNotMatch(runner, /spawn\(.*resources.*ffmpeg.*PATH/s);
  });

  // Exercise the repository's asynchronous write queue with two overlapping
  // snapshots, mirroring rapid autosave + manual-save timing.
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mrp-p28-autosave-test-'));
  try {
    const projectDir = path.join(tempRoot, 'Project');
    const base = createDefaultProject('Autosave Regression', projectDir);
    const older = { ...base, playlist: { files: ['older-track.mp3'], shuffle: false, playbackOrder: [] }, youtubeSEO: { ...base.youtubeSEO, mainKeyword: 'older keyword' } };
    const newer = { ...base, updatedAt: new Date(Date.now() + 1000).toISOString(), playlist: { files: ['latest-track.mp3'], shuffle: true, playbackOrder: ['latest-track.mp3'] }, youtubeSEO: { ...base.youtubeSEO, mainKeyword: 'latest keyword', customPrompt: 'keep the latest edited prompt' } };
    const repositoryInstance = new ProjectRepository();
    await Promise.all([repositoryInstance.save(older), repositoryInstance.save(newer)]);
    const onDisk = JSON.parse(await fsp.readFile(path.join(projectDir, 'project.json'), 'utf8'));
    assert.deepEqual(onDisk.playlist.files, ['latest-track.mp3']);
    assert.equal(onDisk.playlist.shuffle, true);
    assert.deepEqual(onDisk.playlist.playbackOrder, ['latest-track.mp3']);
    assert.equal(onDisk.youtubeSEO.mainKeyword, 'latest keyword');
    assert.equal(onDisk.youtubeSEO.customPrompt, 'keep the latest edited prompt');
    const leftovers = (await fsp.readdir(projectDir)).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(leftovers, [], 'no temporary project files remain after save');
    checks.push({ name: 'Overlapping repository autosaves preserve the latest playlist and editing state', ok: true });
  } catch (error) {
    checks.push({ name: 'Overlapping repository autosaves preserve the latest playlist and editing state', ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }

  for (const row of checks) console.log(`${row.ok ? 'PASS' : 'FAIL'}: ${row.name}${row.error ? ` — ${row.error}` : ''}`);
  const failed = checks.filter((row) => !row.ok);
  console.log(`P28 PERSISTENCE/OVERLAY/VISUALIZER/RENDER: ${failed.length ? `FAILED (${failed.length})` : `PASSED (${checks.length})`}`);
  process.exitCode = failed.length ? 1 : 0;
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
