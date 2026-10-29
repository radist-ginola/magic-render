import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectSticker, StickerMediaType } from '../../shared/domain/stickerTypes';
import { validateStickerSchedule } from './stickerScheduler';

const imageExt = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const videoExt = new Set(['.mp4', '.mov', '.mkv', '.webm']);

const assertFile = async (filePath: string) => { const st = await fs.stat(filePath).catch(() => null); if (!st?.isFile()) throw new Error(`File sticker tidak ditemukan: ${filePath}`); };

export async function validateStickerFile(filePath: string, type: StickerMediaType): Promise<string> {
  if (!path.isAbsolute(filePath)) throw new Error('Path sticker harus absolut.');
  await assertFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const allowed = type === 'image' ? imageExt : type === 'video' ? videoExt : new Set(['.gif']);
  if (!allowed.has(ext)) throw new Error(`Format sticker ${type} tidak didukung.`);
  return path.normalize(filePath);
}

const color = (value: string) => { if (!/^0x[0-9a-fA-F]{6}$/.test(value)) throw new Error(`Warna key sticker tidak valid: ${value}`); };

export function validateStickerShape(value: unknown): ProjectSticker {
  if (!value || typeof value !== 'object') throw new Error('Sticker tidak valid.');
  const s = value as Record<string, any>;
  if (s.locked !== undefined && typeof s.locked !== 'boolean') throw new Error('Status kunci sticker tidak valid.');
  if (s.hiddenInPreview !== undefined && typeof s.hiddenInPreview !== 'boolean') throw new Error('Status visibilitas sticker tidak valid.');
  if (typeof s.id !== 'string' || !s.id.trim() || typeof s.path !== 'string' || !path.isAbsolute(s.path)) throw new Error('Sticker id/path tidak valid.');
  if (!['image','video','gif'].includes(s.type)) throw new Error('Tipe sticker tidak valid.');
  const c = s.config as Record<string, any>;
  if (!c || typeof c !== 'object') throw new Error('Konfigurasi sticker tidak valid.');
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (typeof c.audioMuted !== 'boolean') throw new Error('audioMuted sticker tidak valid.');
  if (!c.fade || !finite(c.fade.fadeInSec) || !finite(c.fade.fadeOutSec) || c.fade.fadeInSec < 0 || c.fade.fadeOutSec < 0 || c.fade.fadeInSec > 86400 || c.fade.fadeOutSec > 86400) throw new Error('Fade sticker tidak valid.');
  if (c.speed === undefined) c.speed = 1;
  if (c.opacity === undefined) c.opacity = 1;
  if (c.blendMode === undefined) c.blendMode = 'normal';
  if (c.durationSec === undefined) c.durationSec = 3;
  if (!finite(c.scale) || c.scale <= 0 || c.scale > 20) throw new Error('Scale sticker harus >0 dan ≤20.');
  if (!finite(c.speed) || c.speed <= 0 || c.speed > 8) throw new Error('Speed sticker harus >0 dan ≤8.');
  if (!finite(c.opacity) || c.opacity < 0 || c.opacity > 1) throw new Error('Opacity sticker harus 0 sampai 1.');
  if (!['normal','multiply','screen','overlay'].includes(c.blendMode)) throw new Error('Blend mode sticker tidak valid.');
  if (!finite(c.durationSec) || c.durationSec <= 0 || c.durationSec > 86400) throw new Error('Durasi sticker tidak valid.');
  if (!c.position || !finite(c.position.x) || !finite(c.position.y) || c.position.x < -16384 || c.position.y < -16384 || c.position.x > 16384 || c.position.y > 16384) throw new Error('Posisi sticker tidak valid.');
  if (!finite(c.rotation) || c.rotation < -360 || c.rotation > 360) throw new Error('Rotasi sticker tidak valid.');
  if (!c.schedule || !['iterative','timestamp','full-duration'].includes(c.schedule.mode) || !Array.isArray(c.schedule.timestamps)) throw new Error('Scheduling sticker tidak valid.');
  // Earlier releases showed these defaults in the form without saving them.
  // Restore those existing projects before checking their schedule.
  if (c.schedule.mode === 'timestamp' && c.schedule.timestamps.length === 0) c.schedule.timestamps = ['30'];
  if (c.schedule.mode === 'iterative' && c.schedule.iterativeCount === null) c.schedule.iterativeCount = 1;
  validateStickerSchedule(c.schedule);
  if (!['none','chroma','color'].includes(c.backgroundRemoval)) throw new Error('Background removal sticker tidak valid.');
  if (!c.chromaKey || !c.colorKey) throw new Error('Konfigurasi key sticker tidak lengkap.');
  for (const key of [c.chromaKey, c.colorKey]) { if (typeof key.enabled !== 'boolean' || !finite(key.similarity) || key.similarity < 0 || key.similarity > 1 || !finite(key.blend) || key.blend < 0 || key.blend > 1) throw new Error('Parameter key sticker tidak valid.'); color(key.color); }
  return value as ProjectSticker;
}
