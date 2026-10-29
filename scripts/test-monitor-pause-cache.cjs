const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const Module = require('node:module');
const TS = require('typescript');
const originalLoad = Module._load;
Module._extensions['.ts'] = function(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  mod._compile(TS.transpileModule(source, { compilerOptions: { target: TS.ScriptTarget.ES2022, module: TS.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
};
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return { app: { getPath: () => os.tmpdir() } };
  return originalLoad.apply(this, arguments);
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const { RenderOrchestrator } = require('../src/main/services/render/renderOrchestrator.ts');
  const { CacheManager } = require('../src/main/services/cache/cacheManager.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-live-monitor-'));
  try {
    const source = path.join(dir, 'source.mp4');
    const output = path.join(dir, 'output'); fs.mkdirSync(output);
    const created = cp.spawnSync('ffmpeg', ['-y','-f','lavfi','-i','color=c=blue:s=320x180:r=24','-t','3','-c:v','libx264',source], { encoding:'utf8' });
    assert(created.status === 0, created.stderr);
    const wrapper = path.join(dir, 'slow-ffmpeg');
    fs.writeFileSync(wrapper, '#!/bin/sh\nexec ffmpeg -re "$@"\n', { mode:0o755 });
    const makeProject = (id) => ({ projectId:id, schemaVersion:1, name:id, projectDir:dir, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), mainMedia:{ type:'video', path:source, durationSeconds:3, resize:null, position:{x:0,y:0}, rotation:0, fade:{fadeInSec:0,fadeOutSec:0}, autoMute:true }, overlays:[], textOverlays:[], stickerSubscribe:null, playlistTracks:[], playlist:{ files:[], shuffle:false, playbackOrder:[] }, intro:{ enabled:false, path:null, fallbackFadeInSec:0 }, settings:{ outputDir:output, resolution:'1080p', bitrateKbps:1000, cpuLoadPercent:75 }, youtubeSEO:{ enabled:false, mainKeyword:'', provider:'openai', model:'gpt-4o', mode:'timestamp' } });
    const orchestrator = new RenderOrchestrator(wrapper, 'ffprobe', path.join(dir,'cache'));
    const earlyEvents = [];
    const earlyJob = orchestrator.start(makeProject('early-pause'), (event) => earlyEvents.push(event));
    assert(orchestrator.pause('early-pause', (event) => earlyEvents.push(event)), 'Pause saat persiapan render tidak diterima.');
    await delay(450);
    assert(earlyEvents.at(-1).status === 'paused', 'Status pause saat probe media ditimpa oleh status idle.');
    assert(orchestrator.resume('early-pause'), 'Resume saat persiapan gagal.');
    await earlyJob;
    const events = [];
    let paused = false;
    const job = orchestrator.start(makeProject('pause-resume'), (event) => {
      events.push(event);
      if (!paused && event.percent > 5 && event.percent < 100) { paused = orchestrator.pause('pause-resume', (e) => events.push(e)); }
    });
    for (let i=0; i<80 && !paused; i++) await delay(100);
    assert(paused, 'Tidak ada progres aktif untuk dijeda.');
    await delay(120);
    const frozen = events.at(-1).elapsedRenderSec;
    await delay(350);
    assert(Math.abs(events.at(-1).elapsedRenderSec - frozen) < 0.03, 'Waktu render bergerak saat jeda.');
    assert(orchestrator.resume('pause-resume'), 'Lanjutkan gagal.');
    const done = await job;
    assert(done.status === 'done' && fs.existsSync(done.outputPath), 'Render tidak selesai setelah dilanjutkan.');
    assert(events.some((e) => e.status === 'paused') && events.some((e) => e.percent > 5 && e.speedMultiplier > 0), 'Metrik progres/speed tidak ada.');
    assert(events.filter((e) => e.percent > 0 && e.percent < 100).length > 2, 'Bar progres tidak bergerak bertahap.');
    const cancelEvents = [];
    let cancelled = false;
    const job2 = orchestrator.start(makeProject('cancel'), (event) => {
      cancelEvents.push(event);
      if (!cancelled && event.percent > 5) { cancelled = orchestrator.cancel('cancel'); }
    });
    await job2.then(() => { throw new Error('Render yang dibatalkan malah selesai.'); }, () => undefined);
    assert(cancelled && cancelEvents.some((e) => e.status === 'cancelled'), 'Pembatalan tidak dikirim segera.');
    assert(!fs.existsSync(path.join(output, 'cancel.mp4')), 'File output parsial tertinggal setelah batal.');
    const pausedCancelEvents = [];
    let pauseThenCancel = false;
    const job3 = orchestrator.start(makeProject('pause-cancel'), (event) => {
      pausedCancelEvents.push(event);
      if (!pauseThenCancel && event.percent > 5) pauseThenCancel = orchestrator.pause('pause-cancel', (e) => pausedCancelEvents.push(e));
    });
    for (let i=0; i<80 && !pauseThenCancel; i++) await delay(100);
    assert(pauseThenCancel, 'Jeda sebelum batal gagal.');
    const pausedTime = pausedCancelEvents.at(-1).elapsedRenderSec;
    await delay(250);
    assert(Math.abs(pausedCancelEvents.at(-1).elapsedRenderSec - pausedTime) < 0.03, 'Waktu tidak berhenti pada jeda sebelum batal.');
    assert(orchestrator.cancel('pause-cancel'), 'Batal dari kondisi jeda gagal.');
    await job3.then(() => { throw new Error('Render dijeda lalu dibatalkan malah selesai.'); }, () => undefined);
    assert(pausedCancelEvents.at(-1).status === 'cancelled' && Math.abs(pausedCancelEvents.at(-1).elapsedRenderSec - pausedTime) < 0.03, 'Waktu bergerak setelah batal.');
    const cache = new CacheManager(path.join(dir,'cache'));
    const savedJob = await cache.createRenderJob('protected');
    const protectedFile = path.join(savedJob, 'saved-asset.png'); fs.writeFileSync(protectedFile,'asset');
    const garbageJob = await cache.createRenderJob('garbage'); fs.writeFileSync(path.join(garbageJob,'temporary.tmp'),'junk');
    const cleaned = await cache.cleanupStaleJobs(0, [protectedFile]);
    assert(fs.existsSync(protectedFile) && !fs.existsSync(garbageJob) && cleaned.some((entry) => entry.jobDir === garbageJob), 'Cache menghapus asset atau gagal menghapus file sementara.');
    console.log('LIVE MONITOR, PAUSE/RESUME, CANCEL, PROTECTED CACHE: PASSED');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); Module._load = originalLoad; }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
