const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const sourceCss = fs.readFileSync(path.join(root, 'src/renderer/styles/index.css'), 'utf8');
const distCssPath = path.join(root, 'dist/renderer/assets/index-D5UrtBJn.css');
const distCss = fs.readFileSync(distCssPath, 'utf8');
const panels = fs.readFileSync(path.join(root, 'src/renderer/components/EffectsPanels.tsx'), 'utf8');

for (const [name, css] of [['source', sourceCss], ['dist', distCss]]) {
  assert.ok(css.includes('P35-HF4 — repair the three cramped effect panels'), `${name} CSS is missing the HF4 override`);
  assert.ok(css.includes('grid-template-columns: minmax(0, 1fr) !important;'), `${name} CSS is missing the single-column stack rule`);
  assert.ok(css.includes('word-break: normal !important;'), `${name} CSS is missing the safe word-wrap rule`);
}

assert.match(sourceCss, /\.mrp-render-page--media-workspace \.mrp-media-settings-stack > \.mrp-effects-panel\s*\{[^}]*grid-column:\s*1\s*!important;/s,
  'Main Media Effects must remain in the same stack column as Main Media Controls');
assert.match(sourceCss, /\.mrp-render-page--overlay-workspace \.mrp-overlay-selected-settings \.mrp-effects-panel__header[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) !important;/,
  'Particle and Visualizer headers must use a full-width one-column layout');
assert.match(sourceCss, /@media \(max-width:\s*1199px\)[\s\S]*?\.mrp-render-page\.mrp-render-page--media-workspace[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) !important;/,
  'Media workspace must reflow below desktop width');
assert.ok(panels.includes('MainMediaEffectsPanel') && panels.includes('ParticleEffectsPanel') && panels.includes('VisualizerPanel'),
  'All three existing effect panels must remain present');
assert.ok(panels.includes('mrp-main-media-effects-controls') && panels.includes('mrp-particle-effects-controls') && panels.includes('mrp-visualizer-controls'),
  'Existing collapse controls and panel IDs must be preserved');

for (const [name, css] of [['source', sourceCss], ['dist', distCss]]) {
  let depth = 0;
  for (const char of css) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, `${name} CSS contains an extra closing brace`);
  }
  assert.equal(depth, 0, `${name} CSS braces must be balanced`);
}

console.log('PASS P35-HF4: all three panel layout fixes and source/dist CSS checks passed.');
