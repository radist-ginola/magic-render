const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
Module._extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
const { createDefaultProject } = require('../src/main/domain/project/projectFactory.ts');
const { defaultOverlayConfig } = require('../src/shared/domain/overlayTypes.ts');
const { defaultStickerConfig } = require('../src/shared/domain/stickerTypes.ts');
const { defaultVisualizer } = require('../src/shared/domain/visualizerTypes.ts');
const { validateOverlayShape } = require('../src/main/services/overlay/overlayValidator.ts');
const { buildComposedOutputCommand } = require('../src/main/services/render/renderCommandBuilder.ts');
const { ChromaKeyBuilder } = require('../src/main/services/ffmpegEngine/filterGraphBuilder/chromaKeyBuilder.ts');
const { translateFfmpegError } = require('../src/main/services/ffmpegEngine/errorTranslator.ts');

function run(args, timeout = 60000) {
  const result = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding:'utf8', timeout });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mrp-v5z-'));
try {
  const main=path.join(dir,'main.png'), sticker=path.join(dir,'sticker.png'), overlay=path.join(dir,'overlay.mp4'), audio=path.join(dir,'audio.aac');
  run(['-f','lavfi','-i','color=c=blue:s=320x180','-frames:v','1','-update','1',main]);
  run(['-f','lavfi','-i','color=c=red:s=80x45','-frames:v','1','-update','1',sticker]);
  run(['-f','lavfi','-i','testsrc2=s=160x90:r=24','-t','2','-c:v','libx264','-pix_fmt','yuv420p',overlay]);
  run(['-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','3','-c:a','aac',audio]);
  const project=createDefaultProject('V5Z filter',dir,{resolution:'720p',fps:24,bitrateKbps:1000,renderPreset:'fast'});
  project.mainMedia={path:main,type:'image',autoMute:true,resize:{width:1920,height:1080},position:{x:0,y:0},rotation:0,fade:{fadeInSec:0,fadeOutSec:0}};
  const config={...defaultOverlayConfig(),resize:{width:640,height:360},position:{x:300,y:300},chromaKey:{enabled:true,color:'0x00FF00',similarity:.1,blend:.1},crop:{left:10,right:15,top:5,bottom:10},trim:{startSec:.3,endSec:1.6,sourceDurationSec:2}};
  const layer={id:'overlay',type:'video',path:overlay,config};
  validateOverlayShape(layer);
  assert.match(new ChromaKeyBuilder().build('source','keyed',{enabled:true,color:'0x00FF00',similarity:0,blend:0}),/similarity=0\.00001/);
  run(['-f','lavfi','-i','color=c=green:s=32x32','-vf','format=rgba,colorkey=0x00FF00:0.00001:0','-frames:v','1','-f','null','-']);
  const translated = translateFfmpegError('Error initializing complex filters', { stage:'output',stderr:'Value 0.000000 for parameter similarity out of range\nError initializing complex filters\nInvalid argument' });
  assert.match(translated.message,/similarity out of range/);
  assert.throws(()=>validateOverlayShape({...layer,config:{...config,crop:{left:90,right:20,top:0,bottom:0}}}),/Crop overlay/);
  project.overlays=[layer];
  const stickerConfig={...defaultStickerConfig(),backgroundRemoval:'none',position:{x:600,y:200},durationSec:1,schedule:{mode:'timestamp',timestamps:['1'],iterativeCount:null}};
  project.stickerSubscribes=[{id:'sticker',path:sticker,type:'image',config:stickerConfig}];
  project.stickerSubscribe=project.stickerSubscribes[0];
  for (const kind of ['bars','spectrumFire','spectrumScroll']) {
    project.visualizers=[{...defaultVisualizer('test'),kind,frequencyScale:'linear',size:{width:500,height:120},position:{x:200,y:800}}];
    const output=path.join(dir,`result-${kind}.mp4`);
    const command=buildComposedOutputCommand('ffmpeg',project,output,3,0,audio,false);
    run(command.args,90000);
    assert.ok(fs.statSync(output).size>10000);
  }
  console.log('V5Z: FFmpeg overlay trim+crop+chroma, sticker, tiga visualizer pada MP4: PASSED');
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
