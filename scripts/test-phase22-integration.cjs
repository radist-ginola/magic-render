const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const child = require('node:child_process');
const Module = require('node:module');
const TS = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;
function installTsLoader() {
  Module._extensions['.ts'] = function(mod, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const out = TS.transpileModule(source, { compilerOptions: { target: TS.ScriptTarget.ES2022, module: TS.ModuleKind.CommonJS, esModuleInterop: true }, fileName: filename }).outputText;
    mod._compile(out, filename);
  };
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => os.tmpdir() } };
    return originalLoad.call(this, request, parent, isMain);
  };
}
installTsLoader();

(async () => {
  // I-002/I-003: real FFmpeg + progress parser.
  const rootTmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'mrp-phase22-integration-'));
  const source = path.join(rootTmp, 'source.mp4');
  const output = path.join(rootTmp, 'encoded.mp4');
  const generated = child.spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=24', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  const encoded = child.spawnSync('ffmpeg', ['-y', '-i', source, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-b:v', '800k', '-minrate', '800k', '-maxrate', '800k', '-bufsize', '1600k', '-an', output], { encoding: 'utf8' });
  assert.equal(encoded.status, 0, encoded.stderr);
  assert.ok(fs.existsSync(output));
  const probe = child.spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', output], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
  assert.ok(Number(probe.stdout.trim()) > 0.9);

  const progressModule = require(path.join(root, 'src/main/services/ffmpegEngine/progressParser.ts'));
  const parser = new progressModule.FfmpegProgressParser();
  assert.equal(parser.parseLine('out_time_ms=1250000').outTimeSec, 1.25);
  assert.equal(parser.parseLine('speed=2.00x').speedMultiplier, 2);

  // I-004: render lifecycle with actual orchestrator.
  const RenderOrchestrator = require(path.join(root, 'src/main/services/render/renderOrchestrator.ts')).RenderOrchestrator;
  const main = path.join(rootTmp, 'main.mp4');
  const intro = path.join(rootTmp, 'intro.mp4');
  const overlay = path.join(rootTmp, 'overlay.png');
  const audio = path.join(rootTmp, 'music.mp3');
  const run = (args) => { const r = child.spawnSync(args[0], args.slice(1), { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  run(['ffmpeg','-y','-f','lavfi','-i','color=c=0x101020:s=320x180:r=24','-t','1','-c:v','libx264','-pix_fmt','yuv420p',main]);
  run(['ffmpeg','-y','-f','lavfi','-i','color=c=0xff00ff:s=320x180:r=24','-t','0.5','-c:v','libx264','-pix_fmt','yuv420p',intro]);
  run(['ffmpeg','-y','-f','lavfi','-i','color=c=red:s=80x40','-frames:v','1',overlay]);
  run(['ffmpeg','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1.5','-c:a','libmp3lame',audio]);
  const project = {
    projectId: 'phase22-integration', schemaVersion: 1, name: 'Phase22Integration', projectDir: rootTmp,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    mainMedia: { type:'video', metadata:null, path:main, durationSeconds:1, resize:null, position:{x:0,y:0}, rotation:0, fade:{fadeInSec:0,fadeOutSec:0}, autoMute:true },
    overlays: [{ id:'overlay1', path:overlay, type:'image', config:{ opacity:0.8, position:{x:10,y:10}, resize:{width:80,height:40}, rotation:0, speed:1, blendMode:'normal', chromaKey:{enabled:false,color:'0x00FF00',similarity:0.3,blend:0.1}, colorKey:{enabled:false,color:'0x000000',similarity:0.3,blend:0.1} } }],
    textOverlays: [], stickerSubscribe:null,
    playlistTracks: [{path:audio,durationSeconds:1.5,order:0}],
    playlist: { files:[audio], shuffle:false, playbackOrder:[audio] },
    intro:{ enabled:true, path:intro, fallbackFadeInSec:2 },
    settings:{ outputDir: path.join(rootTmp,'out'), resolution:'1080p', bitrateKbps:1200, cpuLoadPercent:75 },
    youtubeSEO:{enabled:false,mainKeyword:'',provider:'openai',model:'gpt-4o'}
  };
  await fsp.mkdir(project.settings.outputDir, { recursive: true });
  const events = [];
  const orchestrator = new RenderOrchestrator('ffmpeg', 'ffprobe', path.join(rootTmp,'jobs'));
  const result = await orchestrator.start(project, event => events.push(event));
  assert.ok(fs.existsSync(result.outputPath));
  assert.ok(events.some(e => e.status === 'processing_audio'));
  assert.ok(events.some(e => e.status === 'compressing_video' && e.percent > 8 && e.speedMultiplier > 0));
  assert.ok(events.some(e => e.status === 'done'));

  // I-005 cleanup actual cache manager.
  const CacheManager = require(path.join(root, 'src/main/services/cache/cacheManager.ts')).CacheManager;
  const cache = new CacheManager(path.join(rootTmp, 'cache'));
  const job = await cache.createRenderJob('phase22-cleanup');
  const renderDir = await cache.prepareArtifactDirectory(job, 'render');
  await fsp.writeFile(path.join(renderDir, 'partial.mp4'), 'partial');
  await cache.cleanupJob(job);
  assert.equal(fs.existsSync(job), false);
  assert.equal(fs.existsSync(result.outputPath), true);
  assert.equal(fs.existsSync(source), true);

  await fsp.rm(rootTmp, { recursive: true, force: true });
  console.log('PHASE 22 INTEGRATION TESTS: TEST PASSED (FFmpeg spawn, progress parsing, render lifecycle, cleanup).');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
