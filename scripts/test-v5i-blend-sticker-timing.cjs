const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
Module._extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
const { FilterGraphBuilder } = require('../src/main/services/ffmpegEngine/filterGraphBuilder/filterGraphBuilder.ts');
const { buildStickerFilterGraph } = require('../src/main/services/ffmpegEngine/stickerFilterBuilder.ts');
const { defaultStickerConfig } = require('../src/main/services/stickerService.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-v5i-'));
const run = (args) => { const result = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 8e6 }); assert.equal(result.status, 0, result.stderr.toString()); return result.stdout; };
const pixel = (buffer, width, x, y, frame=0, height=90) => [...buffer.subarray((frame * width * height + y * width + x) * 3, (frame * width * height + y * width + x) * 3 + 3)];
try {
  const layer = path.join(root, 'keyed.png');
  run(['-f','lavfi','-i','color=c=green:s=80x40,format=rgb24,drawbox=x=20:y=10:w=40:h=20:color=red:t=fill','-frames:v','1',layer]);
  for (const mode of ['normal','screen','multiply','overlay']) {
    const overlay = { id:'keyed', path:layer, type:'image', config:{ opacity:1, position:{x:20,y:20}, resize:{width:80,height:40}, rotation:0, speed:1, blendMode:mode, chromaKey:{enabled:true,color:'0x008000',similarity:0.1,blend:0}, colorKey:{enabled:false,color:'0x000000',similarity:0.3,blend:0.1} } };
    const graph = new FilterGraphBuilder().build('0:v',[{sourceIndex:1,sourceLabel:'1:v',overlay}],160,90);
    const data = run(['-f','lavfi','-i','color=c=0x202040:s=160x90:r=10','-loop','1','-framerate','10','-i',layer,'-filter_complex',graph.filterGraph,'-map',`[${graph.finalLabel}]`,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
    const outside = pixel(data,160,2,2), transparent = pixel(data,160,24,24), inside = pixel(data,160,60,40);
    for (const c of [outside,transparent]) assert(Math.abs(c[0]-32)<9 && Math.abs(c[1]-32)<9 && Math.abs(c[2]-64)<9,`${mode} tint outside keyed layer: ${c}`);
    assert(inside[0] > outside[0] + 25 || mode==='multiply' && inside[0] > outside[0] - 8, `${mode} lost visible overlay: ${inside}`);
  }
  const colorOverlay={id:'color',path:layer,type:'image',config:{opacity:.6,position:{x:20,y:20},resize:{width:80,height:40},rotation:0,speed:1,blendMode:'screen',chromaKey:{enabled:false,color:'0x008000',similarity:.1,blend:0},colorKey:{enabled:true,color:'0x008000',similarity:.1,blend:0}}};
  const colorGraph=new FilterGraphBuilder().build('0:v',[{sourceIndex:1,sourceLabel:'1:v',overlay:colorOverlay}],160,90);
  const colorData=run(['-f','lavfi','-i','color=c=0x202040:s=160x90:r=10','-loop','1','-framerate','10','-i',layer,'-filter_complex',colorGraph.filterGraph,'-map',`[${colorGraph.finalLabel}]`,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
  const colorOutside=pixel(colorData,160,24,24),colorInside=pixel(colorData,160,60,40);
  assert(Math.abs(colorOutside[0]-32)<9 && Math.abs(colorOutside[2]-64)<9,`color key tinted background: ${colorOutside}`);
  assert(colorInside[0]>colorOutside[0]+20 && colorInside[0]<240,`color key/opacity lost foreground: ${colorInside}`);
  const stickerPath = path.join(root, 'sticker.png');
  run(['-f','lavfi','-i','color=c=red:s=30x20','-frames:v','1',stickerPath]);
  for (const schedule of [
    { mode:'timestamp', iterativeCount:null, timestamps:['1.2'] },
    { mode:'iterative', iterativeCount:3, timestamps:[] },
    { mode:'full-duration', iterativeCount:null, timestamps:[] },
  ]) {
    const config=defaultStickerConfig();config.position={x:10,y:10};config.scale=0.3;config.fade={fadeInSec:0,fadeOutSec:0};config.durationSec=0.5;config.schedule=schedule;
    const graph=buildStickerFilterGraph({id:'s',path:stickerPath,type:'image',config},'0:v','1:v',160,90,4);
    const data=run(['-f','lavfi','-i','color=c=black:s=160x90:r=10:d=4','-loop','1','-framerate','10','-i',stickerPath,'-filter_complex',graph.filterGraph,'-map',`[${graph.finalLabel}]`,'-t','4','-r','10','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
    const red=(time)=>pixel(data,160,30,25,Math.round(time*10))[0]>180;
    if(schedule.mode==='timestamp') { assert(!red(0.5));assert(red(1.3),'timestamp sticker missing at 1.3s');assert(!red(2.0)); }
    else if(schedule.mode==='iterative') { assert(red(0.2));assert(!red(1));assert(!red(1.9),'repeat interval of 3 minutes must not repeat in a 4 second video'); }
    else { assert(red(0.2));assert(red(2.0));assert(red(3.7),'full duration sticker ended early'); }
  }
  const screenConfig=defaultStickerConfig();screenConfig.position={x:10,y:10};screenConfig.scale=.3;screenConfig.blendMode='screen';screenConfig.fade={fadeInSec:0,fadeOutSec:0};screenConfig.durationSec=.5;screenConfig.schedule={mode:'timestamp',iterativeCount:null,timestamps:['1.2']};
  const screenGraph=buildStickerFilterGraph({id:'s',path:stickerPath,type:'image',config:screenConfig},'0:v','1:v',160,90,3);
  const screenFrames=run(['-f','lavfi','-i','color=c=0x202040:s=160x90:r=10:d=3','-loop','1','-framerate','10','-i',stickerPath,'-filter_complex',screenGraph.filterGraph,'-map',`[${screenGraph.finalLabel}]`,'-t','3','-r','10','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
  const before=pixel(screenFrames,160,30,25,5), during=pixel(screenFrames,160,30,25,13), after=pixel(screenFrames,160,30,25,22);
  assert(Math.abs(before[0]-32)<9 && Math.abs(before[2]-64)<9,`screen sticker tinted before window: ${before}`);
  assert(during[0]>100,`screen sticker missing during window: ${during}`);
  assert(Math.abs(after[0]-32)<9 && Math.abs(after[2]-64)<9,`screen sticker persists after window: ${after}`);
  const clip=path.join(root,'short-sticker.mp4');
  run(['-f','lavfi','-i','color=c=red:s=30x20:r=10:d=0.4','-t','0.4','-c:v','libx264','-pix_fmt','yuv420p',clip]);
  const repeatConfig=defaultStickerConfig();repeatConfig.position={x:10,y:10};repeatConfig.scale=.3;repeatConfig.fade={fadeInSec:0,fadeOutSec:0};repeatConfig.durationSec=.5;repeatConfig.schedule={mode:'iterative',iterativeCount:3,timestamps:[]};
  const repeatGraph=buildStickerFilterGraph({id:'v',path:clip,type:'video',config:repeatConfig},'0:v','1:v',160,90,4);
  const repeatFrames=run(['-f','lavfi','-i','color=c=black:s=160x90:r=10:d=4','-stream_loop','-1','-i',clip,'-filter_complex',repeatGraph.filterGraph,'-map',`[${repeatGraph.finalLabel}]`,'-t','4','-r','10','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
  assert(pixel(repeatFrames,160,30,25,2)[0]>150,'video sticker missing at the initial occurrence');
  assert(pixel(repeatFrames,160,30,25,19)[0]<100,'video sticker repeated before two minutes elapsed');
  console.log('V5I BLEND COLOR + CHROMA + STICKER TIMING: PASSED');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
