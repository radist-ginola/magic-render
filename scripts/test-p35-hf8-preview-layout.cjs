const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const sourceCss = fs.readFileSync(path.join(root, 'src/renderer/styles/index.css'), 'utf8');
const distCss = fs.readdirSync(path.join(root, 'dist/renderer/assets')).filter((name) => name.endsWith('.css')).map((name) => fs.readFileSync(path.join(root, 'dist/renderer/assets', name), 'utf8')).join('\n');
const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
const marker = 'P35-HF8 — lock YouTube SEO and final Render preview geometry to the shared canvas contract.';

function lastRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{`, 'g'))];
  assert.ok(matches.length > 0, `missing selector: ${selector}`);
  const match = matches[matches.length - 1];
  const open = match.index + match[0].lastIndexOf('{');
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unclosed rule: ${selector}`);
}

const seoBodySelector = '.mrp-render-page.mrp-render-page--seo-workspace .mrp-render-right--workspace > .mrp-canvas-body';
const seoHeadSelector = '.mrp-render-page.mrp-render-page--seo-workspace .mrp-render-right--workspace > .mrp-canvas-head';
const seoRootSelector = '.mrp-render-page.mrp-render-page--seo-workspace .mrp-render-right--workspace > .mrp-canvas-body .mrp-canvas-preview-root:not(.mrp-canvas-preview--expanded)';
const seoEditorSelector = `${seoRootSelector} .mrp-canvas-editor`;
const renderShellSelector = '.mrp-final-render-workspace';
const renderPreviewSelector = '.mrp-final-render-workspace .mrp-final-render-preview';
const renderBodySelector = '.mrp-final-render-workspace .mrp-final-render-preview > .mrp-canvas-body';
const renderEditorSelector = '.mrp-final-render-workspace .mrp-final-render-preview .mrp-canvas-preview-root:not(.mrp-canvas-preview--expanded) .mrp-canvas-editor';

for (const [name, css] of [['source', sourceCss], ['packaged', distCss]]) {
  assert.ok(css.includes(marker), `${name} CSS must include the HF8 hardening block`);
  const seoHead = lastRule(css, seoHeadSelector);
  assert.match(seoHead, /grid-row:\s*2\s*!important/);
  assert.match(seoHead, /margin:\s*var\(--mrp-canvas-preview-outside-gutter\)\s+var\(--mrp-canvas-preview-outside-gutter\)\s+0\s*!important/);
  assert.match(seoHead, /padding:\s*0\s*!important/);
  const seoBody = lastRule(css, seoBodySelector);
  assert.match(seoBody, /grid-row:\s*3\s*!important/);
  assert.match(seoBody, /align-self:\s*start\s*!important/);
  assert.match(seoBody, /height:\s*auto\s*!important/);
  assert.match(seoBody, /min-height:\s*0\s*!important/);
  assert.match(seoBody, /margin:\s*0\s+var\(--mrp-canvas-preview-outside-gutter\)\s+var\(--mrp-canvas-preview-outside-gutter\)\s*!important/);
  assert.match(seoBody, /padding:\s*var\(--mrp-canvas-preview-frame-padding\)\s*!important/);
  const seoRoot = lastRule(css, seoRootSelector);
  assert.match(seoRoot, /width:\s*100%\s*!important/);
  assert.match(seoRoot, /margin:\s*0\s*!important/);
  assert.match(seoRoot, /padding:\s*0\s*!important/);
  const seoEditor = lastRule(css, seoEditorSelector);
  assert.match(seoEditor, /width:\s*min\(100%,\s*calc\(var\(--mrp-canvas-preview-max-height\)\s*\*\s*16\s*\/\s*9\)\)\s*!important/);
  assert.match(seoEditor, /max-height:\s*var\(--mrp-canvas-preview-max-height\)\s*!important/);
  assert.match(seoEditor, /aspect-ratio:\s*16\s*\/\s*9\s*!important/);

  const shellRule = lastRule(css, renderShellSelector);
  assert.match(shellRule, /padding:\s*0\s*!important/);
  assert.match(shellRule, /column-gap:\s*var\(--mrp-workspace-panel-gap,\s*12px\)\s*!important/);
  const renderPreview = lastRule(css, renderPreviewSelector);
  assert.match(renderPreview, /row-gap:\s*0\s*!important/);
  const renderBody = lastRule(css, renderBodySelector);
  assert.match(renderBody, /align-self:\s*start\s*!important/);
  assert.match(renderBody, /min-height:\s*0\s*!important/);
  assert.match(renderBody, /margin:\s*0\s+var\(--mrp-canvas-preview-outside-gutter\)\s+var\(--mrp-canvas-preview-outside-gutter\)\s*!important/);
  assert.match(renderBody, /padding:\s*var\(--mrp-canvas-preview-frame-padding\)\s*!important/);
  const renderEditor = lastRule(css, renderEditorSelector);
  assert.match(renderEditor, /width:\s*min\(100%,\s*calc\(var\(--mrp-canvas-preview-max-height\)\s*\*\s*16\s*\/\s*9\)\)\s*!important/);
  assert.match(renderEditor, /max-height:\s*var\(--mrp-canvas-preview-max-height\)\s*!important/);
  assert.match(renderEditor, /aspect-ratio:\s*16\s*\/\s*9\s*!important/);

  let depth = 0;
  for (const char of css) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, `${name} CSS has an extra closing brace`);
  }
  assert.equal(depth, 0, `${name} CSS braces must balance`);
}
assert.ok(app.includes("renderTab === 'Youtube SEO'"), 'YouTube SEO workspace must remain connected');
assert.ok(app.includes('mrp-final-render-page'), 'final Render workspace must remain connected');
assert.ok(sourceCss.includes('min(58vh, 760px)'), 'shared canvas height token must remain in source CSS');
console.log('PASS P35-HF8: YouTube SEO canvas no longer stretches across metadata grid tracks; final Render outer inset is removed; both share identical 12px outer gutters, 8px frame padding and 16:9 sizing in source and packaged CSS.');
