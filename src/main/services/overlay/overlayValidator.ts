import path from 'node:path';
import fs from 'node:fs/promises';
import type { OverlayMediaType, ProjectOverlay } from '../../../shared/domain/overlayTypes';

const EXTENSIONS: Record<OverlayMediaType, Set<string>> = {
  image: new Set(['.png', '.jpg', '.jpeg', '.webp']),
  video: new Set(['.mp4', '.mov', '.mkv', '.webm', '.gif']),
};

const num = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function validateOverlayShape(overlay: unknown): ProjectOverlay {
  if (!overlay || typeof overlay !== 'object') throw new Error('Overlay tidak valid.');
  const value = overlay as Record<string, unknown>;
  if (value.locked !== undefined && typeof value.locked !== 'boolean') throw new Error('Status kunci overlay tidak valid.');
  if (value.hiddenInPreview !== undefined && typeof value.hiddenInPreview !== 'boolean') throw new Error('Status visibilitas overlay tidak valid.');
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 120) throw new Error('Overlay id tidak valid.');
  if (typeof value.path !== 'string' || value.path.length < 1 || value.path.length > 32767) throw new Error('Path overlay tidak valid.');
  if (value.type !== 'image' && value.type !== 'video') throw new Error('Tipe overlay tidak valid.');
  if (!value.config || typeof value.config !== 'object') throw new Error('Konfigurasi overlay tidak valid.');
  const config = value.config as Record<string, unknown>;
  const position = config.position as Record<string, unknown> | undefined;
  const resize = config.resize as Record<string, unknown> | null | undefined;
  const chroma = config.chromaKey as Record<string, unknown> | undefined;
  const color = config.colorKey as Record<string, unknown> | undefined;
  if (!num(config.opacity, 0, 1)) throw new Error('Opacity overlay harus 0..1.');
  if (!position || !num(position.x, -16384, 16384) || !num(position.y, -16384, 16384)) throw new Error('Position overlay tidak valid.');
  if (resize !== null && resize !== undefined && (!num(resize.width, 1, 16384) || !num(resize.height, 1, 16384))) throw new Error('Resize overlay tidak valid.');
  if (!num(config.rotation, -360, 360)) throw new Error('Rotasi overlay tidak valid.');
  if (!num(config.speed, 0.05, 8)) throw new Error('Speed overlay harus 0.05..8.');
  if (config.fadeInSec !== undefined && !num(config.fadeInSec, 0, 30)) throw new Error('Fade-in overlay harus 0..30 detik.');
  if (!['normal', 'multiply', 'screen', 'overlay'].includes(String(config.blendMode))) throw new Error('Blend mode overlay tidak valid.');
  if (!chroma || typeof chroma.enabled !== 'boolean' || typeof chroma.color !== 'string' || !num(chroma.similarity, 0, 1) || !num(chroma.blend, 0, 1)) throw new Error('Chroma key overlay tidak valid.');
  if (!color || typeof color.enabled !== 'boolean' || typeof color.color !== 'string' || !num(color.similarity, 0, 1) || !num(color.blend, 0, 1)) throw new Error('Color key overlay tidak valid.');
  if (config.crop !== undefined) {
    const crop = config.crop as Record<string, unknown>;
    if (!crop || !['left','right','top','bottom'].every((edge) => num(crop[edge], 0, 95)) || Number(crop.left) + Number(crop.right) >= 99 || Number(crop.top) + Number(crop.bottom) >= 99) throw new Error('Crop overlay harus menyisakan area gambar yang terlihat.');
  }
  if (config.mask !== undefined) {
    const mask = config.mask as Record<string, unknown>;
    if (!mask || !['rectangle','square','circle','oval','freehand'].includes(String(mask.shape)) || !num(mask.x,0,1) || !num(mask.y,0,1) || !num(mask.width,0.01,1) || !num(mask.height,0.01,1) || Number(mask.x)+Number(mask.width)>1.00001 || Number(mask.y)+Number(mask.height)>1.00001) throw new Error('Bentuk mask overlay tidak valid.');
    if (mask.shape === 'freehand' && (!Array.isArray(mask.points) || mask.points.length < 3 || mask.points.length > 32 || !mask.points.every((p:unknown)=>!!p && typeof p==='object' && num((p as Record<string,unknown>).x,0,1) && num((p as Record<string,unknown>).y,0,1)))) throw new Error('Gambar mask memerlukan 3 sampai 32 titik di dalam layer.');
  }
  if (config.trim !== undefined) {
    const trim = config.trim as Record<string, unknown>;
    if (value.type !== 'video' || !trim || !num(trim.sourceDurationSec, 0.1, 36000) || !num(trim.startSec, 0, 36000) || !num(trim.endSec, 0.1, 36000) || Number(trim.endSec) > Number(trim.sourceDurationSec) + 0.01 || Number(trim.endSec) - Number(trim.startSec) < 0.1) throw new Error('Trim overlay harus berada dalam durasi video sumber dan minimal 0,1 detik.');
  }
  return value as ProjectOverlay;
}

export async function validateOverlayFile(filePath: string, type: OverlayMediaType): Promise<string> {
  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).toLowerCase();
  if (!EXTENSIONS[type].has(ext)) throw new Error(`Format file ${type} overlay tidak didukung: ${ext || '(tanpa extension)'}.`);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isFile()) throw new Error('File overlay tidak ditemukan atau bukan file.');
  return resolved;
}
