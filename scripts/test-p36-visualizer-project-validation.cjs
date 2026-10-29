const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const localTsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-p36-visualizer-validation-'));
const tsc = fs.existsSync(localTsc) ? localTsc : 'tsc';

try {
  // The local TypeScript binary is normally used after npm ci. If it is absent,
  // run the globally available compiler with the same isolated compile arguments.
  const args = [
    '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node',
    '--skipLibCheck', '--strict', '--rootDir', 'src', '--outDir', outDir,
    'src/shared/domain/visualizerTypes.ts',
    'src/main/services/effects/visualizerValidator.ts',
  ];
  const result = tsc === 'tsc'
    ? spawnSync('tsc', args, { cwd: root, encoding: 'utf8' })
    : spawnSync(process.execPath, [localTsc, ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `Targeted TypeScript compilation failed:\n${result.stdout}\n${result.stderr}`);

  const typesPath = path.join(outDir, 'shared', 'domain', 'visualizerTypes.js');
  const validatorPath = path.join(outDir, 'main', 'services', 'effects', 'visualizerValidator.js');
  const { STEREO_VISUALIZER_STYLES, defaultVisualizer } = require(typesPath);
  const { validateVisualizer } = require(validatorPath);

  assert.ok(STEREO_VISUALIZER_STYLES.length >= 38, 'All legacy and new visualizer styles should be registered.');
  const seen = new Set();
  for (const style of STEREO_VISUALIZER_STYLES) {
    assert.ok(!seen.has(style), `Duplicate visualizer style: ${style}`);
    seen.add(style);
    const visual = defaultVisualizer(`test-${style.replace(/[^a-z0-9-]/gi, '-')}`);
    visual.stereoStyle = style;
    if (style === 'onix-logo' || style === 'onix-album-art') {
      visual.kind = 'mediaLogo';
      visual.sourcePath = 'C:\\visualizer-test.png';
    } else {
      visual.kind = 'wave';
      delete visual.sourcePath;
    }
    assert.equal(validateVisualizer(visual).stereoStyle, style, `Validator rejected selectable style ${style}`);
  }

  const unsupported = defaultVisualizer('bad-style');
  unsupported.stereoStyle = 'onix-not-a-real-style';
  assert.throws(() => validateVisualizer(unsupported), /Model visualizer tidak didukung: onix-not-a-real-style/);
  assert.throws(() => validateVisualizer(null), /Konfigurasi visualizer harus berupa objek/);
  console.log(`P36 VISUALIZER PROJECT VALIDATION: PASSED (${STEREO_VISUALIZER_STYLES.length} styles + invalid-input checks)`);
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
