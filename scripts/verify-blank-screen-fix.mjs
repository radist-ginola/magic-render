import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const env = fs.readFileSync(path.join(root, 'src/main/config/environment.ts'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
const vite = fs.readFileSync(path.join(root, 'vite.renderer.config.ts'), 'utf8');

const checks = [
  ['packaged app always loads production', env.includes("app.isPackaged ? 'production' : readEnvironment")],
  ['explicit MAGIC_RENDER_ENV still supported', env.includes('process.env.MAGIC_RENDER_ENV')],
  ['production loads local renderer file', main.includes("path.join(__dirname, '..', 'renderer', 'index.html')")],
  ['preload resolver checks compiled dist layout and fallbacks', main.includes('function resolvePreloadScriptPath()') && main.includes("path.resolve(__dirname, '..', 'preload', 'index.js')") && main.includes("path.resolve(app.getAppPath(), 'dist', 'preload', 'index.js')") && main.includes("path.resolve(process.cwd(), 'dist', 'preload', 'index.js')")],
  ['renderer build uses relative base', vite.includes("base: './'" )],
  ['renderer load failures are logged', main.includes("did-fail-load")],
  ['renderer crashes are logged', main.includes("render-process-gone")],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`FAILED: ${label}`);
  console.log(`PASSED: ${label}`);
}
console.log(`BLANK SCREEN FIX VERIFY: PASSED (${checks.length} checks)`);
