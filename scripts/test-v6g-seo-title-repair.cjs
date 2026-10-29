const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
for(const ext of ['.ts','.tsx']) Module._extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const {parseProductionResponse,buildTitleRepairPrompt,parseTitleRepairCandidates,fitTitleLengths,validateSeoTitles,seoTitleCase} = require('../src/main/services/aiService/seoPipeline.ts');
const {buildReadyDescription}=require('../src/main/services/aiService/seoFileWriter.ts');
const keyword='whiskey blues';
const titles=[
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
const parts={opening:'Warm light fills the room.',body:'Whiskey blues accompanies the amber room.',bodySecondary:'A guitar rests on the table.',perfectForNarrative:'A calm setting for a reflective evening.',perfectForHeading:'This playlist is perfect for:',audiences:['late-night listening','quiet work sessions','reflective evenings','unhurried mornings'],closing:'Subscribe if you enjoy the atmosphere.'};
const output={titles,titleNotes:Array.from({length:10},(_,i)=>`reason ${i+1}`),bestTitleIndex:0,descriptionParts:parts,tags:['whiskey blues'],hashtags:['#WhiskeyBlues','#SlowBlues','#NightMusic']};
assert.throws(()=>parseProductionResponse(JSON.stringify(output),keyword),/80–99/);
const parsed=parseProductionResponse(JSON.stringify(output),keyword,false);
const analysis={visualAnalysis:'Warm light and a guitar on a table.',audienceIntent:'Listeners seeking a reflective evening.',visualEvidence:{observed:['Amber lamp','Guitar on table'],interpreted:[],uncertain:[],visibleText:[]},keywordsPrimary:[keyword],keywordsSecondary:[],keywordsLongTail:[]};
const prompt=buildTitleRepairPrompt(titles,keyword,{targetCountry:'Amerika Serikat (US)',targetLanguage:'English (US)'},analysis,parts.audiences);
assert.match(prompt,/Revise ONLY the ten YouTube titles/);
assert.match(prompt,/80–99/);
assert.match(prompt,/Search intent means who searches/);
const title83='Amber Room 🥃 Whiskey Blues for Quiet Nights and Listeners Seeking a Midnight Escape';
const title81=title83.replace('Quiet Nights','Quiet Night').replace('Listeners','Listener');
const title84=`${title83}!`;
assert.equal(Array.from(title81).length,81);
assert.equal(Array.from(title84).length,84);
validateSeoTitles([title81,title84,...Array(8).fill(title83)],keyword);
assert.equal(seoTitleCase('amber room 🥃 whiskey blues for quiet nights and lonely listeners'),'Amber Room 🥃 Whiskey Blues for Quiet Nights and Lonely Listeners');
assert.throws(()=>validateSeoTitles([recoveredTitleWithLongScene(),...titles.slice(1)],keyword,false),/2–3 kata/);
const recovered=fitTitleLengths(parsed.titles,keyword,parts.audiences,analysis.visualEvidence.observed,'English (US)');
validateSeoTitles(recovered,keyword);
assert.equal(new Set(recovered).size,10);
assert(recovered.every(title=>Array.from(title).length>=80&&Array.from(title).length<=99));
const repaired=parseTitleRepairCandidates(JSON.stringify({titles:recovered}));assert.deepEqual(repaired,recovered);
function recoveredTitleWithLongScene(){return titles[0].replace('Amber Room','Amber Lit Music Room');}
const withHash={...parsed,descriptionParts:{...parts,body:'Whiskey blues helps listeners wind down #WhiskeyBlues.',closing:'Subscribe for more. #NightMusic'},hashtags:['#WhiskeyBlues','#NightMusic','#whiskeyblues']};
const description=buildReadyDescription(withHash,'00:00 Quiet Night',true);
assert.equal((description.match(/#WhiskeyBlues/gi)||[]).length,1);
assert.equal((description.match(/#NightMusic/gi)||[]).length,1);
assert(description.trimEnd().endsWith('#WhiskeyBlues #NightMusic'));
console.log('V6G title-only repair and grounded local fitting PASSED');
