const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceCss = fs.readFileSync(path.join(root, 'src/renderer/styles/index.css'), 'utf8');
const distCss = fs.readdirSync(path.join(root, 'dist/renderer/assets')).filter((name) => name.endsWith('.css')).map((name) => fs.readFileSync(path.join(root, 'dist/renderer/assets', name), 'utf8')).join('\n');
const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
const seoPanel = fs.readFileSync(path.join(root, 'src/renderer/components/YoutubeSeoPanel.tsx'), 'utf8');
const markerText = 'P35-HF9 — normalize YouTube SEO canvas and side-panel spacing at every breakpoint.';
const marker = '/* ' + markerText + ' */';

function ruleAfter(css, selector, fromIndex) {
  const index = css.indexOf(selector, fromIndex);
  assert.notEqual(index, -1, `missing rule selector after marker: ${selector}`);
  const open = css.indexOf('{', index + selector.length);
  assert.notEqual(open, -1, `missing opening brace: ${selector}`);
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

function declarations(css, selector, markerIndex) {
  return ruleAfter(css, selector, markerIndex).body;
}

const headSelector = '.mrp-render-page.mrp-render-page--seo-workspace .mrp-render-right--workspace > .mrp-canvas-head';
const bodySelector = '.mrp-render-page.mrp-render-page--seo-workspace .mrp-render-right--workspace > .mrp-canvas-body';
const rootSelector = `${bodySelector} .mrp-canvas-preview-root:not(.mrp-canvas-preview--expanded)`;
const editorSelector = `${rootSelector} .mrp-canvas-editor`;
const configSelector = '.mrp-render-page.mrp-render-page--seo-workspace .mrp-youtube-seo-workspace > .mrp-seo-config-panel';
const resultsSelector = '.mrp-render-page.mrp-render-page--seo-workspace .mrp-youtube-seo-workspace > .mrp-seo-results-panel';
const innerResultsSelector = `${resultsSelector} > .mrp-seo-results`;

for (const [name, css] of [['source', sourceCss], ['packaged', distCss]]) {
  const markerIndex = css.lastIndexOf(marker);
  assert.notEqual(markerIndex, -1, `${name} CSS is missing the HF9 override`);

  const head = declarations(css, headSelector, markerIndex);
  assert.match(head, /grid-column:\s*2\s*!important/);
  assert.match(head, /grid-row:\s*2\s*!important/);
  assert.match(head, /margin:\s*var\(--mrp-canvas-preview-outside-gutter\)\s+var\(--mrp-canvas-preview-outside-gutter\)\s+0\s*!important/);
  assert.match(head, /padding:\s*0\s*!important/);

  const body = declarations(css, bodySelector, markerIndex);
  assert.match(body, /grid-column:\s*2\s*!important/);
  assert.match(body, /grid-row:\s*3\s*!important/);
  assert.match(body, /align-self:\s*start\s*!important/);
  assert.match(body, /height:\s*auto\s*!important/);
  assert.match(body, /margin:\s*0\s+var\(--mrp-canvas-preview-outside-gutter\)\s+var\(--mrp-canvas-preview-outside-gutter\)\s*!important/);
  assert.match(body, /padding:\s*var\(--mrp-canvas-preview-frame-padding\)\s*!important/);

  const canvasRoot = declarations(css, rootSelector, markerIndex);
  assert.match(canvasRoot, /width:\s*100%\s*!important/);
  assert.match(canvasRoot, /margin:\s*0\s*!important/);
  assert.match(canvasRoot, /padding:\s*0\s*!important/);
  const canvasEditor = declarations(css, editorSelector, markerIndex);
  assert.match(canvasEditor, /width:\s*min\(100%,\s*calc\(var\(--mrp-canvas-preview-max-height\)\s*\*\s*16\s*\/\s*9\)\)\s*!important/);
  assert.match(canvasEditor, /max-height:\s*var\(--mrp-canvas-preview-max-height\)\s*!important/);
  assert.match(canvasEditor, /aspect-ratio:\s*16\s*\/\s*9\s*!important/);
  assert.match(canvasEditor, /margin:\s*0\s+auto\s*!important/);

  const config = declarations(css, configSelector, markerIndex);
  assert.match(config, /margin:\s*var\(--mrp-sticker-panel-outside-top\)\s+0\s+var\(--mrp-sticker-panel-outside-bottom\)\s+var\(--mrp-sticker-panel-outside-left\)\s*!important/);
  assert.match(config, /padding:\s*var\(--mrp-sticker-panel-inner-padding\)\s*!important/);
  const results = declarations(css, resultsSelector, markerIndex);
  assert.match(results, /margin:\s*var\(--mrp-sticker-panel-outside-top\)\s+var\(--mrp-sticker-panel-outside-right\)\s+var\(--mrp-sticker-panel-outside-bottom\)\s+0\s*!important/);
  assert.match(results, /padding:\s*var\(--mrp-sticker-panel-inner-padding\)\s*!important/);
  const inner = declarations(css, innerResultsSelector, markerIndex);
  assert.match(inner, /margin:\s*0\s*!important/);
  assert.match(inner, /padding:\s*0\s*!important/);
  assert.match(inner, /border:\s*0\s*!important/);

  const compactDesktopStart = css.indexOf('@media (min-width: 1101px) and (max-width: 1199px)', markerIndex);
  assert.notEqual(compactDesktopStart, -1, `${name} CSS must include the compact desktop spacing contract`);
  const compactConfig = ruleAfter(css, configSelector, compactDesktopStart).body;
  assert.match(compactConfig, /margin:\s*0\s*!important/);
  assert.match(compactConfig, /padding:\s*var\(--mrp-sticker-panel-inner-padding\)\s*!important/);
  assert.match(compactConfig, /width:\s*100%\s*!important/);
  const compactInner = ruleAfter(css, innerResultsSelector, compactDesktopStart).body;
  assert.match(compactInner, /padding:\s*0\s*!important/);

  const narrowStart = css.indexOf('@media (max-width: 1100px)', compactDesktopStart);
  assert.notEqual(narrowStart, -1, `${name} CSS must include the narrow stacked-layout spacing contract`);
  const narrowConfig = ruleAfter(css, configSelector, narrowStart).body;
  assert.match(narrowConfig, /margin:\s*0\s+var\(--mrp-canvas-preview-outside-gutter\)\s+var\(--mrp-canvas-preview-outside-gutter\)\s*!important/);
  assert.match(narrowConfig, /padding:\s*var\(--mrp-sticker-panel-inner-padding\)\s*!important/);
  assert.match(narrowConfig, /width:\s*auto\s*!important/);
  const narrowInner = ruleAfter(css, innerResultsSelector, narrowStart).body;
  assert.match(narrowInner, /padding:\s*0\s*!important/);

  let depth = 0;
  for (const char of css) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, `${name} CSS has an extra closing brace`);
  }
  assert.equal(depth, 0, `${name} CSS braces must balance`);
}

