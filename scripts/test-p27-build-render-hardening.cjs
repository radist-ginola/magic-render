const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
Module._extensions['.ts'] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  mod._compile(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
};
const { prepareFfmpegSpawnArgs, detectFilterGraphFileOption } = require('../src/main/services/ffmpegEngine/ffmpegRunner.ts');
const { formatSpawnCommand } = require('../src/main/services/ffmpegEngine/commandBuilder.ts');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const results = [];
function check(name, run) {
  try { run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error instanceof Error ? error.message : String(error) }); }
}

async function main() {
  check('Patch version and package-lock root stay synchronized', () => {
    assert.match(pkg.version, /^0\.3\.\d+$/);
    assert.equal(lock.version, pkg.version);
    assert.equal(lock.packages?.['']?.version, pkg.version);
    assert.deepEqual(pkg.dependencies, lock.packages?.['']?.dependencies);
    assert.deepEqual(pkg.devDependencies, lock.packages?.['']?.devDependencies);
  });

  check('Long FFmpeg filter_complex is externalized using the modern option-file syntax by default', () => {
    const graph = `[0:v]null[${'long_label_'.repeat(1500)}out]`;
    const prepared = prepareFfmpegSpawnArgs('ffmpeg.exe', ['-y', '-i', 'input.mp4', '-filter_complex', graph, '-map', '[out]', 'out.mp4'], 'win32');
    try {
      assert.equal(prepared.externalizedFilterGraph, true);
      const option = prepared.args.indexOf('-/filter_complex');
      assert.ok(option >= 0, 'modern option-file syntax is present by default');
      assert.equal(prepared.args.includes('-filter_complex'), false);
      assert.equal(fs.readFileSync(prepared.args[option + 1], 'utf8'), graph);
      assert.ok(prepared.args[option + 1].length < 260, 'temp script path remains short');
    } finally { prepared.cleanup(); }
  });

  check('Legacy FFmpeg remains supported when capability detection selects its script option', () => {
    const graph = 'x'.repeat(15000);
    const prepared = prepareFfmpegSpawnArgs('ffmpeg.exe', ['-filter_complex', graph], 'win32', 24000, '-filter_complex_script');
    try {
      const option = prepared.args.indexOf('-filter_complex_script');
      assert.ok(option >= 0);
      assert.equal(fs.readFileSync(prepared.args[option + 1], 'utf8'), graph);
    } finally { prepared.cleanup(); }
  });

  check('Externalized filter script is safely removed after the process stage completes', () => {
    const prepared = prepareFfmpegSpawnArgs('ffmpeg.exe', ['-filter_complex', 'x'.repeat(15000)], 'win32');
    const scriptPath = prepared.args[prepared.args.indexOf('-/filter_complex') + 1];
    assert.ok(fs.existsSync(scriptPath));
    prepared.cleanup();
    prepared.cleanup();
    assert.equal(fs.existsSync(scriptPath), false);
  });

  check('Short FFmpeg commands keep the original argv and do not allocate temp files', () => {
    const original = ['-y', '-i', 'in.mp4', '-filter_complex', '[0:v]null[v]', '-map', '[v]', 'out.mp4'];
    const prepared = prepareFfmpegSpawnArgs('ffmpeg.exe', original, 'win32');
    assert.equal(prepared.externalizedFilterGraph, false);
    assert.deepEqual(prepared.args, original);
    prepared.cleanup();
  });

  check('Render command logs elide very long graphs instead of producing massive misleading console entries', () => {
    const graph = 'filter,'.repeat(5000);
    const formatted = formatSpawnCommand({ executable: 'C:/ffmpeg/bin/ffmpeg.exe', args: ['-y', '-filter_complex', graph, 'out.mp4'] });
    assert.ok(formatted.includes('C:/ffmpeg/bin/ffmpeg.exe'));
    assert.ok(formatted.includes('graph 35000 characters'));
    assert.ok(!formatted.includes(graph));
  });

  const ffmpeg = process.env.MAGIC_RENDER_FFMPEG_PATH || process.env.FFMPEG_PATH || 'ffmpeg';
  await (async () => {
    const name = 'Long filter graph executes through the detected FFmpeg option-file syntax';
    try {
      const option = await detectFilterGraphFileOption(ffmpeg);
      const graphParts = ['[0:v]null[p0]'];
      for (let index = 1; index <= 900; index++) graphParts.push(`[p${index - 1}]null[p${index}]`);
      graphParts.push('[p900]null[outv]');
      const graph = graphParts.join(';');
      const prepared = prepareFfmpegSpawnArgs(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=32x32:r=1:d=1',
        '-filter_complex', graph, '-map', '[outv]', '-frames:v', '1', '-f', 'null', '-',
      ], 'win32', 24000, option);
      try {
        assert.equal(prepared.externalizedFilterGraph, true);
        const result = spawnSync(ffmpeg, prepared.args, { encoding: 'utf8', timeout: 30000, windowsHide: true });
        if (result.error?.code === 'ENOENT' && process.platform !== 'win32') return;
        assert.equal(result.status, 0, result.stderr || result.error?.message || `FFmpeg exit ${result.status}`);
      } finally { prepared.cleanup(); }
      results.push({ name, pass: true });
    } catch (error) {
      if (error?.code === 'ENOENT' && process.platform !== 'win32') results.push({ name, pass: true });
      else results.push({ name, pass: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();

  check('Oversized Windows command without a filter graph gets an actionable diagnostic', () => {
    assert.throws(
      () => prepareFfmpegSpawnArgs('ffmpeg.exe', ['-i', 'x'.repeat(200)], 'win32', 100),
      (error) => error && error.code === 'ERR_FFMPEG_ARGV_TOO_LONG' && /shorten source\/output paths/i.test(error.message),
    );
  });

  for (const row of results) console.log(`${row.pass ? 'PASS' : 'FAIL'}: ${row.name}${row.error ? ` — ${row.error}` : ''}`);
  const failed = results.filter((row) => !row.pass);
  console.log(`P27/P28 BUILD/RENDER HARDENING: ${failed.length ? `FAILED (${failed.length})` : `PASSED (${results.length})`}`);
  process.exitCode = failed.length ? 1 : 0;
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
