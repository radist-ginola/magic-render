const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceCss = fs.readFileSync(path.join(root, 'src/renderer/styles/index.css'), 'utf8');
const distCss = fs.readdirSync(path.join(root, 'dist/renderer/assets')).filter((name) => name.endsWith('.css')).map((name) => fs.readFileSync(path.join(root, 'dist/renderer/assets', name), 'utf8')).join('\n');
const marker = '/* P35-HF10 — remove duplicate top inset from the YouTube SEO canvas workspace. */';
const parent = '.mrp-render-page.mrp-render-page--seo-workspace .mrp-render-right--workspace';
const head = `${parent} > .mrp-canvas-head`;

function ruleAfter(css, selector, fromIndex) {
  const index = css.indexOf(selector, fromIndex);
  assert.notEqual(index, -1, `missing selector: ${selector}`);
  const open = css.indexOf('{', index + selector.length);
  assert.notEqual(open, -1, `missing rule body: ${selector}`);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) return { body: css.slice(open + 1, i), index, end: i + 1 };
    }
  }
  throw new Error(`unclosed rule: ${selector}`);
}

function assertParent(css, mediaStart, expectations) {
  const rule = ruleAfter(css, parent, mediaStart);
  for (const [pattern, description] of expectations) assert.match(rule.body, pattern, description);
  return rule.body;
}

for (const [name, css] of [['source', sourceCss], ['packaged', distCss]]) {
  const markerIndex = css.lastIndexOf(marker);
  assert.notEqual(markerIndex, -1, `${name} stylesheet is missing P35-HF10 marker`);

  const desktopStart = css.indexOf('@media (min-width: 1200px)', markerIndex);
  assert.notEqual(desktopStart, -1, `${name}: missing wide desktop media query`);
  assertParent(css, desktopStart, [[/margin-top:\s*0\s*!important/, `${name}: remove duplicate wrapper top margin on desktop`]]);
  const priorHeadIndex = css.lastIndexOf(head, markerIndex);
  assert.notEqual(priorHeadIndex, -1, `${name}: shared SEO canvas header rule must remain intact`);
  const priorHead = ruleAfter(css, head, priorHeadIndex);
  assert.match(priorHead.body, /margin:\s*var\(--mrp-canvas-preview-outside-gutter\)\s+var\(--mrp-canvas-preview-outside-gutter\)\s+0\s*!important/, `${name}: keep the shared single 12px canvas-header gutter`);
  assert.match(priorHead.body, /padding:\s*0\s*!important/, `${name}: preserve header padding contract`);

  const compactStart = css.indexOf('@media (min-width: 821px) and (max-width: 1199px)', markerIndex);
  assert.notEqual(compactStart, -1, `${name}: missing compact desktop media query`);
  assertParent(css, compactStart, [
    [/margin-top:\s*0\s*!important/, `${name}: no extra parent top margin in compact layout`],
    [/padding-top:\s*var\(--mrp-canvas-preview-outside-gutter\)\s*!important/, `${name}: compact layout parent owns one 12px inset`]
  ]);

  const mobileStart = css.indexOf('@media (max-width: 820px)', compactStart);
  assert.notEqual(mobileStart, -1, `${name}: missing mobile media query`);
  assertParent(css, mobileStart, [
    [/margin-top:\s*0\s*!important/, `${name}: no extra parent top margin on mobile`],
    [/padding-top:\s*var\(--mrp-canvas-preview-outside-gutter\)\s*!important/, `${name}: mobile parent owns one 12px inset`]
  ]);

  let depth = 0;
  for (const char of css) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, `${name}: extra closing brace in CSS`);
  }
  assert.equal(depth, 0, `${name}: CSS braces must balance`);
}

assert.equal(sourceCss.slice(sourceCss.lastIndexOf(marker)), distCss.slice(distCss.lastIndexOf(marker)), 'P35-HF10 source and packaged CSS must match exactly');
assert.ok(sourceCss.includes('--mrp-canvas-preview-outside-gutter: 12px'), 'shared canvas top gutter must stay 12px');
console.log('PASS P35-HF10: YouTube SEO uses one top inset at desktop and responsive breakpoints; source and packaged CSS match.');
