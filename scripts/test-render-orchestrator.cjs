const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const child = require('node:child_process');
const Module = require('module');
const TS = require('typescript');

Module._extensions['.ts'] = function(mod, filename) {
  const src = fs.readFileSync(filename, 'utf8');
  const out = TS.transpileModule(src, { compilerOptions: { target: TS.ScriptTarget.ES2022, module: TS.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  mod._compile(out, filename);
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return { app: { getPath: (kind) => kind === 'temp' ? os.tmpdir() : os.tmpdir() } };
  return originalLoad.call(this, request, parent, isMain);
};

const { RenderOrchestrator } = require(path.join(process.cwd(), 'src/main/services/render/renderOrchestrator.ts'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-render-pro-orchestrator-'));
const outputDir = path.join(tmp, 'out');
fs.mkdirSync(outputDir, { recursive: true });
const main = path.join(tmp, 'main.mp4');
const intro = path.join(tmp, 'intro.mp4');
const overlay = path.join(tmp, 'overlay.png');
const audio = path.join(tmp, 'music.mp3');
const audio2 = path.join(tmp, 'music2.mp3');
const cmd = (args) => { const r = child.spawnSync(args[0], args.slice(1), { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr || `${args[0]} failed`); };
cmd(['ffmpeg','-y','-f','lavfi','-i','color=c=0x101020:s=320x180:r=24','-t','1','-c:v','libx264','-pix_fmt','yuv420p',main]);
cmd(['ffmpeg','-y','-f','lavfi','-i','color=c=0xff00ff:s=320x180:r=24','-t','0.5','-c:v','libx264','-pix_fmt','yuv420p',intro]);
cmd(['ffmpeg','-y','-f','lavfi','-i','color=c=red:s=80x40','-frames:v','1',overlay]);
cmd(['ffmpeg','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','0.8','-c:a','libmp3lame',audio]);
cmd(['ffmpeg','-y','-f','lavfi','-i','sine=frequency=880:sample_rate=44100','-t','0.7','-c:a','libmp3lame',audio2]);
const project = {
  projectId: 'phase12-smoke', schemaVersion: 1, name: 'Phase12Smoke', projectDir: tmp,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  mainMedia: { type:'video', metadata:null, path:main, durationSeconds:1, resize:null, position:{x:0,y:0}, rotation:0, fade:{fadeInSec:0,fadeOutSec:0}, autoMute:true },
  overlays: [{ id:'overlay1', path:overlay, type:'image', config:{ opacity:0.8, position:{x:10,y:10}, resize:{width:80,height:40}, rotation:0, speed:1, blendMode:'normal', chromaKey:{enabled:false,color:'0x00FF00',similarity:0.3,blend:0.1}, colorKey:{enabled:false,color:'0x000000',similarity:0.3,blend:0.1} } }],
  textOverlays: [{id:'title',config:{text:'UJI STROKE',fontFamily:'DejaVu Sans',fontStyle:'normal',fontColor:'#ffffff',fontSize:32,bold:false,italic:false,underline:false,strokeColor:'#ff3300',strokeWidth:2,opacity:1,neonGlow:false,glowColor:'#111111',glowBlur:0,effect:'none',animation:'none',position:{x:80,y:120},scale:1,rotation:0,speed:1}}],
  stickerSubscribe:{id:'sub',path:overlay,type:'image',config:{audioMuted:true,fade:{fadeInSec:0,fadeOutSec:0},scale:0.5,speed:1,position:{x:30,y:20},rotation:0,opacity:1,blendMode:'normal',durationSec:0.5,schedule:{mode:'timestamp',iterativeCount:null,timestamps:['0.3']},backgroundRemoval:'none',chromaKey:{enabled:false,color:'0x00FF00',similarity:0.3,blend:0.1},colorKey:{enabled:false,color:'0x000000',similarity:0.3,blend:0.1}}},
  playlistTracks: [{path:audio,durationSeconds:0.8,order:0},{path:audio2,durationSeconds:0.7,order:1}],
  playlist: { files:[audio,audio2], shuffle:false, playbackOrder:[audio,audio2] },
  intro:{ enabled:true, path:intro, fallbackFadeInSec:2 },
  settings:{ outputDir, resolution:'1080p', fps:25, bitrateKbps:1200, cpuLoadPercent:75 },
  youtubeSEO:{enabled:false,mainKeyword:'',provider:'openai',model:'gpt-4o'}
};
project.stickerSubscribes = [
  { ...project.stickerSubscribe, config: { ...project.stickerSubscribe.config, fade: { fadeInSec: 0.1, fadeOutSec: 0.1 }, schedule: { mode: 'iterative', iterativeCount: 1, iterativeUnit: 'seconds', timestamps: [] } } },
  { ...project.stickerSubscribe, id: 'sub-screen', config: { ...project.stickerSubscribe.config, blendMode: 'screen', position: { x: 100, y: 50 } } },
];
const orchestrator = new RenderOrchestrator('ffmpeg', 'ffprobe', path.join(tmp,'jobs'));
const events=[];
orchestrator.start(project, p => events.push(p)).then(async result => {
  if (!fs.existsSync(result.outputPath)) throw new Error('Final output missing');
  const probe = child.spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',result.outputPath],{encoding:'utf8'});
  const duration = Number(probe.stdout.trim());
  if (!(duration > 1.9 && duration < 2.1)) throw new Error(`Unexpected final duration ${duration}`);
  const streams = child.spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,r_frame_rate','-of','csv=p=0',result.outputPath],{encoding:'utf8'}).stdout;
  if (!streams.includes('25/1') || !streams.includes('audio')) throw new Error(`FPS atau audio output tidak sesuai: ${streams}`);
  if (!events.some(e => e.status === 'processing_audio')) throw new Error('Audio stage progress missing');
  if (!events.some(e => e.status === 'compressing_video' && e.percent > 8 && e.percent < 100)) throw new Error('Final visual composition progress missing');
  if (!events.some(e => e.status === 'done')) throw new Error('Done progress missing');
  if (events.some(e => e.status !== 'done' && e.percent >= 100)) throw new Error('Render monitor reached 100% before FFmpeg and cleanup completed');
  if (events.at(-1)?.status !== 'done' || events.at(-1)?.percent !== 100) throw new Error('Final progress event must follow output completion');
  if (!events.some(e => e.percent > 8 && e.percent < 100 && e.elapsedRenderSec > 0 && e.totalDurationSec > 0 && e.speedMultiplier > 0)) throw new Error('Live render monitor metrics missing');
  const stillProject = { ...project, projectId: 'still-main', name: 'StillMain', mainMedia: { ...project.mainMedia, type: 'image', path: overlay, durationSeconds: null }, overlays: [], textOverlays: [], stickerSubscribe: null, stickerSubscribes: [], intro: { enabled: false, path: null, fallbackFadeInSec: 0 } };
  const still = await orchestrator.start(stillProject, () => undefined);
  const stillDuration = Number(child.spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',still.outputPath],{encoding:'utf8'}).stdout.trim());
  if (!(stillDuration >= 1.45 && stillDuration < 1.7)) throw new Error(`Main image tidak mengikuti playlist: ${stillDuration}`);
  fs.rmSync(tmp,{recursive:true,force:true});
  console.log('RENDER ORCHESTRATOR E2E SMOKE: PASSED (playlist first, single video encoding, intro, overlay, live monitor).');
}).catch(err => { console.error(err.stack || err); process.exitCode=1; });
