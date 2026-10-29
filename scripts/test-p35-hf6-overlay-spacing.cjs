const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const sourceCss = fs.readFileSync(path.join(root, 'src/renderer/styles/index.css'), 'utf8');
const distCss = fs.readdirSync(path.join(root, 'dist/renderer/assets')).filter((name) => name.endsWith('.css')).map((name) => fs.readFileSync(path.join(root, 'dist/renderer/assets', name), 'utf8')).join('\n');
const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
const panels = fs.readFileSync(path.join(root, 'src/renderer/components/EffectsPanels.tsx'), 'utf8');
const marker = 'P35-HF6 — normalize Overlay right-panel gutters across Media Overlay, Particle, Visualizer, and Text Overlay';

function lastRule(css, selector) {
  const selectorIndex = css.lastIndexOf(selector);
  assert.notEqual(selectorIndex, -1, `CSS rule not found: ${selector}`);
  const open = css.indexOf('{', selectorIndex);
  assert.notEqual(open, -1, `CSS rule has no opening brace: ${selector}`);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`CSS rule has no closing brace: ${selector}`);
}

for (const [name, css] of [['source', sourceCss], ['packaged', distCss]]) {
  assert.ok(css.includes(marker), `${name} stylesheet is missing the HF6 spacing contract`);
  const parent = lastRule(css, '.mrp-render-page--overlay-workspace .mrp-overlay-selected-settings {');
  assert.match(parent, /padding:\s*0\s*!important/,
    `${name} selected-settings wrapper must not introduce an extra, inconsistent inner gutter`);
  assert.match(parent, /gap:\s*12px\s*!important/,
    `${name} selected-settings wrapper must keep a consistent section gap`);

  for (const selector of [
    '.mrp-render-page--overlay-workspace .mrp-overlay-selected-settings > .mrp-overlay-panel {',
    '.mrp-render-page--overlay-workspace .mrp-overlay-selected-settings > .mrp-effects-panel {',
    '.mrp-render-page--overlay-workspace .mrp-overlay-selected-settings > .mrp-text-overlay-panel {'
  ]) {
    const rule = lastRule(css, selector);
    assert.match(rule, /width:\s*100%\s*!important/, `${name} ${selector} must fill the same right-panel width`);
    assert.match(rule, /margin:\s*0\s*!important/, `${name} ${selector} must not add an inconsistent outer margin`);
  }

  for (const selector of [
    '.mrp-render-page--overlay-workspace .mrp-overlay-selected-settings .mrp-overlay-panel__library,',
    '.mrp-render-page--overlay-workspace .mrp-overlay-selected-settings > .mrp-effects-panel .mrp-effects-panel__header,',
    '.mrp-render-page--overlay-workspace .mrp-overlay-selected-settings > .mrp-text-overlay-panel .mrp-text-overlay-panel__header,'
  ]) {
    assert.ok(css.includes(selector), `${name} stylesheet must normalize internal padding for ${selector}`);
  }
  assert.match(css, /\.mrp-render-page--overlay-workspace \.mrp-overlay-selected-settings \.mrp-overlay-panel__library,[\s\S]*?padding:\s*12px\s*!important;/,
    `${name} Media Overlay cards must use 12px internal padding`);
  assert.match(css, /\.mrp-render-page--overlay-workspace \.mrp-overlay-selected-settings > \.mrp-effects-panel \.mrp-effects-panel__header,[\s\S]*?padding:\s*12px\s*!important;/,
    `${name} Particle/Visualizer headers must use 12px internal padding`);
  assert.match(css, /\.mrp-render-page--overlay-workspace \.mrp-overlay-selected-settings > \.mrp-text-overlay-panel \.mrp-text-overlay-panel__header,[\s\S]*?padding:\s*12px\s*!important;/,
    `${name} Text Overlay header must use 12px internal padding`);

  let depth = 0;
  for (const char of css) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, `${name} stylesheet has an extra closing brace`);
  }
  assert.equal(depth, 0, `${name} stylesheet braces must balance`);
}

for (const label of ['Media Overlay', 'Particle Effects', 'Audio Visualizer', 'Text Overlay']) {
  assert.ok(app.includes(label), `Overlay feature rail must retain ${label}`);
}
for (const className of ['mrp-overlay-panel', 'mrp-effects-panel--particle', 'mrp-effects-panel--visualizer']) {
  assert.ok(panels.includes(className) || sourceCss.includes(className), `Existing feature panel ${className} must remain in the project`);
}
assert.ok(panels.includes('mrp-effects-panel__collapse'), 'Particle/Visualizer collapse controls must remain present');
assert.ok(app.includes('<OverlayPanel') && app.includes('<TextOverlayPanel') && app.includes('<ParticleEffectsPanel') && app.includes('<VisualizerPanel'),
  'All four feature editors must remain connected to their existing project state and handlers');

console.log('PASS P35-HF6: Overlay right-panel margins and inner padding are normalized across all four feature editors; source and packaged CSS are valid.');
