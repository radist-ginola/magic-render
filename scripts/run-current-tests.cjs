const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { ensureNpmOnPath, prependPathEntry } = require('./test-runner-env.cjs');

const root = path.resolve(__dirname, '..');
const toolsDirectory = path.join(root, 'resources', 'ffmpeg');
const env = { ...process.env };
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Jalankan pengujian melalui npm test.');
if (process.platform === 'win32') {
  const preflight = spawnSync(process.execPath, [path.join(__dirname, 'preflight-dist.cjs')], { cwd: root, stdio: 'inherit', env });
  if (preflight.status !== 0) process.exit(preflight.status ?? 1);
  if (fs.existsSync(path.join(toolsDirectory, 'ffmpeg.exe'))) {
    // Do not assign env.PATH directly on Windows: the inherited environment
    // often exposes the key as `Path`, and duplicate casing can cause child
    // cmd.exe shells to lose the Node/npm directory.
    prependPathEntry(env, toolsDirectory, process.platform);
  }
}

// Apply after all platform-specific PATH additions so nested `npm run` calls
// can resolve npm.cmd even when FFmpeg is prepended.
ensureNpmOnPath(env, process.execPath, npmCli, process.platform);

const steps = [
  // The repository intentionally excludes generated dist/ output. Build first so
  // packaged-output regression tests always inspect artifacts from current source.
  ['npm', 'build'],
  ['node', 'test-runner-env.test.cjs'],
  ['node', 'verify-repository-cleanup.cjs'],
  ['node', 'test-help-update-check.cjs'],
  ['node', 'test-p27-build-render-hardening.cjs'],
  ['node', 'test-p28-persistence-render-fixes.cjs'],
  ['node', 'test-output-compatibility.cjs'],
  ['node', 'test-p30-workflow-fixes.cjs'],
  ['node', 'test-p31-connected-workflow-fixes.cjs'],
  ['node', 'test-p32-ui-fixes.cjs'],
  ['node', 'test-p33-stereo-bulk-log-fixes.cjs'],
  ['node', 'test-p33-bulk-sidecars.cjs'],
  ['node', 'test-p34-visualizer-canvas-reference.cjs'],
  ['node', 'test-p35-onix-visualizers.cjs'],
  ['node', 'test-p35-hf3-visualizer-parity.cjs'],
  ['node', 'test-p35-hf4-panel-layout.cjs'],
  ['node', 'test-p35-hf5-media-header.cjs'],
  ['node', 'test-p35-hf6-overlay-spacing.cjs'],
  ['node', 'test-p35-hf7-canvas-preview-spacing.cjs'],
  ['node', 'test-p35-hf8-preview-layout.cjs'],
  ['node', 'test-p35-hf9-seo-spacing.cjs'],
  ['node', 'test-p35-hf10-seo-top-spacing.cjs'],
  ['node', 'test-p35-hf11-preload-bridge.cjs'],
  ['node', 'test-p35-hf12-runtime-fixes.cjs'],
  ['node', 'test-p35-hf13-header-normalization.cjs'],
  ['node', 'test-p36-visualizer-project-validation.cjs'],
  ['node', 'verify-updates-p35.cjs'],
  ['npm', 'verify:foundation'],
  ['npm', 'verify:uiux'],
  ['npm', 'verify:blank-screen-fix'],
  ['npm', 'test:playlist'],
  ['npm', 'test:render-engine'],
  ['npm', 'test:orchestrator'],
  ['npm', 'test:monitor-pause-cache'],
  ['npm', 'test:phase22'],
  ['node', 'test-v5i-blend-sticker-timing.cjs'],
  ['node', 'test-v5v-ai-providers.cjs'],
  ['node', 'test-ai-validation-fixes.cjs'],
  ['node', 'test-v5w-playlist-sticker-seo.cjs'],
  ['npm', 'test:v5n-bulk'],
  ['npm', 'test:v6e-seo'],
  ['npm', 'test:v6f'],
  ['npm', 'test:v6g-seo'],
  ['npm', 'test:v6i-smooth-loop'],
  ['npm', 'test:p23-random-audio-seo'],
  ['npm', 'test:p24-undo-visualizer-seo'],
  ['npm', 'verify:ui-layout:p24'],
  ['npm', 'test:p26-visualizer-seo-layout'],
  ['npm', 'verify:ui-layout:p26'],
  ['npm', 'verify:updates:p33'],
  ['npm', 'test:v5x-upgrades'],
  ['npm', 'test:v5y-sync'],
  ['npm', 'test:v5z-assets-render'],
];

for (const [kind, name] of steps) {
  const command = process.execPath;
  const args = kind === 'npm' ? [npmCli, 'run', name] : [path.join(__dirname, name)];
  console.log(`\n[PENGUJIAN] ${name}`);
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[PENGUJIAN] Gagal: ${name}${result.error ? ` — ${result.error.message}` : ''}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\n[PENGUJIAN] Pemeriksaan V5W dan alur render terbaru lulus.');
