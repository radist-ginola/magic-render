import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'package.json',
  'tsconfig.main.json',
  'tsconfig.renderer.json',
  'tsconfig.preload.json',
  'vite.renderer.config.ts',
  'tailwind.config.cjs',
  'postcss.config.cjs',
  '.env.example',
  'src/main/index.ts',
  'src/main/config/environment.ts',
  'src/main/config/appConfig.ts',
  'src/main/ipc/registerIpc.ts',
  'src/main/ipc/appHandlers.ts',
  'src/main/ipc/validation.ts',
  'src/main/utils/logger.ts',
  'src/preload/index.ts',
  'src/shared/ipc.ts',
  'src/shared/app.ts',
  'src/renderer/index.html',
  'src/renderer/main.tsx',
  'src/renderer/App.tsx',
  'src/renderer/components/MainNav.tsx',
  'src/renderer/components/FoundationStatus.tsx',
  'src/renderer/styles/index.css',
  'resources/ffmpeg/README.md',
];

const errors = [];
for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`Missing required file: ${relative}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.main !== 'dist/main/index.js') errors.push('Unexpected Electron main entry.');
if (!packageJson.build?.win?.target?.some((item) => item.target === 'nsis')) errors.push('Windows NSIS target missing.');
if (!packageJson.scripts?.['build:main']?.includes('tsconfig.preload.json')) errors.push('Preload build configuration missing.');
if (!packageJson.build?.extraResources?.some((item) => item.from === 'resources/ffmpeg')) errors.push('FFmpeg extraResources mapping missing.');

const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
const ipc = fs.readFileSync(path.join(root, 'src/main/ipc/appHandlers.ts'), 'utf8');

for (const required of ['contextIsolation: true', 'nodeIntegration: false']) {
  if (!main.includes(required)) errors.push(`Security setting missing: ${required}`);
}
if (!preload.includes('contextBridge.exposeInMainWorld')) errors.push('Preload contextBridge exposure missing.');
if (!preload.includes('IPC_CHANNELS.')) errors.push('Preload is not using shared IPC channel constants.');
if (!ipc.includes('assertNoArguments')) errors.push('IPC boundary argument validation missing.');
if (/ipcRenderer\.(send|invoke|on|once)/.test(renderer)) errors.push('Renderer directly accesses ipcRenderer.');

if (errors.length > 0) {
  console.error('FOUNDATION VERIFY: FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('FOUNDATION VERIFY: PASSED');
console.log(`Checked ${requiredFiles.length} required foundation files.`);
console.log('Electron security baseline and typed IPC whitelist checks passed.');
