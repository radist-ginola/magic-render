const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
for (const ext of ['.ts','.tsx']) Module._extensions[ext] = (mod,file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);
const originalLoad=Module._load;
Module._load=function(name,parent,isMain) { if(name==='electron-store') return class {get(){return {}}}; if(name==='electron') return {safeStorage:{isEncryptionAvailable:()=>false}}; return originalLoad.call(this,name,parent,isMain); };
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {YoutubeSeoPanel}=require('../src/renderer/components/YoutubeSeoPanel.tsx');
const {YoutubeSeoService}=require('../src/main/services/aiService/youtubeSeoService.ts');
const {createDefaultProject}=require('../src/main/domain/project/projectFactory.ts');
const {loadSeoPromptFramework}=require('../src/main/services/aiService/seoPromptFramework.ts');
const {normalizeSeoContext}=require('../src/main/services/aiService/seoContext.ts');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mrp-v6e-'));
(async()=>{try {
 const framework=await loadSeoPromptFramework();assert.match(framework,/Validasi dan Pemilihan Hasil Terbaik/);assert.match(framework,/Jangan mengarang/);
 const project=createDefaultProject('Cordial Blues Night',dir);
 project.youtubeSEO={...project.youtubeSEO,mode:'timestamp-seo',mainKeyword:'whiskey blues, late night blues',analysisSource:'main',context:{contentType:'Musik',targetCountry:'Amerika Serikat (US)',targetLanguage:'English (US)',optimizationGoals:['youtube-search','suggested-videos','browse-features','brand-awareness','balanced'],titleStyle:'cinematic'}};
 const main=path.join(dir,'main.png'),mp3=path.join(dir,'01_Quiet_Night.mp3');fs.writeFileSync(main,'fake image');fs.writeFileSync(mp3,'fake audio');
 project.mainMedia={type:'image',metadata:null,path:main,durationSeconds:2,resize:null,position:{x:0,y:0},rotation:0,fade:{fadeInSec:0,fadeOutSec:0},autoMute:true};
 const markup=renderToStaticMarkup(React.createElement(YoutubeSeoPanel,{project,onProjectChange:()=>{},onMessage:()=>{},onOpenSettings:()=>{}}));
 for(const label of ['Gambar utama','Jenis konten video','Topik atau keyword utama','Bahasa &amp; target penonton','Tujuan Optimasi','Gaya Judul','Simpan sebagai template'])assert(markup.includes(label),`Input missing ${label}`);
 assert.equal((markup.match(/type="checkbox" checked=""/g)||[]).length,5);
 assert.throws(()=>normalizeSeoContext({optimizationGoals:[]}),/1–5/);
 const analysis={visualAnalysis:'An amber-lit room with a guitar.',audienceIntent:'US viewers may want a quiet night playlist.',visualEvidence:{observed:['Amber lamp','Guitar on table'],interpreted:['Calm atmosphere'],uncertain:['Music heard'],visibleText:[]},keywordsPrimary:['whiskey blues','late night blues'],keywordsSecondary:['quiet blues music','blues at night'],keywordsLongTail:['blues music for a quiet evening']};
 const titles=[
   'Amber Room 🥃 Whiskey Blues for Quiet Nights and Listeners Seeking a Warm Midnight Escape',
   'Quiet Evening 🌙 Whiskey Blues for Late Night Listeners in a Warm Room with Amber Lights',
   'Warm Lights 🎸 Whiskey Blues for Reflective Nights and Listeners Who Enjoy Quiet Hours',
   'Late Night Lounge 🥃 Whiskey Blues for Listeners Seeking a Slow Evening Under Amber Light',
   'Still Room ✨ Whiskey Blues for Calm Listeners Drawn to the Glow of a Warm Amber Evening',
   'Amber Lamp 🥃 Whiskey Blues for Quiet Nights and Listeners Seeking a Warm Midnight Escape',
   'Soft Glow 🥃 Whiskey Blues for Quiet Nights and Listeners Seeking a Warm Midnight Escape',
   'Warm Room 🥃 Whiskey Blues for Quiet Nights and Listeners Seeking a Warm Midnight Escape',
   'Quiet Guitar 🥃 Whiskey Blues for Quiet Nights and Listeners Seeking a Warm Midnight Escape',
   'Guitar Table 🥃 Whiskey Blues for Quiet Nights and Listeners Seeking a Warm Midnight Escape',
 ];
 for(const title of titles)assert(Array.from(title).length>=80&&Array.from(title).length<=99,title);
 const production={titles,titleNotes:Array.from({length:10},(_,i)=>`Reason ${i+1}`),bestTitleIndex:1,descriptionParts:{opening:'An amber-lit room sets the mood for this playlist. Settle into a quiet night.',body:'Whiskey blues accompanies an amber-lit visual atmosphere grounded in the main image.',bodySecondary:'Warm lights and a guitar on the table shape a quiet blues scene without claiming details of unseen tracks.',perfectForNarrative:'The unhurried room may appeal to listeners looking for a reflective evening setting and a calm visual scene.',perfectForHeading:'This playlist is perfect for:',audiences:['late-night listening','relaxed evenings','quiet work sessions','reflective moments'],closing:'If this mood speaks to you, subscribe, leave a like, or comment on your favorite moment.'},tags:['whiskey blues','late night blues','quiet blues music'],hashtags:['#WhiskeyBlues','#LateNightBlues','#SlowBlues','#BluesPlaylist','#QuietMusic','#MusicAtNight','#BluesMood']};

 const service=Object.create(YoutubeSeoService.prototype),extractions=[];
 service.globalCredentials={getAiCredentials:()=>({model:'gemini-test',apiKey:'test'})};service.credentials={get:()=>null};
 service.keyframeExtractor={extract:async(...args)=>{extractions.push(args);return [{timestampSec:0,mimeType:'image/jpeg',base64:'dGVzdA=='}]}};
 const audioPlan={orderedTracks:[{path:mp3,order:0,durationSeconds:120}],segments:[{path:mp3,startSeconds:0,durationSeconds:120,sourceTrackIndex:0}],totalDurationSeconds:120,targetDurationSeconds:120,shuffle:false};
 service.playlistService={getTracks:()=>audioPlan.orderedTracks,buildComposition:()=>audioPlan};service.mediaProbe={probe:async()=>({durationSeconds:120})};
 const shortTitles=[
   'Amber Room 🥃 Whiskey Blues for Quiet Nights and Reflective Listeners',
   'Warm Lights 🥃 Whiskey Blues for Quiet Nights and Reflective Listeners',
   'Quiet Room 🥃 Whiskey Blues for Quiet Nights and Reflective Listeners',
   'Calm Evening 🥃 Whiskey Blues for Quiet Nights and Reflective Listeners',
   'Still Night 🥃 Whiskey Blues for Quiet Nights and Reflective Listeners',
   'Amber Lamp 🥃 Whiskey Blues for Quiet Nights and Reflective Listeners',
   'Soft Glow 🥃 Whiskey Blues for Quiet Nights and Reflective Listeners',
   'Warm Room 🥃 Whiskey Blues for Quiet Nights and Reflective Listeners',
   'Quiet Guitar 🥃 Whiskey Blues for Quiet Nights and Reflective Listeners',
   'Guitar Table 🥃 Whiskey Blues for Quiet Nights and Reflective Listeners',
 ];
 let shortMode=false, repairFails=false;
 const calls=[];global.fetch=async(_url,opts)=>{const body=JSON.parse(opts.body);calls.push(body);const repair=String(body.contents[0].parts[0]?.text??'').includes('Revise ONLY the ten YouTube titles');const output=body.contents[0].parts.length>1?analysis:repair?{titles:repairFails?shortTitles:production.titles}:shortMode?{...production,titles:shortTitles}:production;return {ok:true,status:200,text:async()=>JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(output)}]}}]})}};
 const result=await service.generate({projectId:project.projectId,project,mainKeyword:project.youtubeSEO.mainKeyword,provider:'gemini',model:'gemini-test'});
 assert.equal(calls.length,2);assert.equal(extractions.length,1);
 assert.equal(result.titles.length,10);assert.equal(result.bestTitleIndex,1);
 assert.match(JSON.stringify(calls[0]),/Tahap Pertama — Analisis Gambar/);
 assert.match(JSON.stringify(calls[1]),/Validasi dan Pemilihan Hasil Terbaik/);
 assert.doesNotMatch(JSON.stringify(calls[1]),/### A\. Ringkasan Analisis Gambar/);
 assert.match(JSON.stringify(calls[1]),/cinematic/);
 assert.match(JSON.stringify(calls[1]),/AS MANY relevant generated tags/);
 assert.match(JSON.stringify(calls[1]),/Never repeat a generic template/);
 const file=fs.readFileSync(result.outputFiles.seoTxt,'utf8');
 assert(file.startsWith('youtube seo untuk Cordial Blues Night\n\n#judul\n'));
 assert.equal((file.match(/^\d+\. .+$/gm)||[]).length,10);
 assert.equal((file.match(/#WhiskeyBlues/g)||[]).length,1);
 assert.match(file,/#deskripsi\nQuiet Evening: Whiskey Blues.*\n?/);assert.match(file,/Playlist 🎧\n00:00 Quiet Night/);
 assert.match(file,/This playlist is perfect for:\n✓ late-night listening/);
 assert.match(file,/#tag\nwhiskey blues, late night blues/);
 assert.match(file,/#deskripsi\nQuiet Evening: Whiskey Blues/);
 assert.doesNotMatch(file,/# kombinasi terbaik|Hashtags:/);
 assert.match(file,/reflective evening setting/);
 assert(result.tags.join(', ').length<=500);
 assert(!file.includes('125 kandidat'));assert(!file.includes('## == JUDUL == ##'));
 await service.generate({projectId:project.projectId,project,mainKeyword:project.youtubeSEO.mainKeyword,provider:'gemini',model:'gemini-test'});
 assert.equal(calls.length,3,'analisis visual identik dipakai dari cache');
 const other=path.join(dir,'upload.png');fs.writeFileSync(other,'different image');
 await service.generate({projectId:project.projectId,project:{...project,youtubeSEO:{...project.youtubeSEO,analysisSource:'manual',analysisMediaPath:other}},mainKeyword:project.youtubeSEO.mainKeyword,provider:'gemini',model:'gemini-test'});
 assert.equal(extractions.at(-1)[1],other);assert.equal(calls.length,5,'upload baru dianalisis ulang');
 shortMode=true;
 const beforeRepair=calls.length;
 const repaired=await service.generate({projectId:project.projectId,project:{...project,youtubeSEO:{...project.youtubeSEO,analysisSource:'manual',analysisMediaPath:other}},mainKeyword:project.youtubeSEO.mainKeyword,provider:'gemini',model:'gemini-test'});
 assert.equal(calls.length-beforeRepair,2,'judul di luar batas memicu permintaan revisi judul saja, tanpa analisis ulang');
 assert(repaired.titles.every((title)=>Array.from(title).length>=80&&Array.from(title).length<=99));
 assert.match(fs.readFileSync(repaired.outputFiles.seoTxt,'utf8'),/#deskripsi\nQuiet Evening: Whiskey Blues.*\n?/);
 repairFails=true;
 const beforeFallback=calls.length;
 const fallback=await service.generate({projectId:project.projectId,project:{...project,youtubeSEO:{...project.youtubeSEO,analysisSource:'manual',analysisMediaPath:other}},mainKeyword:project.youtubeSEO.mainKeyword,provider:'gemini',model:'gemini-test'});
 assert.equal(calls.length-beforeFallback,2,'model judul yang masih terlalu pendek memakai fallback lokal');
 assert(fallback.titles.every((title)=>Array.from(title).length>=80&&Array.from(title).length<=99));


 console.log('V6E SEO: attached framework, six input groups, cached vision, final ready-copy file, manual upload PASSED');
}finally{fs.rmSync(dir,{recursive:true,force:true});Module._load=originalLoad}})().catch((error)=>{console.error(error);process.exitCode=1});