const sourceTail = sourceCss.slice(sourceCss.lastIndexOf(marker));
const distTail = distCss.slice(distCss.lastIndexOf(marker));
assert.equal(sourceTail, distTail, 'source CSS and packaged renderer CSS must contain the exact same HF9 override');
assert.ok(app.includes("renderTab === 'Youtube SEO'"), 'YouTube SEO workspace must remain connected');
assert.ok(seoPanel.includes('className="mrp-seo-results-panel"'), 'right-side SEO results panel must remain connected');
assert.ok(seoPanel.includes('className="mrp-seo-config-panel"'), 'left-side SEO config panel must remain connected');
assert.ok(sourceCss.includes('--mrp-sticker-panel-inner-padding: 12px'), 'shared side-panel inner padding token must remain 12px');
assert.ok(sourceCss.includes('--mrp-canvas-preview-outside-gutter: 12px'), 'shared canvas outside gutter must remain 12px');
assert.ok(sourceCss.includes('--mrp-canvas-preview-frame-padding: 8px'), 'shared canvas frame padding must remain 8px');
console.log('PASS P35-HF9: YouTube SEO canvas keeps the shared 12px outside gutter/8px frame padding/centered 16:9 geometry, both side panels use the shared 14/12px outer and 12px inner spacing, and nested result padding is removed in source and packaged CSS.');
