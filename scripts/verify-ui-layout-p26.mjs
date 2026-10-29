import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const preview = read('src/renderer/components/VisualizerPreview.tsx');
const builder = read('src/main/services/effects/visualizerBuilder.ts');
const css = read('src/renderer/styles/index.css');
const seo = read('src/renderer/components/YoutubeSeoPanel.tsx');
const effects = read('src/renderer/components/EffectsPanels.tsx');
const pkg = JSON.parse(read('package.json'));
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
const patch = css.slice(css.lastIndexOf('P26 — keep the SEO canvas stage anchored'));

check('Stereo live analyser uses isolated left/right analysers and shared timing', preview.includes('visualAnalyzer.smoothingTimeConstant = 0') && preview.includes('routing.stereoAnalysers.get(visual.id)') && preview.includes('const temporalTau = Math.max(1 / Math.max(1, fps)') && preview.includes('drawStereoModel'));
check('Waveform preview uses distinct left and right channels and the model renderer', preview.includes('drawWaveChannel') && preview.includes('getByteTimeDomainData(buffers.leftWaveform)') && preview.includes('getByteTimeDomainData(buffers.rightWaveform)') && preview.includes('drawStereoModel'));
check('Every stereo visualizer model uses an explicit FFmpeg graph', ['showwaves=','showcqt=','avectorscope=','channelsplit=channel_layout=stereo','boxblur=${glowRadius}:1','hflip,vflip'].every((token) => builder.includes(token)));
check('SEO fullscreen layout top-anchors the preview while keeping horizontal centring', patch.includes('align-items: flex-start !important') && patch.includes('justify-content: center !important') && patch.includes('justify-content: flex-start !important') && patch.includes('@media (min-width: 1200px)'));
check('SEO preview override comes after all previous competing SEO rules', css.lastIndexOf('P26 — keep the SEO canvas stage anchored') > css.lastIndexOf('P24 — keep SEO result categories') && css.lastIndexOf('P26 — keep the SEO canvas stage anchored') > css.lastIndexOf('P21 — text-only information cleanup'));
check('SEO configuration, preview, and result panels remain a single row on desktop', css.includes('grid-template-columns:minmax(250px,27%) minmax(280px,1fr) minmax(265px,27%)') && css.includes('.mrp-seo-config-panel') && css.includes('.mrp-seo-results-panel') && css.includes('.mrp-canvas-body'));
check('Windowed SEO responsive breakpoints remain defined', css.includes('@media (max-width:1100px)') && css.includes('@media (max-width:640px)'));
check('All visualizer styles still share the anti-shake UI control', effects.includes("slider('Kehalusan / anti-getar', effect.smoothing ?? 0.9, 0, 0.97, 0.01") && preview.includes('const smoothing = Math.max(0, Math.min(.97, visual.smoothing ?? .9))'));
check('Logo/media visualizer crop/chroma/blend functionality and stable SEO tabs remain present', builder.includes('cropFilter') && builder.includes('colorkey=0x${keyColor}') && builder.includes('blend=all_mode=${mode}') && seo.includes('role="tablist"') && ['titles','description','tags','hashtags'].every((id) => seo.includes(`result && activeResultTab === '${id}'`)));
check('P26 scripts are registered without dependency or product version changes', pkg.scripts?.['test:p26-visualizer-seo-layout'] === 'node scripts/test-p26-visualizer-seo-layout.cjs' && /^0\.3\.\d+$/.test(pkg.version) && pkg.dependencies?.react === '19.2.8');

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}: ${item.name}`);
console.log(`P26 UI LAYOUT VERIFY: ${failed.length ? `FAILED (${failed.length})` : 'PASSED'} (${checks.length} checks)`);
process.exitCode = failed.length ? 1 : 0;
