import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LockedAsset } from '../../../shared/domain/lockedAssetTypes';
import type { OverlayConfig, ProjectOverlay } from '../../../shared/domain/overlayTypes';
import { FilterGraphBuilder } from '../ffmpegEngine/filterGraphBuilder/filterGraphBuilder';
import { getLockedAssetStore } from '../persistentStore/lockedAssetStore';

const execFileAsync = promisify(execFile);
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const OUTPUT_FPS = 30;

function mediaKind(filePath: string): 'image' | 'video' {
  return /\.(mp4|mov|mkv|webm|gif|avi)$/i.test(filePath) ? 'video' : 'image';
}

async function getDuration(filePath: string, ffprobePath: string): Promise<number> {
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
  ], { timeout: 30_000, windowsHide: true, maxBuffer: 1024 * 1024 });
  const value = Number(String(stdout).trim());
  if (!Number.isFinite(value) || value <= 0 || value > 24 * 60 * 60) throw new Error('Durasi media overlay tidak dapat dibaca atau di luar batas 24 jam.');
  return value;
}

async function runFfmpeg(executable: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('Proses simpan hasil edit overlay melewati batas 10 menit.'));
    }, 600_000);
    child.stderr.on('data', (chunk) => { stderr = (stderr + String(chunk)).slice(-6000); });
    child.on('error', (error) => finish(new Error(`FFmpeg tidak dapat dijalankan: ${error.message}`)));
    child.on('close', (code) => finish(code === 0 ? undefined : new Error(`Gagal merender hasil edit overlay (FFmpeg ${code}): ${stderr.trim().slice(-1800)}`)));
  });
}

function bakedConfig(config: OverlayConfig): OverlayConfig {
  // Geometry, keying, crop/mask, rotation, speed and opacity are baked into
  // the transparent media. Fade-in and blend mode remain runtime controls so
  // they are not applied twice and blend still reacts to the target video.
  return {
    ...config,
    opacity: 1,
    position: { x: 0, y: 0 },
    resize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    rotation: 0,
    speed: 1,
    crop: undefined,
    mask: undefined,
    trim: undefined,
    chromaKey: { ...config.chromaKey, enabled: false },
    colorKey: { ...config.colorKey, enabled: false },
    fadeInSec: config.fadeInSec ?? 0,
  };
}

/**
 * Render an edited overlay into a transparent 1920x1080 media file and replace
 * the Asset Library entry. Original user files outside the managed asset folder
 * are never deleted; only a previous managed library copy is eligible for cleanup.
 */
export async function applyEditedOverlayAsset(
  asset: LockedAsset,
  config: OverlayConfig,
  ffmpegPath: string,
  ffprobePath: string,
  assetDir: string,
): Promise<LockedAsset> {
  if (asset.menu !== 'overlay') throw new Error('Simpan hasil edit langsung saat ini hanya berlaku untuk asset Overlay.');
  if (!asset.path || !path.isAbsolute(asset.path)) throw new Error('Path asset overlay tidak valid.');

  const menuDir = path.resolve(assetDir, 'overlay');
  await fs.mkdir(menuDir, { recursive: true });
  const ext = mediaKind(asset.path) === 'video' ? '.mov' : '.png';
  const workingPath = path.join(menuDir, `${asset.assetId}-working-${randomUUID()}${ext}`);
  const outputPath = path.join(menuDir, `${asset.assetId}-edited-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  let keepOutput = false;

  try {
    const isVideo = mediaKind(asset.path) === 'video';
    const sourceDuration = isVideo ? await getDuration(asset.path, ffprobePath) : 1;
    const trim = config.trim;
    const segmentDuration = isVideo && trim
      ? Math.max(0.1, Math.min(sourceDuration, trim.endSec) - Math.max(0, trim.startSec))
      : sourceDuration;
    const outputDuration = isVideo ? Math.max(0.1, segmentDuration / Math.max(0.1, config.speed)) : 1;
    if (isVideo && trim && (trim.startSec < 0 || trim.endSec <= trim.startSec || trim.endSec > sourceDuration + 0.1)) {
      throw new Error('Rentang trim overlay tidak cocok dengan durasi sumber.');
    }

    const renderConfig: OverlayConfig = { ...config, fadeInSec: 0, blendMode: 'normal' };
    const overlay: ProjectOverlay = {
      id: asset.assetId,
      path: asset.path,
      type: isVideo ? 'video' : 'image',
      config: renderConfig,
    };
    const built = new FilterGraphBuilder().build('base', [{ sourceIndex: 0, sourceLabel: '0:v', overlay }], CANVAS_WIDTH, CANVAS_HEIGHT, OUTPUT_FPS);
    const baseDuration = (isVideo ? outputDuration : 1) + 0.2;
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', asset.path,
      '-f', 'lavfi', '-i', `color=c=black@0:s=${CANVAS_WIDTH}x${CANVAS_HEIGHT}:r=${OUTPUT_FPS}:d=${baseDuration.toFixed(4)}`,
      '-filter_complex', `[1:v]format=rgba,colorchannelmixer=aa=0[base];${built.filterGraph}`,
      '-map', `[${built.finalLabel}]`, '-an', '-t', outputDuration.toFixed(4), '-r', String(OUTPUT_FPS),
    ];
    if (isVideo) args.push('-c:v', 'qtrle', '-pix_fmt', 'argb', '-movflags', '+faststart');
    else args.push('-frames:v', '1', '-c:v', 'png', '-pix_fmt', 'rgba');
    args.push(workingPath);
    await runFfmpeg(ffmpegPath, args);
    const stat = await fs.stat(workingPath);
    if (!stat.isFile() || stat.size < 128) throw new Error('Hasil edit kosong atau tidak dapat dibaca. Asset lama tetap dipertahankan.');
    await fs.rename(workingPath, outputPath);

    const replaced = await getLockedAssetStore().replaceEditedMedia(asset.assetId, outputPath, bakedConfig(config), assetDir);
    keepOutput = true;
    return replaced;
  } finally {
    await fs.rm(workingPath, { force: true }).catch(() => undefined);
    if (!keepOutput) await fs.rm(outputPath, { force: true }).catch(() => undefined);
  }
}
