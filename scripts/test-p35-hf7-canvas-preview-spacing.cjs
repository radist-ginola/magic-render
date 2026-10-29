const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const sourceCss = fs.readFileSync(path.join(root, 'src/renderer/styles/index.css'), 'utf8');
const distCss = fs.readdirSync(path.join(root, 'dist/renderer/assets')).filter((name) => name.endsWith('.css')).map((name) => fs.readFileSync(path.join(root, 'dist/renderer/assets', name), 'utf8')).join('\n');
const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
const canvasPreview = fs.readFileSync(path.join(root, 'src/renderer/components/CanvasPreview.tsx'), 'utf8');
const marker = 'P35-HF7 — unify canvas preview outer gutters, frame padding, and sizing across all preview workspaces.';
const scopedWorkspace = '.mrp-render-page--workspace:not(.mrp-render-page--playlist-workspace) .mrp-render-right--workspace';

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
  assert.ok(css.includes(marker), `${name} stylesheet is missing the HF7 canvas spacing contract`);
  assert.match(css, /--mrp-canvas-preview-outside-gutter:\s*12px/,
    `${name} stylesheet must define the shared 12px canvas outer gutter`);
  assert.match(css, /--mrp-canvas-preview-frame-padding:\s*8px/,
    `${name} stylesheet must define the shared 8px frame padding`);
  assert.match(css, /--mrp-canvas-preview-max-height:\s*min\(58vh,\s*760px\)/,
    `${name} stylesheet must define the shared canvas size cap`);

  const shell = lastRule(css, `${scopedWorkspace},`);
  assert.match(shell, /margin:\s*0\s*!important/);
  assert.match(shell, /padding:\s*0\s*!important/);

  const header = lastRule(css, `${scopedWorkspace} > .mrp-canvas-head,`);
  assert.match(header, /margin:\s*var\(--mrp-canvas-preview-outside-gutter\)\s+var\(--mrp-canvas-preview-outside-gutter\)\s+var\(--mrp-canvas-preview-outside-gutter\)\s*!important/);
  assert.match(header, /padding:\s*0\s*!important/);

  const body = lastRule(css, `${scopedWorkspace} > .mrp-canvas-body,`);
  assert.match(body, /margin:\s*0\s+var\(--mrp-canvas-preview-outside-gutter\)\s+var\(--mrp-canvas-preview-outside-gutter\)\s*!important/);
  assert.match(body, /padding:\s*var\(--mrp-canvas-preview-frame-padding\)\s*!important/);
  assert.match(body, /min-height:\s*0\s*!important/);

  const rootRule = lastRule(css, `${scopedWorkspace} .mrp-canvas-preview-root:not(.mrp-canvas-preview--expanded),`);
  assert.match(rootRule, /align-items:\s*center\s*!important/);
  assert.match(rootRule, /width:\s*100%\s*!important/);
  assert.match(rootRule, /margin:\s*0\s*!important/);
  assert.match(rootRule, /padding:\s*0\s*!important/);

  const editor = lastRule(css, `${scopedWorkspace} .mrp-canvas-preview-root:not(.mrp-canvas-preview--expanded) .mrp-canvas-editor,`);
  assert.match(editor, /width:\s*min\(100%,\s*calc\(var\(--mrp-canvas-preview-max-height\)\s*\*\s*16\s*\/\s*9\)\)\s*!important/);
  assert.match(editor, /max-height:\s*var\(--mrp-canvas-preview-max-height\)\s*!important/);
  assert.match(editor, /aspect-ratio:\s*16\s*\/\s*9\s*!important/);
  assert.match(editor, /margin:\s*0\s+auto\s*!important/);

  assert.ok(css.includes('.mrp-final-render-workspace .mrp-final-render-preview > .mrp-canvas-body'), `${name} final Render preview must use the same canvas contract`);
  assert.ok(css.includes('.mrp-render-page--workspace:not(.mrp-render-page--playlist-workspace)'), `${name} shared contract must cover every preview workspace without restoring Playlist canvas`);
  assert.ok(css.includes('.mrp-canvas-preview-root:not(.mrp-canvas-preview--expanded)'), `${name} must leave expanded/fullscreen canvas sizing intact`);

  let depth = 0;
  for (const char of css) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, `${name} stylesheet has an extra closing brace`);
  }
  assert.equal(depth, 0, `${name} stylesheet braces must balance`);
}

for (const tab of ['Media', 'Intro', 'Overlay', 'Sticker Subscribe', 'Playlist', 'Youtube SEO']) {
  assert.ok(app.includes(`renderTab === '${tab}'`), `Workspace tab ${tab} should remain connected`);
}
assert.ok(app.includes('<CanvasPreview') || app.includes('CanvasPreview'), 'Shared CanvasPreview component must remain connected');
assert.ok(canvasPreview.includes('mrp-canvas-preview--expanded'), 'Expanded canvas preview behavior must remain available');
assert.ok(canvasPreview.includes('mrp-canvas-editor'), 'Canvas editor and interactive preview surface must remain connected');

console.log('PASS P35-HF7: Canvas preview outer margins, inner frame padding, centering and 16:9 sizing use one spacing contract across preview workspaces; source and packaged CSS are valid.');
