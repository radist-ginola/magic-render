const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const ffmpeg = path.join(root, 'resources', 'ffmpeg', 'ffmpeg.exe');
const ffprobe = path.join(root, 'resources', 'ffmpeg', 'ffprobe.exe');

function copyFromBuildDependency(destination, packageName) {
  if (fs.existsSync(destination) || process.platform !== 'win32') return;
  try {
    const source = require(packageName);
    if (typeof source === 'string' && fs.existsSync(source)) {
      fs.copyFileSync(source, destination);
      console.log(`Runtime ${path.basename(destination)} disalin dari ${packageName}.`);
    }
  } catch {
    // The missing-file check below provides an actionable error. Manual
    // binaries remain a supported option on offline packaging machines.
  }
}

function assertWindowsExecutable(executable) {
  if (!fs.existsSync(executable)) throw new Error(`File wajib tidak ada: ${path.relative(root, executable)}`);
  const stat = fs.statSync(executable);
  const handle = fs.openSync(executable, 'r');
  const header = Buffer.alloc(2);
  try { fs.readSync(handle, header, 0, 2, 0); }
  finally { fs.closeSync(handle); }
  if (!stat.isFile() || stat.size < 1_000_000 || header.toString('ascii') !== 'MZ') {
    throw new Error(`${path.relative(root, executable)} bukan executable Windows yang lengkap.`);
  }
}

function inspect(executable, args) {
  return execFileSync(executable, args, { encoding: 'utf8', timeout: 10000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}

function main() {
  const packageConfig = require(path.join(root, 'package.json'));
  const bundled = packageConfig.build?.extraResources?.some((entry) => entry.from === 'resources/ffmpeg' && entry.to === 'ffmpeg');
  if (!bundled) throw new Error('Konfigurasi installer belum menyertakan resources/ffmpeg.');
  copyFromBuildDependency(ffmpeg, 'ffmpeg-static');
  copyFromBuildDependency(ffprobe, '@derhuerst/ffprobe-static');
  assertWindowsExecutable(ffmpeg);
  assertWindowsExecutable(ffprobe);
  if (process.platform !== 'win32') {
    throw new Error('Jalankan npm run dist pada Windows x64 agar binary FFmpeg Windows dapat diuji sebelum installer dibuat.');
  }
  const version = inspect(ffmpeg, ['-version']);
  const probeVersion = inspect(ffprobe, ['-version']);
  if (!/^ffmpeg version\s/im.test(version) || !/^ffprobe version\s/im.test(probeVersion)) {
    throw new Error('Binary FFmpeg/FFprobe tidak mengembalikan versi yang sesuai.');
  }
  const ffmpegRelease = version.match(/^ffmpeg version\s+(\d+\.\d+)/im)?.[1];
  const ffprobeRelease = probeVersion.match(/^ffprobe version\s+(\d+\.\d+)/im)?.[1];
  if (ffmpegRelease && ffprobeRelease && ffmpegRelease !== ffprobeRelease) {
    throw new Error(`Versi FFmpeg (${ffmpegRelease}) dan FFprobe (${ffprobeRelease}) tidak cocok.`);
  }
  const encoders = inspect(ffmpeg, ['-hide_banner', '-encoders']);
  const filters = inspect(ffmpeg, ['-hide_banner', '-filters']);
  for (const name of ['libx264', 'aac']) {
    if (!new RegExp(`\\b${name}\\b`).test(encoders)) throw new Error(`FFmpeg tidak menyediakan encoder ${name}.`);
  }
  for (const name of ['overlay', 'chromakey', 'colorkey', 'drawtext', 'scale', 'showfreqs', 'showwaves', 'showspectrum']) {
    if (!new RegExp(`\\b${name}\\b`).test(filters)) throw new Error(`FFmpeg tidak menyediakan filter ${name}.`);
  }
  console.log(`Preflight installer lulus: ${version.split(/\r?\n/, 1)[0]} dan FFprobe. Runtime Windows x64 akan disertakan.`);
}

try { main(); }
catch (error) {
  console.error(`PRE-FLIGHT DIST GAGAL: ${error.message}`);
  console.error('Sediakan ffmpeg.exe dan ffprobe.exe Windows x64 lengkap di resources/ffmpeg/ beserta informasi lisensinya, lalu ulangi npm run dist.');
  process.exitCode = 1;
}
