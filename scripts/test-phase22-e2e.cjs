const fs = require('node:fs');
const path = require('node:path');
const child = require('node:child_process');
const root = path.join(__dirname, '..');
const cases = [];
function run(name, command, args = []) {
  const result = child.spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  cases.push({ name, status: result.status === 0 ? 'TEST PASSED' : 'FAILED', output: `${result.stdout}${result.stderr}` });
}

// Reuse the real render E2E smoke for the automated core path.
run('E2E-001 core render smoke', process.execPath, [path.join(root, 'scripts/test-render-orchestrator.cjs')]);

// Timestamp output is verified against a real render output directory.
const timestampScript = `const fs=require('node:fs/promises'); const path=require('node:path'); const Module=require('node:module'); const TS=require('typescript'); const root=process.argv[1]; Module._extensions['.ts']=function(mod,filename){const src=require('node:fs').readFileSync(filename,'utf8'); const out=TS.transpileModule(src,{compilerOptions:{target:TS.ScriptTarget.ES2022,module:TS.ModuleKind.CommonJS,esModuleInterop:true},fileName:filename}).outputText; mod._compile(out,filename);}; (async()=>{const os=require('node:os'); const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrp-e2e-ts-')); const mod=require(path.join(root,'src/main/services/aiService/timestampGenerator.ts')); const out=path.join(dir,'final.mp4'); const target=await mod.writeYoutubeTimestampText({project:{name:'E2E'},finalDurationSeconds:10,outputVideoPath:out,introDurationSeconds:2,audioPlan:{orderedTracks:[{path:'/music/A.mp3',durationSeconds:8,order:0}],segments:[{path:'/music/A.mp3',startSeconds:0,durationSeconds:8,sourceTrackIndex:0}],totalDurationSeconds:8,targetDurationSeconds:8,shuffle:false}}); const text=await fs.readFile(target,'utf8'); if(!text.includes('00:00 Intro')||!text.includes('00:02 A')) process.exit(1); await fs.rm(dir,{recursive:true,force:true}); console.log('TIMESTAMP OUTPUT: TEST PASSED');})().catch(e=>{console.error(e);process.exit(1)});`;
const tsResult = child.spawnSync(process.execPath, ['-e', timestampScript, root], { encoding: 'utf8' });
cases.push({ name: 'E2E-001 timestamp output', status: tsResult.status === 0 ? 'TEST PASSED' : 'FAILED', output: `${tsResult.stdout}${tsResult.stderr}` });

const apiKeyPresent = Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
if (!apiKeyPresent) {
  cases.push({ name: 'E2E-002 SEO completion', status: 'NOT RUN', output: 'No API key supplied in environment; live multimodal API test intentionally not executed.' });
} else {
  cases.push({ name: 'E2E-002 SEO completion', status: 'NOT RUN', output: 'API key is present but live provider execution is intentionally excluded from unattended Phase 22 run to avoid uncontrolled external API usage.' });
}

cases.push({
  name: 'E2E-003 Windows GUI packaged path',
  status: 'MANUAL VERIFICATION REQUIRED',
  output: 'Requires packaged Electron application on Windows with the bundled ffmpeg.exe and interactive GUI.'
});

for (const test of cases) {
  console.log(`[${test.status}] ${test.name}`);
  process.stdout.write(test.output.trim() + '\n');
}
if (cases.some(test => test.status === 'FAILED')) process.exitCode = 1;
