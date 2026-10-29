import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LockedAsset } from '../../../shared/domain/lockedAssetTypes';
import type { OverlayConfig } from '../../../shared/domain/overlayTypes';
import { lockAsset } from '../persistentStore';
import { MediaProbe } from '../media/mediaProbe';

export type SmoothLoopResult = { asset: LockedAsset; durationSec: number };
const execFileAsync = promisify(execFile);

/** One cyclic clip: final 70% of the source fades into its first 30%. */
export function smoothLoopPlan(startSec: number, endSec: number, fps: number): { durationSec: number; filter: string; frames: number } {
  const rate = Math.max(10, Math.min(60, Math.round(fps)));
  const first = Math.round(startSec * rate);
  const total = Math.round((endSec - startSec) * rate);
  if (!Number.isFinite(first) || !Number.isFinite(total) || first < 0 || total < 12 || total > 36000 * rate) throw new Error('Pilih overlay video dengan durasi minimal 0,5 detik.');
  const overlap = Math.max(3, Math.round(total * .3));
  const loopFrames = total - overlap;
  const offsetFrames = loopFrames - overlap;
  if (offsetFrames <= 0) throw new Error('Durasi overlay terlalu pendek untuk smooth loop.');
  const seconds = (frames: number) => Number((frames / rate).toFixed(6));
  const filter = `[0:v]fps=${rate},split=2[tail_in][head_in];` +
    `[tail_in]trim=start_frame=${first + overlap}:end_frame=${first + total},setpts=PTS-STARTPTS,format=yuv420p[tail];` +
    `[head_in]trim=start_frame=${first}:end_frame=${first + overlap},setpts=PTS-STARTPTS,format=yuv420p[head];` +
    `[tail][head]xfade=transition=fade:duration=${seconds(overlap)}:offset=${seconds(offsetFrames)},format=yuv420p[loop]`;
  return { durationSec: seconds(loopFrames), frames: loopFrames, filter };
}

async function runFfmpeg(executable: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error); else resolve();
    };
    const timeout = setTimeout(() => { child.kill(); finish(new Error('Pembuatan smooth loop melewati 10 menit. Periksa media atau FFmpeg di Setting.')); }, 600_000);
    child.stderr.on('data', (chunk) => { stderr = (stderr + String(chunk)).slice(-5000); });
    child.on('error', (error) => finish(new Error(`FFmpeg smooth loop tidak dapat dijalankan: ${error.message}`)));
    child.on('close', (code) => finish(code === 0 ? undefined : new Error(`Smooth loop gagal (FFmpeg ${code}): ${stderr.trim().slice(-1000)}`)));
  });
}

export async function createSmoothLoopAsset(asset: LockedAsset, config: OverlayConfig, ffmpegPath: string, ffprobePath: string, assetDir: string): Promise<SmoothLoopResult> {
  if (asset.menu !== 'overlay' || !/\.(mp4|mov|mkv|webm)$/i.test(asset.path)) throw new Error('Smooth loop hanya untuk overlay video.');
  const probe = await new MediaProbe(ffprobePath).probe(asset.path);
  const duration = probe.durationSeconds;
  if (!duration || !Number.isFinite(duration)) throw new Error('Durasi overlay tidak tersedia. Periksa FFprobe di Setting.');
  const alphaDetails = await execFileAsync(ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt:stream_tags=alpha_mode', '-of', 'default=nw=1', asset.path], { windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  if (/^pix_fmt=(?:yuva|gbrap|rgba|argb|bgra|abgr|ya|pal8)/mi.test(alphaDetails.stdout) || /^TAG:alpha_mode=1$/mi.test(alphaDetails.stdout)) {
    throw new Error('Overlay video memiliki kanal transparansi. Smooth loop MP4 dapat menghilangkan alpha; ekspor sumber tanpa alpha atau gunakan versi berlatar chroma key.');
  }
  const start = config.trim?.startSec ?? 0;
  const end = config.trim?.endSec ?? duration;
  if (start < 0 || end > duration + .05 || end <= start) throw new Error('Trim overlay tidak sesuai dengan durasi sumber.');
  const plan = smoothLoopPlan(start, Math.min(end, duration), probe.fps ?? 30);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mrp-smooth-loop-'));
  const cleanName = path.basename(asset.metadata.originalName, path.extname(asset.metadata.originalName)).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 70) || 'Overlay';
  const output = path.join(temporary, `${cleanName}-smooth-loop.mp4`);
  try {
    await runFfmpeg(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', asset.path, '-filter_complex', plan.filter, '-map', '[loop]', '-an', '-frames:v', String(plan.frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]);
    if ((await fs.stat(output)).size < 1024) throw new Error('FFmpeg belum menghasilkan duplikat smooth loop yang valid.');
    const { trim: _trim, ...preset } = config;
    const duplicate = await lockAsset('overlay', output, preset, assetDir);
    return { asset: duplicate, durationSec: plan.durationSec };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
