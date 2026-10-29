const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const sourceCss = fs.readFileSync(path.join(root, 'src/renderer/styles/index.css'), 'utf8');
const distCss = fs.readdirSync(path.join(root, 'dist/renderer/assets')).filter((name) => name.endsWith('.css')).map((name) => fs.readFileSync(path.join(root, 'dist/renderer/assets', name), 'utf8')).join('\n');
const panels = fs.readFileSync(path.join(root, 'src/renderer/components/EffectsPanels.tsx'), 'utf8');
const marker = 'P35-HF5 — keep Main Media Effects text left and action buttons right with space-between';

for (const [name, css] of [['source', sourceCss], ['dist', distCss]]) {
  assert.ok(css.includes(marker), `${name} CSS is missing the P35-HF5 header override`);
  assert.match(css, /\.mrp-main-media-effects__header\s*\{[^}]*display:\s*flex\s*!important;[^}]*justify-content:\s*space-between\s*!important;/s,
    `${name} Main Media Effects header must use flex + space-between`);
  assert.match(css, /\.mrp-main-media-effects__actions\s*\{[^}]*justify-content:\s*flex-end\s*!important;/s,
    `${name} action buttons must remain aligned to the right`);
}

assert.ok(panels.includes('Efek Visual · {effects.length}/8'), 'the effect count kicker label should remain visible');
assert.ok(panels.includes('<h3>Main Media Efex</h3>'), 'the Main Media Efex title should remain visible');
assert.ok(panels.includes('+ Tambahkan Efek'), 'the add effect button label should be updated');
assert.ok(panels.includes('mrp-main-media-effects__collapse'), 'the collapse action must be preserved');
assert.ok(panels.includes('aria-expanded={!collapsed}'), 'the collapse accessibility state must be preserved');

for (const [name, css] of [['source', sourceCss], ['dist', distCss]]) {
  let depth = 0;
  for (const char of css) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, `${name} CSS has an extra closing brace`);
  }
  assert.equal(depth, 0, `${name} CSS braces must be balanced`);
}

console.log('PASS P35-HF5: Main Media Effects header uses space-between and retains readable labels/actions.');
